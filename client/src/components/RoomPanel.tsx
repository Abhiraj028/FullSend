import type { JoinStatus, RoomRole } from "../lib/protocol";

type RoomPanelProps = {
  connectionStatus: string;
  roomId: string | null;
  roomLink: string | null;
  role: RoomRole;
  joinStatus: JoinStatus;
  hasPendingJoinRequest: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onRetryJoin: () => void;
  onApproveJoin: () => void;
  onRejectJoin: () => void;
};

export function RoomPanel({
  connectionStatus, roomId, roomLink, role, joinStatus, hasPendingJoinRequest,
  onCreateRoom, onJoinRoom, onRetryJoin, onApproveJoin, onRejectJoin,
}: RoomPanelProps) {
  if (!roomId) {
    return <button onClick={onCreateRoom} disabled={connectionStatus !== "Connected"}>Create room</button>;
  }

  if (role === "host") {
    return <>
      <section className="room-panel">
        <p className="label">Share this room link</p>
        <code>{roomLink}</code>
        <p className="hint">Keep this page open while another peer requests entry.</p>
      </section>
      {hasPendingJoinRequest && <section className="room-panel join-request">
        <p className="label">A peer wants to join</p>
        <p className="hint">Approve only if you expect this person to be here.</p>
        <div className="actions">
          <button onClick={onApproveJoin}>Approve</button>
          <button className="secondary-button" onClick={onRejectJoin}>Reject</button>
        </div>
      </section>}
    </>;
  }

  if (role === "guest") {
    return <section className="room-panel">
      <p className="label">Room connected</p>
      <code>{roomId}</code>
      <p className="hint">The peer approved your request.</p>
    </section>;
  }

  if (joinStatus === "pending") {
    return <section className="room-panel">
      <p className="label">Join request sent</p>
      <code>{roomId}</code>
      <p className="hint">Waiting for the room host to approve you.</p>
    </section>;
  }

  if (joinStatus === "rejected") {
    return <section className="room-panel">
      <p className="label">Join request rejected</p>
      <button onClick={onRetryJoin}>Try again</button>
    </section>;
  }

  return <section className="room-panel">
    <p className="label">Join room</p>
    <code>{roomId}</code>
    <button onClick={onJoinRoom} disabled={connectionStatus !== "Connected"}>Request entry</button>
  </section>;
}
