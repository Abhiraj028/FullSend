# FullSend — Amazon Data Analyst Interview Defense Report

> **Evidence basis**: Every claim below derives from direct code inspection of the FullSend repository.
> Labels used throughout: **✅ Confirmed from code** | **🔶 Reasonable inference — confirm before interview** | **❓ Missing — you must supply**

---

## 1. PROJECT TRUTH AUDIT

### Plain-Language Rewrite

FullSend is a browser-based, peer-to-peer file-sharing tool. Two users open the same web app in their browsers. A lightweight signaling server (WebSocket, ~89 lines of TypeScript, running on Bun) tracks who is online and relays connection-setup signals. Once two peers confirm they want to connect, a direct WebRTC DataChannel is opened between their browsers. Files are then sliced into 64 KB chunks and streamed through that DataChannel—the file bytes never touch the signaling server. The UI is React 19 with TailwindCSS v4, built on Bun's native HTTP/WS server.

**System map:**

| Element | What it is |
|---|---|
| **User** | Any two people who open the app URL in a modern browser |
| **Stakeholder** | Solo/personal project; no organizational stakeholder identified |
| **Problem** | Sending large files privately without uploading to a third-party cloud service |
| **Input** | A file (or files) selected in the browser; max practical limit ~2 GB per file (enforced in code) |
| **Processing** | Chunk the file into 64 KB ArrayBuffers, send over WebRTC DataChannel, reassemble on receiver's side |
| **Output** | The receiver's browser auto-downloads the reassembled file |
| **Impact** | File bytes travel point-to-point between two browsers; the signaling server only carries ~5 message types, none of which contain file data |

---

### Resume Bullet Audit

#### New Resume Version
> *"Built a networking tool that sends files directly between two devices with no server or cloud storage in between, prioritizing privacy and data security."*

| Sub-claim | Status | What you need |
|---|---|---|
| "Built" | ✅ Full codebase present | Be ready to walk through every file |
| "directly between two devices" | ✅ Confirmed — WebRTC DataChannel, file bytes never sent to `server.ts` | Explain the signaling vs. transfer distinction clearly |
| "no server or cloud storage in between" | 🔶 **Partially true but requires nuance** | A signaling server IS required for peer discovery and connection handshake; only file content bypasses the server. This claim can mislead an interviewer. See safer wording below. |
| "prioritizing privacy and data security" | ❓ **Unsupported as stated** | No auth, no encryption layer beyond WebRTC's built-in DTLS, no access controls. The project uses WebRTC's default DTLS/SRTP, which is real but you did not implement it yourself. State this clearly. |

#### Old Resume Version
> *"Built a peer-to-peer file transfer application using PeerJS and WebRTC DataChannels, enabling direct file sharing between devices without routing file contents through a central server."*

| Sub-claim | Status | What you need |
|---|---|---|
| "Built" | ✅ | Same caveat — walk through code |
| "using PeerJS and WebRTC DataChannels" | ✅ `peerjs@^1.5.5` in `package.json`, `DataConnection` used in `usePeerConnection.ts` | Understand what PeerJS adds on top of raw WebRTC |
| "without routing file contents through a central server" | ✅ More precise than new version | Correct and defensible |
| "Utilised PeerJS for peer discovery and connection establishment" | 🔶 **Partially correct** | PeerJS IS used for the DataChannel, but peer *discovery* (who is online) is done by your own custom WebSocket signaling server, not PeerJS's built-in signaling. PeerJS's signaling server is still used for ICE/SDP negotiation. Clarify the two-layer signaling. |

#### Critical Contradiction
The new resume says "no server" while the old says "without routing file **contents** through a central server." The old wording is more accurate. The new wording is misleading.

---

### ⚠️ Vague / Risky Statements

| Statement | Risk | Safer Wording |
|---|---|---|
| "no server or cloud storage in between" | Misleads; there is a signaling server | "File bytes are transferred directly between browsers via WebRTC DataChannels; a lightweight signaling server handles only peer discovery and connection setup, never touching file data" |
| "prioritizing privacy and data security" | You cannot claim end-to-end encryption as your own work | "Leverages WebRTC's built-in DTLS/SRTP encryption for the data channel; file bytes are never stored or proxied by any server" |
| "peer discovery" (old resume) | Conflates custom WS signaling with PeerJS | "Built a custom WebSocket signaling server for peer discovery; used PeerJS to manage WebRTC DataChannel establishment" |

---

### Missing Information — Questions You Must Answer

1. ❓ Is this deployed anywhere? What URL? What hosting infrastructure?
2. ❓ Have you measured actual transfer speeds? (The code calculates MB/s in real-time — what did you observe?)
3. ❓ Did you work on this alone or with collaborators?
4. ❓ What motivated this project — personal use, course project, hackathon?
5. ❓ Have you tested across NAT (different networks)? Does it work without a STUN/TURN server?
6. ❓ What is the PeerJS cloud server's role when the data channel is established? (Important for the "no server" claim.)

---

## 2. INTERVIEW INTRODUCTIONS

### One-Sentence Summary
> "FullSend is a browser-based peer-to-peer file transfer tool I built from scratch, where file bytes travel directly between two browsers over a WebRTC DataChannel, bypassing any server storage."

### 30-Second Explanation
> "I built FullSend to solve a simple but common problem: sending a large file to someone privately, without uploading it to Google Drive or WeTransfer. I built a custom signaling server in about 90 lines of TypeScript that tracks online peers and forwards connection requests between them — but never the file data itself. Once two users confirm the connection, WebRTC opens a direct DataChannel between their browsers, and I slice the file into 64 KB chunks and stream them across. The receiver's browser reassembles and auto-downloads the file. End-to-end, the file never leaves the two browsers."

### 90-Second Explanation
> "I built FullSend because I wanted to understand how peer-to-peer systems actually work under the hood, and because file-sharing tools always seem to require an account or cloud upload.
>
> The architecture has two distinct layers. The first is a lightweight WebSocket signaling server I wrote in TypeScript, running on Bun. It has one job: track which peers are online and relay three types of control messages — connection request, accept, and reject. The file bytes never pass through it.
>
> The second layer is the WebRTC DataChannel, managed through PeerJS. Once two users exchange those control signals, PeerJS negotiates a direct, encrypted DataChannel between their browsers. On top of that channel, I defined my own binary protocol: a metadata frame carries the filename, MIME type, total size, and chunk count; then each 64 KB chunk is sent with its index; a done signal marks completion; and the receiver sends back an acknowledgment. The receiver reconstructs the file in memory and triggers a browser download.
>
> I also designed a shared TypeScript package with Zod schemas for both the signaling and transfer protocols, so both the backend and frontend share the same validated message types."

### 3-Minute Walkthrough
> "Let me walk you through the full lifecycle of a file transfer in FullSend.
>
> **User arrives.** When someone opens the app, the first thing they see is a nickname modal. The app auto-generates a human-readable name using an adjective-animal pattern — something like 'swift-falcon-472'. The nickname is saved in localStorage so it persists across sessions. Under the hood, PeerJS also assigns a UUID-based peer ID to each browser session.
>
> **Connecting to the signaling server.** The `useSignaling` hook opens a WebSocket connection to my Bun server on port 8080. The browser sends a `pid` message with its peer ID and nickname. The server registers it in an in-memory Map and broadcasts an updated peer list to everyone. So every connected client immediately sees who else is online.
>
> **Initiating a connection.** A user sees the peer list and clicks someone's name, or types their peer ID manually. This sends a `connReq` message through the WebSocket server to the target peer. The target sees a dialog and can accept or reject. If they accept, a `connAccept` message travels back through the signaling server. This is the only moment the server is involved — it's forwarding a 60-byte control message, not any file data.
>
> **WebRTC handshake.** When the initiating side sees `connAccept`, it calls PeerJS's `connect()` method, which triggers the WebRTC ICE and SDP negotiation. PeerJS uses its own cloud signaling for this phase — so technically PeerJS's infrastructure does handle the ICE negotiation. Once ICE completes, a direct DataChannel opens between the two browsers.
>
> **File transfer.** The sender slices the file into 64 KB ArrayBuffer chunks using the File API's `slice()` method. For each chunk, it sends a `file-chunk` message with the chunk index, total chunk count, and the raw bytes. A 5 ms pause between chunks prevents DataChannel buffer overflow. After all chunks, a `file-done` signal is sent. The receiver has been collecting chunks in a Map indexed by chunk index, so even if ordering is slightly off, it can reassemble correctly. It then creates a Blob, generates an object URL, and clicks a hidden anchor tag to trigger the download. It sends a `file-ack` back so the sender knows delivery was confirmed.
>
> **What the server never sees.** Every byte of the file travels over the WebRTC DataChannel. The signaling server's message handler literally only handles five message types — none are file payloads.
>
> **Tech stack.** Backend: Bun, TypeScript, native Bun WebSocket. Frontend: React 19, TailwindCSS v4, PeerJS, React Router. Shared: a TypeScript workspace package with Zod-validated message schemas."

---

## 3. BUSINESS AND ANALYTICAL CONTEXT

### The Problem
Cloud file-sharing services (WeTransfer, Google Drive, Dropbox) upload your file to a third-party server before the recipient downloads it. This means: (1) the file is exposed to the provider, (2) you depend on upload and download bandwidth to the cloud, and (3) there are often file size limits or rate limits.

