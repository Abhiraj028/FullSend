# FullSend — Interview Cheatsheet

---

## Page 1 — Codebase Map

```
FullSend/
├── backend/
│   └── src/
│       └── server.ts
│           broadcast()          — rebuilds peerList and sends to all connected WS clients
│           forward()            — looks up target WS by ID, injects senderNickname, relays message
│           websocket.open()     — sends greeting on new WS connection
│           websocket.message()  — routes pid / nicknameUpdate / connReq / connAccept / connReject
│           websocket.close()    — removes peer from maps, triggers broadcast
│
├── shared/
│   └── src/
│       ├── constants.ts
│       │   CHUNK_SIZE = 65536   — 64KB chunks used for splitting file data in transfer
│       │
│       ├── protocol.ts
│       │   parseClientMessage()        — parses raw WS string into ClientMessage (Zod-validated)
│       │   parseSignalingMessage()     — parses raw WS string into ServerMessage (Zod-validated)
│       │   parseTransferMessage()      — parses DataChannel data into TransferMessage (Zod-validated)
│       │   wsMsg.pid()                — factory: builds pid registration message
│       │   wsMsg.nicknameUpdate()     — factory: builds nickname change message
│       │   wsMsg.connReq/Accept/Reject() — factories for handshake signaling messages
│       │   transferMsg.meta()         — factory: file-meta with UUID, name, size, mimeType, totalChunks
│       │   transferMsg.chunk()        — factory: file-chunk with index and ArrayBuffer data
│       │   transferMsg.done()         — factory: signals sender is finished
│       │   transferMsg.ack()          — factory: receiver acknowledges file received
│       │
│       └── index.ts
│           — re-exports all schemas, types, factories, parsers, and CHUNK_SIZE
│
└── frontend/
    └── src/
        ├── index.ts              — Bun dev server entry; serves index.html on all routes with HMR
        ├── frontend.tsx          — React DOM root; mounts <App /> into #root
        ├── App.tsx
        │   App()                 — checks localStorage for nickname; shows NicknameModal or routes to Lobby/Transfer
        │
        ├── hooks/
        │   ├── useSignaling.ts
        │   │   useSignaling()          — opens WebSocket to signaling server; handles peerList and incoming connReqs
        │   │   connectWs()             — creates WS, registers pid on open, exponential backoff on close (1s→30s)
        │   │   updateNickname()        — sends nicknameUpdate message over WS, updates internal ref
        │   │   sendSignalingMessage()  — JSON-stringifies and sends any object over active WS
        │   │   addSignalingListener()  — attaches typed WS message handler, returns unsubscribe fn
        │   │
        │   ├── usePeerConnection.ts
        │   │   usePeerConnection()     — initializes PeerJS Peer, manages DataConnection lifecycle and signaling handshake
        │   │   handleConnect()         — sends connReq via WS, starts 15s connect timeout
        │   │   acceptRequest()         — sends connAccept via WS, starts 10s accept timeout, sets status to connected
        │   │   rejectRequest()         — sends connReject via WS, resets status to idle
        │   │   disconnect()            — closes DataConnection, resets all state
        │   │   peer.on('open')         — resolves async PeerJS ID and exposes it as resolvedPeerId
        │   │
        │   ├── useFullSend.ts
        │   │   useFullSend()           — composes useSignaling + usePeerConnection; syncs resolvedPeerId; main state facade
        │   │   wrappedHandleConnect()  — binds remotePeerId into handleConnect before exposing
        │   │   wrappedUpdateNickname() — updates local nickname state and delegates to signaling
        │   │
        │   ├── PeerContext.tsx
        │   │   PeerProvider()          — wraps app in context; calls useFullSend and provides result to tree
        │   │   usePeer()               — hook to consume PeerContext; throws if used outside PeerProvider
        │   │
        │   └── useFileTransfer.ts
        │       useFileTransfer()       — listens on DataConnection for incoming files; manages send state and progress
        │       sendFiles()             — slices files into 64KB chunks, sends meta→chunks→done, tracks progress and speed
        │       handler (file-meta)     — initializes receive buffer keyed by file UUID
        │       handler (file-chunk)    — appends ArrayBuffer chunk to receive state
        │       handler (file-done)     — reassembles blob, triggers browser download, sends ack
        │       handler (file-ack)      — marks file as received in remoteTracker
        │
        ├── pages/
        │   ├── LobbyPage.tsx
        │   │   LobbyPage()             — peer discovery screen; shows PeerIdentity, PeerList, ConnectForm, ConnectionDialog
        │   │   handleNicknameChange()  — persists new nickname to localStorage and calls updateNickname
        │   │   useEffect (nav)         — navigates to /transfer/:peerId when status=connected and dataConn is live
        │   │
        │   └── TransferPage.tsx
        │       TransferPage()          — file send/receive UI; drag-drop zone, queue list, progress bar, tracker cards
        │       handleFiles()           — validates files (<2GB), appends to queue
        │       handleDrop()            — drag-and-drop handler forwarding to handleFiles
        │       handleSend()            — calls sendFiles with queued files, clears queue on completion
        │       handleDisconnect()      — calls disconnect(), clears sessionStorage, navigates back to lobby
        │
        └── components/
            ├── ConnectForm.tsx         — search/autocomplete input + connect button; filters live peerList by nickname or ID
            ├── PeerList.tsx            — renders online peers from WS peerList; filters out self; clickable to select
            ├── PeerCard.tsx            — displays peer name and transfer tracker (sent/received file names)
            ├── ConnectionDialog.tsx    — modal shown when incoming connReq arrives; accept or reject buttons
            ├── ConnectionStatus.tsx    — small status pill (idle / connecting / connected / rejected) with peer label
            ├── PeerIdentity.tsx        — displays own peer ID and editable nickname
            └── NicknameModal.tsx       — initial screen on first visit; prompts for nickname, saves to localStorage
```

