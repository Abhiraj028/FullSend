import type { Server, ServerWebSocket } from "bun";
import { parseClientMessage } from "@fullsend/shared";

const currentPeers = new Map<ServerWebSocket, string>();
const nicknames = new Map<string, string>();

Bun.serve({
  hostname: "0.0.0.0",
  port: 8080,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    open(ws) {
      ws.send("Server connection open");
    },

    message(ws, message) {
      const msg = parseClientMessage(message as string); //helper in shared
      if (!msg) {
        console.log("Invalid JSON or unknown message type:", message);
        return;
      }

      switch (msg.type) { //switch based updation of the maps.
        case "pid": {
          const isNew = !Array.from(currentPeers.values()).includes(msg.id);
          currentPeers.set(ws, msg.id);
          if (msg.nickname) {
            nicknames.set(msg.id, msg.nickname);
          }
          if (isNew) {
            console.log("Peer registered:", msg.id, "| Nickname:", msg.nickname, "| Total:", currentPeers.size);
            broadcast();
          }
          break;
        }

        case "nicknameUpdate":
          nicknames.set(msg.id, msg.nickname);
          console.log("Nickname updated:", msg.id, "→", msg.nickname);
          broadcast();
          break;

        case "connReq":
        case "connAccept":
        case "connReject":
          console.log(`${msg.type}:`, msg.sender, "->", msg.receiver);
          forward(msg.receiver, message as string, msg.sender);
          break;
      }
    },

    close(ws, code, reason) {
      const PID = currentPeers.get(ws);
      if (PID) {
        currentPeers.delete(ws);
        nicknames.delete(PID);
        broadcast(); // updates the peerlist
        console.log("Websocket closed:", code, reason);
      }
    },
  },
});

function broadcast() {
  const peerList = Array.from(currentPeers.values()).map((id) => ({
    id,
    nickname: nicknames.get(id) ?? id,
  }));
  const payload = JSON.stringify({ type: "peerList", peers: peerList });
  for (const peerWs of currentPeers.keys()) {
    peerWs.send(payload);
  }
}

function forward(targetId: string, message: string, senderId: string) {
  const parsed = JSON.parse(message);
  parsed.senderNickname = nicknames.get(senderId) ?? senderId;
  const enriched = JSON.stringify(parsed);
  for (const [peerWs, id] of currentPeers) { // should be switched to id first for O1 lookup
    if (id === targetId) {
      peerWs.send(enriched);
      break;
    }
  }
}
