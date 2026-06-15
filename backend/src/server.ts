import type { Server, ServerWebSocket } from "bun";

const currentPeers = new Map<ServerWebSocket, string>();
let arr: string[] = [];

Bun.serve({
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
              console.log("Peer registered:", msg.id, "| Total:", arr.length);
              broadcast();
            }
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
      arr = arr.filter((item) => item !== PID);
      broadcast();
      console.log("Websocket closed:", code, reason);
    },
  },
});

function broadcast() {
  const payload = JSON.stringify({ type: "peerList", peers: arr });
  for (const peerWs of currentPeers.keys()) {
    peerWs.send(payload);
  }
}

function forward(targetId: string, message: string) {
  for (const [peerWs, id] of currentPeers) {
    if (id === targetId) {
      peerWs.send(message);
      break;
    }
  }
}
