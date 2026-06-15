import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { ConnectionStatus } from "@/hooks/useFullSend";

type ConnectFormProps = {
  value: string;
  onChange: (value: string) => void;
  onConnect: () => void;
  status: ConnectionStatus;
};

export function ConnectForm({ value, onChange, onConnect, status }: ConnectFormProps) {
  const connecting = status === "connecting";

  return (
    <div className="pt-4">
      <p className="text-xs font-medium text-slate-400 uppercase mb-3">Establish Connection</p>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Input
            className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 pr-8"
            type="text"
            placeholder="Paste remote peer ID..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
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
