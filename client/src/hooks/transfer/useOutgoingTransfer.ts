import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { sha256Hex } from "../../lib/hash";
import type { ControlMessage } from "../../lib/protocol";
import {
  FILE_CHUNK_SIZE,
  type OutgoingBatch,
  type ReportEvent,
  type SendControlMessage,
  type SendFileData,
} from "../../lib/transfer";

export function useOutgoingTransfer(
  sendControlMessage: SendControlMessage,
  sendFileData: SendFileData,
  reportEvent: ReportEvent,
) {
  const outgoingBatchRef = useRef<OutgoingBatch | null>(null);
  const sendCurrentFileRef = useRef<() => void>(() => {});
  const startSendingFileRef = useRef<() => void>(() => {});
  const [outgoingBatch, setOutgoingBatch] = useState<OutgoingBatch | null>(
    null,
  );
  const [outgoingHistory, setOutgoingHistory] = useState<OutgoingBatch[]>([]);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [sentBytes, setSentBytes] = useState(0);

  const replaceOutgoingBatch = useCallback((batch: OutgoingBatch | null) => {
    // The ref is protocol truth for async callbacks; state is its UI projection.
    outgoingBatchRef.current = batch;
    setOutgoingBatch(batch);
  }, []);

  const sendCurrentFile = useCallback(() => {
    const batch = outgoingBatchRef.current;
    const file = batch?.files[batch.currentIndex];
    if (!batch || !file || batch.status !== "accepted") return;

    // Do not emit binary data until the receiver has reset its buffers for this file.
    if (
      !sendControlMessage({ type: "file-start", transferId: file.transferId })
    ) {
      replaceOutgoingBatch({ ...batch, status: "failed" });
      reportEvent("The control channel is not ready to start the next file.");
      return;
    }

    replaceOutgoingBatch({ ...batch, status: "starting" });
    setSentBytes(0);
    reportEvent(`Preparing to send ${file.name}.`);
  }, [replaceOutgoingBatch, reportEvent, sendControlMessage]);

  const startSendingFile = useCallback(() => {
    const batch = outgoingBatchRef.current;
    const item = batch?.files[batch.currentIndex];
    if (!batch || !item || batch.status !== "starting") return;

    replaceOutgoingBatch({ ...batch, status: "sending" });
    void (async () => {
      try {
        let offset = 0;
        while (offset < item.file.size) {
          const chunk = await item.file
            .slice(offset, offset + FILE_CHUNK_SIZE)
            .arrayBuffer();
          if (!(await sendFileData(chunk))) {
            throw new Error("The file channel is no longer open.");
          }
          offset += chunk.byteLength;
          setSentBytes(offset);
        }

        const sendingBatch = outgoingBatchRef.current;
        if (
          !sendingBatch ||
          sendingBatch.batchId !== batch.batchId ||
          sendingBatch.files[sendingBatch.currentIndex]?.transferId !==
            item.transferId
        ) {
          return;
        }

        replaceOutgoingBatch({ ...sendingBatch, status: "hashing" });
        // Hash after streaming so verification does not delay the first byte sent.
        const sha256 = await sha256Hex(item.file);
        const hashingBatch = outgoingBatchRef.current;
        if (
          !hashingBatch ||
          hashingBatch.batchId !== batch.batchId ||
          hashingBatch.files[hashingBatch.currentIndex]?.transferId !==
            item.transferId
        ) {
          return;
        }

        if (
          !sendControlMessage({
            type: "file-complete",
            transferId: item.transferId,
            byteCount: item.file.size,
            sha256,
          })
        ) {
          throw new Error("Could not send the file completion message.");
        }

        replaceOutgoingBatch({
          ...hashingBatch,
          status: "complete-sent",
          currentHash: sha256,
        });
        reportEvent(`Sent ${item.name}; waiting for verification.`);
      } catch (error) {
        const current = outgoingBatchRef.current;
        if (
          current?.batchId === batch.batchId &&
          current.files[current.currentIndex]?.transferId === item.transferId
        ) {
          replaceOutgoingBatch({ ...current, status: "failed" });
        }
        reportEvent(
          `File transfer stopped: ${error instanceof Error ? error.message : "Unknown transfer error."}`,
        );
      }
    })();
  }, [replaceOutgoingBatch, reportEvent, sendControlMessage, sendFileData]);

  useEffect(() => {
    sendCurrentFileRef.current = sendCurrentFile;
  }, [sendCurrentFile]);

  useEffect(() => {
    startSendingFileRef.current = startSendingFile;
  }, [startSendingFile]);

  const handleControlMessage = useCallback(
    (message: ControlMessage) => {
      if (message.type === "batch-accept") {
        const batch = outgoingBatchRef.current;
        if (
          !batch ||
          batch.batchId !== message.batchId ||
          batch.status !== "waiting"
        ) {
          return;
        }
        replaceOutgoingBatch({ ...batch, status: "accepted" });
        reportEvent("Peer accepted the batch. Starting transfer.");
        // Leave the current message handler before advancing the next protocol step.
        queueMicrotask(() => sendCurrentFileRef.current());
        return;
      }

      if (message.type === "batch-reject") {
        const batch = outgoingBatchRef.current;
        if (
          !batch ||
          batch.batchId !== message.batchId ||
          batch.status !== "waiting"
        ) {
          return;
        }
        replaceOutgoingBatch({ ...batch, status: "failed" });
        reportEvent(`Peer rejected the batch: ${message.reason}`);
        return;
      }

      if (message.type === "file-ready") {
        const batch = outgoingBatchRef.current;
        const current = batch?.files[batch.currentIndex];
        if (
          !batch ||
          batch.status !== "starting" ||
          current?.transferId !== message.transferId
        ) {
          return;
        }
        startSendingFileRef.current();
        return;
      }

      if (message.type === "file-verified") {
        const batch = outgoingBatchRef.current;
        const current = batch?.files[batch.currentIndex];
        if (
          !batch ||
          !current ||
          current.transferId !== message.transferId ||
          batch.status !== "complete-sent"
        ) {
          return;
        }
        if (batch.currentHash !== message.sha256) {
          replaceOutgoingBatch({ ...batch, status: "failed" });
          reportEvent(
            `Peer returned the wrong verification hash for ${current.name}.`,
          );
          return;
        }
        if (batch.currentIndex === batch.files.length - 1) {
          replaceOutgoingBatch({ ...batch, status: "verified" });
          reportEvent("Peer verified the complete batch.");
        } else {
          replaceOutgoingBatch({
            ...batch,
            currentIndex: batch.currentIndex + 1,
            status: "accepted",
            currentHash: undefined,
          });
          reportEvent(`Peer verified ${current.name}. Starting the next file.`);
          queueMicrotask(() => sendCurrentFileRef.current());
        }
        return;
      }

      if (message.type === "file-integrity-failed") {
        const batch = outgoingBatchRef.current;
        const current = batch?.files[batch.currentIndex];
        if (!batch || !current || current.transferId !== message.transferId) {
          return;
        }
        replaceOutgoingBatch({ ...batch, status: "failed" });
        reportEvent(`Peer could not verify ${current.name}. Batch stopped.`);
      }
    },
    [replaceOutgoingBatch, reportEvent],
  );

  function offerSelectedFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    if (
      outgoingBatchRef.current &&
      !["failed", "verified"].includes(outgoingBatchRef.current.status)
    ) {
      reportEvent("Wait for the current batch to finish.");
      return;
    }
    setDraftFiles((current) => [...current, ...files]);
  }

  function removeDraftFile(index: number) {
    setDraftFiles((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function offerDraftBatch() {
    const files = draftFiles;
    if (files.length === 0) return;

    const previousBatch = outgoingBatchRef.current;
    if (
      previousBatch &&
      ["failed", "verified"].includes(previousBatch.status)
    ) {
      setOutgoingHistory((history) => [...history, previousBatch]);
    }

    const batch: OutgoingBatch = {
      batchId: crypto.randomUUID(),
      files: files.map((file) => ({
        transferId: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        mimeType: file.type,
        file,
      })),
      currentIndex: 0,
      status: "waiting",
    };
    const metadata = batch.files.map((file) => ({
      transferId: file.transferId,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
    }));

    // The offer contains metadata only; bytes wait for batch-accept and file-ready.
    if (
      !sendControlMessage({
        type: "batch-offer",
        batchId: batch.batchId,
        files: metadata,
      })
    ) {
      reportEvent("The control channel is not ready for a batch offer.");
      return;
    }

    replaceOutgoingBatch(batch);
    setDraftFiles([]);
    reportEvent(`Offered a batch of ${files.length} file(s).`);
  }

  return {
    outgoingBatch,
    outgoingHistory,
    draftFiles,
    sentBytes,
    handleControlMessage,
    offerSelectedFiles,
    removeDraftFile,
    offerDraftBatch,
  };
}
