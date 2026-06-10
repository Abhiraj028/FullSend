import type { Server, ServerWebSocket } from "bun";

const currentPeers = new Map<ServerWebSocket,string>();
let arr : string[] = [];

Bun.serve({
    port: 8080,
    fetch(req,server){
        if(server.upgrade(req)){
            return;
        }
        return new Response("Upgrade failed", {status: 500});
    },
    websocket:{

        open(ws){
            ws.send("Server generated message. Connection has been open to the server. ");      
        },

        message(ws, message){
            const msg = message as string;
            console.log("Received message from client:", msg);

            if(msg.startsWith("$pid->") && !arr.includes(msg.slice(6))){
                arr.push(message as string);
                currentPeers.set(ws, message as string);
                
                for (const peerWs of currentPeers.keys()) {
                    peerWs.send(JSON.stringify(arr));
                }
            }
        },

        close(ws, code, reason){
            const PID = currentPeers.get(ws);
            currentPeers.delete(ws);
            arr = arr.filter(item => item !== PID);

            for (const peerWs of currentPeers.keys()) {
                peerWs.send(JSON.stringify(arr));
            }

            console.log("Websocket closed: ", code, reason);
            ws.send("Connection closed: " + code + " - " + reason);
        }
    },
});
