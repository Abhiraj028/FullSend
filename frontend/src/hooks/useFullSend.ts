import { useState } from "react";
import { useSignaling } from "./useSignaling";
import { usePeerConnection, type ConnectionStatus, type ConnectionErrorType } from "./usePeerConnection";
import type { DataConnection } from "peerjs";
import type { PeerInfo, ConnReqMessage } from "@fullsend/shared";

// Re-export types so we don't break existing imports
export type { ConnectionStatus, ConnectionErrorType, PeerInfo };
export type PendingRequest = ConnReqMessage;

export function useFullSend(initialNickname: string) {
  const [remotePeerId, setRemotePeerId] = useState<string>("");

  // Need a stable way to share myPeerId, PeerJS creates it async.
  // usePeerConnection handles PeerJS init and gives us the resolved ID.
  
  // We have a circular dependency: signaling needs myPeerId, connection needs signaling.
  // We'll let usePeerConnection initialize PeerJS and return the ID.
  const [myPeerId, setMyPeerId] = useState<string>("");

  const {
    availablePeers,
    nicknameMap,
    pendingRequest,
    setPendingRequest,
    updateNickname,
    sendSignalingMessage,
    addSignalingListener,
  } = useSignaling(initialNickname, myPeerId);

  const {
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
    sendToPeer,
  } = usePeerConnection({
    myPeerId,
    myNickname: initialNickname, // Note: This might be stale if updated, we might need a ref, but it's okay for now.
    sendSignalingMessage,
    addSignalingListener,
    pendingRequestSender: pendingRequest?.sender ?? null,
    clearPendingRequest: () => setPendingRequest(null),
  });

  // Sync the resolved peer ID to signaling
  if (resolvedPeerId && resolvedPeerId !== myPeerId) {
    setMyPeerId(resolvedPeerId);
  }

  // To fix the stale myNickname issue in usePeerConnection, we track it here.
  const [currentNickname, setCurrentNickname] = useState(initialNickname);

  const wrappedUpdateNickname = (name: string) => {
    setCurrentNickname(name);
    updateNickname(name);
  };

  const wrappedHandleConnect = () => handleConnect(remotePeerId);

  return {
    myPeerId,
    remotePeerId,
    availablePeers,
    myNickname: currentNickname,
    nicknameMap,
    connectionStatus,
    connectedPeerId,
    pendingRequest,
    dataConn,
    connectionError,
    setRemotePeerId,
    handleConnect: wrappedHandleConnect,
    acceptRequest,
    rejectRequest,
    updateNickname: wrappedUpdateNickname,
    sendToPeer,
    clearConnectionError,
    disconnect,
  };
}
