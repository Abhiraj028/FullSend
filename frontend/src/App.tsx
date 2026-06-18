import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { PeerProvider } from "@/hooks/PeerContext";
import { NicknameModal } from "@/components/NicknameModal";
import { LobbyPage } from "@/pages/LobbyPage";
import { TransferPage } from "@/pages/TransferPage";

export function App() {
  const [nickname, setNickname] = useState<string | null>(
    () => localStorage.getItem("fullsend_nickname"),
  );

  if (!nickname) {
    return <NicknameModal onConfirm={setNickname} />;
  }

  return (
    <PeerProvider nickname={nickname}>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/transfer/:peerId" element={<TransferPage />} />
      </Routes>
    </PeerProvider>
  );
}

export default App;
