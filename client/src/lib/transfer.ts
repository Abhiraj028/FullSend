import type { BatchFile, BatchOfferMessage, ControlMessage } from "./protocol";

export const FILE_CHUNK_SIZE = 64 * 1024;

export type BatchStatus =
  | "waiting"
  | "accepted"
  | "starting"
  | "sending"
  | "hashing"
  | "complete-sent"
  | "failed"
  | "verified";

export type OutgoingBatchFile = BatchFile & { file: File };

export type OutgoingBatch = {
  batchId: string;
  files: OutgoingBatchFile[];
  currentIndex: number;
  status: BatchStatus;
  currentHash?: string;
};

export type CompletedDownload = {
  transferId: string;
  name: string;
  url: string;
};

export type IncomingHistoryEntry = {
  batch: BatchOfferMessage;
  decision: "accepted" | "rejected";
};

export type SendControlMessage = (message: ControlMessage) => boolean;
export type SendFileData = (data: ArrayBuffer) => Promise<boolean>;
export type ReportEvent = (message: string) => void;
