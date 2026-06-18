import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { type DataConnection } from "peerjs";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "rejected";

export type ConnectionErrorType = "accept_timeout" | "connect_timeout";

export type PeerInfo = {
  id: string;
  nickname: string;
};

export type PendingRequest = {
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
  const [dataConn, setDataConn] = useState<DataConnection | null>(null);
  const [connectionError, setConnectionError] = useState<ConnectionErrorType | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const acceptTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dataConnRef = useRef<DataConnection | null>(null);

  const nicknameMap: Record<string, string> = {};
  for (const p of availablePeers) {
    nicknameMap[p.id] = p.nickname;
  }

  useEffect(() => {
    let retryDelay = 1000;

    const connectWs = (id: string) => {
      const ws = new WebSocket(`ws://${location.hostname}:8080`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryDelay = 1000;
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
              setPendingRequest({ sender: msg.sender, receiver: msg.receiver, senderNickname: msg.senderNickname });
              break;

            case "connAccept":
              setConnectionStatus("connected");
              setConnectedPeerId(msg.sender);
              setConnectionError(null);
              {
                const conn = peerRef.current?.connect(msg.sender);
                if (conn) {
                  dataConnRef.current = conn;
                    conn.on("open", () => {
                    setDataConn(conn);
                    clearTimeout(connectTimerRef.current);
                    setConnectionError(null);
                  });
                  conn.on("close", () => setDataConn(null));
                }
              }
              break;

            case "connReject":
              setConnectionStatus("rejected");
              setConnectionError(null);
              clearTimeout(connectTimerRef.current);
              break;
          }
        } catch {
          console.log("Non-JSON message:", event.data);
        }
      };

      ws.onclose = () => {
        console.log("Websocket closed, reconnecting in", retryDelay, "ms");
        retryRef.current = setTimeout(() => {
          connectWs(id);
          retryDelay = Math.min(retryDelay * 2, 30000);
        }, retryDelay);
      };
    };

    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      setMyPeerId(id);
      connectWs(id);
    });

    peer.on("connection", (conn) => {
      dataConnRef.current = conn;
      conn.on("open", () => {
        setDataConn(conn);
        clearTimeout(acceptTimerRef.current);
        clearTimeout(connectTimerRef.current);
        setConnectionError(null);
      });
      conn.on("close", () => setDataConn(null));
    });

    return () => {
      clearTimeout(retryRef.current);
      clearTimeout(acceptTimerRef.current);
      clearTimeout(connectTimerRef.current);
      peer.destroy();
      wsRef.current?.close();
    };
  }, []);

  const handleConnect = () => {
    if (!remotePeerId) return;
    setConnectionStatus("connecting");
    setConnectionError(null);
    wsRef.current?.send(
      JSON.stringify({
        type: "connReq",
        sender: myPeerId,
        receiver: remotePeerId,
        senderNickname: myNickname,
      })
    );
    clearTimeout(connectTimerRef.current);
    connectTimerRef.current = setTimeout(() => {
      if (!dataConnRef.current) {
        setConnectionStatus("rejected");
        setConnectionError("connect_timeout");
      }
    }, 15000);
  };

  const acceptRequest = () => {
    if (!pendingRequest) return;
    setConnectionError(null);
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
    clearTimeout(acceptTimerRef.current);
    acceptTimerRef.current = setTimeout(() => {
      if (!dataConnRef.current) {
        setConnectionStatus("rejected");
        setConnectionError("accept_timeout");
      }
    }, 10000);
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

  const sendToPeer = useCallback((data: unknown) => {
    dataConnRef.current?.send(data);
  }, []);

  const clearConnectionError = useCallback(() => setConnectionError(null), []);

  const disconnect = useCallback(() => {
    dataConnRef.current?.close();
    dataConnRef.current = null;
    setDataConn(null);
    setConnectionStatus("idle");
    setConnectedPeerId(null);
    setConnectionError(null);
    setPendingRequest(null);
    clearTimeout(connectTimerRef.current);
    clearTimeout(acceptTimerRef.current);
  }, []);

  return {
    myPeerId,
    remotePeerId,
    availablePeers,
    myNickname,
    nicknameMap,
    connectionStatus,
    connectedPeerId,
    pendingRequest,
    dataConn,
    connectionError,
    setRemotePeerId,
    handleConnect,
    acceptRequest,
    rejectRequest,
    updateNickname,
    sendToPeer,
    clearConnectionError,
    disconnect,
  };
}
