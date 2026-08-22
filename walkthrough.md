# FullSend Modularization Complete

The FullSend project has been successfully restructured into a more modular, robust, and scalable architecture.

## Changes Made

### 1. Monorepo Structure & Shared Protocol
We created a new `@fullsend/shared` package to hold common types and Zod schemas. Both the backend and frontend now depend on this shared package.
- **Why?** It ensures that WebSocket signaling and DataChannel binary messages are strictly typed on both sides. A change to the protocol in the shared package will now fail the build if not handled correctly in both clients.
- **Added Runtime Validation**: Incoming messages are now parsed and validated at runtime using Zod, avoiding silent failures from malformed messages.

### 2. Backend Cleanup
- Removed dead dependencies (`peerjs`, `cors`).
- Simplified peer management by removing the redundant `arr` array. The active peer list is now derived directly from `currentPeers.values()`, eliminating the possibility of the two state collections going out of sync.

### 3. Frontend Core Modularization
The massive `useFullSend.ts` hook was broken down into specialized hooks:
- [`useSignaling.ts`](file:///c:/mine/Projects/FullSend/frontend/src/hooks/useSignaling.ts): Handles WebSocket connection, reconnection logic, nickname updates, and the live peer list.
- [`usePeerConnection.ts`](file:///c:/mine/Projects/FullSend/frontend/src/hooks/usePeerConnection.ts): Manages PeerJS instantiation, WebRTC negotiation, and handshake timeouts.
- [`useFileTransfer.ts`](file:///c:/mine/Projects/FullSend/frontend/src/hooks/useFileTransfer.ts): Encapsulates the chunking, sending, receiving, reassembling, and tracking of files via the DataChannel.
- [`useFullSend.ts`](file:///c:/mine/Projects/FullSend/frontend/src/hooks/useFullSend.ts) now simply composes these three hooks together, making it an orchestrator rather than a god-object.

> [!TIP]
> This separation makes each hook independently testable and dramatically reduces the cognitive load when reading the codebase.

### 4. UX & Environment Improvements
- **Environment Variables**: The WebSocket URL is no longer hardcoded to `8080`. It now reads from `BUN_PUBLIC_WS_HOST` and `BUN_PUBLIC_WS_PORT` with sensible defaults.
- **Session Recovery**: `TransferPage` now stores the active peer ID and name in `sessionStorage`. If you accidentally hit "refresh", you will be shown a helpful "Session interrupted" state allowing you to return to the lobby, rather than a broken page.
- **File Queue Management**: You can now remove files from the transfer queue before sending them.
- **Size Validation**: The app now intercepts files larger than 2GB before queuing them to warn the user, preventing browser crashes from excessive ArrayBuffer allocations.

## Verification
- Both backend and frontend successfully compile via TypeScript (`bun x tsc`).
- Dependencies correctly resolve across the new Bun workspace.

## Next Steps
You can start the backend and frontend using `bun run src/server.ts` and `bun dev` to see the improvements in action!
