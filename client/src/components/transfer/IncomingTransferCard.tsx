import type { BatchFile, BatchOfferMessage } from "../../lib/protocol";
import type {
  CompletedDownload,
  IncomingHistoryEntry,
} from "../../lib/transfer";
import { FileList, TransferProgress } from "./TransferPrimitives";

type Props = {
  channelIsOpen: boolean;
  incomingBatch: BatchOfferMessage | null;
  incomingHistory: IncomingHistoryEntry[];
  incomingDecision: "pending" | "accepted" | "rejected" | null;
  activeIncomingFile: BatchFile | null;
  verificationStatus: "idle" | "verifying" | "verified" | "failed";
  receivedBytes: number;
  completedDownloads: CompletedDownload[];
  onAcceptIncomingBatch: () => void;
  onRejectIncomingBatch: () => void;
};

export function IncomingTransferCard({
  channelIsOpen,
  incomingBatch,
  incomingHistory,
  incomingDecision,
  activeIncomingFile,
  verificationStatus,
  receivedBytes,
  completedDownloads,
  onAcceptIncomingBatch,
  onRejectIncomingBatch,
}: Props) {
  return (
    <div className="transfer-card incoming-card">
      <div className="transfer-heading">
        <div>
          <p className="label">Incoming</p>
          <p className="file-name">Received on this device</p>
        </div>
        {incomingBatch && (
          <span className="transfer-state">
            {incomingDecision ?? "pending"}
          </span>
        )}
      </div>

      {incomingHistory.length > 0 && (
        <div className="history-list">
          {incomingHistory.map(({ batch, decision }) => (
            <details className="history-entry" key={batch.batchId}>
              <summary>
                {batch.files.length} file
                {batch.files.length === 1 ? "" : "s"} · {decision}
              </summary>
              <FileList files={batch.files} downloads={completedDownloads} />
            </details>
          ))}
        </div>
      )}

      {incomingBatch && (
        <div className="current-batch">
          <p className="batch-caption">
            Latest · {incomingBatch.files.length} file
            {incomingBatch.files.length === 1 ? "" : "s"}
          </p>
          <FileList
            files={incomingBatch.files}
            downloads={completedDownloads}
          />
          {channelIsOpen && incomingDecision === "pending" && (
            <div className="actions">
              <button onClick={onAcceptIncomingBatch}>Accept batch</button>
              <button
                className="secondary-button"
                onClick={onRejectIncomingBatch}
              >
                Reject batch
              </button>
            </div>
          )}
          {activeIncomingFile && incomingDecision === "accepted" && (
            <>
              <p className="hint">
                Receiving {activeIncomingFile.name}
                {verificationStatus === "verifying" &&
                  " · Verifying SHA-256…"}
                {verificationStatus === "failed" &&
                  " · Verification failed."}
              </p>
              <TransferProgress
                value={receivedBytes}
                total={activeIncomingFile.size}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