### Why It Matters
- Privacy-sensitive files (documents, photos, proprietary data) should not transit a provider's servers
- On a fast LAN or direct connection, WebRTC DataChannels can theoretically approach local network speeds
- No account, no login, no retention — the file exists only in two browser memory spaces

### Stakeholders
❓ This is a personal/portfolio project. Identify who you built it for and whether anyone besides yourself used it.

### Decisions It Was Intended to Support
Not a decision-support system. FullSend is a tool, not an analytics product. **This is important to state correctly in an Amazon Data Analyst interview.** You should frame it as a systems engineering project that demonstrates technical depth, not as an analytics project.

### Success Criteria (as could be inferred)
| Criterion | Status |
|---|---|
| File bytes never touch the server | ✅ Confirmed from code |
| Connection works across different networks | ❓ Requires testing — depends on NAT/STUN |
| Files transfer correctly (no corruption) | 🔶 Chunk reassembly logic looks correct; not unit-tested |
| UI handles rejection and timeout gracefully | ✅ Timeout at 10 s (accept) and 15 s (connect) |

### KPI Candidates (❓ None defined in the project — these are recommendations)

| Metric | Formula | Grain | Misleading Interpretation Risk |
|---|---|---|---|
| Transfer success rate | Successful `file-ack` received / `file-done` sent | Per transfer session | A dropped connection after `file-ack` could be double-counted |
| Transfer speed (MB/s) | Bytes sent / elapsed seconds | Per file | Measures sender-side throughput, not receiver-side; network congestion not captured |
| Connection establishment time | Timestamp(`dataConn open`) − Timestamp(`connReq sent`) | Per session | Includes ICE negotiation time which depends on STUN server, not your code |
| Chunk loss rate | (totalChunks − received chunks) / totalChunks | Per file | The current code does not detect or retry missing chunks; this metric would expose a data quality gap |

> **⚠️ For a nontechnical stakeholder, explain it like this:** "Imagine AirDrop, but it works in any browser and the file never uploads to any server — it goes directly from your screen to theirs, like handing someone a USB drive over the internet."

---

## 4. END-TO-END ARCHITECTURE

### Whiteboard Diagram (text form)

```
[Browser A (Sender)]                         [Browser B (Receiver)]
        │                                            │
        │  1. WebSocket: pid, peerList              │
        │◄──────────────────────────────────────────►│
        │         [Bun WS Signaling Server]          │
        │                   │                        │
        │  2. WS: connReq   │   3. WS: connAccept   │
        │──────────────────►│──────────────────────►│
        │                   │                        │
        │  4. PeerJS ICE/SDP negotiation (via PeerJS Cloud)
        │◄──────────────────────────────────────────►│
        │                                            │
        │  5. WebRTC DataChannel (direct, DTLS-encrypted)
        │  [file-meta][file-chunk x N][file-done]   │
        │──────────────────────────────────────────►│
        │                   ◄── [file-ack] ──────── │
        │                                            │
        │                            [Blob download triggered]
```

### Component Responsibilities

| Component | Technology | Responsibility |
|---|---|---|
| Signaling server | Bun WebSocket, TypeScript | Track online peers; relay `connReq`, `connAccept`, `connReject`; broadcast `peerList` |
| Frontend SPA | React 19, Bun, TailwindCSS v4 | Peer discovery UI, connection flow, file selection, chunked sending, reassembly |
| `useSignaling` hook | React/WebSocket | Manages WS lifecycle, reconnect with exponential backoff (1s → 30s cap), peer list state |
| `usePeerConnection` hook | PeerJS | Creates Peer object, manages DataConnection, integrates signaling handshake |
| `useFileTransfer` hook | Native WebRTC DataChannel | Sends/receives chunked binary protocol, tracks progress, triggers download |
| `@fullsend/shared` package | TypeScript workspace | Shared Zod schemas and message builder functions for both server and client |
| PeerJS Cloud | Third-party | ICE/SDP relay for WebRTC handshake only (not file data) |

### Technology Selection Rationale

| Technology | Why Chosen | Alternative | Trade-off |
|---|---|---|---|
| **Bun** | Native WS server, no Node.js boilerplate, fast startup | Node.js + `ws` | Bun is newer with smaller ecosystem; Node.js is more production-proven |
| **PeerJS** | Abstracts raw WebRTC RTCPeerConnection and ICE handling | Raw WebRTC API | PeerJS hides complexity but adds a third-party cloud dependency for ICE negotiation |
| **WebSocket for signaling** | Simple, bidirectional, built into browsers and Bun | WebRTC itself (data channel for signaling) | Would create a bootstrapping problem; WS is the right tool for signaling |
| **Zod** | Runtime type validation for protocol messages | Manual type guards | Zod adds ~14 KB but guarantees message shape at runtime, preventing silent corruption |
| **React 19** | Component reactivity for connection state machine | Vanilla JS | React adds build complexity but makes state transitions explicit |

### State Boundaries and Source of Truth

| State | Location | Notes |
|---|---|---|
| Online peer list | Signaling server in-memory `Map<ServerWebSocket, string>` | Lost on server restart |
| Nickname | localStorage + server `nicknames` Map | localStorage is client source of truth on reconnect |
| Connection status | React state in `usePeerConnection` | `"idle" \| "connecting" \| "connected" \| "rejected"` |
| In-flight chunks | `receiveStateRef` in `useFileTransfer` (React ref, not state) | Avoids re-renders on every chunk; correct choice |
| Sent file tracker | `sentFilesRef` + React state `myTracker/remoteTracker` | Ref for lookups, state for UI display |

### Batch vs. Real-Time
- **Signaling**: Real-time WebSocket push
- **File transfer**: Pseudo-streaming — sequential chunks with a 5 ms delay between each to prevent DataChannel backpressure
- **Peer list**: Broadcast on every connect/disconnect event (real-time push)

### Failure Modes

| Component Failure | What Happens |
|---|---|
| Signaling server drops | `useSignaling` triggers exponential backoff reconnect; peer list cleared on disconnect |
| ICE negotiation fails | `connectTimerRef` fires after 15 s; status → `"rejected"` with `connect_timeout` error |
| Accept timeout | `acceptTimerRef` fires after 10 s; status → `"rejected"` with `accept_timeout` error |
| DataChannel closes mid-transfer | `connectionLost` state triggers in `TransferPage`; user prompted to return to lobby |
| File > 2 GB | Validation in `TransferPage.handleFiles` blocks it with an alert before queuing |

### Architecture Narration Script (for whiteboard)
> "I'll draw this left to right. On the left is Browser A, the sender. On the right is Browser B, the receiver. In the middle at the top is my signaling server — a Bun WebSocket server in about 90 lines. When both browsers open the app, they each connect to the signaling server and register their peer ID and nickname. The server broadcasts the updated peer list to everyone.
>
> Step two: A wants to connect to B. A sends a `connReq` message through the WebSocket server. The server's `forward()` function routes it to B's socket. B accepts; a `connAccept` travels back through the server to A.
>
> Now step three: A calls PeerJS's `connect()`. This triggers WebRTC's ICE negotiation — PeerJS's own cloud handles the SDP exchange here. Once ICE completes, a direct DataChannel opens between A and B, shown at the bottom. The signaling server is now out of the picture.
>
> Step four: the file transfer. A slices the file into 64 KB chunks. Each chunk travels directly to B through the DataChannel. The server sees none of this. B collects chunks, reassembles the Blob, and triggers a download. B sends an `ack` back to A."

---

## 5. DATA MODEL AND STORAGE

FullSend is a **stateless, in-memory system** with no database. Understanding this is important — an interviewer may probe it.

### Server-Side In-Memory State

```typescript
// server.ts
const currentPeers = new Map<ServerWebSocket, string>();
// Key: WebSocket connection object
// Value: peer ID (UUID assigned by PeerJS)

const nicknames = new Map<string, string>();
// Key: peer ID
// Value: human-readable nickname
```

**Grain**: One row per active WebSocket connection
**Primary "key"**: The `ServerWebSocket` object itself
**Lifetime**: Evicted on WebSocket `close` event

### Protocol Message Schemas (from `protocol.ts`)

#### Signaling Layer (WS — server-relayed)

| Message Type | Fields | Direction |
|---|---|---|
| `pid` | `id: string`, `nickname: string` | Client → Server |
| `nicknameUpdate` | `id: string`, `nickname: string` | Client → Server |
| `connReq` | `sender: string`, `receiver: string`, `senderNickname?: string` | Client → Server → Client |
| `connAccept` | `sender: string`, `receiver: string`, `senderNickname?: string` | Client → Server → Client |
| `connReject` | `sender: string`, `receiver: string`, `senderNickname?: string` | Client → Server → Client |
| `peerList` | `peers: Array<{id: string, nickname: string}>` | Server → All Clients |

#### Transfer Layer (WebRTC DataChannel — direct, never touches server)

| Message Type | Fields | Notes |
|---|---|---|
| `file-meta` | `id: UUID`, `name: string`, `size: number`, `mimeType: string`, `totalChunks: number` | Sent once per file, before chunks |
| `file-chunk` | `id: UUID`, `index: number`, `total: number`, `data: ArrayBuffer` | Sent N times; chunk size = 64 KB |
| `file-done` | `id: UUID` | Sent after all chunks |
| `file-ack` | `id: UUID` | Receiver → Sender, confirms reassembly |

