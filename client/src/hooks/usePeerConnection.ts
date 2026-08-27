import { useCallback, useEffect, useRef, useState } from "react";
import {
  isIceCandidateInit,
  isSessionDescriptionInit,
  isControlMessage,
  type ControlMessage,
  type ClientMessage,
  type SignalPayload,
} from "../lib/protocol";

type SendMessage = (message: ClientMessage) => boolean;

type ControlMessageHandler = (message: ControlMessage) => void;

type FileDataHandler = (data: ArrayBuffer) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

// Manages the WebRTC connection lifecycle, data channel setup, and SDP/ICE signaling.
export function usePeerConnection(sendMessage: SendMessage, onControlMessage: ControlMessageHandler, onFileData: FileDataHandler) {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  // Candidates may arrive over signaling before remoteDescription is set; queue them here.
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [webRtcStatus, setWebRtcStatus] = useState("Not started");
  const [controlChannel, setControlChannel] = useState<RTCDataChannel | null>(null);
  const [controlChannelStatus, setControlChannelStatus] = useState<RTCDataChannelState | "not-created">("not-created");
  const [fileChannel, setFileChannel] = useState<RTCDataChannel | null>(null);

  const rememberDataChannel = useCallback((channel: RTCDataChannel) => {
    // File chunks arrive as ArrayBuffers; control messages arrive as JSON strings.
    channel.binaryType = "arraybuffer";

    if (channel.label === "control") {
      setControlChannel(channel);
      setControlChannelStatus(channel.readyState);

      const updateControlChannelStatus = () => {
        setControlChannelStatus(channel.readyState);
      }

      channel.onopen = updateControlChannelStatus;
      channel.onclose = updateControlChannelStatus;

      channel.onmessage = (event) => {
        if (typeof event.data !== "string") return;

        try {
          const message: unknown = JSON.parse(event.data);

          if (isControlMessage(message)) {
            onControlMessage(message);
          }
        } catch {
          console.warn("Received invalid control-channel JSON.");
        }
      };
    }

    if (channel.label === "file") {
      setFileChannel(channel);

      // the file channel carries raw bytes, never JSON control messages.
      channel.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          onFileData(event.data);
          return;
        }

        console.warn("Received unexpected data on file channel:", event.data);
      };
    }
  }, [onControlMessage, onFileData]);

  const resetPeerConnection = useCallback((peerConnection: RTCPeerConnection) => {
    peerConnection.close();
    if (peerConnectionRef.current === peerConnection) {
      peerConnectionRef.current = null;
      pendingIceCandidatesRef.current = [];
      setControlChannel(null);
      setFileChannel(null);
      setControlChannelStatus("not-created");
    }
  }, []);

  const sendSignal = useCallback(
    (signal: SignalPayload) => sendMessage({ type: "signal", signal }),
    [sendMessage],
  );

  const createPeerConnection = useCallback(() => {
    const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    console.log("Creating peer connection.");

    // ICE state tells us whether browsers found a usable network route.
    peerConnection.oniceconnectionstatechange = () => {
      setWebRtcStatus(`ICE: ${peerConnection.iceConnectionState}`);
    };

    // Candidate gathering is separate from candidate connection testing.
    peerConnection.onicegatheringstatechange = () => {
      console.log("ICE gathering:", peerConnection.iceGatheringState);
    };

    peerConnection.onicecandidateerror = (event) => {
      console.error(
        "ICE candidate error:",
        event.errorCode,
        event.errorText,
        event.url,
      );
    };

    // Trickle ICE candidates to the remote peer via the signaling server.
    // Send each possible direct network route to the other peer.
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        console.log("ICE candidate gathering finished.");
        return;
      }

      console.log("Sending ICE candidate:", event.candidate.type);

      sendSignal({
        kind: "ice-candidate",
        data: event.candidate.toJSON(),
      });
    };

    // The guest receives channels created by the host through this event.
    peerConnection.ondatachannel = (event) => rememberDataChannel(event.channel);
    return peerConnection;
  }, [rememberDataChannel, sendSignal]);

  // Apply any ICE candidates that arrived before setRemoteDescription finished.
  const flushPendingIceCandidates = useCallback(async (peerConnection: RTCPeerConnection) => {
    const candidates = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];
    for (const candidate of candidates) {
      await peerConnection.addIceCandidate(candidate);
    }
  }, []);

  // addIceCandidate fails if remoteDescription is not yet set; queue if not ready.
  const addOrQueueIceCandidate = useCallback(
    async (peerConnection: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
      if (!peerConnection.remoteDescription) {
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }

      await peerConnection.addIceCandidate(candidate);
    },
    [],
  );

  const failConnection = useCallback((peerConnection: RTCPeerConnection, error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown WebRTC error.";
    setWebRtcStatus(`Failed: ${message}`);
    resetPeerConnection(peerConnection);
  }, [resetPeerConnection]);

  // Host initiates the connection: creates channels, generates SDP offer, and sends via signaling.
  const startHostConnection = useCallback(async () => {
    if (peerConnectionRef.current) return;

    setWebRtcStatus("Creating offer...");
    pendingIceCandidatesRef.current = [];

    const peerConnection = createPeerConnection();
    peerConnectionRef.current = peerConnection;

    // Both channels must exist before creating the first offer to be negotiated in SDP.
    rememberDataChannel(peerConnection.createDataChannel("control", { ordered: true }));
    rememberDataChannel(peerConnection.createDataChannel("file", { ordered: true }));

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (!peerConnection.localDescription) throw new Error("WebRTC did not create a local offer.");

      if (!sendSignal({ kind: "offer", data: peerConnection.localDescription.toJSON() })) {
        throw new Error("Could not send the WebRTC offer.");
      }

      setWebRtcStatus("Offer sent. Waiting for peer response.");
    } catch (error) {
      failConnection(peerConnection, error);
    }
  }, [createPeerConnection, failConnection, rememberDataChannel, sendSignal]);

  // Dispatches incoming signaling payloads (offer, answer, ICE candidate) from remote peer.
  const handleSignal = useCallback(async (signal: SignalPayload) => {
    if (signal.kind === "offer") {
      if (!isSessionDescriptionInit(signal.data) || signal.data.type !== "offer") {
        setWebRtcStatus("Received an invalid WebRTC offer.");
        return;
      }

      if (peerConnectionRef.current) {
        setWebRtcStatus("Ignoring an unexpected second offer.");
        return;
      }

      // Guest flow: apply host's offer, create answer, and send it back.
      setWebRtcStatus("Creating answer...");
      pendingIceCandidatesRef.current = [];
      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      try {
        await peerConnection.setRemoteDescription(signal.data);
        await flushPendingIceCandidates(peerConnection);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        if (!peerConnection.localDescription) throw new Error("WebRTC did not create a local answer.");

        if (!sendSignal({ kind: "answer", data: peerConnection.localDescription.toJSON() })) {
          throw new Error("Could not send the WebRTC answer.");
        }

        setWebRtcStatus("Answer sent. Establishing connection.");
      } catch (error) {
        failConnection(peerConnection, error);
      }

      return;
    }

    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) {
      setWebRtcStatus(`Received ${signal.kind} before WebRTC was ready.`);
      return;
    }

    try {
      if (signal.kind === "answer") {
        // Host flow: receive guest's answer to finalize connection setup.
        if (!isSessionDescriptionInit(signal.data) || signal.data.type !== "answer") {
          throw new Error("Received an invalid WebRTC answer.");
        }

        await peerConnection.setRemoteDescription(signal.data);
        await flushPendingIceCandidates(peerConnection);
        setWebRtcStatus("Answer received. Establishing connection.");
      }

      if (signal.kind === "ice-candidate") {
        if (!isIceCandidateInit(signal.data)) throw new Error("Received an invalid ICE candidate.");
        await addOrQueueIceCandidate(peerConnection, signal.data);
      }
    } catch (error) {
      failConnection(peerConnection, error);
    }
  }, [addOrQueueIceCandidate, createPeerConnection, failConnection, flushPendingIceCandidates, sendSignal]);

  useEffect(() => () => peerConnectionRef.current?.close(), []);

  const sendControlMessage = useCallback((message: ControlMessage) => {
    if (!controlChannel || controlChannel.readyState !== "open") {
      return false;
    }

    controlChannel.send(JSON.stringify(message));
    return true;
  }, [controlChannel]);

  const sendFileData = useCallback((data: ArrayBuffer) => {
    if (!fileChannel || fileChannel.readyState !== "open") {
      return false;
    }

    fileChannel.send(data);
    return true;
  }, [fileChannel]);

  return {
    webRtcStatus,
    controlChannel,
    fileChannel,
    startHostConnection,
    handleSignal,
    sendControlMessage,
    controlChannelStatus,
    sendFileData,
  };
}
