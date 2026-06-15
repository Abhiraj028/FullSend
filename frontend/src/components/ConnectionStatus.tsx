import type { ConnectionStatus } from "@/hooks/useFullSend";

type ConnectionStatusProps = {
  status: ConnectionStatus;
  peerId: string | null;
};

export function ConnectionStatus({ status, peerId }: ConnectionStatusProps) {
  if (status === "idle") return null;

  return (
    <div className="text-center">
      {status === "connecting" && (
        <p className="text-sm text-amber-600 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Connecting to {peerId}...
        </p>
      )}
      {status === "connected" && (
        <p className="text-sm text-green-600 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Connected to {peerId}
        </p>
      )}
      {status === "rejected" && (
        <p className="text-sm text-red-600 flex items-center justify-center gap-2">
          Connection rejected by {peerId}
        </p>
      )}
    </div>
  );
}
