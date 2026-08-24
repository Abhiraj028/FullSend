import type { ServerWebSocket } from "bun";

type SocketRole = "host" | "pending-guest" | "guest";

type SocketData = {
    connectedAt: number;
    roomId?: string;
    role?: SocketRole;
};

type Room = {
    id: string;
    host: ServerWebSocket<SocketData>;
    pendingGuest?: ServerWebSocket<SocketData>;
    guest?: ServerWebSocket<SocketData>;
    createdAt: number;
};

type CreateRoomMessage = {
    type: "create-room";
};

type JoinRoomMessage = {
    type: "join-room";
    roomId: string;
};

type ApproveJoinMessage = {
    type: "approve-join";
};

type RejectJoinMessage = {
    type: "reject-join";
};

type SignalKind = "offer" | "answer" | "ice-candidate";

type SignalPayload = {
    kind: SignalKind;
    data: Record<string, unknown>;
};

type SignalMessage = {
    type: "signal";
    signal: SignalPayload;
};

type ClientMessage =
    | CreateRoomMessage
    | JoinRoomMessage
    | ApproveJoinMessage
    | RejectJoinMessage
    | SignalMessage;

const rooms = new Map<string, Room>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSignalKind(value: unknown): value is SignalKind {
    return (
        value === "offer" ||
        value === "answer" ||
        value === "ice-candidate"
    );
}

//checks the message, doesnt trust it.
function parseClientMessage(rawMessage: unknown): ClientMessage | null {
    if (typeof rawMessage !== "string") {
        return null;
    }

    try {
        const value: unknown = JSON.parse(rawMessage);

        if (
            typeof value !== "object" || value === null || !("type" in value)) {
            return null;
        }

        if (value.type === "create-room") {
            return { type: "create-room" };
        }

        if (value.type === "join-room" && "roomId" in value && typeof value.roomId === "string") {
            return {
                type: "join-room",
                roomId: value.roomId,
            };
        }

        if (value.type === "approve-join") {
            return { type: "approve-join" };
        }

        if (value.type === "reject-join") {
            return { type: "reject-join" };
        }

        if (value.type === "signal" && "signal" in value
            && isRecord(value.signal) && isSignalKind(value.signal.kind)
            && "data" in value.signal && isRecord(value.signal.data)) {
            return {
                type: "signal",
                signal: {
                    kind: value.signal.kind,
                    data: value.signal.data,
                },
            };
        }


        return null;
    } catch {
        return null;
    }
}

function sendJson(ws: ServerWebSocket<SocketData>, message: object) {
    ws.send(JSON.stringify(message));
}

