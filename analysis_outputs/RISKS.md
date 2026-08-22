# Review risks and follow-up points

These are static-review findings, not confirmed production failures.

## High — connection handshake listener can be missing

`usePeerConnection` subscribes via `addSignalingListener` in an effect that
runs on mount. At that point `myPeerId` is empty, so `useSignaling` has not
created the WebSocket; `addSignalingListener` returns a no-op. Its callback is
stable, so the subscriber effect does not run again after the WebSocket opens.
The signaling hook itself handles incoming `connReq`, but `connAccept` and
`connReject` are delegated to the unsubscribed peer-connection hook.

Review point: make subscription readiness explicit (for example, expose a
signaling connection generation/state and depend on it), or centralize message
dispatch inside `useSignaling` rather than registering directly on a mutable
socket ref.

## Medium — server trusts claimed peer identity

The backend associates a WebSocket with an ID supplied by that client and
forwards connection messages using the supplied `sender` and `receiver` IDs.
It does not verify that `msg.sender` is the ID registered for the sending
WebSocket. A client can therefore attempt to impersonate an ID in signaling
messages. Duplicate registrations also leave multiple sockets for the same
logical ID; closing one removes its nickname even if another is active.

Review point: bind the sender ID to `currentPeers.get(ws)`, reject messages
without a registered socket, and maintain an ID-to-socket mapping with an
explicit duplicate-ID policy.

## Medium — transfer integrity and resource limits are incomplete

The receiver accepts any chunk payload, silently omits missing chunks when it
constructs the `Blob`, and does not compare reconstructed bytes with metadata.
All chunks are retained in memory, so large files can consume substantially
more memory than their on-disk size. The UI warns only above 2 GiB; it does not
enforce a safe operational limit.

Review point: validate `ArrayBuffer` payloads plus indexes/counts and final
byte length, reject duplicates/out-of-range chunks, introduce cancellation and
backpressure, and use a memory-conscious transfer strategy or enforce a hard
limit.

## Low — stale nickname parameter

`useFullSend` tracks `currentNickname`, but passes `initialNickname` to
`usePeerConnection`. The latter's connection-message callbacks retain the
original nickname. The backend currently overwrites `senderNickname` before
forwarding, which masks this in normal flows, but the client state is still
internally inconsistent.

## Low — malformed session storage can crash TransferPage

`TransferPage` parses `sessionStorage.fullsend_peer` without handling JSON
parse errors. A corrupted value can prevent the transfer page from rendering.
