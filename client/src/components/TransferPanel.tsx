import type { ChangeEvent } from "react";
import type { BatchFile, BatchOfferMessage, RoomRole } from "../lib/protocol";
import type {
  CompletedDownload,
  IncomingHistoryEntry,
  OutgoingBatch,
} from "../lib/transfer";
import { IncomingTransferCard } from "./transfer/IncomingTransferCard";
import { OutgoingTransferCard } from "./transfer/OutgoingTransferCard";
import "./TransferPanel.css";

type Props = {
  controlChannelStatus: RTCDataChannelState | "not-created";
  role: RoomRole;
  outgoingBatch: OutgoingBatch | null;
  outgoingHistory: OutgoingBatch[];
  incomingBatch: BatchOfferMessage | null;
  incomingHistory: IncomingHistoryEntry[];
  incomingDecision: "pending" | "accepted" | "rejected" | null;
  activeIncomingFile: BatchFile | null;
  verificationStatus: "idle" | "verifying" | "verified" | "failed";
  sentBytes: number;
  receivedBytes: number;
  completedDownloads: CompletedDownload[];
  draftFiles: File[];
  onOfferSelectedFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveDraftFile: (index: number) => void;
  onOfferDraftBatch: () => void;
  onAcceptIncomingBatch: () => void;
  onRejectIncomingBatch: () => void;
};

export function TransferPanel(props: Props) {
  const channelIsOpen = props.controlChannelStatus === "open";
  const hasOutgoing =
    props.draftFiles.length > 0 ||
    props.outgoingBatch !== null ||
    props.outgoingHistory.length > 0;
  const hasIncoming =
    props.incomingBatch !== null || props.incomingHistory.length > 0;

  return (
    <section className={`transfer-panel role-${props.role ?? "none"}`}>
      {!channelIsOpen && (
        <div className="transfer-empty">
          <p className="label">Transfer workspace</p>
          <p className="hint">The direct transfer channel is not open.</p>
        </div>
      )}

      {channelIsOpen && !hasOutgoing && (
        <div className="idle-picker">
          <label className="file-button">
            Choose files
            <input
              type="file"
              multiple
              onChange={props.onOfferSelectedFiles}
            />
          </label>
        </div>
      )}

      {hasOutgoing && (
        <OutgoingTransferCard
          channelIsOpen={channelIsOpen}
          outgoingBatch={props.outgoingBatch}
          outgoingHistory={props.outgoingHistory}
          draftFiles={props.draftFiles}
          sentBytes={props.sentBytes}
          onOfferSelectedFiles={props.onOfferSelectedFiles}
          onRemoveDraftFile={props.onRemoveDraftFile}
          onOfferDraftBatch={props.onOfferDraftBatch}
        />
      )}

      {hasIncoming && (
        <IncomingTransferCard
          channelIsOpen={channelIsOpen}
          incomingBatch={props.incomingBatch}
          incomingHistory={props.incomingHistory}
          incomingDecision={props.incomingDecision}
          activeIncomingFile={props.activeIncomingFile}
          verificationStatus={props.verificationStatus}
          receivedBytes={props.receivedBytes}
          completedDownloads={props.completedDownloads}
          onAcceptIncomingBatch={props.onAcceptIncomingBatch}
          onRejectIncomingBatch={props.onRejectIncomingBatch}
        />
      )}
    </section>
  );
}
