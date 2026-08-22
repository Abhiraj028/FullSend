import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { type DataConnection } from "peerjs";
import { wsMsg } from "@fullsend/shared";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "rejected";
export type ConnectionErrorType = "accept_timeout" | "connect_timeout";

type SignalingProps = {
  myPeerId: string;
  myNickname: string;
  sendSignalingMessage: (msg: object) => void;
  addSignalingListener: (type: string, handler: (msg: any) => void) => () => void;
  pendingRequestSender: string | null;
  clearPendingRequest: () => void;
};

export function usePeerConnection({
  myPeerId,
  myNickname,
  sendSignalingMessage,
  addSignalingListener,
  pendingRequestSender,
  clearPendingRequest
}: SignalingProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectedPeerId, setConnectedPeerId] = useState<string | null>(null);
  const [dataConn, setDataConn] = useState<DataConnection | null>(null);
  const [connectionError, setConnectionError] = useState<ConnectionErrorType | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const acceptTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Initialize PeerJS
  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

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
      clearTimeout(acceptTimerRef.current);
      clearTimeout(connectTimerRef.current);
      peer.destroy();
    };
  }, []);

  // Listen to signaling messages for connection handshake
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(addSignalingListener("connAccept", (msg) => {
      setConnectionStatus("connected");
      setConnectedPeerId(msg.sender);
      setConnectionError(null);
      
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
    }));

    unsubs.push(addSignalingListener("connReject", () => {
      setConnectionStatus("rejected");
      setConnectionError(null);
      clearTimeout(connectTimerRef.current);
    }));

    return () => unsubs.forEach(unsub => unsub());
  }, [addSignalingListener]);

  const handleConnect = useCallback((remotePeerId: string) => {
    if (!remotePeerId) return;
    setConnectionStatus("connecting");
    setConnectionError(null);
    
    sendSignalingMessage(wsMsg.connReq(myPeerId, remotePeerId, myNickname));
    
    clearTimeout(connectTimerRef.current);
    connectTimerRef.current = setTimeout(() => {
      if (!dataConnRef.current) {
        setConnectionStatus("rejected");
        setConnectionError("connect_timeout");
      }
    }, 15000);
  }, [myPeerId, myNickname, sendSignalingMessage]);

  const acceptRequest = useCallback(() => {
    if (!pendingRequestSender) return;
    setConnectionError(null);
    
    sendSignalingMessage(wsMsg.connAccept(myPeerId, pendingRequestSender, myNickname));
    
    setConnectionStatus("connected");
    setConnectedPeerId(pendingRequestSender);
    clearPendingRequest();
    
    clearTimeout(acceptTimerRef.current);
    acceptTimerRef.current = setTimeout(() => {
      if (!dataConnRef.current) {
        setConnectionStatus("rejected");
        setConnectionError("accept_timeout");
      }
    }, 10000);
  }, [myPeerId, pendingRequestSender, myNickname, sendSignalingMessage, clearPendingRequest]);

  const rejectRequest = useCallback(() => {
    if (!pendingRequestSender) return;
    
    sendSignalingMessage(wsMsg.connReject(myPeerId, pendingRequestSender, myNickname));
    
    setConnectionStatus("idle");
    clearPendingRequest();
  }, [myPeerId, pendingRequestSender, myNickname, sendSignalingMessage, clearPendingRequest]);

  const clearConnectionError = useCallback(() => setConnectionError(null), []);

  const disconnect = useCallback(() => {
    dataConnRef.current?.close();
    dataConnRef.current = null;
    setDataConn(null);
    setConnectionStatus("idle");
    setConnectedPeerId(null);
    setConnectionError(null);
    clearPendingRequest();
    clearTimeout(connectTimerRef.current);
    clearTimeout(acceptTimerRef.current);
  }, [clearPendingRequest]);

  // We need to return peerId because it's created by PeerJS asynchronously
  const [resolvedPeerId, setResolvedPeerId] = useState<string>("");
  useEffect(() => {
    if (peerRef.current) {
      peerRef.current.on('open', setResolvedPeerId);
    }
  }, []);

  return {
    resolvedPeerId,
    connectionStatus,
    connectedPeerId,
    dataConn,
    connectionError,
    handleConnect,
    acceptRequest,
    rejectRequest,
    clearConnectionError,
    disconnect,
    sendToPeer: useCallback((data: unknown) => dataConnRef.current?.send(data), []),
  };
}
