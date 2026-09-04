import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { RoomPanel } from "./components/RoomPanel";
import { TransferPanel } from "./components/TransferPanel";
import { useFileTransferSession } from "./hooks/useFileTransferSession";
import { SIGNALING_URL } from "./lib/config";
import {
  parseServerMessage,
  type ClientMessage,
  type JoinStatus,
  type RoomRole,
  type ServerMessage,
} from "./lib/protocol";

function getRoomIdFromUrl() {
  return (
    new URLSearchParams(window.location.search).get("room")?.trim() || null
  );
}

function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const messageHandlerRef = useRef<(message: ServerMessage) => void>(() => {});
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [roomId, setRoomId] = useState(getRoomIdFromUrl);
  const [role, setRole] = useState<RoomRole>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("idle");
  const [hasPendingJoinRequest, setHasPendingJoinRequest] = useState(false);
  const [lastMessage, setLastMessage] = useState("Waiting for the server...");

  const sendMessage = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setLastMessage("The signaling server is not connected.");
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const transfer = useFileTransferSession(sendMessage, role, setLastMessage);
  const {
    startHostConnection,
    handleSignal,
    handleRoomClosed,
    clearConnectionError,
  } = transfer;

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      setLastMessage(message.type);

      if (message.type === "room-closed") {
        handleRoomClosed(message.reason ?? "The room was closed.");
        return;
      }

      if (message.type === "room-created" && message.roomId) {
        clearConnectionError();
        setRoomId(message.roomId);
        setRole("host");
        const url = new URL(window.location.href);
        url.searchParams.set("room", message.roomId);
        window.history.replaceState({}, "", url);
        return;
      }

      if (message.type === "join-pending") {
        setJoinStatus("pending");
        return;
      }

      if (message.type === "join-rejected") {
        setJoinStatus("rejected");
        return;
      }

      if (message.type === "join-requested") {
        setHasPendingJoinRequest(true);
        return;
      }

      if (message.type === "join-cancelled") {
        setHasPendingJoinRequest(false);
        return;
      }

      if (message.type === "room-paired" && message.role) {
        clearConnectionError();
        setRole(message.role);
        setJoinStatus("idle");
        setHasPendingJoinRequest(false);
        if (message.role === "host") void startHostConnection();
        return;
      }

      if (message.type === "signal" && message.signal) {
        setLastMessage(`Received ${message.signal.kind} signal.`);
        void handleSignal(message.signal);
        return;
      }

      if (message.type === "error" && message.message) {
        setLastMessage(`Error: ${message.message}`);
      }
    },
    [
      clearConnectionError,
      handleRoomClosed,
      handleSignal,
      startHostConnection,
    ],
  );

  useEffect(() => {
    messageHandlerRef.current = handleServerMessage;
  }, [handleServerMessage]);

  useEffect(() => {
    const socket = new WebSocket(SIGNALING_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionStatus("Connected");
      setLastMessage("Connected to the signaling server.");
    };
    socket.onmessage = (event) => {
      try {
        const message = parseServerMessage(JSON.parse(event.data));
        if (!message) {
          setLastMessage("Received an invalid message from the server.");
          return;
        }
        messageHandlerRef.current(message);
      } catch {
        setLastMessage("Received invalid JSON from the server.");
      }
    };
    socket.onerror = () => setConnectionStatus("Connection error");
    socket.onclose = () => {
      if (socketRef.current === socket) setConnectionStatus("Disconnected");
    };

    return () => {
      if (socketRef.current === socket) socketRef.current = null;
      socket.close();
    };
  }, []);

  const roomLink = roomId ? `${window.location.origin}/?room=${roomId}` : null;

  function startFresh() {
    sendMessage({ type: "leave-room" });
    window.location.assign(window.location.origin);
  }

  return (
    <main className="app">
      <button
        className="home-button"
        onClick={startFresh}
        aria-label="FullSend home"
        title="Start fresh"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11.25 12 4l9 7.25v8.25a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5v-8.25Z" />
        </svg>
      </button>

      <section className="card">
        {transfer.connectionError && (
          <div className="connection-error" role="alert">
            <div>
              <strong>Connection ended</strong>
              <span>{transfer.connectionError}</span>
            </div>
            <button onClick={startFresh}>Start fresh</button>
          </div>
        )}

        <p className="eyebrow">FULLSEND V1</p>
        <h1>Direct file transfer.</h1>
        <p className="description">
          Create a temporary room, approve one peer, then connect directly.
        </p>
        <div className="status-row">
          <span className="status-dot" />
          <span>{connectionStatus}</span>
        </div>
        <div className="connection-details">
          <span>WebRTC: {transfer.webRtcStatus}</span>
          {role && <span>Control: {transfer.controlChannelStatus}</span>}
        </div>

        <RoomPanel
          connectionStatus={connectionStatus}
          roomId={roomId}
          roomLink={roomLink}
          role={role}
          joinStatus={joinStatus}
          hasPendingJoinRequest={hasPendingJoinRequest}
          onCreateRoom={() => sendMessage({ type: "create-room" })}
          onJoinRoom={() => {
            if (roomId && sendMessage({ type: "join-room", roomId })) {
              setJoinStatus("pending");
            }
          }}
          onRetryJoin={() => {
            setJoinStatus("idle");
            setLastMessage("You can request entry again.");
          }}
          onApproveJoin={() => {
            if (sendMessage({ type: "approve-join" })) {
              setLastMessage("Approving join request...");
            }
          }}
          onRejectJoin={() => {
            if (sendMessage({ type: "reject-join" })) {
              setHasPendingJoinRequest(false);
              setLastMessage("Rejecting join request...");
            }
          }}
        />

        {role && (
          <TransferPanel
            role={role}
            controlChannelStatus={transfer.controlChannelStatus}
            outgoingBatch={transfer.outgoingBatch}
            outgoingHistory={transfer.outgoingHistory}
            incomingBatch={transfer.incomingBatch}
            incomingHistory={transfer.incomingHistory}
            incomingDecision={transfer.incomingDecision}
            activeIncomingFile={transfer.activeIncomingFile}
            verificationStatus={transfer.verificationStatus}
            sentBytes={transfer.sentBytes}
            receivedBytes={transfer.receivedBytes}
            completedDownloads={transfer.completedDownloads}
            draftFiles={transfer.draftFiles}
            onOfferSelectedFiles={transfer.offerSelectedFiles}
            onRemoveDraftFile={transfer.removeDraftFile}
            onOfferDraftBatch={transfer.offerDraftBatch}
            onAcceptIncomingBatch={transfer.acceptIncomingBatch}
            onRejectIncomingBatch={transfer.rejectIncomingBatch}
          />
        )}

        <p className="message">Last event: {lastMessage}</p>
      </section>
    </main>
  );
}

export default App;
