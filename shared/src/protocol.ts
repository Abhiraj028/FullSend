import { z } from "zod";

// --- WebSocket Signaling Protocol ---

export const PidMessageSchema = z.object({
  type: z.literal("pid"),
  id: z.string(),
  nickname: z.string(),
});
export type PidMessage = z.infer<typeof PidMessageSchema>;

export const NicknameUpdateSchema = z.object({
  type: z.literal("nicknameUpdate"),
  id: z.string(),
  nickname: z.string(),
});
export type NicknameUpdate = z.infer<typeof NicknameUpdateSchema>;

export const ConnReqMessageSchema = z.object({
  type: z.literal("connReq"),
  sender: z.string(),
  receiver: z.string(),
  senderNickname: z.string().optional(),
});
export type ConnReqMessage = z.infer<typeof ConnReqMessageSchema>;

export const ConnAcceptMessageSchema = z.object({
  type: z.literal("connAccept"),
  sender: z.string(),
  receiver: z.string(),
  senderNickname: z.string().optional(),
});
export type ConnAcceptMessage = z.infer<typeof ConnAcceptMessageSchema>;

export const ConnRejectMessageSchema = z.object({
  type: z.literal("connReject"),
  sender: z.string(),
  receiver: z.string(),
  senderNickname: z.string().optional(),
});
export type ConnRejectMessage = z.infer<typeof ConnRejectMessageSchema>;

export const PeerInfoSchema = z.object({
  id: z.string(),
  nickname: z.string(),
});
export type PeerInfo = z.infer<typeof PeerInfoSchema>;

export const PeerListMessageSchema = z.object({
  type: z.literal("peerList"),
  peers: z.array(PeerInfoSchema),
});
export type PeerListMessage = z.infer<typeof PeerListMessageSchema>;

export type ClientMessage = PidMessage | NicknameUpdate | ConnReqMessage | ConnAcceptMessage | ConnRejectMessage;
export type ServerMessage = PeerListMessage | ConnReqMessage | ConnAcceptMessage | ConnRejectMessage;

export const wsMsg = {
  pid: (id: string, nickname: string): PidMessage => ({ type: "pid", id, nickname }),
  nicknameUpdate: (id: string, nickname: string): NicknameUpdate => ({ type: "nicknameUpdate", id, nickname }),
  connReq: (sender: string, receiver: string, senderNickname?: string): ConnReqMessage => ({ type: "connReq", sender, receiver, senderNickname }),
  connAccept: (sender: string, receiver: string, senderNickname?: string): ConnAcceptMessage => ({ type: "connAccept", sender, receiver, senderNickname }),
  connReject: (sender: string, receiver: string, senderNickname?: string): ConnRejectMessage => ({ type: "connReject", sender, receiver, senderNickname }),
};

export function parseSignalingMessage(raw: unknown): ServerMessage | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object" && "type" in data) {
      switch (data.type) {
        case "peerList": return PeerListMessageSchema.parse(data);
        case "connReq": return ConnReqMessageSchema.parse(data);
        case "connAccept": return ConnAcceptMessageSchema.parse(data);
        case "connReject": return ConnRejectMessageSchema.parse(data);
      }
    }
  } catch (e) {
    console.error("Failed to parse signaling message", e);
  }
  return null;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object" && "type" in data) {
      switch (data.type) {
        case "pid": return PidMessageSchema.parse(data);
        case "nicknameUpdate": return NicknameUpdateSchema.parse(data);
        case "connReq": return ConnReqMessageSchema.parse(data);
        case "connAccept": return ConnAcceptMessageSchema.parse(data);
        case "connReject": return ConnRejectMessageSchema.parse(data);
      }
    }
  } catch (e) {
    console.error("Failed to parse client message", e);
  }
  return null;
}

// --- DataChannel File Transfer Protocol ---

export const FileMetaSchema = z.object({
  type: z.literal("file-meta"),
  id: z.string().uuid(),
  name: z.string(),
  size: z.number().positive(),
  mimeType: z.string(),
  totalChunks: z.number().int().positive(),
});
export type FileMeta = z.infer<typeof FileMetaSchema>;

export const FileChunkSchema = z.object({
  type: z.literal("file-chunk"),
  id: z.string().uuid(),
  index: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  data: z.any(), // ArrayBuffer
});
export type FileChunk = z.infer<typeof FileChunkSchema>;

export const FileDoneSchema = z.object({
  type: z.literal("file-done"),
  id: z.string().uuid(),
});
export type FileDone = z.infer<typeof FileDoneSchema>;

export const FileAckSchema = z.object({
  type: z.literal("file-ack"),
  id: z.string().uuid(),
});
export type FileAck = z.infer<typeof FileAckSchema>;

export type TransferMessage = FileMeta | FileChunk | FileDone | FileAck;

export const transferMsg = {
  meta: (id: string, name: string, size: number, mimeType: string, totalChunks: number): FileMeta => ({
    type: "file-meta", id, name, size, mimeType, totalChunks
  }),
  chunk: (id: string, index: number, total: number, data: ArrayBuffer): FileChunk => ({
    type: "file-chunk", id, index, total, data
  }),
  done: (id: string): FileDone => ({ type: "file-done", id }),
  ack: (id: string): FileAck => ({ type: "file-ack", id }),
};

export function parseTransferMessage(raw: unknown): TransferMessage | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object" && "type" in data) {
      switch (data.type) {
        case "file-meta": return FileMetaSchema.parse(data);
        case "file-chunk": return FileChunkSchema.parse(data);
        case "file-done": return FileDoneSchema.parse(data);
        case "file-ack": return FileAckSchema.parse(data);
      }
    }
  } catch (e) {
    console.error("Failed to parse transfer message", e);
  }
  return null;
}
