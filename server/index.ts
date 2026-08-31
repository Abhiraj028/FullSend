import type { ServerWebSocket } from "bun";
import { parseClientMessage } from "./protocol";

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

const rooms = new Map<string, Room>();
const port = Number(Bun.env.PORT ?? 8080);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port number.");
}

function sendJson(ws: ServerWebSocket<SocketData>, message: object) {
    ws.send(JSON.stringify(message));
}

const server = Bun.serve<SocketData>({
    port,

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

            if (message.type === "leave-room") {
                const roomId = ws.data.roomId;
                const room = roomId ? rooms.get(roomId) : undefined;

                if (room?.host === ws) {
                    const otherPeer = room.pendingGuest ?? room.guest;
                    if (otherPeer) {
                        otherPeer.data.roomId = undefined;
                        otherPeer.data.role = undefined;
                        sendJson(otherPeer, { type: "room-closed", reason: "The room host left." });
                    }
                    rooms.delete(room.id);
                } else if (room?.guest === ws) {
                    room.host.data.roomId = undefined;
                    room.host.data.role = undefined;
                    rooms.delete(room.id);
                    sendJson(room.host, { type: "room-closed", reason: "The approved peer left." });
                } else if (room?.pendingGuest === ws) {
                    room.pendingGuest = undefined;
                    sendJson(room.host, { type: "join-cancelled", roomId: room.id });
                }

                ws.data.roomId = undefined;
                ws.data.role = undefined;
                sendJson(ws, { type: "room-closed", reason: "You left the room." });
                return;
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
                    otherPeer.data.roomId = undefined;
                    otherPeer.data.role = undefined;
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

                // an approved peer leaving ends the entire room.
                room.host.data.roomId = undefined;
                room.host.data.role = undefined;
                rooms.delete(room.id);

                sendJson(room.host, {
                    type: "room-closed",
                    reason: "The approved peer disconnected. Create a new room to continue.",
                });

                console.log(`Deleted room ${room.id} after guest disconnect`);
            }

            console.log(`WebSocket closed with code ${code}`);
        },
    },
});

console.log(`Server listening on ${server.url}`);
