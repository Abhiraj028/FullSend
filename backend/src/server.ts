import type { Server, ServerWebSocket } from "bun";

const currentPeers = new Map<ServerWebSocket, string>();
const nicknames = new Map<string, string>();
let arr: string[] = [];

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
      try {
        const msg = JSON.parse(message as string);

        switch (msg.type) {
          case "pid":
            if (!arr.includes(msg.id)) {
              arr.push(msg.id);
              currentPeers.set(ws, msg.id);
              if (msg.nickname) {
                nicknames.set(msg.id, msg.nickname);
              }
              console.log("Peer registered:", msg.id, "| Nickname:", msg.nickname, "| Total:", arr.length);
              broadcast();
            }
            break;

          case "nicknameUpdate":
            nicknames.set(msg.id, msg.nickname);
            console.log("Nickname updated:", msg.id, "→", msg.nickname);
            broadcast();
            break;

          case "connReq":
            console.log("connReq:", msg.sender, "->", msg.receiver);
            forward(msg.receiver, message as string);
            break;

          case "connAccept":
            console.log("connAccept:", msg.sender, "->", msg.receiver);
            forward(msg.receiver, message as string);
            break;

          case "connReject":
            console.log("connReject:", msg.sender, "->", msg.receiver);
            forward(msg.receiver, message as string);
            break;
        }
      } catch {
        console.log("Invalid JSON:", message);
      }
    },

    close(ws, code, reason) {
      const PID = currentPeers.get(ws);
      currentPeers.delete(ws);
      nicknames.delete(PID!);
      arr = arr.filter((item) => item !== PID);
      broadcast();
      console.log("Websocket closed:", code, reason);
    },
  },
});

function broadcast() {
  const peerList = arr.map((id) => ({
    id,
    nickname: nicknames.get(id) ?? id,
  }));
  const payload = JSON.stringify({ type: "peerList", peers: peerList });
  for (const peerWs of currentPeers.keys()) {
    peerWs.send(payload);
  }
}

function forward(targetId: string, message: string) {
  const parsed = JSON.parse(message);
  parsed.senderNickname = nicknames.get(parsed.sender) ?? parsed.sender;
  const enriched = JSON.stringify(parsed);
  for (const [peerWs, id] of currentPeers) {
    if (id === targetId) {
      peerWs.send(enriched);
      break;
    }
  }
}
