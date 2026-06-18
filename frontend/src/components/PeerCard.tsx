export type Tracker = {
  sentNames: string[];
  receivedNames: string[];
};

type PeerCardProps = {
  label: string;
  name: string;
  subtitle?: string;
  tracker?: Tracker | null;
};

function trackerLabel(t: Tracker) {
  const parts: string[] = [];
  if (t.sentNames.length) parts.push(`↑ ${t.sentNames.length}`);
  if (t.receivedNames.length) parts.push(`↓ ${t.receivedNames.length}`);
  return parts.join("  ·  ");
}

export function PeerCard({ label, name, subtitle, tracker }: PeerCardProps) {
  const show = tracker && (tracker.sentNames.length > 0 || tracker.receivedNames.length > 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center">
      <p className="text-xs font-medium text-slate-400 uppercase mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800 truncate">{name}</p>
      {subtitle && (
        <code className="text-[10px] text-slate-400 font-mono block truncate">{subtitle}</code>
      )}
      {show && tracker && (
        <span className="relative group inline-block mt-2 text-xs font-semibold text-slate-500">
          <span className="border-b border-dashed border-slate-300 cursor-pointer">
            {trackerLabel(tracker)}
          </span>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
            <div className="bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap flex gap-4">
              {tracker.sentNames.length > 0 && (
                <div>
                  <p className="font-semibold text-indigo-300 mb-0.5">Sent:</p>
                  {tracker.sentNames.map((n) => (
                    <p key={n} className="text-slate-300">{n}</p>
                  ))}
                </div>
              )}
              {tracker.receivedNames.length > 0 && (
                <div>
                  <p className="font-semibold text-indigo-300 mb-0.5">Received:</p>
                  {tracker.receivedNames.map((n) => (
                    <p key={n} className="text-slate-300">{n}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </span>
      )}
    </div>
  );
}
