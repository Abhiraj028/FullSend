import { useState } from "react";
import { generateNickname } from "@/lib/nameGen";

type NicknameModalProps = {
  onConfirm: (nickname: string) => void;
};

export function NicknameModal({ onConfirm }: NicknameModalProps) {
  const [nickname, setNickname] = useState(generateNickname);

  const handleConfirm = () => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    localStorage.setItem("fullsend_nickname", trimmed);
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-6 w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-slate-500">Your nickname</p>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="text-xl font-semibold text-slate-800 border-b-2 border-dashed border-slate-300 pb-0.5 bg-transparent text-center outline-none focus:border-indigo-400 transition-colors w-full"
          />
        </div>

        <button
          onClick={handleConfirm}
          disabled={!nickname.trim()}
          className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
