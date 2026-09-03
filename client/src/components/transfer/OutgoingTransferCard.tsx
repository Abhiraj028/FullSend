import type { ChangeEvent } from "react";
import { formatBytes } from "../../lib/format";
import type { OutgoingBatch } from "../../lib/transfer";
import { FileList, TransferProgress } from "./TransferPrimitives";

type Props = {
  channelIsOpen: boolean;
  outgoingBatch: OutgoingBatch | null;
  outgoingHistory: OutgoingBatch[];
  draftFiles: File[];
  sentBytes: number;
  onOfferSelectedFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveDraftFile: (index: number) => void;
  onOfferDraftBatch: () => void;
};

export function OutgoingTransferCard({
  channelIsOpen,
  outgoingBatch,
  outgoingHistory,
  draftFiles,
  sentBytes,
  onOfferSelectedFiles,
  onRemoveDraftFile,
  onOfferDraftBatch,
}: Props) {
  const current = outgoingBatch?.files[outgoingBatch.currentIndex];
  const canChooseFiles =
    !outgoingBatch || ["failed", "verified"].includes(outgoingBatch.status);

  return (
    <div className="transfer-card outgoing-card">
      <div className="transfer-heading">
        <div>
          <p className="label">Outgoing</p>
          <p className="file-name">Sent from this device</p>
        </div>
        <div className="transfer-heading-actions">
          {outgoingBatch && (
            <span className="transfer-state">{outgoingBatch.status}</span>
          )}
          {channelIsOpen && canChooseFiles && (
            <label className="file-button compact-file-button">
              Add files
              <input type="file" multiple onChange={onOfferSelectedFiles} />
            </label>
          )}
        </div>
      </div>

      {draftFiles.length > 0 && (
        <div className="draft-list">
          {draftFiles.map((file, index) => (
            <div className="draft-file" key={`${file.name}-${index}`}>
              <span>
                {file.name} · {formatBytes(file.size)}
              </span>
              <button
                className="remove-file"
                onClick={() => onRemoveDraftFile(index)}
              >
                Remove
              </button>
            </div>
          ))}
          <button onClick={onOfferDraftBatch}>
            Offer {draftFiles.length} file{draftFiles.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {outgoingHistory.length > 0 && (
        <div className="history-list">
          {outgoingHistory.map((batch) => (
            <details className="history-entry" key={batch.batchId}>
              <summary>
                {batch.files.length} file
                {batch.files.length === 1 ? "" : "s"} · {batch.status}
              </summary>
              <FileList files={batch.files} />
            </details>
          ))}
        </div>
      )}

      {outgoingBatch && (
        <div className="current-batch">
          <p className="batch-caption">
            Latest · {outgoingBatch.files.length} file
            {outgoingBatch.files.length === 1 ? "" : "s"}
          </p>
          <FileList files={outgoingBatch.files} />
          {current && (
            <>
              <p className="hint">Current: {current.name}</p>
              {["sending", "hashing", "complete-sent"].includes(
                outgoingBatch.status,
              ) && <TransferProgress value={sentBytes} total={current.size} />}
            </>
          )}
          {outgoingBatch.status === "complete-sent" && (
            <p className="hint">
              Waiting for verification before the next file.
            </p>
          )}
          {outgoingBatch.status === "verified" && (
            <p className="hint">Peer verified every file in the batch.</p>
          )}
        </div>
      )}
    </div>
  );
}
