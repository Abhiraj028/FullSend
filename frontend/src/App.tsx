import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, } from "./components/ui/card";
import { Input } from "./components/ui/input";
import Peer from "peerjs";

export function App() {
  const [myPeerId, setMyPeerId] = useState<string>("");
  const [remotePeerId, setRemotePeerId] = useState<string>("");
  const [availablePeerIds, setAvailablePeerIds] = useState<string[]>([]);
  const peerRef = useRef<Peer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      setMyPeerId(id);
      const ws = new WebSocket("ws://localhost:8080");
      wsRef.current = ws;

      wsRef.current.onopen = () => {
        console.log("Websocket connection opened");
        if (peer.id) wsRef.current?.send("$pid->"+peer.id);
      };
      
      ws.onmessage = (event) => {
        const msg = event.data as string;
        if (msg.startsWith("[")) {
          console.log("Server sent us: "+msg);
          const peerArr = JSON.parse(msg);
          setAvailablePeerIds(peerArr);
        }else{
          console.log(msg);
        }
      };
    });

    peer.on("connection", conn => {
      conn.on("data", data => {
        console.log("Got some data sent from"+conn.peer+" : "+data);
      })
    });

    return () => {
      peer.destroy();
      wsRef.current?.close();
    };
  },[]);

  const handleConnect = () => {
    const conn = peerRef.current?.connect(remotePeerId);
    conn?.on("open", () => {
      conn.send("Hello from " + myPeerId);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col items-center p-6 md:p-12">
      <div className="max-w-3xl w-full space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-indigo-600">FullSend</h1>
          <p className="text-slate-500 text-lg">Fast, private peer-to-peer data transfer.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sidebar Area: Available Peers */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 px-1">Available Peers</h2>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-[200px]">
              {availablePeerIds.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-60">
                  <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" />
                  <p className="text-sm text-slate-400">Waiting for others...</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {availablePeerIds.map((id) => (
                    <li key={id} className="group flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                      <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                      <span className="font-mono text-xs truncate flex-1">{id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Main Action Area */}
          <div className="space-y-20">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-12">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase mb-2">Your Identity</p>
                <div className="bg-slate-900 rounded-lg p-3 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <code className="text-indigo-300 font-mono text-sm block truncate">
                    {myPeerId || "Initialising network..."}
                  </code>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 uppercase mb-3">Establish Connection</p>
                <div className="flex flex-col gap-3">
                  <Input 
                    className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                    type="text" 
                    placeholder="Paste remote peer ID..." 
                    value={remotePeerId}
                    onChange={(e) => setRemotePeerId(e.target.value)}
                  />
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all active:scale-[0.98]" onClick={handleConnect}>
                    Connect to Peer
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-center text-[10px] text-slate-400">
              Connected via WebRTC • End-to-End Encrypted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