**Chunk size**: `CHUNK_SIZE = 65536` bytes (64 KB), defined in `shared/src/constants.ts`

### Timestamp / ID Handling
- **File ID**: `crypto.randomUUID()` — browser's native UUID v4, called per file in `useFileTransfer.sendFiles`
- **Peer ID**: Assigned by PeerJS library asynchronously on `Peer.on('open')` — UUID format
- **No timestamps** stored anywhere in the current implementation

### Null / Duplicate Handling
- Duplicate peer registration: `const isNew = !Array.from(currentPeers.values()).includes(msg.id)` — if a peer reconnects with the same ID, it won't trigger a duplicate broadcast
- Missing chunk: ⚠️ **Gap** — if a chunk is lost, the `for` loop reassembles only received chunks. Missing chunk = corrupted file. No retry or detection mechanism.
- Duplicate chunks: The `Map<number, ArrayBuffer>` keyed by chunk index is idempotent — a duplicate chunk with the same index simply overwrites.

### Likely Schema-Design Questions

1. *"Why not store transfer history in a database?"* — Stateless design is intentional; privacy means nothing persists.
2. *"What happens if the server restarts while a transfer is in progress?"* — The DataChannel is independent of the signaling server; a mid-transfer server restart would not affect an ongoing DataChannel, but the peer list on the signaling server would be lost.
3. *"How do you prevent two peers from registering the same ID?"* — PeerJS generates UUIDs; collision probability is negligible. The server's `isNew` check prevents duplicate broadcasts but doesn't enforce uniqueness of IDs.

---

## 6. SQL AND DATA TRANSFORMATION

> ⚠️ **Important framing note for the interview**: FullSend contains no database, no SQL, and no data pipeline. An Amazon Data Analyst interviewer will likely ask you to pivot: *"How would you instrument and analyze this system if it were in production?"* Prepare to propose a schema and write SQL against it.

### Proposed Instrumentation Schema (label as: ❓ Not implemented — proposed for analytical discussion)

```sql
-- Illustrative schema for a hypothetical FullSend analytics layer

CREATE TABLE transfer_events (
    event_id        UUID        PRIMARY KEY,
    session_id      UUID        NOT NULL,           -- Groups all events for one file transfer
    file_id         UUID        NOT NULL,
    event_type      VARCHAR(20) NOT NULL,           -- 'transfer_started', 'chunk_sent', 'transfer_complete', 'transfer_failed'
    peer_id_sender  VARCHAR(64) NOT NULL,
    peer_id_receiver VARCHAR(64) NOT NULL,
    file_size_bytes BIGINT,
    total_chunks    INT,
    chunks_sent     INT,
    bytes_sent      BIGINT,
    duration_ms     INT,                            -- Total time from meta to ack
    speed_mbps      NUMERIC(10,2),
    error_code      VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE signaling_events (
    event_id    UUID        PRIMARY KEY,
    peer_id     VARCHAR(64) NOT NULL,
    event_type  VARCHAR(20) NOT NULL,               -- 'connect', 'disconnect', 'connReq', 'connAccept', 'connReject'
    target_peer VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### SQL Question Bank (using illustrative schema)

#### Q1: What is the average transfer speed (MB/s) per day over the last 30 days?
```sql
SELECT
    DATE_TRUNC('day', created_at) AS transfer_date,
    ROUND(AVG(speed_mbps), 2)     AS avg_speed_mbps,
    COUNT(*)                       AS total_transfers
FROM transfer_events
WHERE event_type = 'transfer_complete'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;
```
*Edge case*: Days with zero transfers won't appear — use a date spine for continuity.
*Performance*: Index on `(event_type, created_at)`.

---

#### Q2: What percentage of connection requests result in a successful file transfer?
```sql
WITH requests AS (
    SELECT COUNT(*) AS total_reqs
    FROM signaling_events
    WHERE event_type = 'connReq'
),
successes AS (
    SELECT COUNT(*) AS total_success
    FROM transfer_events
    WHERE event_type = 'transfer_complete'
)
SELECT
    s.total_success,
    r.total_reqs,
    ROUND(s.total_success * 100.0 / NULLIF(r.total_reqs, 0), 2) AS conversion_pct
FROM requests r, successes s;
```
*Edge case*: `NULLIF(r.total_reqs, 0)` prevents division by zero. One request can lead to multiple file transfers — this query doesn't handle that 1:N relationship correctly; need a session ID join.
*Incorrect result risk*: If a user sends multiple files in one session, `transfer_complete` count > `connReq` count, making conversion_pct > 100%.

---

#### Q3: Find the top 5 days with the highest connection rejection rate.
```sql
SELECT
    DATE_TRUNC('day', created_at) AS day,
    COUNT(*) FILTER (WHERE event_type = 'connReject') AS rejections,
    COUNT(*) FILTER (WHERE event_type IN ('connReq')) AS requests,
    ROUND(
        COUNT(*) FILTER (WHERE event_type = 'connReject') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE event_type = 'connReq'), 0),
        2
    ) AS rejection_rate_pct
FROM signaling_events
WHERE event_type IN ('connReq', 'connReject')
  AND created_at >= NOW() - INTERVAL '90 days'
GROUP BY 1
HAVING COUNT(*) FILTER (WHERE event_type = 'connReq') > 10  -- exclude low-volume days
ORDER BY rejection_rate_pct DESC
LIMIT 5;
```
*Edge case*: `HAVING` clause filters days with very few requests to avoid misleading 100% rejection rates from 1-request days.

---

#### Q4: Detect potentially incomplete transfers (file-done sent but no file-ack received within 60 seconds).
```sql
SELECT
    te_done.file_id,
    te_done.peer_id_sender,
    te_done.peer_id_receiver,
    te_done.created_at AS done_at,
    te_ack.created_at  AS ack_at,
    EXTRACT(EPOCH FROM (te_ack.created_at - te_done.created_at)) AS ack_delay_secs
FROM transfer_events te_done
LEFT JOIN transfer_events te_ack
    ON te_done.file_id = te_ack.file_id
    AND te_ack.event_type = 'transfer_complete'
WHERE te_done.event_type = 'transfer_failed'
   OR (te_done.event_type = 'transfer_complete' AND te_ack.file_id IS NULL)
ORDER BY te_done.created_at DESC;
```
*Grain*: One row per potentially incomplete transfer.
*Incorrect result risk*: Late-arriving ack events could cause false positives; add a time threshold.

---

#### Q5: Window function — rank peers by total bytes received (all-time leaderboard).
```sql
SELECT
    peer_id_receiver,
    SUM(file_size_bytes)                                        AS total_bytes_received,
    RANK() OVER (ORDER BY SUM(file_size_bytes) DESC)           AS recv_rank,
    COUNT(*)                                                    AS files_received,
    ROUND(AVG(speed_mbps), 2)                                  AS avg_speed_mbps
FROM transfer_events
WHERE event_type = 'transfer_complete'
GROUP BY peer_id_receiver
ORDER BY total_bytes_received DESC
LIMIT 20;
```

---

#### Q6: Cohort analysis — do users who transfer successfully in their first session return?
```sql
WITH first_session AS (
    SELECT
        peer_id_sender,
        MIN(DATE_TRUNC('day', created_at)) AS first_day,
        BOOL_OR(event_type = 'transfer_complete') AS first_session_success
    FROM transfer_events
    GROUP BY peer_id_sender
),
returning AS (
    SELECT DISTINCT peer_id_sender
    FROM transfer_events
    WHERE event_type = 'transfer_complete'
    GROUP BY peer_id_sender
    HAVING COUNT(DISTINCT DATE_TRUNC('day', created_at)) > 1
)
SELECT
    fs.first_session_success,
    COUNT(*) AS peers,
    COUNT(r.peer_id_sender) AS returning_peers,
    ROUND(COUNT(r.peer_id_sender) * 100.0 / NULLIF(COUNT(*), 0), 2) AS return_rate_pct
