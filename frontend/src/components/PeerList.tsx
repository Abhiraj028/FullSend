type PeerListProps = {
  peerIds: string[];
  myPeerId: string;
  onSelect: (id: string) => void;
};

export function PeerList({ peerIds, myPeerId, onSelect }: PeerListProps) {
  const others = peerIds.filter((id) => id !== myPeerId);

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 px-1">
        Available Peers
      </h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-[200px]">
        {others.length === 0 ? (
          <EmptyState alone={peerIds.length > 0} />
        ) : (
          <ul className="space-y-2">
            {others.map((id) => (
              <li
                key={id}
                onClick={() => onSelect(id)}
                className="relative group flex items-center gap-3 p-2 rounded-lg cursor-pointer border border-transparent hover:border-dashed hover:border-indigo-400 hover:scale-[1.02] hover:shadow-md transition-all duration-200"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                <span className="font-mono text-xs truncate flex-1">{id}</span>
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