const server = Bun.serve<SocketData>({
    port: 8080,

    fetch(request, bunServer) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return Response.json({
                status: "ok",
                activeRooms: rooms.size,
            });
        }

        if (url.pathname === "/ws") {
            const upgraded = bunServer.upgrade(request, {
                data: {
                    connectedAt: Date.now(),
                },
            });

            if (upgraded) {
                return;
            }

            return new Response("WebSocket upgrade failed.", { status: 500 });
        }

        return new Response("FullSend signaling server is running.");
    },

    websocket: {
        open(ws) {
            console.log(`WebSocket opened at ${ws.data.connectedAt}`);

            sendJson(ws, {
                type: "connected",
                message: "Connected to the FullSend signaling server.",
            });
        },

        message(ws, rawMessage) {
            const message = parseClientMessage(rawMessage);

            if (!message) {
                sendJson(ws, {
                    type: "error",
                    code: "invalid-message",
                    message: "Expected a valid protocol message.",
                });

                return;
            }

            if (message.type === "create-room") {
                if (ws.data.roomId) {
                    sendJson(ws, {
                        type: "error",
                        code: "already-in-room",
                        message: "Leave the current room before creating another one.",
                    });

                    return;
                }

                const roomId = crypto.randomUUID();

                rooms.set(roomId, {
                    id: roomId,
                    host: ws,
                    createdAt: Date.now(),
                });

                ws.data.roomId = roomId;
                ws.data.role = "host";

                console.log(`Created room ${roomId}`);

                sendJson(ws, {
                    type: "room-created",
                    roomId,
                });
            }

            if (message.type === "join-room") {
                if (ws.data.roomId) {
                    sendJson(ws, {
                        type: "error",
                        code: "already-in-room",
                        message: "Leave the current room before joining another one.",
                    });

                    return;
                }

                const room = rooms.get(message.roomId);

                if (!room) {
                    sendJson(ws, {
                        type: "error",
                        code: "room-not-found",
                        message: "That room does not exist or has expired.",
                    });

                    return;
                }

                if (room.pendingGuest || room.guest) {
                    sendJson(ws, {
                        type: "error",
                        code: "room-busy",
                        message: "This room already has a pending join request.",
                    });

                    return;
                }

                // Reserve the room's single guest slot until the host decides.
                room.pendingGuest = ws;
                ws.data.roomId = room.id;
                ws.data.role = "pending-guest";

                console.log(`Join requested for room ${room.id}`);

                sendJson(room.host, {
                    type: "join-requested",
                    roomId: room.id,
                });

                sendJson(ws, {
                    type: "join-pending",
                    roomId: room.id,
                });
            }

            if (message.type === "approve-join" || message.type === "reject-join") {
                const roomId = ws.data.roomId;
                const room = roomId ? rooms.get(roomId) : undefined;

                if (!room || room.host !== ws) {
                    sendJson(ws, {
                        type: "error",
                        code: "not-room-host",
                        message: "Only the room host can decide a join request.",
                    });

                    return;
                }

                const pendingGuest = room.pendingGuest;

                if (!pendingGuest) {
                    sendJson(ws, {
                        type: "error",
                        code: "no-pending-guest",
                        message: "There is no join request to decide.",
                    });

                    return;
                }

                if (message.type === "approve-join") {
                    // Promote the pending socket into the room's active guest slot.
                    room.guest = pendingGuest;
                    room.pendingGuest = undefined;
                    pendingGuest.data.role = "guest";

                    console.log(`Approved guest for room ${room.id}`);

                    sendJson(ws, {
                        type: "room-paired",
                        roomId: room.id,
                        role: "host",
                    });

                    sendJson(pendingGuest, {
                        type: "room-paired",
                        roomId: room.id,
                        role: "guest",
                    });

                    return;
                }

                room.pendingGuest = undefined;
                pendingGuest.data.roomId = undefined;
                pendingGuest.data.role = undefined;

                console.log(`Rejected guest for room ${room.id}`);

                sendJson(ws, {
                    type: "join-rejection-sent",
                    roomId: room.id,
                });

                sendJson(pendingGuest, {
                    type: "join-rejected",
                    roomId: room.id,
                });
            }

            if (message.type === "signal") {
                const roomId = ws.data.roomId;
                const room = roomId ? rooms.get(roomId) : undefined;

                if (!room || !room.guest) {
                    sendJson(ws, {
                        type: "error",
                        code: "room-not-paired",
                        message: "WebRTC signaling requires an approved room guest.",
                    });

                    return;
                }

                let recipient: ServerWebSocket<SocketData> | undefined;

                if (room.host === ws) {
                    recipient = room.guest;
                } else if (room.guest === ws) {
                    recipient = room.host;
                }

                if (!recipient) {
                    sendJson(ws, {
                        type: "error",
                        code: "not-room-member",
                        message: "Only approved room members may send signals.",
                    });

                    return;
                }

                // The server routes setup metadata but never creates a peer connection.
                sendJson(recipient, {
                    type: "signal",
                    signal: message.signal,
                });

                console.log(
                    `Forwarded ${message.signal.kind} for room ${room.id}`,
                );
            }


        },

        close(ws, code) {
            const roomId = ws.data.roomId;
            const room = roomId ? rooms.get(roomId) : undefined;

            if (room?.host === ws) {
                // A room cannot remain alive without its creator.
                const otherPeer = room.pendingGuest ?? room.guest;

                if (otherPeer) {
                    sendJson(otherPeer, {
                        type: "room-closed",
                        reason: "The room host disconnected.",
                    });
                }

                rooms.delete(room.id);
                console.log(`Deleted room ${room.id}`);

            } else if (room?.pendingGuest === ws) {

                room.pendingGuest = undefined;

                sendJson(room.host, {
                    type: "join-cancelled",
                    roomId: room.id,
                });

                console.log(`Join request cancelled for room ${room.id}`);
            } else if (room?.guest === ws) {
                // Keep the host's room available for a future guest.
                room.guest = undefined;

                sendJson(room.host, {
                    type: "peer-left",
                    roomId: room.id,
                });

                console.log(`Guest left room ${room.id}`);
            }

            console.log(`WebSocket closed with code ${code}`);
        },
    },
});

console.log(`Server listening on ${server.url}`);