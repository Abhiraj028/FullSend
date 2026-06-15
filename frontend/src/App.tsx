import { useFullSend } from "@/hooks/useFullSend";
import { PeerIdentity } from "@/components/PeerIdentity";
import { PeerList } from "@/components/PeerList";
import { ConnectForm } from "@/components/ConnectForm";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { ConnectionStatus } from "@/components/ConnectionStatus";

export function App() {
  const {
    myPeerId,
    remotePeerId,
    availablePeerIds,
    connectionStatus,
    connectedPeerId,
    pendingRequest,
    setRemotePeerId,
    handleConnect,
    acceptRequest,
    rejectRequest,
  } = useFullSend();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col items-center p-6 md:p-12">
      <div className="max-w-3xl w-full space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-indigo-600">FullSend</h1>
          <p className="text-slate-500 text-lg">Fast, private peer-to-peer data transfer.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <PeerIdentity peerId={myPeerId} />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-[200px]">
              <PeerList
                peerIds={availablePeerIds}
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
              />
            </div>
            <div className="mt-3">
              <ConnectionStatus status={connectionStatus} peerId={connectedPeerId || remotePeerId} />
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 pt-4">
          Connected via WebRTC &bull; End-to-End Encrypted
        </p>

        {pendingRequest && (
          <ConnectionDialog
            sender={pendingRequest.sender}
            onAccept={acceptRequest}
            onReject={rejectRequest}
          />
        )}
      </div>
    </div>
  );
}

export default App;
