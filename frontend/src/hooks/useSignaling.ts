import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { parseSignalingMessage, wsMsg, type PeerInfo, type ConnReqMessage } from "@fullsend/shared";

export function useSignaling(initialNickname: string, myPeerId: string) {
  const [availablePeers, setAvailablePeers] = useState<PeerInfo[]>([]);
  const [pendingRequest, setPendingRequest] = useState<ConnReqMessage | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentNicknameRef = useRef(initialNickname);

  const nicknameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of availablePeers) {
      map[p.id] = p.nickname;
    }
    return map;
  }, [availablePeers]);

  useEffect(() => {
    if (!myPeerId) return;

    let retryDelay = 1000;
    
    // Support environment variables for WS connection
    const signalingPort = import.meta.env["BUN_PUBLIC_WS_PORT"] ?? "8080";
    const signalingHost = import.meta.env["BUN_PUBLIC_WS_HOST"] ?? location.hostname;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";

    const connectWs = () => {
      const ws = new WebSocket(`${protocol}//${signalingHost}:${signalingPort}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryDelay = 1000;
        console.log("Websocket connection opened");
        ws.send(JSON.stringify(wsMsg.pid(myPeerId, currentNicknameRef.current)));
      };

      ws.onmessage = (event) => {
        const msg = parseSignalingMessage(event.data);
        if (!msg) return;

        switch (msg.type) {
          case "peerList":
            setAvailablePeers(msg.peers);
            break;
          case "connReq":
            setPendingRequest(msg);
            break;
        }
      };

      ws.onclose = () => {
        console.log("Websocket closed, reconnecting in", retryDelay, "ms");
        setAvailablePeers([]);
        retryRef.current = setTimeout(() => {
          connectWs();
          retryDelay = Math.min(retryDelay * 2, 30000);
        }, retryDelay);
      };
    };

    connectWs();

    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [myPeerId]); // Re-run if myPeerId changes

  const updateNickname = useCallback((newName: string) => {
    currentNicknameRef.current = newName;
    wsRef.current?.send(JSON.stringify(wsMsg.nicknameUpdate(myPeerId, newName)));
  }, [myPeerId]);

  const sendSignalingMessage = useCallback((msg: object) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const addSignalingListener = useCallback((type: string, handler: (msg: any) => void) => {
    const ws = wsRef.current;
    if (!ws) return () => {};

    const msgHandler = (event: MessageEvent) => {
      const msg = parseSignalingMessage(event.data);
      if (msg && msg.type === type) {
        handler(msg);
      }
    };
    ws.addEventListener("message", msgHandler);
    return () => ws.removeEventListener("message", msgHandler);
  }, []);

  return {
    availablePeers,
    nicknameMap,
    pendingRequest,
    setPendingRequest,
    updateNickname,
    sendSignalingMessage,
    addSignalingListener,
  };
}
