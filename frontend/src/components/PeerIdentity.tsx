export function PeerIdentity({ peerId }: { peerId: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase mb-2">Your Identity</p>
      <div className="bg-slate-900 rounded-lg p-3 relative overflow-hidden group">
        <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center gap-2">
          <span className="bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded leading-none shrink-0">
            Me
          </span>
          <code className="text-indigo-300 font-mono text-sm block truncate">
            {peerId || "Initialising network..."}
          </code>
        </div>
      </div>
    </div>
  );
}