---

## Page 2 — Tech Stack

### Runtime & Build

| Tech | Why |
|------|-----|
| **Bun** | Single runtime for backend and frontend dev server. Native TypeScript support without a transpile step, and built-in WebSocket server — no Express or `ws` package needed. |
| **TypeScript** | Used across all three packages. Shared types in `@fullsend/shared` make the protocol contract enforceable at compile time on both client and server. |
| **Bun Workspaces** | Monorepo linking. `@fullsend/shared` is imported as a local workspace package in both backend and frontend without publishing to npm. |

### Backend

| Tech | Why |
|------|-----|
| **Bun WebSocket** | Native Bun WebSocket server, no framework. The signaling server is a single `server.ts` file, 89 lines — handles all peer registration and message forwarding. |
| **No HTTP framework** | The backend only upgrades HTTP connections to WebSocket. No REST routes needed — all state is ephemeral and in-memory (two `Map`s). |

### Frontend

| Tech | Why |
|------|-----|
| **React 18** | UI framework. Component-based structure maps cleanly onto the two-screen flow: Lobby and Transfer. |
| **React Router v6** | Client-side routing for the two pages: `/` (lobby) and `/transfer/:peerId` (transfer session). |
| **PeerJS** | WebRTC abstraction layer. Manages STUN/TURN negotiation, DataChannel creation, and peer ID assignment. Chosen to avoid writing raw `RTCPeerConnection` signaling by hand. |
| **Vite (via Bun)** | Frontend bundler and dev server. Used for HMR during development. |
| **TailwindCSS** | Utility-first CSS. Chosen for speed of styling without writing separate CSS files. |
| **lucide-react** | Lightweight SVG icon set. Used for UI icons (upload, arrow, close). |

### Shared

| Tech | Why |
|------|-----|
| **Zod** | Runtime schema validation for all WebSocket and DataChannel messages. Ensures malformed messages don't crash either end silently. Both `parseClientMessage()` and `parseTransferMessage()` use Zod `.parse()`. |
| **@fullsend/shared** | Internal package. Single source of truth for all message types, Zod schemas, factory helpers (`wsMsg`, `transferMsg`), parser functions, and `CHUNK_SIZE`. Imported by both backend and frontend. |

### Data Flow Summary

| Channel | Role |
|---------|------|
| **WebSocket (signaling)** | Used only for peer discovery and connection handshake. Never carries file data. |
| **WebRTC DataChannel** | All file data travels peer-to-peer over the PeerJS DataChannel. Server is not involved after handshake. |
| **Chunking** | Files split into 64KB `ArrayBuffer` chunks. Each chunk sent as `file-chunk`. Receiver reassembles into a `Blob` and triggers browser download via `URL.createObjectURL()`. |
| **Tracker** | Both sides maintain a local tracker (`sentNames` / `receivedNames`) updated on `file-done` and `file-ack` events. |
