import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { usePeer } from "@/hooks/PeerContext";
import { PeerIdentity } from "@/components/PeerIdentity";
import { PeerList } from "@/components/PeerList";
import { ConnectForm } from "@/components/ConnectForm";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { ConnectionStatus } from "@/components/ConnectionStatus";

export function LobbyPage() {
  const navigate = useNavigate();
  const {
    myPeerId,
    remotePeerId,
    availablePeers,
    myNickname,
    nicknameMap,
    connectionStatus,
    connectedPeerId,
    dataConn,
    pendingRequest,
    connectionError,
    setRemotePeerId,
    handleConnect,
    acceptRequest,
    rejectRequest,
    updateNickname,
    clearConnectionError,
  } = usePeer();

  useEffect(() => {
    if (connectionStatus === "connected" && connectedPeerId && dataConn) {
      navigate(`/transfer/${connectedPeerId}`);
    }
  }, [connectionStatus, connectedPeerId, dataConn, navigate]);

  const handleNicknameChange = (newName: string) => {
    localStorage.setItem("fullsend_nickname", newName);
    updateNickname(newName);
  };

  const errorMessage = connectionError === "accept_timeout"
    ? "Connection failed — peer disconnected during handshake"
    : connectionError === "connect_timeout"
    ? "Connection request timed out — no response from peer"
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col items-center p-6 md:p-12">
      <div className="max-w-3xl w-full space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-indigo-600">FullSend</h1>
          <p className="text-slate-500 text-lg">Fast, private peer-to-peer data transfer.</p>
        </header>

        {errorMessage && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-amber-700">{errorMessage}</p>
            <button
              onClick={clearConnectionError}
              className="p-1 hover:bg-amber-100 rounded transition-colors cursor-pointer shrink-0"
            >
              <X size={14} className="text-amber-500" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <PeerIdentity peerId={myPeerId} nickname={myNickname} />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-50">
              <PeerList
                peers={availablePeers}
                myPeerId={myPeerId}
                onSelect={setRemotePeerId}
              />
            </div>
          </div>

          <div className="flex flex-col">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <ConnectForm
                value={remotePeerId}
                onChange={setRemotePeerId}
                onConnect={handleConnect}
                status={connectionStatus}
                peers={availablePeers}
              />
            </div>
            <div className="mt-3">
              <ConnectionStatus status={connectionStatus} peerId={connectedPeerId || remotePeerId} nicknameMap={nicknameMap} connectionError={connectionError} />
            </div>
          </div>
        </div>

        <div className="text-center pt-6 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-400 uppercase mb-2">Your Nickname</p>
          <p className="text-sm text-slate-500">
            My name is{" "}
            <input
              value={myNickname}
              onChange={(e) => handleNicknameChange(e.target.value)}
              className="border-b-2 border-dashed border-indigo-300 bg-transparent text-indigo-600 font-semibold text-center outline-none hover:scale-110 transition-all duration-200"
            />
          </p>
        </div>

        <p className="text-center text-[10px] text-slate-400 pt-4">
          Connected via WebRTC &bull; End-to-End Encrypted
        </p>

        {pendingRequest && (
          <ConnectionDialog
            sender={pendingRequest.sender}
            senderNickname={pendingRequest.senderNickname}
            onAccept={acceptRequest}
            onReject={rejectRequest}
          />
        )}
      </div>
    </div>
  );
}
