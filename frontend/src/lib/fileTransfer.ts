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

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(b64: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
