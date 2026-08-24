export type RoomRole = "host" | "guest" | null;
export type JoinStatus = "idle" | "pending" | "rejected";
export type SignalKind = "offer" | "answer" | "ice-candidate";

export type SignalPayload = {
  kind: SignalKind;
  data: unknown;
};

export type PingMessage = {
  type: "ping";
  sentAt: number;
};

export type FileOfferMessage = {
  type: "file-offer";
  transferId: string;
  name: string;
  size: number;
  mimeType: string;
};

export type FileAcceptMessage = {
  type: "file-accept";
  transferId: string;
};

export type FileRejectMessage = {
  type: "file-reject";
  transferId: string;
  reason: string;
};

export type ControlMessage =
  | PingMessage
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage;


export type ClientMessage =
  | { type: "create-room" }
  | { type: "join-room"; roomId: string }
  | { type: "approve-join" }
  | { type: "reject-join" }
  | { type: "signal"; signal: SignalPayload };

export type ServerMessage = {
  type: string;
  roomId?: string;
  role?: RoomRole;
  signal?: SignalPayload;
  message?: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSignalKind(value: unknown): value is SignalKind {
  return value === "offer" || value === "answer" || value === "ice-candidate";
}

function isSignalPayload(value: unknown): value is SignalPayload {
  return isRecord(value) && isSignalKind(value.kind) && "data" in value;
}

// WebSocket payloads are untrusted until their envelope has been checked.
export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  let signal: SignalPayload | undefined;

  if (value.type === "signal") {
    if (!isSignalPayload(value.signal)) return null;
    signal = value.signal;
  }

  const message: ServerMessage = { type: value.type };
  if (typeof value.roomId === "string") message.roomId = value.roomId;
  if (value.role === "host" || value.role === "guest") message.role = value.role;
  if (typeof value.message === "string") message.message = value.message;
  if (signal) message.signal = signal;
  return message;
}

export function isSessionDescriptionInit(value: unknown): value is RTCSessionDescriptionInit {
  if (!isRecord(value)) return false;

  const validType =
    value.type === "offer" ||
    value.type === "answer" ||
    value.type === "pranswer" ||
    value.type === "rollback";

  return validType && (value.sdp === undefined || typeof value.sdp === "string");
}

export function isIceCandidateInit(value: unknown): value is RTCIceCandidateInit {
  if (!isRecord(value)) return false;

  const isStringOrEmpty = (field: unknown) =>
    field === undefined || field === null || typeof field === "string";
  const isNumberOrEmpty = (field: unknown) =>
    field === undefined || field === null || typeof field === "number";

  return (
    isStringOrEmpty(value.candidate) &&
    isStringOrEmpty(value.sdpMid) &&
    isNumberOrEmpty(value.sdpMLineIndex) &&
    isStringOrEmpty(value.usernameFragment)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Control-channel JSON is validated before the app acts on it.
export function isControlMessage(value: unknown): value is ControlMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "ping") {
    return typeof value.sentAt === "number";
  }

  if (value.type === "file-offer") {
    return (
      isNonEmptyString(value.transferId) &&
      isNonEmptyString(value.name) &&
      typeof value.size === "number" &&
      Number.isSafeInteger(value.size) &&
      value.size >= 0 &&
      typeof value.mimeType === "string"
    );
  }

  if (value.type === "file-accept") {
    return isNonEmptyString(value.transferId);
  }

  if (value.type === "file-reject") {
    return (
      isNonEmptyString(value.transferId) &&
      isNonEmptyString(value.reason)
    );
  }

  return false;
}