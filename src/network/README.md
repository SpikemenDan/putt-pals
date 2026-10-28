# N1 room transports

This module implements the C1 transport shape for solo, deterministic in-memory links, and injected PeerJS data channels. The browser entry point still uses its embedded legacy room implementation; I1 owns adoption. No PeerJS dependency or version upgrade is introduced here.

```js
import { createPeerTransport, bindRoomSession } from './src/network/index.js';
import { createRoomSession } from './src/session/index.js';

// Application supplies the existing Peer constructor, unique peer/session IDs,
// signaling/ICE options and an explicit session clock.
const transport = createPeerTransport({
  Peer, peerId: hostId, hostId, sessionId, now: clock.now,
  peerOptions,
});
const session = createRoomSession({ hostId, clock });
await transport.connect();
const unbind = bindRoomSession(transport, session, { clock });
transport.send({ type: 'command', payload: { type: 'START_VOTING' } });
// On leaving: unbind(); transport.close(); session.dispose();
```

A guest uses its own `peerId`, the same `hostId`, and omits `sessionId`. Subscribe to snapshots before connecting, await `connect()`, then send `{ type: 'command', payload: { type: 'JOIN_ROOM', name } }`. The application chooses the room host and maps an invitation code to `hostId`; this adapter does not auto-promote a failed guest to host. A fresh host must get a new unpredictable session ID (for example a UUID). IDs accept 1–128 ASCII letters, digits, underscores and hyphens. Room/session IDs are routing and freshness identifiers, not account authentication or secrets.

`MemoryRoomHub.create(options)` returns the same interface, using a shared hub for all room participants. `createSoloTransport({peerId, sessionId, now})` is a host transport with no remote links. `subscribe()` receives independently owned `{type, senderId, payload}` messages (`command`, `presence`, `snapshot`) and `peer-open`/`peer-close` lifecycle events. `subscribeStatus()` receives `{state, reason}`; `connectionState` starts disconnected and becomes connecting/connected/disconnected/closed. Calling close is terminal and idempotent. Startup timeout defaults to ten seconds. Host loss ends the guest connection with `host-lost`; the UI must offer a return-to-lobby path. Retry/reconnect identity and grace handling belong to N2; close/dispose the old room before constructing another.

## Protocol and authority

Only JSON **strings** travel over data channels. Every envelope includes version 1, a session ID, round number, putt index, monotonic sequence number, actual sender ID, room timestamp, message type and payload. An initial host welcome establishes session/time/round context. Real Chromium can drop the first messages the host writes the moment a received data channel opens, so a bridge with `heartbeatMs` re-sends the welcome (followed by a snapshot) at that interval on every link that has not yet delivered a valid message (`transport.greet()`, T1c #48). Guests accept snapshots only from their host connection. The host accepts guest commands/presence only from an attached connection with matching sender, session and round; duplicate/older sequences are dropped. The sender ID supplied to the actor comes from the link, never from payload `playerId`. Guest host commands and internal XState events are rejected before actor dispatch. The L1 actor still enforces phase, membership, start time and monotonically increasing score rules. `send()` returning true means dispatched/sent, not that the actor accepted a command; observe authoritative snapshots for the result.

Messages are limited to 65,536 UTF-8 bytes before JSON parsing. Positions are finite and bounded to absolute values of 1,000,000; counts are nonnegative safe integers. The shared helper/protocol now preserve scores above 99 and zero penalties. Names remain strings, including markup characters; UI consumers must render them as text. Snapshot validation covers domain phases, modes, round/putt tokens, players, scorecards, votes, totals, results and optional presence. Snapshots include the actor's `state` and host-view `isHost`; UI code must derive local host authority from the transport, not copy this host-view flag into guest controls.

The adapter caps live links to three guests plus the host, consistent with the accepted C1/L1 four-member limit; pending PeerJS links count toward that cap. Snapshot history is bounded to 128 retained player/total entries and also by the message byte limit. If a long-lived room accumulates more history or exceeds the byte bound, snapshot sending returns false and reports `snapshot-rejected` or `payload-rejected` through `subscribeStatus`; the application must end/recreate the room rather than silently truncate scores. This is a protocol resource bound, not a new gameplay stroke cap. PeerJS connection IDs bind current links but do not provide anti-cheat, accounts, resume authentication or host migration.

## Host bridge and movement

`bindRoomSession()` is host-only and never owns or disposes the supplied actor/transport. It dispatches validated commands with the bound sender ID and turns link departure into `LEAVE_ROOM`. Session changes publish immediately. Current-round positions sent as `{type:'presence', payload:{x,y,z,mode,strokes}}` (I1 added optional `effect`, one of `'' mag steady rew rev zany`, and `fx: {id, t: 'rev'|'zany'}` for power-up auras and attacks; both validated, unknown fields still rejected) are cached only for active connected participants, and published as `snapshot.presence[playerId]` at most every 70 ms when dirty. Modes match simulation: play/sunk/timeout/spectator. Position publication does not change actor scores. Positions are discarded on departure or round/putt change. Local feedback and simulation remain application-owned. No interpolation, prediction, effect/attack messages, recovery tokens or managed TURN service are implemented in N1.

Use one bridge per host session. Its returned disposer cancels the recurring publication timer and unsubscribes both sources; call it before closing the transport and actor. `clock` for the bridge needs `setTimeout` and `clearTimeout`. The PeerJS adapter additionally accepts that timer clock and a configurable `timeoutMs`; the transport `now` callback supplies monotonic local time. Guest time uses the latest host timestamp offset, without latency compensation. Network clock refinement belongs to later integration/recovery work.

## Verification

Run `npm run test:network`. Tests cover four fake clients completing the actual six-putt L1 lifecycle, uncapped scores, guest/phase guards, malformed and oversized payloads, forged identities, incompatible versions, stale/duplicate sequences, movement cadence, spectators, capacity, host loss, cancellation and disposal. PeerJS-shaped fake channels test its event/resource lifecycle, not real WebRTC. `npm test` and CI include this suite. Browser/WebRTC/separate-network/TURN validation remains unrun here and must be recorded separately during I1/T1/N2/N3 adoption.

Peer event/data-channel APIs were checked against the [official PeerJS guide](https://peerjs.com/client/getting-started). Library injection preserves the embedded version; I1 supplies the constructor and signaling/ICE configuration.
