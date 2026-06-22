import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload } from "lucide-react";
import { usePeer } from "@/hooks/PeerContext";
import { PeerCard, type Tracker } from "@/components/PeerCard";
import { CHUNK_SIZE, FILE_META, FILE_CHUNK, FILE_DONE, FILE_ACK, type FileReceiveState } from "@/lib/fileTransfer";

export function TransferPage() {
  const { peerId } = useParams();
  const navigate = useNavigate();
  const { myNickname, nicknameMap, dataConn, sendToPeer, disconnect } = usePeer();
  const peerName = nicknameMap[peerId ?? ""] ?? peerId ?? "Unknown";
  const inputRef = useRef<HTMLInputElement>(null);

  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    filename: string;
    speed: string;
  } | null>(null);

  const [myTracker, setMyTracker] = useState<Tracker>({ sentNames: [], receivedNames: [] });
  const [remoteTracker, setRemoteTracker] = useState<Tracker>({ sentNames: [], receivedNames: [] });
  const [connectionLost, setConnectionLost] = useState(false);
  const hadDataConnRef = useRef(false);

  useEffect(() => {
    if (dataConn) {
      hadDataConnRef.current = true;
      setConnectionLost(false);
    } else if (hadDataConnRef.current) {
      setConnectionLost(true);
    }
  }, [dataConn]);

  useEffect(() => {
    if (!dataConn && !hadDataConnRef.current) {
      setConnectionLost(true);
    }
  }, []);

  const handleDisconnect = () => {
    disconnect();
    navigate("/");
  };

  const handleFiles = useCallback((files: FileList | File[]) => {
    setQueuedFiles((prev) => [...prev, ...Array.from(files)]);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const receiveStateRef = useRef<Map<string, FileReceiveState>>(new Map());
  const sentFilesRef = useRef<Map<string, string>>(new Map());

  const handleSend = async () => {
    if (sendState !== "idle" || queuedFiles.length === 0 || !dataConn) return;
    setSendState("sending");

    const totalBytes = queuedFiles.reduce((s, f) => s + f.size, 0);
    const sentFileNames: string[] = [];
    let bytesSent = 0;
    const startTime = Date.now();

    for (const file of queuedFiles) {
      const fileId = crypto.randomUUID();
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      sendToPeer({
        type: FILE_META,
        id: fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        totalChunks,
      });

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        const chunkBuffer = await chunkBlob.arrayBuffer();

        sendToPeer({
          type: FILE_CHUNK,
          id: fileId,
          index: i,
          total: totalChunks,
          data: chunkBuffer,
        });

        bytesSent += chunkBuffer.byteLength;
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0
          ? `${(bytesSent / elapsed / 1024 / 1024).toFixed(1)} MB/s`
          : "...";

        setProgress({ current: bytesSent, total: totalBytes, filename: file.name, speed });
        await new Promise((r) => setTimeout(r, 5));
      }

      sentFilesRef.current.set(fileId, file.name);
      sendToPeer({ type: FILE_DONE, id: fileId });
      sentFileNames.push(file.name);
    }

    setMyTracker((prev) => ({
      ...prev,
      sentNames: [...prev.sentNames, ...sentFileNames],
    }));
    setSendState("sent");
    setQueuedFiles([]);
    setProgress(null);
    setTimeout(() => setSendState("idle"), 1500);
  };

  useEffect(() => {
    if (!dataConn) return;

    receiveStateRef.current.clear();

    const handler = (raw: unknown) => {
      try {
        const msg = typeof raw === "string" ? JSON.parse(raw) : raw as any;

        switch (msg.type) {
          case FILE_META:
            receiveStateRef.current.set(msg.id, {
              name: msg.name,
              size: msg.size,
              mimeType: msg.mimeType,
              totalChunks: msg.totalChunks,
              chunks: new Map(),
              receivedBytes: 0,
            });
            break;

          case FILE_CHUNK: {
            const state = receiveStateRef.current.get(msg.id);
            if (!state) break;
            const buf = msg.data as ArrayBuffer;
            state.chunks.set(msg.index, buf);
            state.receivedBytes += buf.byteLength;
            break;
          }

          case FILE_DONE: {
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

            setMyTracker((prev) => ({
              ...prev,
              receivedNames: [...prev.receivedNames, state.name],
            }));

            setRemoteTracker((prev) => ({
              ...prev,
              sentNames: [...prev.sentNames, state.name],
            }));

            sendToPeer({ type: FILE_ACK, id: msg.id });
            receiveStateRef.current.delete(msg.id);
            break;
          }

          case FILE_ACK: {
            const fileName = sentFilesRef.current.get(msg.id);
            if (fileName) {
              setRemoteTracker((prev) => ({
                ...prev,
                receivedNames: [...prev.receivedNames, fileName],
              }));
              sentFilesRef.current.delete(msg.id);
            }
            break;
          }
        }
      } catch {}
    };

    dataConn.on("data", handler);
    return () => {
      dataConn.off("data", handler);
    };
  }, [dataConn]);

  const sendLabel =
    sendState === "idle" ? "send" : sendState === "sending" ? "sending..." : "sent!";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col p-6 md:p-12">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        <header className="flex items-center gap-4">
          <button
            onClick={handleDisconnect}
            className="p-2 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} className="text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-indigo-600">Connected to {peerName}</h1>
            <p className="text-xs text-slate-400 font-mono">{peerId}</p>
          </div>
        </header>

        {connectionLost && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
            <p className="text-sm font-medium text-amber-700">Connection lost — data channel closed</p>
            <button
              onClick={handleDisconnect}
              className="mt-1 text-xs text-amber-600 underline hover:text-amber-800 transition-colors cursor-pointer"
            >
              Back to lobby
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <PeerCard
            label="You"
            name={myNickname}
            subtitle={nicknameMap[peerId ?? ""] ? "—" : peerId}
            tracker={myTracker}
          />
          <PeerCard
            label="Peer"
            name={peerName}
            subtitle={peerId}
            tracker={remoteTracker}
          />
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-14 text-center hover:border-indigo-400 transition-colors cursor-pointer bg-white"
        >
          <Upload size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">Drop a file or browse files</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        {progress && (
          <div className="space-y-2">
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-center">
              {progress.filename} · {progress.speed}
            </p>
          </div>
        )}

        {queuedFiles.length > 0 && sendState === "idle" && (
          <p className="relative group text-xs text-slate-400 text-center -mt-3">
            <span className="border-b border-dashed border-slate-300 cursor-pointer">
              {queuedFiles.length} file{queuedFiles.length > 1 ? "s" : ""} selected
            </span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
              <span className="bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap block">
                {queuedFiles.map((f) => (
                  <span key={f.name} className="block text-slate-300">{f.name}</span>
                ))}
              </span>
            </span>
          </p>
        )}

        <p
          onClick={handleSend}
          className={`text-center text-lg border-b-2 border-dashed border-slate-400 pb-0.5 w-fit mx-auto transition-all duration-200 cursor-pointer select-none
            ${sendState === "idle" && queuedFiles.length > 0 ? "hover:scale-110 hover:border-indigo-500 hover:text-indigo-600 text-slate-600" : ""}
            ${sendState === "idle" && queuedFiles.length === 0 ? "text-slate-300 cursor-default" : ""}
            ${sendState === "sending" ? "text-amber-500 animate-pulse" : ""}
            ${sendState === "sent" ? "text-green-500" : ""}`}
        >
          {sendLabel}
        </p>

        <p className="text-center text-xs text-slate-400 pt-2">
          Want to send more files? Just select files and press send!
        </p>
      </div>
    </div>
  );
}
