import { useCallback, useEffect, useRef, useState, type ChangeEvent, } from "react";
import "./App.css";
import { RoomPanel } from "./components/RoomPanel";
import { usePeerConnection } from "./hooks/usePeerConnection";
import {
  parseServerMessage,
  type ClientMessage,
  type JoinStatus,
  type RoomRole,
  type ServerMessage,
  type ControlMessage,
  type FileOfferMessage,
} from "./lib/protocol";

const SIGNALING_URL = "ws://localhost:8080/ws";

function getRoomIdFromUrl() {
  return new URLSearchParams(window.location.search).get("room")?.trim() || null;
}

const FILE_CHUNK_SIZE = 64 * 1024;

type OutgoingOffer = {
  transferId: string;
  file: File;
  status: "waiting" | "accepted" | "rejected";
};

function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const messageHandlerRef = useRef<(message: ServerMessage) => void>(() => { });

  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [roomId, setRoomId] = useState(getRoomIdFromUrl);
  const [role, setRole] = useState<RoomRole>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("idle");
  const [hasPendingJoinRequest, setHasPendingJoinRequest] = useState(false);
  const [lastMessage, setLastMessage] = useState("Waiting for the server...");
  const [lastControlMessage, setLastControlMessage] = useState("No direct control messages received yet.",);

  const [outgoingOffer, setOutgoingOffer] = useState<OutgoingOffer | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<FileOfferMessage | null>(null);

  const [incomingDecision, setIncomingDecision] = useState<"pending" | "accepted" | "rejected" | null>(null);

  const [lastFileData, setLastFileData] = useState("No binary file-channel data received yet.");

  const sendMessage = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setLastMessage("The signaling server is not connected.");
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const handleControlMessage = useCallback((message: ControlMessage) => {
    if (message.type === "ping") {
      setLastControlMessage(
        `Ping received directly. Sent at ${new Date(message.sentAt).toLocaleTimeString()}.`,
      );
      return;
    }

    if (message.type === "file-offer") {
      setIncomingOffer(message);
      setIncomingDecision("pending");
      setLastControlMessage(`Received an offer for ${message.name}.`);
      return;
    }

    if (message.type === "file-accept") {
      setOutgoingOffer((currentOffer) => {
        if (currentOffer?.transferId !== message.transferId) {
          return currentOffer;
        }

        return { ...currentOffer, status: "accepted" };
      });

      setLastControlMessage("Peer accepted the file offer.");
      setLastMessage("Peer accepted the file offer. Sending the file.");
      return;
    }

    if (message.type === "file-reject") {
      setOutgoingOffer((currentOffer) => {
        if (currentOffer?.transferId !== message.transferId) {
          return currentOffer;
        }

        return { ...currentOffer, status: "rejected" };
      });

      setLastControlMessage(`Peer rejected the offer: ${message.reason}`);
      setLastMessage(`Peer rejected the offer: ${message.reason}`);
    }
  }, []);

  const handleFileData = useCallback((data: ArrayBuffer) => {
    const bytes = Array.from(new Uint8Array(data).slice(0, 8));

    setLastFileData(
      `Received ${data.byteLength} binary bytes. First bytes: [${bytes.join(", ")}].`,
    );
  }, []);

  const { webRtcStatus, controlChannel, startHostConnection, handleSignal, sendControlMessage, controlChannelStatus, sendFileData } = usePeerConnection(sendMessage, handleControlMessage, handleFileData);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    setLastMessage(message.type);

    if (message.type === "room-created" && message.roomId) {
      setRoomId(message.roomId);
      setRole("host");

      // Update the address without refreshing the socket-owning app.
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
      setRole(message.role);
      setJoinStatus("idle");
      setHasPendingJoinRequest(false);

      if (message.role === "host") {
        void startHostConnection();
      }

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
  }, [handleSignal, startHostConnection]);

  // The socket is mounted once; its mutable handler always sees current React state.
  useEffect(() => {
    messageHandlerRef.current = handleServerMessage;
  }, [handleServerMessage])

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

  function createRoom() {
    sendMessage({ type: "create-room" });
  }

  function joinRoom() {
    if (roomId && sendMessage({ type: "join-room", roomId })) {
      setJoinStatus("pending");
    }
  }

  function retryJoin() {
    setJoinStatus("idle");
    setLastMessage("You can request entry again.");
  }

  function approveJoin() {
    if (sendMessage({ type: "approve-join" })) {
      setLastMessage("Approving join request...");
    }
  }

  function rejectJoin() {
    if (sendMessage({ type: "reject-join" })) {
      setHasPendingJoinRequest(false);
      setLastMessage("Rejecting join request...");
    }
  }

  function sendPing() {
    const sent = sendControlMessage({
      type: "ping",
      sentAt: Date.now(),
    });

    setLastMessage(
      sent
        ? "Sent ping through the direct control channel."
        : "The control channel is not ready yet.",
    );
  }

  function offerSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (outgoingOffer) {
      setLastMessage("Wait for the current file offer to be decided.");
      event.target.value = "";
      return;
    }

    const transferId = crypto.randomUUID();

    const sent = sendControlMessage({
      type: "file-offer",
      transferId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
    });

    if (!sent) {
      setLastMessage("The control channel is not ready for a file offer.");
      return;
    }

    setOutgoingOffer({ transferId, file, status: "waiting" });
    setLastMessage(`Offered ${file.name} directly to the peer.`);

    // Allow choosing the same file again after this offer is resolved.
    event.target.value = "";
  }

  function acceptIncomingOffer() {
    if (!incomingOffer) return;

    const sent = sendControlMessage({
      type: "file-accept",
      transferId: incomingOffer.transferId,
    });

    if (!sent) {
      setLastMessage("The control channel is not ready.");
      return;
    }

    setIncomingDecision("accepted");
    setLastMessage(`Accepted ${incomingOffer.name}.`);
  }

  function rejectIncomingOffer() {
    if (!incomingOffer) return;

    const sent = sendControlMessage({
      type: "file-reject",
      transferId: incomingOffer.transferId,
      reason: "Receiver declined the file.",
    });

    if (!sent) {
      setLastMessage("The control channel is not ready.");
      return;
    }

    setIncomingDecision("rejected");
    setLastMessage(`Rejected ${incomingOffer.name}.`);
  }

  function sendBinaryProbe() {
    const probe = new Uint8Array([70, 83, 49]).buffer;
    const sent = sendFileData(probe);

    setLastMessage(
      sent
        ? "Sent a binary probe through the direct file channel."
        : "The file channel is not ready yet.",
    );
  }

  async function sendFirstFileChunk() {
    if (!outgoingOffer || outgoingOffer.status !== "accepted") {
      setLastMessage("A peer must accept the file before sending bytes.");
      return;
    }

    // slice creates a Blob view; arrayBuffer reads only this bounded portion.
    const firstChunk = await outgoingOffer.file
      .slice(0, FILE_CHUNK_SIZE)
      .arrayBuffer();

    const sent = sendFileData(firstChunk);

    setLastMessage(
      sent
        ? `Sent the first ${firstChunk.byteLength} bytes directly.`
        : "The file channel is not ready yet.",
    );
  }

  return (
    <main className="app">
      <section className="card">
        <p className="eyebrow">FULLSEND V1</p>
        <h1>Direct file transfer.</h1>
        <p className="description">
          Create a temporary room, approve one peer, then connect directly.
        </p>

        <div className="status-row">
          <span className="status-dot" />
          <span>{connectionStatus}</span>
        </div>
        <p className="hint">WebRTC: {webRtcStatus}</p>

        <RoomPanel
          connectionStatus={connectionStatus}
          roomId={roomId}
          roomLink={roomLink}
          role={role}
          joinStatus={joinStatus}
          hasPendingJoinRequest={hasPendingJoinRequest}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onRetryJoin={retryJoin}
          onApproveJoin={approveJoin}
          onRejectJoin={rejectJoin}
        />


        {role && (
          <section className="room">
            <p className="label">
              Control channel: {controlChannelStatus ?? "waiting"}
            </p>
            <button
              onClick={sendPing}
              disabled={controlChannelStatus !== "open"}
            >
              Send test ping
            </button>
            <p className="hint">{lastControlMessage}</p>
          </section>
        )}

        {role && controlChannelStatus === "open" && (
          <section className="room">
            <p className="label">Offer a file</p>
            <input type="file" onChange={offerSelectedFile} />

            {outgoingOffer && (
              <>
                <p className="hint">
                  {outgoingOffer.file.name}: {outgoingOffer.status}
                </p>

                {outgoingOffer.status === "accepted" && (
                  <button onClick={() => void sendFirstFileChunk()}>
                    Send first 64 KiB
                  </button>
                )}
              </>
            )}

            {incomingOffer && (
              <div className="room">
                <p className="label">Incoming file offer</p>
                <p>{incomingOffer.name}</p>
                <p className="hint">
                  {incomingOffer.size} bytes ·{" "}
                  {incomingOffer.mimeType || "unknown file type"}
                  {incomingDecision === "pending" && (
                    <div className="actions">
                      <button onClick={acceptIncomingOffer}>Accept</button>
                      <button
                        className="secondary-button"
                        onClick={rejectIncomingOffer}
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {incomingDecision === "accepted" && (
                    <p className="hint">Accepted. Waiting for file data.</p>
                  )}

                  {incomingDecision === "rejected" && (
                    <p className="hint">Offer rejected.</p>
                  )}
                </p>
              </div>
            )}
          </section>
        )}

        {role && controlChannelStatus === "open" && (
          <section className="room">
            <p className="label">File-channel binary probe</p>
            <button onClick={sendBinaryProbe}>Send FS1 probe</button>
            <p className="hint">{lastFileData}</p>
          </section>
        )}


        <p className="message">Last event: {lastMessage}</p>
      </section>
    </main>
  );
}

export default App;
