import { useCallback, useEffect, useRef, useState, type ChangeEvent, } from "react";
import "./App.css";
import { RoomPanel } from "./components/RoomPanel";
import { sha256Hex } from "./lib/hash";
import { usePeerConnection } from "./hooks/usePeerConnection";
import { TransferPanel } from "./components/TransferPanel";
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
  status: "waiting" | "accepted" | "rejected" | "sending" | "chunks-sent" | "failed" | "complete-sent" | "hashing" | "verified";
};

function isTerminalTransferStatus(status: OutgoingOffer["status"]) {
  return (
    status === "verified" ||
    status === "rejected" ||
    status === "failed"
  );
}

function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const messageHandlerRef = useRef<(message: ServerMessage) => void>(() => { });

  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [roomId, setRoomId] = useState(getRoomIdFromUrl);
  const [role, setRole] = useState<RoomRole>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("idle");
  const [hasPendingJoinRequest, setHasPendingJoinRequest] = useState(false);
  const [lastMessage, setLastMessage] = useState("Waiting for the server...");

  const [outgoingOffer, setOutgoingOffer] = useState<OutgoingOffer | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<FileOfferMessage | null>(null);

  const [incomingDecision, setIncomingDecision] = useState<"pending" | "accepted" | "rejected" | null>(null);

  const receivedChunksRef = useRef<ArrayBuffer[]>([]);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [senderCompletedBytes, setSenderCompletedBytes] = useState<number | null>(null);
  const [sentBytes, setSentBytes] = useState(0);

  const [expectedHash, setExpectedHash] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verifying" | "verified" | "failed">("idle");

  const verificationStartedRef = useRef<string | null>(null);

  type CompletedDownload = {
    name: string;
    url: string;
  };

  const [completedDownload, setCompletedDownload] =
    useState<CompletedDownload | null>(null);

  const completedTransferIdRef = useRef<string | null>(null);
  const downloadUrlRef = useRef<string | null>(null);

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

    if (message.type === "file-offer") {
      receivedChunksRef.current = [];
      setReceivedBytes(0);
      setSenderCompletedBytes(null);
      setExpectedHash(null);
      setVerificationStatus("idle");
      verificationStartedRef.current = null;

      // cleanup any previous download offer
      completedTransferIdRef.current = null;
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }

      setCompletedDownload(null);


      setIncomingOffer(message);
      setIncomingDecision("pending");
      setLastMessage(`Received an offer for ${message.name}.`);
      return;
    }

    if (message.type === "file-accept") {
      setOutgoingOffer((currentOffer) => {
        if (currentOffer?.transferId !== message.transferId) {
          return currentOffer;
        }

        return { ...currentOffer, status: "accepted" };
      });

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

      setLastMessage(`Peer rejected the offer: ${message.reason}`);
    }

    if (message.type === "file-complete") {
      if (incomingOffer?.transferId !== message.transferId) {
        return;
      }

      setExpectedHash(message.sha256);
      setSenderCompletedBytes(message.byteCount);
      setLastMessage(
        `Peer finished sending ${message.byteCount} bytes. Checking received data.`,
      );
    }

    if (message.type === "file-verified") {
      setOutgoingOffer((currentOffer) => {
        if (currentOffer?.transferId !== message.transferId) {
          return currentOffer;
        }

        return { ...currentOffer, status: "verified" };
      });

      setLastMessage("Peer verified the received file hash.");
      return;
    }

    if (message.type === "file-integrity-failed") {
      setOutgoingOffer((currentOffer) => {
        if (currentOffer?.transferId !== message.transferId) {
          return currentOffer;
        }

        return { ...currentOffer, status: "failed" };
      });

      setLastMessage("Peer reported that file verification failed.");
    }

  }, [incomingOffer]);

  const handleFileData = useCallback((data: ArrayBuffer) => {
    // Keep chunks for reconstruction into a downloadable file in the next step.

    receivedChunksRef.current.push(data);
    setReceivedBytes((currentBytes) => currentBytes + data.byteLength);
  }, []);

  const { webRtcStatus, startHostConnection, handleSignal, sendControlMessage, controlChannelStatus, sendFileData } = usePeerConnection(sendMessage, handleControlMessage, handleFileData);

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

  // when sender and receiver have both sent and received the entire file, create a downloadable URL

  useEffect(() => {
    if (
      !incomingOffer ||
      !expectedHash ||
      senderCompletedBytes !== incomingOffer.size ||
      receivedBytes !== incomingOffer.size ||
      verificationStartedRef.current === incomingOffer.transferId
    ) {
      return;
    }

    verificationStartedRef.current = incomingOffer.transferId;
    setVerificationStatus("verifying");

    void (async () => {
      const blob = new Blob(receivedChunksRef.current, {
        type: incomingOffer.mimeType || "application/octet-stream",
      });

      const actualHash = await sha256Hex(blob);

      if (actualHash !== expectedHash) {
        setVerificationStatus("failed");
        setLastMessage("File verification failed.");

        sendControlMessage({
          type: "file-integrity-failed",
          transferId: incomingOffer.transferId,
          expectedHash,
          actualHash,
        });

        return;
      }

      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }

      const url = URL.createObjectURL(blob);

      downloadUrlRef.current = url;
      completedTransferIdRef.current = incomingOffer.transferId;

      setCompletedDownload({
        name: incomingOffer.name,
        url,
      });

      setVerificationStatus("verified");
      setLastMessage(`${incomingOffer.name} passed SHA-256 verification.`);

      sendControlMessage({
        type: "file-verified",
        transferId: incomingOffer.transferId,
        sha256: actualHash,
      });
    })();
  }, [
    expectedHash,
    incomingOffer,
    receivedBytes,
    sendControlMessage,
    senderCompletedBytes,
  ]);

  useEffect(() => {
    // cleanup the blob URL when the component unmounts
    return () => {
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
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

  function offerSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (outgoingOffer && !isTerminalTransferStatus(outgoingOffer.status)) {
      setLastMessage("Wait for the current file transfer to finish.");
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

    setSentBytes(0);
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

  async function sendFileInChunks() {
    if (!outgoingOffer || outgoingOffer.status !== "accepted") {
      setLastMessage("A peer must accept the file before sending bytes.");
      return;
    }

    const { file, transferId } = outgoingOffer;

    setOutgoingOffer((currentOffer) => {
      if (currentOffer?.transferId !== transferId) return currentOffer;
      return { ...currentOffer, status: "sending" };
    });

    try {
      let offset = 0;

      while (offset < file.size) {
        const chunk = await file
          .slice(offset, offset + FILE_CHUNK_SIZE)
          .arrayBuffer();

        const sent = await sendFileData(chunk);

        if (!sent) {
          throw new Error("The file channel is no longer open.");
        }

        offset += chunk.byteLength;
        setSentBytes(offset);
      }

      setOutgoingOffer((currentOffer) => {
        if (currentOffer?.transferId !== transferId) return currentOffer;
        return { ...currentOffer, status: "hashing" };
      });

      const sha256 = await sha256Hex(file);

      const completionSent = sendControlMessage({
        type: "file-complete",
        transferId,
        byteCount: file.size,
        sha256,
      });

      if (!completionSent) {
        throw new Error("Could not send the file completion message.");
      }

      setOutgoingOffer((currentOffer) => {
        if (currentOffer?.transferId !== transferId) return currentOffer;
        return { ...currentOffer, status: "complete-sent" };
      });

      setLastMessage(`Sent all ${file.size} bytes and completion metadata.`);

    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown transfer error.";

      setOutgoingOffer((currentOffer) => {
        if (currentOffer?.transferId !== transferId) return currentOffer;
        return { ...currentOffer, status: "failed" };
      });

      setLastMessage(`File transfer stopped: ${message}`);
    }
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
        <div className="connection-details">
          <span>WebRTC: {webRtcStatus}</span>
          {role && <span>Control: {controlChannelStatus}</span>}
        </div>

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
          <TransferPanel
            controlChannelStatus={controlChannelStatus}
            outgoingOffer={outgoingOffer}
            incomingOffer={incomingOffer}
            incomingDecision={incomingDecision}
            verificationStatus={verificationStatus}
            sentBytes={sentBytes}
            receivedBytes={receivedBytes}
            senderCompletedBytes={senderCompletedBytes}
            completedDownload={completedDownload}
            onOfferSelectedFile={offerSelectedFile}
            onSendFile={sendFileInChunks}
            onAcceptIncomingOffer={acceptIncomingOffer}
            onRejectIncomingOffer={rejectIncomingOffer}
          />
        )}

        <p className="message">Last event: {lastMessage}</p>
      </section>
    </main>
  );
}

export default App;
