# FullSend repository map

## Purpose

FullSend is a browser-to-browser file-transfer application.  The backend only
provides WebSocket-based peer discovery and connection-consent signaling; file
data is sent directly between browsers over a PeerJS/WebRTC data channel.

## Runtime layout

| Area | Entry point | Responsibility |
| --- | --- | --- |
| Frontend | `frontend/src/index.ts` | Bun serves the React application and its HTML fallback. |
| React UI | `frontend/src/frontend.tsx` and `frontend/src/App.tsx` | Mounts routing, gathers a nickname, and supplies connection state through `PeerProvider`. |
| Signaling backend | `backend/src/server.ts` | Maintains active WebSocket peers, broadcasts peer lists, and relays connection requests, accepts, and rejects. |
| Shared protocol | `shared/src/protocol.ts` | Defines TypeScript types, Zod runtime parsers, and builders for signaling and transfer messages. |
| Transfer engine | `frontend/src/hooks/useFileTransfer.ts` | Splits files into 64 KiB chunks, sends them over the data channel, reassembles downloads, and tracks acknowledgements. |

## User and network flow

1. A visitor chooses a nickname, stored in `localStorage`.
2. `usePeerConnection` creates a PeerJS peer and receives its peer ID.
3. `useSignaling` opens `ws(s)://<host>:<port>` (defaults to port 8080) and registers that ID and nickname.
4. The backend broadcasts the peer list. A user selects a peer and sends a `connReq` through the backend.
5. The target accepts or rejects. On accept, the requesting browser creates the PeerJS data connection.
6. Once the data channel is open, React routes to `/transfer/:peerId`.
7. A queued file is announced with `file-meta`, transmitted in `file-chunk` messages, finalized with `file-done`, and acknowledged with `file-ack` after the receiver downloads it.

## Current refactor state

The working tree contains an uncommitted monorepo/modularization change:

- a root Bun workspace and a new `@fullsend/shared` package;
- extracted `useSignaling`, `usePeerConnection`, and `useFileTransfer` hooks;
- runtime Zod parsing for signaling and transfer protocol messages;
- queue removal, a nominal 2 GiB file warning, and session-interruption UI.

`backend` type-checks successfully with `bun x tsc --noEmit`. The frontend
type-check could not run in this sandbox because Bun was denied access to its
temporary directory; this was an environment limitation, not a compiler error.

## Important finding

The extracted connection hooks have a timing issue: the PeerJS handshake
listeners are installed while the signaling WebSocket ref is still null.
`addSignalingListener` then returns a no-op and the effect does not rerun when
the WebSocket later opens. As a result, `connAccept` and `connReject` handling
is likely never registered, preventing the requesting browser from opening its
PeerJS connection after acceptance. See `RISKS.md` for detail and other
unverified risks.
