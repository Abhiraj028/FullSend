import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  ControlMessage,
  RoomRole,
} from "../lib/protocol";
import type {
  ReportEvent,
  SendControlMessage,
  SendFileData,
} from "../lib/transfer";
import { usePeerConnection } from "./usePeerConnection";
import { useIncomingTransfer } from "./transfer/useIncomingTransfer";
import { useOutgoingTransfer } from "./transfer/useOutgoingTransfer";

type SendMessage = (message: ClientMessage) => boolean;

export function useFileTransferSession(
  sendMessage: SendMessage,
  role: RoomRole,
  reportEvent: ReportEvent,
) {
  const sendControlMessageRef = useRef<SendControlMessage>(() => false);
  const sendFileDataRef = useRef<SendFileData>(async () => false);
  const closePeerConnectionRef = useRef<() => void>(() => {});
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Transfer hooks need WebRTC senders, while WebRTC needs their receive handlers.
  // Stable proxies break that dependency cycle and are wired to the real functions below.
  const sendControlMessage = useCallback<SendControlMessage>(
    (message) => sendControlMessageRef.current(message),
    [],
  );
  const sendFileData = useCallback<SendFileData>(
    (data) => sendFileDataRef.current(data),
    [],
  );
  const closePeerConnection = useCallback(
    () => closePeerConnectionRef.current(),
    [],
  );
  const reportConnectionError = useCallback(
    (message: string) => setConnectionError(message),
    [],
  );

  const {
    handleControlMessage: handleOutgoingControlMessage,
    ...outgoing
  } = useOutgoingTransfer(sendControlMessage, sendFileData, reportEvent);
  const {
    handleControlMessage: handleIncomingControlMessage,
    handleFileData,
    ...incoming
  } = useIncomingTransfer({
    sendControlMessage,
    closePeerConnection,
    reportEvent,
    reportConnectionError,
  });

  const handleControlMessage = useCallback(
    (message: ControlMessage) => {
      // Both state machines inspect the same control packet and ignore irrelevant types.
      handleOutgoingControlMessage(message);
      handleIncomingControlMessage(message);
    },
    [handleIncomingControlMessage, handleOutgoingControlMessage],
  );

  const {
    webRtcStatus,
    controlChannelStatus,
    startHostConnection,
    handleSignal,
    sendControlMessage: sendControlThroughPeer,
    sendFileData: sendFileThroughPeer,
    closePeerConnection: closePeer,
  } = usePeerConnection(
    sendMessage,
    handleControlMessage,
    handleFileData,
  );

  useEffect(() => {
    sendControlMessageRef.current = sendControlThroughPeer;
  }, [sendControlThroughPeer]);

  useEffect(() => {
    sendFileDataRef.current = sendFileThroughPeer;
  }, [sendFileThroughPeer]);

  useEffect(() => {
    closePeerConnectionRef.current = closePeer;
  }, [closePeer]);

  useEffect(() => {
    const handlePeerInterruption = () => {
      if (role) {
        setConnectionError(
          "The direct peer connection was interrupted. Your session history is still available.",
        );
      }
    };

    window.addEventListener("fullsend-peer-interrupted", handlePeerInterruption);
    return () =>
      window.removeEventListener(
        "fullsend-peer-interrupted",
        handlePeerInterruption,
      );
  }, [role]);

  const handleRoomClosed = useCallback(
    (reason: string) => {
      closePeer();
      setConnectionError(`${reason} Your session history is still available.`);
      reportEvent(reason);
    },
    [closePeer, reportEvent],
  );

  const clearConnectionError = useCallback(() => {
    setConnectionError(null);
  }, []);

  return {
    webRtcStatus,
    controlChannelStatus,
    connectionError,
    ...outgoing,
    ...incoming,
    startHostConnection,
    handleSignal,
    handleRoomClosed,
    clearConnectionError,
  };
}
