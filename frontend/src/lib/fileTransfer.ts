export const CHUNK_SIZE = 65536;

export const FILE_META = "file-meta";
export const FILE_CHUNK = "file-chunk";
export const FILE_DONE = "file-done";
export const FILE_ACK = "file-ack";

export type FileReceiveState = {
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  chunks: Map<number, ArrayBuffer>;
  receivedBytes: number;
};

