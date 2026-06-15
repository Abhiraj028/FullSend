import { useEffect, useRef, useState } from "react";
import Peer from "peerjs";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "rejected";

export function useFullSend() {
  const [myPeerId, setMyPeerId] = useState<string>("");
  const [remotePeerId, setRemotePeerId] = useState<string>("");
  const [availablePeerIds, setAvailablePeerIds] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectedPeerId, setConnectedPeerId] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{
    sender: string;
    receiver: string;
  } | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      setMyPeerId(id);
      const ws = new WebSocket("ws://localhost:8080");
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Websocket connection opened");
        ws.send(JSON.stringify({ type: "pid", id }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          switch (msg.type) {
            case "peerList":
              setAvailablePeerIds(msg.peers);
              break;

            case "connReq":
              if (pendingRequest) {
                console.warn("Dropped pending request from", pendingRequest.sender, "- new request from", msg.sender);
              }
              setPendingRequest({ sender: msg.sender, receiver: msg.receiver });
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
      })
    );
    setConnectionStatus("idle");
    setPendingRequest(null);
  };

  return {
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
  };
}
