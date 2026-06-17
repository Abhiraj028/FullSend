import type { ConnectionStatus as Status } from "@/hooks/useFullSend";

type ConnectionStatusProps = {
  status: Status;
  peerId: string | null;
  nicknameMap: Record<string, string>;
};

function resolve(peerId: string | null, nicknameMap: Record<string, string>) {
  if (!peerId) return null;
  return nicknameMap[peerId] ?? peerId;
}

export function ConnectionStatus({ status, peerId, nicknameMap }: ConnectionStatusProps) {
  if (status === "idle") return null;
  const name = resolve(peerId, nicknameMap);

  return (
    <div className="text-center">
      {status === "connecting" && (
        <p className="text-sm text-amber-600 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Connecting to {name}...
        </p>
      )}
      {status === "connected" && (
        <p className="text-sm text-green-600 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Connected to {name}
        </p>
      )}
      {status === "rejected" && (
        <p className="text-sm text-red-600 flex items-center justify-center gap-2">
          Connection rejected by {name}
        </p>
      )}
    </div>
  );
}
