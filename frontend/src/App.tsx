import { useState } from "react";
import { useFullSend } from "@/hooks/useFullSend";
import { PeerIdentity } from "@/components/PeerIdentity";
import { PeerList } from "@/components/PeerList";
import { ConnectForm } from "@/components/ConnectForm";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { NicknameModal } from "@/components/NicknameModal";

export function App() {
  const [nickname, setNickname] = useState<string | null>(
    () => localStorage.getItem("fullsend_nickname"),
  );

  if (!nickname) {
    return <NicknameModal onConfirm={setNickname} />;
  }

  return <AuthenticatedApp nickname={nickname} />;
}

function AuthenticatedApp({ nickname }: { nickname: string }) {
  const {
    myPeerId,
    remotePeerId,
    availablePeers,
    myNickname,
    nicknameMap,
    connectionStatus,
    connectedPeerId,
    pendingRequest,
    setRemotePeerId,
    handleConnect,
    acceptRequest,
    rejectRequest,
    updateNickname,
  } = useFullSend(nickname);

  const handleNicknameChange = (newName: string) => {
    localStorage.setItem("fullsend_nickname", newName);
    updateNickname(newName);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col items-center p-6 md:p-12">
      <div className="max-w-3xl w-full space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-indigo-600">FullSend</h1>
          <p className="text-slate-500 text-lg">Fast, private peer-to-peer data transfer.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <PeerIdentity peerId={myPeerId} nickname={myNickname} />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-[200px]">
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
              <ConnectionStatus status={connectionStatus} peerId={connectedPeerId || remotePeerId} nicknameMap={nicknameMap} />
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

export default App;
