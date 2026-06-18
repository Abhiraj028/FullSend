import { createContext, useContext } from "react";
import { useFullSend, type ConnectionStatus, type ConnectionErrorType, type PeerInfo, type PendingRequest } from "@/hooks/useFullSend";
import type { DataConnection } from "peerjs";

interface PeerContextValue {
  myPeerId: string;
  remotePeerId: string;
  availablePeers: PeerInfo[];
  myNickname: string;
  nicknameMap: Record<string, string>;
  connectionStatus: ConnectionStatus;
  connectedPeerId: string | null;
  pendingRequest: PendingRequest | null;
  dataConn: DataConnection | null;
  connectionError: ConnectionErrorType | null;
  setRemotePeerId: (id: string) => void;
  handleConnect: () => void;
  acceptRequest: () => void;
  rejectRequest: () => void;
  updateNickname: (name: string) => void;
  sendToPeer: (data: unknown) => void;
  clearConnectionError: () => void;
  disconnect: () => void;
}

const PeerContext = createContext<PeerContextValue | null>(null);

export function PeerProvider({ nickname, children }: { nickname: string; children: React.ReactNode }) {
  const value = useFullSend(nickname);
  return <PeerContext.Provider value={value}>{children}</PeerContext.Provider>;
}

export function usePeer() {
  const ctx = useContext(PeerContext);
  if (!ctx) throw new Error("usePeer must be used within PeerProvider");
  return ctx;
}