FROM first_session fs
LEFT JOIN returning r USING (peer_id_sender)
GROUP BY 1;
```
*Edge case*: Session deduplication must be robust; a user reconnecting the same day counts as one day.

---

## 7. CORE TECHNICAL DEEP DIVES

### Concept 1: WebSocket Signaling Server

**Simple definition**: A WebSocket server is a persistent, bidirectional TCP connection between a browser and a server that allows either side to push messages at any time, unlike HTTP which requires the client to request first.

**How FullSend uses it**: The Bun server in `server.ts` is a pure signaling layer. It never processes file data. It has exactly two responsibilities: (a) maintain the live peer registry, (b) route three types of connection control messages between specific peers using the `forward()` function.

**Key code**:
```typescript
// Forward a control message to a specific target peer
function forward(targetId: string, message: string, senderId: string) {
  const parsed = JSON.parse(message);
  parsed.senderNickname = nicknames.get(senderId) ?? senderId;
  const enriched = JSON.stringify(parsed);
  for (const [peerWs, id] of currentPeers) {
    if (id === targetId) {
      peerWs.send(enriched);
      break; // O(n) scan, exits on first match
    }
  }
}
```

**Why not store the WS connection in a regular Map<string, WebSocket>?**: The server uses `Map<ServerWebSocket, string>` with the WS object as the key, not peer ID. This is because: (a) WebSocket objects have unique identity and are naturally evicted when the connection closes; (b) it makes the `close` handler simple — `currentPeers.delete(ws)` without needing to know the peer ID first.

**Alternatives**: Socket.IO (higher abstraction, rooms, namespaces, reconnection built-in); Server-Sent Events (unidirectional, cannot push from client).

**Edge cases**:
- A peer reconnects with the same ID → `isNew` check prevents duplicate broadcast
- Server crashes → all in-memory state lost; clients must re-register (handled by `useSignaling` reconnect loop)
- Linear scan in `forward()` is O(n) in connected peers; fine for small peer counts, bottleneck at scale

**Interviewer questions**:
- *"Why doesn't the server validate that the sender is who they claim to be?"* → No authentication; anyone who knows a peer ID can send a `connReq` to them. For a production system, you would use signed tokens.
- *"What happens if the server is the bottleneck?"* → Horizontal scaling requires moving peer state out of process memory to Redis or a DB.

---

### Concept 2: WebRTC DataChannel and PeerJS

**Simple definition**: WebRTC (Web Real-Time Communication) is a browser API that enables direct peer-to-peer audio, video, and data transfer. A DataChannel is the data-transfer portion — binary or text messages sent directly between browsers over DTLS-encrypted SCTP.

**How FullSend uses it**: PeerJS (`peerjs@^1.5.5`) wraps the raw `RTCPeerConnection` and DataChannel APIs. When `peerRef.current?.connect(remotePeerId)` is called in `usePeerConnection.ts`, PeerJS initiates ICE candidate gathering, exchanges SDP offers/answers with the remote peer (through PeerJS's own cloud signaling), and opens a DataChannel when ICE succeeds.

**Two-layer signaling distinction** (critical to understand):
- Layer 1 (your code): Custom WebSocket signaling server → human-readable peer list, accept/reject handshake
- Layer 2 (PeerJS): PeerJS cloud → ICE/SDP exchange for WebRTC handshake

**DTLS/SRTP**: WebRTC mandates DTLS encryption for DataChannels. This is not code you wrote — it's the browser's WebRTC implementation. Be explicit about this when claiming "end-to-end encrypted."

**ICE and NAT traversal**: ICE (Interactive Connectivity Establishment) tries to find a direct path between peers. If both are behind symmetric NAT (e.g., corporate firewalls), direct connection may fail without a TURN server. PeerJS's free tier includes STUN but **not TURN**. ❓ This means FullSend may fail in certain network environments — be ready to discuss this.

**Alternatives to PeerJS**: Raw WebRTC API (more control, more boilerplate); Simple-Peer library; mediasoup (for media streaming at scale).

---

### Concept 3: Chunked Binary File Transfer Protocol

**Simple definition**: A file cannot be sent as a single message through a WebRTC DataChannel because (a) there are browser buffer limits (~16 MB typical), (b) sending a very large message blocks the DataChannel, and (c) there is no built-in progress reporting.

**How FullSend uses it**:

```typescript
// From useFileTransfer.ts — the send loop
const totalChunks = Math.ceil(file.size / CHUNK_SIZE);  // CHUNK_SIZE = 65536 bytes

dataConn.send(transferMsg.meta(fileId, file.name, file.size, file.type, totalChunks));

for (let i = 0; i < totalChunks; i++) {
  const start = i * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);
  const chunkBuffer = await file.slice(start, end).arrayBuffer();

  dataConn.send(transferMsg.chunk(fileId, i, totalChunks, chunkBuffer));

  bytesSent += chunkBuffer.byteLength;
  // Live speed calculation: bytes / elapsed_seconds / 1MB
  setProgress({ current: bytesSent, total: totalBytes, filename: file.name, speed });
  await new Promise((r) => setTimeout(r, 5));  // Backpressure relief
}

dataConn.send(transferMsg.done(fileId));
```

**The 5 ms pause**: The `await new Promise(r => setTimeout(r, 5))` is a deliberate rate limiter. Without it, sending thousands of chunks synchronously would overflow the DataChannel's internal buffer and cause an error. This is a practical engineering trade-off — it adds latency (for a 1 GB file at 64 KB/chunk, ~15,000 chunks × 5 ms = ~75 seconds minimum send time regardless of network speed).

**Receiver reassembly**:
```typescript
// Chunks stored in a Map by index — order-independent
state.chunks.set(msg.index, buf);

// Reassembly: iterates in order 0..N-1
for (let i = 0; i < state.totalChunks; i++) {
  const c = state.chunks.get(i);
  if (c) chunks.push(c);  // ⚠️ Missing chunks are silently skipped
}
const blob = new Blob(chunks, { type: state.mimeType });
```

**⚠️ Known gap**: If a chunk is dropped (network error mid-transfer), the Blob is assembled from fewer chunks than expected, producing a corrupted file. There is no chunk checksum, no missing-chunk detection, and no retry mechanism.

**Alternatives**: A proper file transfer protocol (like FTP over DataChannel) with sequence numbers, ACKs per chunk, and retransmission. The QUIC protocol handles this at the transport level, but is not directly accessible in the browser.

---

### Concept 4: Shared TypeScript Workspace with Zod Schema Validation

**Simple definition**: A TypeScript workspace package lets both the frontend and backend share code — in this case, message schema definitions and parser functions — without duplication or version drift.

**How FullSend uses it**: The `@fullsend/shared` package (in `/shared/src/`) defines all message types using Zod schemas. Both the Bun backend and the React frontend import `parseClientMessage`, `parseSignalingMessage`, `parseTransferMessage`, and the `wsMsg`/`transferMsg` builder objects.

**Why this matters**: Without a shared schema, the frontend and backend could define the same message type differently, leading to silent parse failures. Zod validates at runtime:

```typescript
// If a message arrives with a missing field or wrong type, Zod throws
// parseClientMessage returns null — the server logs and ignores the message
export function parseClientMessage(raw: unknown): ClientMessage | null {
  try {
    // ... switch/case with Zod .parse() for each type
  } catch (e) {
    console.error("Failed to parse client message", e);
  }
  return null;
}
```

**Why Zod over TypeScript interfaces alone**: TypeScript types are erased at runtime. A malformed JSON message that looks like a `ConnReqMessage` to TypeScript's compiler will pass type checks but may contain a `null` receiver ID. Zod catches this at runtime.

**Interviewer question**: *"Why use Zod instead of JSON Schema or Protobuf?"* Zod integrates natively with TypeScript's type system — the inferred TypeScript type and the runtime validator are derived from the same declaration, eliminating drift. Protobuf would be more efficient for binary protocols but requires a build step and separate `.proto` files.

---

### Concept 5: React State Machine for Connection Lifecycle

**Simple definition**: The connection process is a state machine with well-defined states: `idle → connecting → connected | rejected`.

**How FullSend uses it** (`usePeerConnection.ts`):

```
idle
 │
 ├── handleConnect(remotePeerId) ──► connecting
 │                                      │
 │                      connAccept ◄────┤───► connected
 │                      connReject ────►│
 │                      15s timeout ───►│──► rejected (connect_timeout)
 │
 ├── pendingRequest arrives ──► acceptRequest() ──► connected
 │                                                     │
 │                                    10s timeout ────►│──► rejected (accept_timeout)
 │
 └── rejectRequest() ──► idle
```

**Why refs for timers, not state**: `acceptTimerRef` and `connectTimerRef` are `useRef`, not `useState`. React state updates are batched and asynchronous; a timeout callback accessing stale state would read the wrong connection status. Refs give stable mutable references accessible in closures.

**Exponential backoff in `useSignaling`**:
```typescript
let retryDelay = 1000;
ws.onclose = () => {
  retryRef.current = setTimeout(() => {
    connectWs();
    retryDelay = Math.min(retryDelay * 2, 30000); // Max 30s
  }, retryDelay);
};
```
This prevents thundering-herd reconnections if the server restarts and many clients reconnect simultaneously.

---

## 8. DATA QUALITY AND VALIDATION

### In-Flight Data Quality

| Problem | Detection | Handling | Gap |
|---|---|---|---|
| Malformed signaling message | Zod parse in `parseClientMessage`/`parseSignalingMessage` | Returns `null`; logged to console; message dropped | No alert to sending client |
| Missing chunk | ❌ None | Silent — `chunks.get(i)` returns undefined; chunk skipped | **Critical gap** |
| Duplicate chunk | ✅ Map<index, buffer> overwrites silently | Idempotent | Acceptable |
| File too large (>2 GB) | ✅ Check in `handleFiles` | Alert + reject | Only enforced UI-side |
| Wrong peer ID in connReq | ❌ None | `forward()` iterates all peers; finds no match; message dropped silently | No error sent back to sender |
| DataChannel closes mid-transfer | ✅ `dataConn.on('close')` → `setDataConn(null)` | `connectionLost` state shown in UI | No partial-file cleanup |

### Validation Checklist

```sql
-- (Illustrative, against hypothetical analytics schema)

-- Check 1: Are all file-done events preceded by a file-meta?
SELECT te_done.file_id
FROM transfer_events te_done
LEFT JOIN transfer_events te_meta
    ON te_done.file_id = te_meta.file_id AND te_meta.event_type = 'transfer_started'
WHERE te_done.event_type = 'transfer_failed'
  AND te_meta.file_id IS NULL;

