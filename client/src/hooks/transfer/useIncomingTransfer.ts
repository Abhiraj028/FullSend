import { useCallback, useEffect, useRef, useState } from "react";
import { sha256Hex } from "../../lib/hash";
import {
  type BatchFile,
  type BatchOfferMessage,
  type ControlMessage,
} from "../../lib/protocol";
import {
  type CompletedDownload,
  type IncomingHistoryEntry,
  type ReportEvent,
  type SendControlMessage,
} from "../../lib/transfer";

type Options = {
  sendControlMessage: SendControlMessage;
  closePeerConnection: () => void;
  reportEvent: ReportEvent;
  reportConnectionError: (message: string) => void;
};

export function useIncomingTransfer({
  sendControlMessage,
  closePeerConnection,
  reportEvent,
  reportConnectionError,
}: Options) {
  // Data-channel callbacks can outrun React renders, so refs own live protocol state.
  const incomingBatchRef = useRef<BatchOfferMessage | null>(null);
  const incomingDecisionRef = useRef<
    "pending" | "accepted" | "rejected" | null
  >(null);
  const activeIncomingFileRef = useRef<BatchFile | null>(null);
  const downloadUrlsRef = useRef<string[]>([]);
  const receivedChunksRef = useRef<ArrayBuffer[]>([]);
  const receivedBytesRef = useRef(0);
  const receiveFailedRef = useRef(false);
  const verificationStartedRef = useRef<string | null>(null);

  const [incomingBatch, setIncomingBatch] = useState<BatchOfferMessage | null>(
    null,
  );
  const [incomingDecision, setIncomingDecision] = useState<
    "pending" | "accepted" | "rejected" | null
  >(null);
  const [activeIncomingFile, setActiveIncomingFile] =
    useState<BatchFile | null>(null);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [senderCompletedBytes, setSenderCompletedBytes] = useState<
    number | null
  >(null);
  const [expectedHash, setExpectedHash] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<
    "idle" | "verifying" | "verified" | "failed"
  >("idle");
  const [completedDownloads, setCompletedDownloads] = useState<
    CompletedDownload[]
  >([]);
  const [incomingHistory, setIncomingHistory] = useState<
    IncomingHistoryEntry[]
  >([]);

  const handleControlMessage = useCallback(
    (message: ControlMessage) => {
      if (message.type === "batch-offer") {
        const previousBatch = incomingBatchRef.current;
        const previousDecision = incomingDecisionRef.current;
        if (
          previousBatch &&
          (previousDecision === "accepted" || previousDecision === "rejected")
        ) {
          setIncomingHistory((history) => [
            ...history,
            { batch: previousBatch, decision: previousDecision },
          ]);
        }
        incomingBatchRef.current = message;
        incomingDecisionRef.current = "pending";
        activeIncomingFileRef.current = null;
        setIncomingBatch(message);
        setIncomingDecision("pending");
        setActiveIncomingFile(null);
        reportEvent(`Received a batch of ${message.files.length} file(s).`);
        return;
      }

      if (message.type === "file-start") {
        const file = incomingBatchRef.current?.files.find(
          (candidate) => candidate.transferId === message.transferId,
        );
        if (!file || incomingDecisionRef.current !== "accepted") return;

        receivedChunksRef.current = [];
        receivedBytesRef.current = 0;
        receiveFailedRef.current = false;
        verificationStartedRef.current = null;
        activeIncomingFileRef.current = file;
        setActiveIncomingFile(file);
        setReceivedBytes(0);
        setSenderCompletedBytes(null);
        setExpectedHash(null);
        setVerificationStatus("idle");

        if (
          !sendControlMessage({
            type: "file-ready",
            transferId: file.transferId,
          })
        ) {
          reportEvent("The control channel closed before the file could start.");
          return;
        }
        reportEvent(`Receiving ${file.name}.`);
        return;
      }

      if (message.type === "file-complete") {
        const activeFile = activeIncomingFileRef.current;
        if (
          receiveFailedRef.current ||
          !activeFile ||
          activeFile.transferId !== message.transferId ||
          message.byteCount !== activeFile.size
        ) {
          return;
        }
        setExpectedHash(message.sha256);
        setSenderCompletedBytes(message.byteCount);
        reportEvent(
          `Peer finished sending ${activeFile.name}. Checking received data.`,
        );
      }
    },
    [reportEvent, sendControlMessage],
  );

  const handleFileData = useCallback(
    (data: ArrayBuffer) => {
      const file = activeIncomingFileRef.current;
      if (!file || receiveFailedRef.current) return;

      const nextByteCount = receivedBytesRef.current + data.byteLength;
      // Declared size is a protocol boundary: excess bytes terminate the peer connection.
      if (nextByteCount > file.size) {
        receiveFailedRef.current = true;
        receivedChunksRef.current = [];
        setVerificationStatus("failed");
        reportEvent(`Stopped ${file.name}: peer sent more data than declared.`);
        reportConnectionError(
          "The peer exceeded the declared file size, so the direct connection was closed.",
        );
        closePeerConnection();
        return;
      }

      receivedChunksRef.current.push(data);
      receivedBytesRef.current = nextByteCount;
      setReceivedBytes(nextByteCount);
    },
    [closePeerConnection, reportConnectionError, reportEvent],
  );

  useEffect(() => {
    const file = activeIncomingFile;
    // Verify only after both the sender receipt and every declared byte have arrived.
    if (
      !file ||
      !expectedHash ||
      senderCompletedBytes !== file.size ||
      receivedBytes !== file.size ||
      verificationStartedRef.current === file.transferId
    ) {
      return;
    }

    verificationStartedRef.current = file.transferId;
    setVerificationStatus("verifying");
    void (async () => {
      const blob = new Blob(receivedChunksRef.current, {
        type: file.mimeType || "application/octet-stream",
      });
      receivedChunksRef.current = [];
      const actualHash = await sha256Hex(blob);

      if (actualHash !== expectedHash) {
        setVerificationStatus("failed");
        reportEvent(`${file.name} failed verification.`);
        sendControlMessage({
          type: "file-integrity-failed",
          transferId: file.transferId,
          expectedHash,
          actualHash,
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      downloadUrlsRef.current.push(url);
      const download = document.createElement("a");
      download.href = url;
      download.download = file.name;
      download.hidden = true;
      document.body.append(download);
      download.click();
      download.remove();
      setCompletedDownloads((downloads) => [
        ...downloads,
        { transferId: file.transferId, name: file.name, url },
      ]);
      setVerificationStatus("verified");
      reportEvent(`${file.name} passed SHA-256 verification.`);
      sendControlMessage({
        type: "file-verified",
        transferId: file.transferId,
        sha256: actualHash,
      });
    })();
  }, [
    activeIncomingFile,
    expectedHash,
    receivedBytes,
    reportEvent,
    sendControlMessage,
    senderCompletedBytes,
  ]);

  useEffect(
    () => () => {
      // Object URLs retain their Blob in memory until explicitly revoked.
      downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  function acceptIncomingBatch() {
    const batch = incomingBatchRef.current;
    if (!batch || incomingDecisionRef.current !== "pending") return;
    if (!sendControlMessage({ type: "batch-accept", batchId: batch.batchId })) {
      reportEvent("The control channel is not ready.");
      return;
    }
    incomingDecisionRef.current = "accepted";
    setIncomingDecision("accepted");
    reportEvent(`Accepted ${batch.files.length} file(s).`);
  }

  function rejectIncomingBatch() {
    const batch = incomingBatchRef.current;
    if (!batch || incomingDecisionRef.current !== "pending") return;
    if (
      !sendControlMessage({
        type: "batch-reject",
        batchId: batch.batchId,
        reason: "Receiver declined the batch.",
      })
    ) {
      reportEvent("The control channel is not ready.");
      return;
    }
    incomingDecisionRef.current = "rejected";
    setIncomingDecision("rejected");
    reportEvent("Rejected the batch.");
  }

  return {
    incomingBatch,
    incomingHistory,
    incomingDecision,
    activeIncomingFile,
    verificationStatus,
    receivedBytes,
    completedDownloads,
    handleControlMessage,
    handleFileData,
    acceptIncomingBatch,
    rejectIncomingBatch,
  };
}
