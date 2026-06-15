type ConnectionDialogProps = {
  sender: string;
  onAccept: () => void;
  onReject: () => void;
};

export function ConnectionDialog({ sender, onAccept, onReject }: ConnectionDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-6 w-80 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Connection Request</p>
        <p className="text-sm text-slate-500">
          Peer{" "}
          <span className="font-mono text-indigo-600 font-medium">{sender}</span>{" "}
          wants to connect
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onReject}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer font-medium"
          >
            Reject
          </button>
          <button
            onClick={onAccept}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer font-medium shadow-sm"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
