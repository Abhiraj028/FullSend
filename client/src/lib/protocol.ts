export type RoomRole = "host" | "guest" | null;
export type JoinStatus = "idle" | "pending" | "rejected";
export type SignalKind = "offer" | "answer" | "ice-candidate";

export type SignalPayload = {
  kind: SignalKind;
  data: unknown;
};

// Kept during the protocol migration so the single-file UI remains usable.
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

export type BatchFile = {
  transferId: string;
  name: string;
  size: number;
  mimeType: string;
};

export type BatchOfferMessage = {
  type: "batch-offer";
  batchId: string;
  files: BatchFile[];
};

export type BatchAcceptMessage = {
  type: "batch-accept";
  batchId: string;
};

export type BatchRejectMessage = {
  type: "batch-reject";
  batchId: string;
  reason: string;
};

export type FileStartMessage = {
  type: "file-start";
  transferId: string;
};

export type FileReadyMessage = {
  type: "file-ready";
  transferId: string;
};

export type FileCompleteMessage = {
  type: "file-complete";
  transferId: string;
  byteCount: number;
  sha256: string;
};

export type FileVerifiedMessage = {
  type: "file-verified";
  transferId: string;
  sha256: string;
};

export type FileIntegrityFailedMessage = {
  type: "file-integrity-failed";
  transferId: string;
  expectedHash: string;
  actualHash: string;
};

export type ControlMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | BatchOfferMessage
  | BatchAcceptMessage
  | BatchRejectMessage
  | FileStartMessage
  | FileReadyMessage
  | FileCompleteMessage
  | FileVerifiedMessage
  | FileIntegrityFailedMessage;

export type ClientMessage =
  | { type: "create-room" }
  | { type: "leave-room" }
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
  reason?: string;
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
  if (typeof value.reason === "string") message.reason = value.reason;
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

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isBatchFile(value: unknown): value is BatchFile {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.transferId) &&
    isNonEmptyString(value.name) &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    typeof value.mimeType === "string"
  );
}

function isBatchFiles(value: unknown): value is BatchFile[] {
  return Array.isArray(value) && value.length > 0 && value.every(isBatchFile);
}

// Control-channel JSON is validated before the app acts on it.
export function isControlMessage(value: unknown): value is ControlMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
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

  if (value.type === "batch-offer") {
    return isNonEmptyString(value.batchId) && isBatchFiles(value.files);
  }

  if (value.type === "batch-accept") {
    return isNonEmptyString(value.batchId);
  }

  if (value.type === "batch-reject") {
    return (
      isNonEmptyString(value.batchId) &&
      isNonEmptyString(value.reason)
    );
  }

  if (value.type === "file-start") {
    return isNonEmptyString(value.transferId);
  }

  if (value.type === "file-ready") {
    return isNonEmptyString(value.transferId);
  }

  if (value.type === "file-complete") {
    return (
      isNonEmptyString(value.transferId) &&
      typeof value.byteCount === "number" &&
      Number.isSafeInteger(value.byteCount) &&
      value.byteCount >= 0 &&
      isSha256(value.sha256)
    );
  }

  if (value.type === "file-verified") {
    return (
      isNonEmptyString(value.transferId) &&
      isSha256(value.sha256)
    );
  }

  if (value.type === "file-integrity-failed") {
    return (
      isNonEmptyString(value.transferId) &&
      isSha256(value.expectedHash) &&
      isSha256(value.actualHash)
    );
  }

  return false;
}
