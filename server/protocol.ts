export type SignalKind = "offer" | "answer" | "ice-candidate";

export type SignalPayload = {
    kind: SignalKind;
    data: Record<string, unknown>;
};

export type ClientMessage =
    | { type: "create-room" }
    | { type: "leave-room" }
    | { type: "join-room"; roomId: string }
    | { type: "approve-join" }
    | { type: "reject-join" }
    | { type: "signal"; signal: SignalPayload };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSignalKind(value: unknown): value is SignalKind {
    return value === "offer" || value === "answer" || value === "ice-candidate";
}

// WebSocket input is untrusted until its protocol envelope has been validated.
export function parseClientMessage(rawMessage: unknown): ClientMessage | null {
    if (typeof rawMessage !== "string") return null;

    try {
        const value: unknown = JSON.parse(rawMessage);
        if (!isRecord(value) || typeof value.type !== "string") return null;

        if (value.type === "create-room") return { type: "create-room" };
        if (value.type === "leave-room") return { type: "leave-room" };
        if (value.type === "approve-join") return { type: "approve-join" };
        if (value.type === "reject-join") return { type: "reject-join" };

        if (value.type === "join-room" && typeof value.roomId === "string") {
            return { type: "join-room", roomId: value.roomId };
        }

        if (
            value.type === "signal" &&
            isRecord(value.signal) &&
            isSignalKind(value.signal.kind) &&
            isRecord(value.signal.data)
        ) {
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
