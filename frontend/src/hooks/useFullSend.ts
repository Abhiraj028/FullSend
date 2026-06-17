import { useEffect, useRef, useState, useCallback } from "react";
import Peer from "peerjs";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "rejected";

export type PeerInfo = {
  id: string;
  nickname: string;
};

type PendingRequest = {
  sender: string;
  receiver: string;
  senderNickname?: string;
};

export function useFullSend(initialNickname: string) {
  const [myPeerId, setMyPeerId] = useState<string>("");
  const [myNickname, setMyNickname] = useState(initialNickname);
  const [remotePeerId, setRemotePeerId] = useState<string>("");
  const [availablePeers, setAvailablePeers] = useState<PeerInfo[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectedPeerId, setConnectedPeerId] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const nicknameMap: Record<string, string> = {};
  for (const p of availablePeers) {
    nicknameMap[p.id] = p.nickname;
  }

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      setMyPeerId(id);
      const ws = new WebSocket(`ws://${location.hostname}:8080`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Websocket connection opened");
        ws.send(JSON.stringify({ type: "pid", id, nickname: initialNickname }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          switch (msg.type) {
            case "peerList":
              setAvailablePeers(msg.peers);
              break;

            case "connReq":
              if (pendingRequest) {
                console.warn("Dropped pending request from", pendingRequest.sender, "- new request from", msg.sender);
              }
              setPendingRequest({ sender: msg.sender, receiver: msg.receiver, senderNickname: msg.senderNickname });
              break;

            case "connAccept":
              setConnectionStatus("connected");
              setConnectedPeerId(msg.sender);
              {
                const conn = peerRef.current?.connect(msg.sender);
                conn?.on("open", () => {
                  conn.send("Hello from " + id);
                });
              }
              break;

            case "connReject":
              setConnectionStatus("rejected");
              break;
          }
        } catch {
          console.log("Non-JSON message:", event.data);
        }
      };
    });

    peer.on("connection", (conn) => {
      conn.on("data", (data) => {
        console.log("Got data from " + conn.peer + " : " + data);
      });
    });

    return () => {
      peer.destroy();
      wsRef.current?.close();
    };
  }, []);

  const handleConnect = () => {
    if (!remotePeerId) return;
    setConnectionStatus("connecting");
    wsRef.current?.send(
      JSON.stringify({
        type: "connReq",
        sender: myPeerId,
        receiver: remotePeerId,
        senderNickname: myNickname,
      })
    );
  };

  const acceptRequest = () => {
    if (!pendingRequest) return;
    wsRef.current?.send(
      JSON.stringify({
        type: "connAccept",
        sender: myPeerId,
        receiver: pendingRequest.sender,
        senderNickname: myNickname,
      })
    );
    setConnectionStatus("connected");
    setConnectedPeerId(pendingRequest.sender);
    setPendingRequest(null);
  };

  const rejectRequest = () => {
    if (!pendingRequest) return;
    wsRef.current?.send(
      JSON.stringify({
        type: "connReject",
        sender: myPeerId,
        receiver: pendingRequest.sender,
        senderNickname: myNickname,
      })
    );
    setConnectionStatus("idle");
    setPendingRequest(null);
  };

  const updateNickname = useCallback((newName: string) => {
    setMyNickname(newName);
    wsRef.current?.send(
      JSON.stringify({
        type: "nicknameUpdate",
        id: myPeerId,
        nickname: newName,
      })
    );
  }, [myPeerId]);

  return {
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
  };
}
