import type { PeerInfo } from "@/hooks/useFullSend";

type PeerListProps = {
  peers: PeerInfo[];
  myPeerId: string;
  onSelect: (id: string) => void;
};

export function PeerList({ peers, myPeerId, onSelect }: PeerListProps) {
  const others = peers.filter((p) => p.id !== myPeerId);

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 px-1">
        Available Peers
      </h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-[200px]">
        {others.length === 0 ? (
          <EmptyState alone={peers.length > 0} />
        ) : (
          <ul className="space-y-2">
            {others.map((p) => (
              <li
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="relative group flex items-center gap-3 p-2 rounded-lg cursor-pointer border border-transparent hover:border-dashed hover:border-indigo-400 hover:scale-[1.02] hover:shadow-md transition-all duration-200"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-xs truncate text-slate-800">{p.nickname}</span>
                  <code className="text-[10px] text-slate-400 font-mono truncate">{p.id}</code>
                </div>
                <span className="absolute -top-1 right-1 text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                  select user
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ alone }: { alone: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-60">
      <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" />
      <p className="text-sm text-slate-400">
        {alone ? "No other peers connected" : "Waiting for others..."}
      </p>
    </div>
  );
}
