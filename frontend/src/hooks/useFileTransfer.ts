import { useState, useRef, useEffect, useCallback } from "react";
import type { DataConnection } from "peerjs";
import { parseTransferMessage, transferMsg, CHUNK_SIZE } from "@fullsend/shared";

export type Tracker = {
  sentNames: string[];
  receivedNames: string[];
};

type FileReceiveState = {
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  chunks: Map<number, ArrayBuffer>;
  receivedBytes: number;
};

export function useFileTransfer(dataConn: DataConnection | null) {
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    filename: string;
    speed: string;
  } | null>(null);

  const [myTracker, setMyTracker] = useState<Tracker>({ sentNames: [], receivedNames: [] });
  const [remoteTracker, setRemoteTracker] = useState<Tracker>({ sentNames: [], receivedNames: [] });

  const receiveStateRef = useRef<Map<string, FileReceiveState>>(new Map());
  const sentFilesRef = useRef<Map<string, string>>(new Map());

  // Listen for incoming files via DataChannel
  useEffect(() => {
    if (!dataConn) return;

    receiveStateRef.current.clear();

    const handler = (raw: unknown) => {
      const msg = parseTransferMessage(raw);
      if (!msg) return;

      switch (msg.type) {
        case "file-meta":
          receiveStateRef.current.set(msg.id, {
            name: msg.name,
            size: msg.size,
            mimeType: msg.mimeType,
            totalChunks: msg.totalChunks,
            chunks: new Map(),
            receivedBytes: 0,
          });
          break;

        case "file-chunk": {
          const state = receiveStateRef.current.get(msg.id);
          if (!state) break;
          const buf = msg.data as ArrayBuffer;
          state.chunks.set(msg.index, buf);
          state.receivedBytes += buf.byteLength;
          break;
        }

        case "file-done": {
          const state = receiveStateRef.current.get(msg.id);
          if (!state) break;

          const chunks: ArrayBuffer[] = [];
          for (let i = 0; i < state.totalChunks; i++) {
            const c = state.chunks.get(i);
            if (c) chunks.push(c);
          }

          const blob = new Blob(chunks, { type: state.mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = state.name;
          a.click();
          URL.revokeObjectURL(url);

          setMyTracker((prev) => ({ ...prev, receivedNames: [...prev.receivedNames, state.name] }));
          setRemoteTracker((prev) => ({ ...prev, sentNames: [...prev.sentNames, state.name] }));

          dataConn.send(transferMsg.ack(msg.id));
          receiveStateRef.current.delete(msg.id);
          break;
        }

        case "file-ack": {
          const fileName = sentFilesRef.current.get(msg.id);
          if (fileName) {
            setRemoteTracker((prev) => ({ ...prev, receivedNames: [...prev.receivedNames, fileName] }));
            sentFilesRef.current.delete(msg.id);
          }
          break;
        }
      }
    };

    dataConn.on("data", handler);
    return () => {
      dataConn.off("data", handler);
    };
  }, [dataConn]);

  const sendFiles = useCallback(async (files: File[]) => {
    if (sendState !== "idle" || files.length === 0 || !dataConn) return;
    setSendState("sending");

    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    const sentFileNames: string[] = [];
    let bytesSent = 0;
    const startTime = Date.now();

    for (const file of files) {
      const fileId = crypto.randomUUID();
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      dataConn.send(transferMsg.meta(fileId, file.name, file.size, file.type, totalChunks));

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        const chunkBuffer = await chunkBlob.arrayBuffer();

        dataConn.send(transferMsg.chunk(fileId, i, totalChunks, chunkBuffer));

        bytesSent += chunkBuffer.byteLength;
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? `${(bytesSent / elapsed / 1024 / 1024).toFixed(1)} MB/s` : "...";

        setProgress({ current: bytesSent, total: totalBytes, filename: file.name, speed });
        await new Promise((r) => setTimeout(r, 5));
      }

      sentFilesRef.current.set(fileId, file.name);
      dataConn.send(transferMsg.done(fileId));
      sentFileNames.push(file.name);
    }

    setMyTracker((prev) => ({ ...prev, sentNames: [...prev.sentNames, ...sentFileNames] }));
    setSendState("sent");
    setProgress(null);
    setTimeout(() => setSendState("idle"), 1500);
  }, [dataConn, sendState]);

  return {
    sendState,
    progress,
    myTracker,
    remoteTracker,
    sendFiles
  };
}
