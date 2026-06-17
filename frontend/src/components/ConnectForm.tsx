import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { ConnectionStatus, PeerInfo } from "@/hooks/useFullSend";

type ConnectFormProps = {
  value: string;
  onChange: (value: string) => void;
  onConnect: () => void;
  status: ConnectionStatus;
  peers: PeerInfo[];
};

export function ConnectForm({ value, onChange, onConnect, status, peers }: ConnectFormProps) {
  const connecting = status === "connecting";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? peers.filter(
        (p) =>
          p.nickname.toLowerCase().includes(value.toLowerCase()) ||
          p.id.toLowerCase().includes(value.toLowerCase()),
      )
    : peers;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="pt-4">
      <p className="text-xs font-medium text-slate-400 uppercase mb-3">Establish Connection</p>
      <div className="flex flex-col gap-3">
        <div className="relative" ref={ref}>
          <Input
            className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 pr-8"
            type="text"
            placeholder="Search by nickname or paste peer ID..."
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            disabled={connecting}
          />
          {value && !connecting && (
            <button
              onClick={() => onChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          )}

          {open && filtered.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtered.map((p) => (
                <li
                  key={p.id}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer transition-colors"
                >
                  <span className="text-sm font-medium text-slate-800">{p.nickname}</span>
                  <code className="text-[10px] text-slate-400 font-mono ml-auto">{p.id}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          className="w-full bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all active:scale-[0.98] cursor-pointer"
          onClick={onConnect}
          disabled={connecting || !value}
        >
          {connecting ? "Connecting..." : "Connect to Peer"}
        </Button>
      </div>
    </div>
  );
}
