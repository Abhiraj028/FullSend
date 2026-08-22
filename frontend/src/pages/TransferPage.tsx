import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, X } from "lucide-react";
import { usePeer } from "@/hooks/PeerContext";
import { PeerCard } from "@/components/PeerCard";
import { useFileTransfer } from "@/hooks/useFileTransfer";

export function TransferPage() {
  const { peerId } = useParams();
  const navigate = useNavigate();
  const { myNickname, nicknameMap, dataConn, disconnect, connectedPeerId } = usePeer();
  
  // T12: Recover from session storage if we lose state on refresh
  const [peerName, setPeerName] = useState(() => {
    const saved = sessionStorage.getItem("fullsend_peer");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.peerId === peerId) return parsed.peerName;
    }
    return nicknameMap[peerId ?? ""] ?? peerId ?? "Unknown";
  });

  useEffect(() => {
    if (peerId && nicknameMap[peerId]) {
      const name = nicknameMap[peerId];
      setPeerName(name);
      sessionStorage.setItem("fullsend_peer", JSON.stringify({ peerId, peerName: name }));
    }
  }, [peerId, nicknameMap]);

  const inputRef = useRef<HTMLInputElement>(null);

  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [connectionLost, setConnectionLost] = useState(!dataConn);
  const hadDataConnRef = useRef(!!dataConn);

  const { sendState, progress, myTracker, remoteTracker, sendFiles } = useFileTransfer(dataConn);

  useEffect(() => {
    if (dataConn) {
      hadDataConnRef.current = true;
      setConnectionLost(false);
    } else if (hadDataConnRef.current || !dataConn) {
      setConnectionLost(true);
    }
  }, [dataConn]);

  const handleDisconnect = () => {
    disconnect();
    sessionStorage.removeItem("fullsend_peer");
    navigate("/");
  };

  const handleFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files);
    // T10: Add pre-send size validation (warn if single file > 2GB)
    const validFiles = newFiles.filter(f => {
      if (f.size > 2 * 1024 * 1024 * 1024) {
        alert(`File ${f.name} is too large (> 2GB) and may crash the browser.`);
        return false;
      }
      return true;
    });
    setQueuedFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setQueuedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    sendFiles(queuedFiles).then(() => setQueuedFiles([]));
  };

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
            <p className="text-sm font-medium text-amber-700">
              {hadDataConnRef.current ? "Connection lost — data channel closed" : "Session interrupted — not connected"}
            </p>
            <button
              onClick={handleDisconnect}
              className="mt-1 text-xs text-amber-600 underline hover:text-amber-800 transition-colors cursor-pointer"
            >
              Back to lobby to reconnect
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
          <div className="flex flex-wrap justify-center gap-2 -mt-3 relative z-10 max-h-32 overflow-y-auto p-2">
            {queuedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1 bg-white border border-slate-200 rounded-full pl-3 pr-1 py-1 shadow-sm text-xs group">
                <span className="truncate max-w-[120px] text-slate-600">{f.name}</span>
                <button
                  onClick={(e) => removeFile(i, e)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
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