-- Check 2: Orphan chunks (chunk_sent with no corresponding file_id in transfer_started)
SELECT DISTINCT file_id FROM transfer_events
WHERE event_type = 'chunk_sent'
  AND file_id NOT IN (SELECT file_id FROM transfer_events WHERE event_type = 'transfer_started');

-- Check 3: Speed outliers (>1000 MB/s is physically impossible on consumer hardware)
SELECT * FROM transfer_events
WHERE speed_mbps > 1000 AND event_type = 'transfer_complete';
```

### How to Know the Transfer Ran Correctly
1. **Sender side**: `file-ack` received → `sentFilesRef` entry cleaned up → `remoteTracker.receivedNames` updated
2. **Receiver side**: `Blob` created from all chunks → `URL.createObjectURL` → browser download triggered → `file-ack` sent
3. **What you cannot verify**: File integrity — no checksum (MD5/SHA256) is computed or compared. A missing chunk produces a corrupted file that is still downloaded.

### ⚠️ Biggest Data Quality Gaps to Disclose
1. No chunk integrity verification (no checksum)
2. No retry mechanism for dropped chunks
3. No duplicate-transfer detection (sending the same file twice produces two downloads)
4. Speed calculation is based on sender elapsed time, not actual receiver throughput

---

## 9. PERFORMANCE, SCALE, AND RELIABILITY

### Current Constraints (estimated from code)

| Constraint | Value | Source |
|---|---|---|
| Max file size (enforced) | 2 GB | `TransferPage.tsx` line 58 |
| Chunk size | 64 KB | `shared/src/constants.ts` |
| Transfer rate limiter | 5 ms/chunk | `useFileTransfer.ts` line 136 |
| Effective max throughput ceiling | ~12.8 MB/s (64 KB / 5 ms) | Calculated |
| Server state | In-memory only | `server.ts` |
| WS reconnect max | 30 seconds | `useSignaling.ts` line 59 |
| Connection request timeout | 15 s | `usePeerConnection.ts` line 101 |
| Accept timeout | 10 s | `usePeerConnection.ts` line 115 |

> ⚠️ The 5 ms artificial delay imposes a **~12.8 MB/s ceiling** regardless of network bandwidth. A 1 GB file would take at minimum ~78 seconds of sender-side CPU time, even on a gigabit LAN. This is a deliberate safety measure against DataChannel buffer overflow, but it's a significant bottleneck. Be ready to discuss alternatives (e.g., backpressure using `bufferedAmount`, send-and-wait per chunk).

### At 10× Scale
| Aspect | Current | At 10× (100 concurrent peers) |
|---|---|---|
| Signaling server memory | Negligible | Still negligible — O(n) Maps |
| `broadcast()` cost | O(n) send per event | O(n²) in worst case if every event triggers broadcast |
| PeerJS cloud dependency | Low load | May hit PeerJS free-tier rate limits |

### At 100× Scale (1000 concurrent peers)
| Aspect | Problem | Fix |
|---|---|---|
| Signaling server | Single-process, no horizontal scaling | Move peer state to Redis; run multiple WS server instances behind a load balancer |
| `forward()` | O(n) linear scan | Use `Map<string, ServerWebSocket>` keyed by peer ID |
| `broadcast()` | Sends to every peer on every connect/disconnect | Consider delta updates or topic subscriptions |
| PeerJS cloud | TURN server capacity | Self-host TURN (coturn) |

### Idempotency
- Re-registering the same peer ID: handled (isNew check)
- Resending the same file: not idempotent — receiver gets two downloads
- Server restart: clients auto-reconnect and re-register

### Monitoring (❓ Not implemented — recommendations)
- WebSocket connection count gauge
- Transfer success/failure counter
- Transfer speed histogram
- Peer registration/deregistration rate
- `broadcast()` latency

---

## 10. SECURITY, PRIVACY, AND GOVERNANCE

### Controls Actually Implemented

| Control | Status | Notes |
|---|---|---|
| DTLS encryption on DataChannel | ✅ By WebRTC spec | Browser-enforced, not your code |
| File bytes not stored server-side | ✅ Confirmed from code | Signaling server only handles control messages |
| Input validation (Zod) | ✅ On all message types | Malformed messages dropped |
| File size limit | ✅ 2 GB check in UI | Enforced client-side only |
| Explicit peer acceptance | ✅ `connReq`/`connAccept` handshake | Receiver must confirm before DataChannel opens |

### Controls NOT Implemented (important to disclose)

| Control | Gap | Production Fix |
|---|---|---|
| Authentication | Any browser can connect and appear as any nickname | JWT tokens, OAuth |
| Authorization | Anyone who guesses a peer ID can send a `connReq` | Rate limiting on signaling server |
| Peer ID is opaque UUID | PeerJS assigns it; it's not user-controlled | Acceptable; not sensitive |
| No TURN server | Transfer may fail across symmetric NAT | Self-host coturn |
| No rate limiting | A malicious client could spam `connReq` to all peers | IP-based rate limiting on WS server |
| No audit log | No record of who connected to whom | Logging middleware on signaling server |
| File content scanning | No malware scanning | Acceptable for direct P2P; receiver trusts sender |
| No HTTPS enforcement | `useSignaling.ts` falls back to `ws:` on non-HTTPS | Serve frontend over HTTPS; WSS required |

### Privacy Assessment
- File bytes: never leave the two browsers (✅)
- Nicknames and peer IDs: stored in server memory during session, cleared on disconnect (✅)
- Nicknames stored in localStorage: persists across browser sessions (⚠️ minor — no sensitive data)

---

## 11. TRADE-OFFS AND ALTERNATIVES

| Decision Made | Reason | Alternative | Advantage of Alternative | Disadvantage of Alternative | When to Change |
|---|---|---|---|---|---|
| Custom WebSocket signaling server instead of using PeerJS's built-in signaling | Human-readable peer discovery (peer list, nicknames), accept/reject UX | Use only PeerJS (no custom server) | Zero server to maintain | No peer list; must share peer ID out-of-band (e.g., copy-paste) | When peer list UX is not required |
| 5 ms sleep between chunks | Prevents DataChannel buffer overflow | `bufferedAmount` backpressure check (poll `dataConn.dataChannel.bufferedAmount`) | True adaptive rate control; higher throughput on fast networks | More complex implementation | For production use or large-file performance |
| PeerJS instead of raw WebRTC | Reduces WebRTC boilerplate by ~200 lines | Raw `RTCPeerConnection` + DataChannel API | Full control over ICE, SDP, retry; no third-party cloud dependency | Significantly more code; ICE negotiation complexity | If PeerJS's cloud becomes unreliable or rate-limited |
| In-memory peer state (no DB) | Simplicity; privacy — no persistent record | Redis-backed peer store | Survives server restarts; enables horizontal scaling | Adds infrastructure dependency | When scaling beyond single-server |
| No chunk checksum | Simplicity; DataChannel is loss-avoiding (SCTP reliable) | SHA-256 per chunk | Detects corruption; enables retry | Computational overhead; implementation complexity | For production file integrity guarantees |
| Bun instead of Node.js | Native WS, fast startup, TypeScript-first | Node.js + `ws` or `uWebSockets.js` | Larger ecosystem; more production deployments | More boilerplate; slower cold start | If Bun stability or ecosystem gaps become blockers |

---

## 12. FAILURE AND EDGE-CASE WALKTHROUGHS

### Scenario 1: Peer Disconnects Mid-Handshake
- **Setup**: A sends `connReq`, B opens dialog, B's browser crashes before accepting
- **Detection**: `connectTimerRef` fires after 15 s on A's side
- **Behavior**: `connectionStatus → "rejected"`, `connectionError → "connect_timeout"`, error banner shown in `LobbyPage`
- **Prevention**: ✅ Implemented

### Scenario 2: Peer Disconnects Mid-Transfer
- **Setup**: DataChannel is open, 60% of chunks sent, receiver's network drops
- **Detection**: `dataConn.on('close')` fires → `setDataConn(null)`
- **Behavior**: `TransferPage` shows "Connection lost" banner; sender's send loop may throw or stall
- **Gap**: The sender's `sendFiles` `for` loop continues running after DataChannel close (no cancellation signal); `dataConn.send()` calls on a closed connection may throw uncaught errors
- **Prevention**: Need an abort controller or `isCancelled` flag in `sendFiles`

### Scenario 3: Server Restart During Active Sessions
- **DataChannel sessions**: ✅ Unaffected — DataChannel is independent of the signaling server
- **Pending handshakes**: ❌ `connAccept`/`connReject` that hasn't been delivered is lost; connection attempt hangs until 15 s timeout
- **Peer list**: ✅ Clients reconnect via exponential backoff and re-register

### Scenario 4: Duplicate File Queued Twice
- **Setup**: User drops the same file twice into the drop zone
- **Behavior**: `queuedFiles` array has two entries; both are sent; receiver downloads the file twice
- **Detection**: None — no deduplication check on file name or content
- **Prevention**: Could hash file content or check filename+size before queuing

### Scenario 5: Malformed Signaling Message
- **Setup**: A bug in a client sends `{ type: "connReq", sender: null }` (null sender)
- **Detection**: Zod `ConnReqMessageSchema.parse(data)` throws because `sender` must be `z.string()`
- **Behavior**: `parseClientMessage` catches exception, logs to console, returns `null`; server message handler returns early
- **Gap**: No error response is sent back to the client; the sender sees nothing

### Scenario 6: File Exceeds 2 GB
- **Detection**: `handleFiles` in `TransferPage.tsx` checks `f.size > 2 * 1024 * 1024 * 1024`
- **Behavior**: `alert()` shown; file excluded from queue
- **Gap**: This is a UI-side check only; if someone bypasses the UI and calls `sendFiles` directly (e.g., via browser console), the check is bypassed

### Scenario 7: Same Peer ID Registered Twice (Reconnect)
- **Setup**: Client reconnects after a network blip with the same PeerJS peer ID
- **Detection**: `const isNew = !Array.from(currentPeers.values()).includes(msg.id)` — O(n) scan
- **Behavior**: If ID already exists, `broadcast()` is not called again; `currentPeers` Map gets a new WS key for the same ID (the old WS is already gone due to `close` event having cleaned it up first)
- **Gap**: If `close` fires after the new `open`, the `close` handler deletes the new WS entry, causing the peer to disappear from the list

---

## 13. RESULTS, IMPACT, AND LIMITATIONS

### What the Project Demonstrably Achieves (✅ Confirmed from code)
1. Files transfer directly between two browsers with no server storage
2. A working peer-to-peer connection handshake with accept/reject UX
3. Real-time transfer progress bar with MB/s calculation
4. WebSocket reconnection with exponential backoff
5. A shared, Zod-validated protocol package used by both backend and frontend
6. A 2 GB file size guard

### What Cannot Legitimately Be Claimed
- Exact transfer speed (❓ not measured)
- Number of users or transfers (❓ not deployed or tracked)
- "End-to-end encryption" as your own implementation (DTLS is the browser's)
- Reliability across all network configurations (TURN server not provided)

### Known Limitations
1. No chunk integrity check — corrupt files are silently delivered
2. 5 ms artificial throttle limits throughput to ~12.8 MB/s ceiling
3. No TURN server — fails across symmetric NAT
4. Signaling server state is not persistent — all peers must re-register on restart
5. No authentication or rate limiting on the signaling server
6. No support for simultaneous multi-peer transfers (one active connection at a time)

### Next Steps for Greatest Business Value
1. Add SHA-256 chunk verification and retry protocol
2. Replace 5 ms sleep with `bufferedAmount` backpressure for adaptive throughput
3. Self-host STUN/TURN for reliable NAT traversal
4. Add transfer history to sessionStorage for the current session
5. Add unit tests for the chunking/reassembly logic

---

## 14. AMAZON LEADERSHIP PRINCIPLES

### Applicable Principles (genuine, from code evidence)

| Principle | Evidence | My Action | Difficulty | Measurable Result |
|---|---|---|---|---|
| **Invent and Simplify** | Custom signaling server in 89 lines; shared protocol package | Chose minimal Bun WebSocket over heavy framework | Resisting the urge to add unnecessary infrastructure | A fully functional P2P system with a signaling server under 100 lines |
| **Dive Deep** | Designed a binary chunked transfer protocol from scratch; handles chunk index, reassembly, ACK | Understood the WebRTC DataChannel buffer constraints | Learning the `bufferedAmount` problem and solving it with rate limiting | Working multi-file transfer with live progress |
| **Ownership** | Solo project: designed architecture, wrote signaling server, frontend, shared protocol | Owned every layer from server to UI | No team to defer to; every design decision was mine | ❓ Quantify if deployed/tested |
| **Bias for Action** | Chose practical 5 ms throttle instead of a complex backpressure system | Shipped a working solution quickly | Accepting a known throughput limitation as a reasonable trade-off | File transfer works end-to-end |
| **Learn and Be Curious** | Self-built WebRTC DataChannel protocol without a template | Implemented message framing, chunking, reassembly from scratch | WebRTC ICE/DTLS complexity | ❓ Describe what you learned about ICE negotiation |

---

### STAR Story 1 — Success / Ownership

**Situation**: I wanted to understand how peer-to-peer data transfer actually works at the protocol level, not just import a library and call `sendFile()`.

**Task**: Build a file transfer system where I control the signaling, the connection handshake, and the transfer protocol, without relying on a black-box service.

**Action**: I designed a two-layer architecture: a custom WebSocket signaling server for peer discovery and connection setup, and a WebRTC DataChannel layer for the actual file transfer. I wrote a shared TypeScript package with Zod-validated message schemas so the server and client could never drift out of sync. I then implemented a binary chunked transfer protocol with metadata, chunk indexing, completion signaling, and ACK.

**Result**: A working peer-to-peer file transfer system where the file bytes genuinely never touch the server — something I can demonstrate live and explain at every layer of the stack.

❓ *Add: What was the hardest technical problem you solved? (e.g., DataChannel buffer overflow, ICE negotiation failure, stale React state in closures)*

---

### STAR Story 2 — Failure / Learning

**Situation**: When I first implemented the file transfer, I sent all chunks as fast as possible in a synchronous loop.

**Task**: The DataChannel was silently dropping messages or throwing errors when I sent large files.

**Action**: I discovered that WebRTC DataChannels have a limited internal send buffer (`bufferedAmount`). Sending thousands of 64 KB chunks without any pacing overwhelmed the buffer. I researched the `bufferedAmount` property and the proper backpressure pattern, but chose a simpler 5 ms delay between chunks as an expedient fix.

**Result**: File transfers work reliably, but I now know this creates a hard throughput ceiling of ~12.8 MB/s. If I were building this for production, I would implement proper `bufferedAmountLowThreshold` backpressure. This taught me that in distributed systems, you have to think about buffer management at every layer.

❓ *Verify: Was this actually the problem you hit? Adjust with your real experience.*

---

## 15. INTERVIEW QUESTION BANK

### Level 1: Project Overview
1. What does FullSend do in one sentence?
2. Walk me through what happens when I open the app.
3. What problem does this solve that existing tools don't?
4. Who would use this?
5. Is this deployed? Can I try it?

### Level 2: Analytical and SQL Details
6. How would you measure whether FullSend is working correctly in production?
7. What metrics would you track? Define the formula for each.
8. Write a query to find the daily transfer success rate over the last 30 days.
9. How would you detect a degraded user experience from data?
10. A PM asks: "Are users who succeed in their first transfer more likely to return?" How do you answer this from data?

### Level 3: Architecture and Implementation
11. Why is there both a WebSocket server and PeerJS? What does each do?
12. Walk me through exactly what happens when I click "connect" to another peer.
13. Why is the file data never sent through your server? How do you guarantee this?
14. Why did you use Zod instead of just TypeScript interfaces?
15. What is the role of the 5 ms sleep in the send loop?

### Level 4: Trade-offs, Failures, and Scaling
16. What happens if the signaling server goes down while a transfer is in progress?
17. Your current `forward()` function is O(n). What would you do at 10,000 concurrent peers?
18. What happens if one chunk is dropped during transfer?
19. How does your 2 GB file size limit work? Can it be bypassed?
20. If I'm behind a corporate firewall, will FullSend work?

### Level 5: Skeptical Resume-Defense Follow-Ups
21. You said "no server in between" — but I can see you have a server. Explain that.
22. You said "end-to-end encrypted" — did you implement the encryption yourself?
23. What exactly did you personally implement versus what the PeerJS library handles?
24. How do you know the file arrived correctly?
25. What failed during development and what did you learn from it?
26. What would you change if you were building this for 1 million users?
27. Have you measured the actual transfer speed? What did you get?
28. What part of this project are you least confident about?
29. Why Bun over Node.js? What are the risks of that choice?
30. What alternatives did you consider for the architecture?

---

## 16. MOCK INTERVIEW

### Q1: "Tell me about FullSend."
**Testing**: Clarity, ownership, ability to explain technical work simply
**Strong answer outline**: Problem → architecture in two layers → what you personally built → interesting technical decision
**Follow-ups**: "Why not use an existing service?" / "Have you tested it?"
**Avoid**: Reading from memory; listing every technology without explaining why

---

### Q2: "Walk me through the code when a file is sent."
**Testing**: Technical depth; do you actually know your own code?
**Strong answer outline**: handleSend() → sendFiles() → meta message → chunk loop → `file.slice().arrayBuffer()` → DataChannel send → 5 ms pause → done message → ack received
**Follow-ups**: "What happens if the DataChannel is closed halfway through?" / "Why 64 KB?"
**Avoid**: "PeerJS handles it" — PeerJS handles the DataChannel setup, not the transfer protocol

---

### Q3: "You say there's no server in between — but you have a server. Explain."
**Testing**: Precision in technical claims; honesty
**Strong answer outline**: Two distinct data flows — signaling (server-relayed, control messages only) vs. transfer (direct DataChannel, file bytes). The server never receives, stores, or forwards file data. It only routes a 60-byte JSON message to initiate the connection.
**Follow-ups**: "How do you prove the file bytes never hit your server?" / "What if I packet-captured your server?"
**Avoid**: Being defensive; instead, lean into the nuance and explain it clearly

---

### Q4: "What metrics would you define to measure this system in production?"
**Testing**: Analytical thinking; metric design
**Strong answer outline**: Primary KPI = transfer completion rate (file-ack received / file-done sent). Guardrail metrics = connection establishment success rate, median transfer speed, error rate by type. Explain numerator/denominator, grain, time window.
**Follow-ups**: "How would you detect a degraded user experience before users complain?" / "What's a leading indicator vs. a lagging indicator here?"
**Avoid**: Vague answers like "I'd track usage" without defining the formula

---

### Q5: "Write a SQL query to find the top 5 slowest transfers in the last week."
**Testing**: SQL proficiency; ability to apply SQL to your own project
**Strong answer outline**: Use the proposed analytics schema; `SELECT file_id, peer_id_sender, speed_mbps FROM transfer_events WHERE event_type = 'transfer_complete' AND created_at > NOW() - INTERVAL '7 days' ORDER BY speed_mbps ASC LIMIT 5;`
**Follow-ups**: "What if you wanted the slowest by file size percentile?" / "How would you use window functions here?"
**Avoid**: Saying "we don't have a database" without proposing how you would instrument it

---

### Q6: "What happens if a chunk is dropped during transfer?"
**Testing**: Intellectual honesty; knowledge of gaps in your own work
**Strong answer outline**: Be direct — the current implementation has no chunk loss detection. The receiver silently skips the missing chunk, assembles a shorter Blob, and the user downloads a corrupted file. The fix would be a per-chunk checksum and retry protocol.
**Follow-ups**: "Why didn't you implement checksums?" / "Isn't WebRTC supposed to be reliable?"
**Avoid**: "It won't happen because WebRTC is reliable" — SCTP is reliable within a session, but if the DataChannel closes and reopens, state is lost

---

### Q7: "What would you change if this needed to serve 10,000 concurrent users?"
**Testing**: Scalability reasoning; systems thinking
**Strong answer outline**: (1) Replace `Map<string, ServerWebSocket>` with the correct key direction for O(1) lookup. (2) Move peer state to Redis for horizontal scaling. (3) Replace PeerJS cloud with self-hosted STUN/TURN. (4) Add observability (metrics, structured logs). (5) Replace the 5 ms sleep with proper backpressure.
**Follow-ups**: "Which of those changes would have the most impact?" / "How would you handle the TURN server cost?"
**Avoid**: Naming AWS services without explaining why

---

### Q8: "How did you validate that the protocol was correct?"
**Testing**: Testing discipline; data quality mindset
**Strong answer outline**: Be honest about what was tested and what wasn't. Manual end-to-end testing between two browser tabs / two machines. Zod runtime validation catches protocol drift. No automated unit tests for chunking/reassembly logic.
**Follow-ups**: "What unit tests would you write?" / "How would you test across a slow network?"
**Avoid**: Overstating test coverage

---

### Q9: "Amazon's Leadership Principle is Customer Obsession. How does FullSend demonstrate this?"
**Testing**: Behavioral / LP alignment
**Strong answer outline**: The "customer" problem is privacy — users should be able to transfer sensitive files without exposing them to third-party servers. Every design decision (no server storage, explicit accept/reject, no auth required) serves that user need. The 2 GB guard protects the user from a browser crash.
**Follow-ups**: "What customer pain point have you NOT solved yet?" / "If you interviewed 10 users, what would you learn?"
**Avoid**: Generic LP answer not grounded in project specifics

---

### Q10: "What part of this project are you least confident about?"
**Testing**: Self-awareness; intellectual honesty — Amazon values this
**Strong answer outline**: "The NAT traversal story. PeerJS provides a STUN server, but not TURN. If both users are behind symmetric NAT — common in corporate networks — the direct WebRTC connection will fail. I haven't tested this extensively across different network configurations. In production, I'd self-host coturn and instrument connection failure rates to understand how often this is a problem."
**Follow-ups**: "How would you find out if this is actually a problem?" / "What's TURN and why would you need it?"
**Avoid**: Saying "I'm confident about everything"

---

### Q11: "Describe a time you had to make a trade-off. What did you choose and why?"
**Testing**: Dive Deep + Bias for Action
**Strong answer outline**: The 5 ms sleep vs. `bufferedAmount` backpressure trade-off. Explain the problem (buffer overflow), explain both solutions, explain why you chose the simpler one (working system now), and acknowledge the known cost (throughput ceiling).
**Follow-ups**: "Would you make the same decision again?" / "What would need to be true for you to implement the more complex solution?"

---

### Q12: "Walk me through the connection flow if I'm the receiver."
**Testing**: Can you explain the system from another party's perspective?
**Strong answer outline**: You see someone in the peer list click your name → your browser receives `connReq` via WebSocket → `ConnectionDialog` appears → you click Accept → `connAccept` is sent through WS server back to initiator → PeerJS initiates DataChannel → 10s timer starts → DataChannel `open` fires → you're on the transfer page
**Follow-ups**: "What if you don't respond for 30 seconds?" / "Can you receive multiple connection requests simultaneously?"

---

### Q13: "How does the signaling server know which WebSocket belongs to which peer?"
**Testing**: Deep implementation understanding
**Strong answer outline**: `Map<ServerWebSocket, string>` — the WS object is the key, the peer ID is the value. When a `pid` message arrives, `currentPeers.set(ws, msg.id)`. The `forward()` function iterates the map to find the target WS. The `close` handler looks up `currentPeers.get(ws)` to find and clean up the peer ID.
**Follow-ups**: "What's the time complexity of `forward()`?" / "How would you make it O(1)?"

---

### Q14: "You mentioned PeerJS — what exactly does PeerJS do vs. what did you build?"
**Testing**: Attribution accuracy; understanding of dependencies
**Strong answer outline**: 
- PeerJS: Creates `RTCPeerConnection`, manages ICE candidate exchange via PeerJS cloud, opens DataChannel, abstracts `RTCDataChannel.send()`
- You built: Custom WebSocket signaling server for peer discovery and accept/reject UX; the binary transfer protocol (file-meta, file-chunk, file-done, file-ack messages); the shared Zod schema package; the React state machine for connection lifecycle; the chunking/reassembly logic; transfer progress tracking
**Follow-ups**: "Could you replace PeerJS with raw WebRTC? How hard would that be?"

---

### Q15: "If you were a Data Analyst at Amazon, how would you use data from FullSend to decide the next feature to build?"
**Testing**: Analytical reasoning; translating data to decisions — this is the core DA question
**Strong answer outline**: 
1. Instrument connection failure rates by error type (timeout, reject, NAT failure)
2. If `connect_timeout` rate is high → TURN server is the priority
3. If `connReject` rate is high → peer discovery UX needs improvement (maybe people connect to wrong peer)
4. Measure transfer completion rate — if low, investigate chunk loss patterns
5. Measure session return rate — if users don't come back, what happened in their first session?
**Follow-ups**: "How would you prioritize between these data signals?" / "What would statistical significance mean in this context?"

---

## 17. WHITEBOARD CHECKLIST

### 1. Architecture Diagram
Draw: Browser A → [WS Signaling Server] ← Browser B, then the direct DataChannel arrow between A and B below.
**Spoken**: "The server is only in the signaling path. Once the DataChannel is open, the server drops out of the data flow entirely."

### 2. Connection Flow Sequence
Draw: A sends `connReq` → Server → B; B sends `connAccept` → Server → A; A calls PeerJS `connect()`; DataChannel opens.
**Spoken**: "The signaling server routes two control messages, then its job is done. PeerJS handles the ICE handshake, and the DataChannel opens directly."

### 3. State Machine
Draw the states: idle → connecting → connected | rejected (with timeout arcs).
**Spoken**: "There are exactly four states. Two timers prevent indefinite hanging: 15 seconds for connect timeout, 10 seconds for accept timeout."

### 4. Chunked Transfer Protocol
Draw: `file-meta` → `[chunk 0][chunk 1]...[chunk N-1]` → `file-done` → `file-ack`.
**Spoken**: "The sender sends metadata first, then each 64 KB chunk indexed 0 to N-1, then a done signal. The receiver collects chunks in a Map, reassembles in order, creates a Blob, and triggers a download."

### 5. Data Flow Through the Server
Draw what the server sees vs. what travels on the DataChannel.
**Spoken**: "The server's `message` handler only processes five message types — `pid`, `nicknameUpdate`, `connReq`, `connAccept`, `connReject`. None of these are file data. The `forward()` function routes control messages; it cannot see file bytes because they never arrive on the WebSocket connection."

### 6. Metric Calculation
Draw: transfer_complete events / file-done events × 100 = completion rate.
**Spoken**: "To measure reliability, I'd define transfer completion rate as the percentage of initiated transfers that result in a confirmed file-ack from the receiver."

### 7. O(1) Fix for `forward()`
Draw: Old `Map<WS, id>` requiring linear scan → New `Map<id, WS>` for O(1) lookup.
**Spoken**: "The current `forward()` scans all peers to find the target. Inverting the Map gives O(1) lookup by peer ID at the cost of slightly more complex bookkeeping."

---

## 18. FINAL STUDY PLAN

### Block 1 — Architecture Fluency (2 hours)
- **Topic**: The two-layer signaling architecture; what the server does vs. PeerJS
- **Must understand**: Why the server exists even though the claim is "no server"; ICE/SDP vs. custom WS signaling
- **Draw**: Architecture diagram from memory in under 3 minutes
- **Answer aloud**: "Walk me through the full connection flow"
- **Completion test**: Draw the architecture, speak the narration, identify what happens if the server goes down

### Block 2 — Code Deep Dive (2 hours)
- **Topic**: `server.ts`, `useSignaling.ts`, `usePeerConnection.ts`, `useFileTransfer.ts`, `protocol.ts`
- **Must understand**: Every function, every state variable, every Map and Ref, why each was chosen
- **Calculate**: Max theoretical throughput with 5 ms delay and 64 KB chunks
- **Answer aloud**: "What exactly does PeerJS do versus what you wrote?"
- **Completion test**: Explain every line of `forward()`, `sendFiles()`, and the chunk reassembly loop

### Block 3 — Chunked Protocol and Data Quality (1.5 hours)
- **Topic**: The binary transfer protocol; what happens when a chunk is missing
- **Must draw**: The file-meta → chunks → file-done → file-ack sequence
- **Cover edge cases**: Missing chunk, duplicate chunk, DataChannel close mid-transfer
- **Answer aloud**: "What happens if a chunk is dropped?" with honest gap disclosure
- **Completion test**: Explain the gap, the consequence, and how you'd fix it

### Block 4 — SQL and Metrics (2 hours)
- **Topic**: Design the analytics schema; write the 6 SQL queries in this report
- **Must calculate**: Define transfer completion rate formula; identify denominator edge cases
- **Practice**: Write Q1–Q6 from memory; explain query logic, grain, edge cases
- **Answer aloud**: "Write a query for daily transfer success rate"
- **Completion test**: Write all 6 queries without notes; explain one incorrect result scenario per query

### Block 5 — Resume Defense and Nuance (1 hour)
- **Topic**: Claim-by-claim defense; the "no server" nuance; the "encrypted" nuance
- **Must say clearly**: What you built vs. what PeerJS provides vs. what the browser's WebRTC stack provides
- **Practice**: Answer "What exactly did you personally do?" for 5 minutes straight
- **Completion test**: Deliver the 90-second explanation without pausing; handle "but you have a server" pushback

### Block 6 — Amazon Leadership Principles (1 hour)
- **Topic**: Invent and Simplify, Dive Deep, Ownership, Bias for Action
- **Prepare**: Two STAR stories with specifics; have one failure story ready
- **Answer aloud**: The mock interview Q9 and Q11 behavioral questions
- **Completion test**: Tell both STAR stories in under 2 minutes each; be ready to add specifics when probed

### Block 7 — Scaling and Trade-offs (1 hour)
- **Topic**: What breaks at 10×, 100×; the trade-off table in Section 11
- **Draw**: O(n) vs. O(1) forward() fix; horizontal scaling architecture
- **Answer aloud**: "What would you change for 10,000 users?"
- **Completion test**: Propose three concrete changes in priority order with justification

---

## 19. ONE-PAGE DEFENSE SHEET

**Elevator pitch**: FullSend is a browser-based peer-to-peer file transfer tool I built from scratch. A lightweight WebSocket signaling server tracks online peers and routes connection requests, but never file data. Once two peers confirm a connection, a WebRTC DataChannel opens directly between their browsers, and files are chunked and streamed directly — the file bytes never touch any server.

**My exact ownership**: Sole developer. Designed and built: the Bun WebSocket signaling server (89 lines), the custom binary file transfer protocol, the React frontend (useSignaling, usePeerConnection, useFileTransfer hooks), the shared Zod-validated protocol package (@fullsend/shared). PeerJS provided the WebRTC DataChannel abstraction; DTLS encryption is browser-enforced.

**Architecture**: Browser A → WebSocket Signaling Server (connReq/connAccept only) → Browser B → [PeerJS ICE negotiation] → WebRTC DataChannel (file bytes, direct, encrypted)

**Dataset grain and scale**: No database. Server holds in-memory Map of active peers. File size limit: 2 GB per file, enforced in UI.

**Three major design decisions**:
1. Custom WS signaling server (vs. PeerJS-only) → enabled peer list and accept/reject UX
2. 5 ms sleep between chunks (vs. bufferedAmount backpressure) → simpler but caps throughput at ~12.8 MB/s
3. Shared Zod schema package → runtime type safety across server and client from same declaration

**Core SQL patterns**: Aggregation with GROUP BY + DATE_TRUNC; FILTER clause for conditional counts; LEFT JOIN for gap detection; window functions (RANK, OVER); NULLIF for safe division; HAVING to exclude low-volume noise.

**Primary KPI**: Transfer completion rate = count(file-ack received) / count(file-done sent) × 100

**Quantified result**: ❓ Measure and record: actual transfer speed MB/s; success rate in testing. Currently no production deployment.

**Two limitations**:
1. No chunk integrity check — missing chunk produces a silently corrupted file
2. No TURN server — transfer fails across symmetric NAT

**One failure story**: DataChannel buffer overflow when sending without rate limiting → discovered `bufferedAmount` constraint → chose 5 ms sleep as practical fix → learned to think about buffer management at every layer.

**Three Amazon Leadership Principles**: (1) Invent and Simplify — custom signaling server in 89 lines. (2) Dive Deep — hand-rolled binary protocol. (3) Ownership — sole architect and developer across every layer.

**Ten highest-probability questions**:
1. Walk me through the code when a file is sent
2. Why do you have a server if you claim "no server in between"?
3. What exactly did you personally build vs. what does PeerJS do?
4. What happens if a chunk is dropped?
5. How would you measure this system in production? Define a metric.
6. Write SQL for daily transfer success rate
7. What fails at 10,000 concurrent users?
8. How do you know the file arrived correctly?
9. What trade-off did you make, and why?
10. What part of the project are you least confident about?

---

## 20. READINESS ASSESSMENT

| Dimension | Score (0–5) | Gap | Action to Reach 4 |
|---|---|---|---|
| Project clarity | 4 | Nuance on "no server" claim | Practice the "two-layer" explanation until it's reflexive |
| Personal ownership | 4 | Attribution of PeerJS vs. your code | Memorize exactly which 5 things PeerJS does; list everything else as yours |
| SQL depth | 2 | No database in the project | Study and write all 6 queries in this report from memory; understand grain and edge cases |
| Data modeling | 2 | No schema in the project | Memorize the proposed analytics schema; be ready to design it on a whiteboard |
| Analytical reasoning | 3 | No metrics were defined or measured | Prepare the 4 KPI definitions; be ready to explain misleading interpretations |
| Metric design | 2 | No metrics implemented | Study Section 3 KPIs; practice defining numerator, denominator, grain, time window aloud |
| Technical architecture | 4 | PeerJS cloud dependency not always disclosed | Add the PeerJS ICE layer to your architecture diagram |
| Validation | 2 | No automated tests; no checksum | Be explicit about gaps; have a clear story on what you would add |
| Business impact | 2 | No users, no deployment, no measurement | Quantify what you can (speed in testing); frame it honestly as a learning/portfolio project |
| Behavioral evidence | 3 | STAR stories need specifics | Fill in the ❓ placeholders in Section 14 with your real experience |

---

### Ten Most Important Gaps
1. ❓ **Actual transfer speed** — measure it and record a specific number
2. ❓ **Deployment** — is this live anywhere? If not, say so clearly
3. ❓ **NAT traversal testing** — have you tested across different networks?
4. ❓ **The failure STAR story** — nail down the exact scenario (DataChannel buffer overflow?)
5. ❓ **SQL fluency** — must practice writing the 6 queries without reference
6. ❓ **The "encrypted" nuance** — practice saying "DTLS is browser-enforced WebRTC behavior, not my code"
7. ❓ **PeerJS cloud dependency** — be explicit that ICE negotiation uses PeerJS's cloud
8. ❓ **Chunk integrity gap** — prepare a specific answer: "Here's the gap; here's the fix I'd implement"
9. ❓ **Metric definitions** — must define at least 3 metrics with formula, numerator, denominator
10. ❓ **User/stakeholder story** — who was this built for? Why? What did they say?

---

### Five Highest-Risk Resume Claims
1. **"no server or cloud storage in between"** — Misleading; a signaling server exists; PeerJS cloud is involved in ICE
2. **"prioritizing privacy and data security"** — Overstates your contribution; DTLS is browser-enforced
3. **"peer discovery"** — Could be mistaken as claiming PeerJS does this; your custom WS server does discovery; PeerJS does ICE
4. **"verifying and confirming peers"** — There is no identity verification; only an accept/reject UI flow; no authentication
5. **"streaming the file directly"** — File is chunked and sent sequentially with deliberate throttling; "streaming" implies continuity and flow control that isn't implemented

---

### Five Questions You Must Answer Before the Interview

1. **"Walk me through the code when I send a file."** (Know every line of `sendFiles()`)
2. **"You have a server. How can you say no server is in between?"** (Two-layer explanation; file bytes vs. signaling)
3. **"What metrics would you define to measure this in production?"** (3 metrics with formulas)
4. **"Write SQL to find the daily transfer completion rate."** (Write it cold, explain grain and edge case)
5. **"What part of this project are you least confident about?"** (NAT traversal + chunk integrity — be honest and specific)

---

### Verdict

> ## 🟡 PARTIALLY READY

You have built a genuinely interesting, technically sophisticated project, and you have code you can point to for every claim. The architecture is sound and shows real engineering depth.

**What holds you back from Defense Ready:**
- SQL and metric design must be practiced to the point of fluency — these are the core DA skills being tested
- Several resume claims need tightening before they can withstand scrutiny
- The behavioral STAR stories need real specifics filled in
- Business impact is hard to quantify without deployment or measurement

**One week of focused preparation** — primarily on the SQL block (Block 4) and the resume nuance work (Block 5) — is sufficient to reach Defense Ready.
