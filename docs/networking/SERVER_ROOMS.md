# Server-owned friend rooms — N4a contract

Status: proposed contract for #66, parent #65. Not yet integrated or adopted by gameplay. Current main still uses PeerJS for online rooms. N3 #14 remains paused with its local changes preserved. No Cloudflare account connection, provisioning, deployment or service spending is authorized by this document. An accepted contract commit must be recorded in #68–#73 after review/integration.

The user selected planning for Cloudflare Workers + SQLite-backed Durable Objects, WebSockets and browser-local physics. One Durable Object owns each room; the Worker routes connections and serves the static build. This replaces signaling/TURN for the normal gameplay path. TURN is not a fallback for a failed WebSocket. No accounts, matchmaking, server physics or anti-cheat is introduced.

## Agreed product defaults and configuration

The user confirmed these defaults on 2026-10-28 and requested that they be editable later:

| Setting | Default | Configuration bounds |
| --- | --- | --- |
| Reconnect grace | 30 seconds | 1 second–5 minutes |
| Controller transfer delay after a disconnect | Immediate | 0–reconnect grace |
| Empty-room retention | 15 minutes | At least reconnect grace, at most 24 hours |

`createRoomPolicy(overrides)` in `src/network/contracts/server-room.js` validates and freezes these settings; unknown fields and invalid values fail rather than silently defaulting. #68 exposes deployment configuration; #69 copies the resolved policy into each new room checkpoint. Editing deployment settings changes **new rooms**, not active timers in existing games. There is no player-editable settings UI in this migration. Adding one later can use this same schema through a separately authorized command/UI task. Room capacity remains four members, including spectators and reconnect reservations. Changing capacity is a contract change, not a hidden config switch.

The proposed retention/succession details below are settled implementation defaults; no additional product decision blocks the first consumers. Changing behavior outside the agreed defaults requires review.

## Authority, permissions and continuity

The backend is the only lifecycle authority. `controllerId` identifies a player allowed to choose mode, start voting, select/start a replay putt, step/restart practice, return to selection/lobby or advance from results. It is not server identity. `hostId`/`isHost` do not exist in the new wire context. Automatic timer/round advancement is server-only, never a public command. All admitted players can vote and report their own strokes/completion; only current roster members can report movement or scores during play. Preserve actor phase, score, deadline and mode guards in addition to transport authorization.

The creator gets controls initially. Explicit Leave revokes their resume identity/seat immediately and passes controls immediately. Abrupt disconnection is detected on socket close or liveness timeout; with the default policy, controls pass immediately to the player whose current connected interval began earliest. Ties use a persisted increasing `joinOrder`. A reconnect starts a new connected interval and does not reclaim controls. If a nonzero transfer delay is configured, hold controls for that delay (no disconnected player can issue commands), then apply the same election. Reconnect before that delay preserves controls; explicit Leave always skips the delay. If no connected players remain, `controllerId` is null under the default policy. First returning/admitted player receives controls. Spectators are eligible to control lobby/series transitions; controlling a room does not promote them into the active map roster.

Controller departure never sends the legacy host-leaving/reset-to-lobby event. Keep remaining players' votes, scores, phase and deadlines. Grace reserves membership and score history, not an invisible live socket. Public `players[id].connected` describes socket liveness. The server's actor adapter must use `seats` to distinguish a reserved participant from a final departure: preserve roster and completion eligibility through grace, so a temporary disconnect does not prematurely trigger all-done/map finalization. At grace expiry, apply ordinary participant departure semantics (remove its vote/participation, retain historical scores) and re-evaluate transitions. Timers continue during grace; no round rewind or restart on resume. If no current-roster member remains live or reserved during play (including when only late spectators remain), abandon the unfinished map to lobby without fabricating scores/winners; increment the round token and cancel its timers. Retain committed history/totals until the next series starts. This explicit server recovery rule prevents a retained room becoming stuck with zero eligible players. It does not cancel a game while another live/reserved participant remains. Late joiners spectate until the next map, as today. Disconnects/creator departure intentionally change room continuity; physics and scoring rules do not change.

Solo/course practice/replay remain local, using the existing actor. If a single member chooses a practice mode in a server room, preserve the current single-member restriction. The adapter must retain course-practice timeouts; only single-putt replay has no timeout. No fake server player occupies a capacity slot or gets scores.

## Room lookup and invitations

Use same-origin `GET /api/rooms/<roomCode>/socket` with a WebSocket upgrade, HTTPS/WSS in deployment, localhost exceptions only in development. Canonical room codes are 1–12 lower-case ASCII letters/digits. Reject invalid codes instead of silently creating a different room. New generated codes use eight cryptographically random unambiguous characters; typed codes remain supported. Names are text-only, trimmed and at most 14 UTF-16 code units, preserving current UI limits.

The full route (environment + protocol version + canonical code) chooses the Durable Object name, isolating preview/production and v1/v2. A fresh `hello` can create a room if no live session exists, or join an existing one. A `hello.resume` **never** silently creates a room or downgrades to a fresh identity. Old/expired session returns `session-expired`; the player must explicitly join again for a new identity. A room code is a shareable invitation, not strong authentication. It contains no resume secret. Enforce exact origin allowlists plus independent admission/rate/connection limits; CORS/origin checks alone do not stop non-browser abuse.

Retain an empty room for 15 minutes from the last live disconnect/leave, independent of shorter reconnect grace. Grace expiry does not erase other participants' historical scores. A new non-resuming visitor can join the retained room, subject to reserved capacity, as a new participant/spectator. Cancel empty expiry on live admission. After expiry, destroy domain state, hashes and attachments; a new visitor using the same code starts a new random `sessionId`. Any old resume credential is invalid even if the code matches. Creator controls do not confer ownership of the code forever.

## Wire boundary and API

Direct imports are intentional: `src/network/contracts/server-room.js` and `server-room-mocks.js`. They introduce **server-room protocol 2**, checkpoint schema 1 and rules version `server-room-1`; existing `PROTOCOL_VERSION = 1`, solo and PeerJS behavior stay unchanged until #71 cuts over. Do not modify active v1 validators to make v2 look compatible. Server and client reject incompatible versions with an actionable rejoin/reload outcome.

Only bounded JSON **text** is accepted; no binary or executable payloads. `decodeRoomFrame(raw, direction)` measures UTF-8 bytes before parsing and validates direction, exact fields and field bounds. `encodeRoomFrame` also checks the output boundary. Unknown fields are rejected; do not forward caller-declared `playerId`, actor internals or arbitrary XState events. Validators here follow the existing dependency-free contract style. Network-only contracts live under `src/network/contracts/`, outside the simulation/common-source fingerprint, consistent with the existing network protocol boundary. They are pure and import no adapter/runtime APIs; backend and browser import the same file. No solver provenance or measurement fixture changes are needed. No new dependency is selected by #66; any broader Zod migration remains integration-owner work under the modernization plan.

| Direction/type | Fields after `version`, `type` |
| --- | --- |
| Client `hello` | `roomCode`, `name`, `resume: null \| {sessionId, playerId, token}` |
| Client `command` | `sessionId`, `connectionId`, `sequence`, `roundNumber`, `puttIndex`, `payload` |
| Client `presence` | Same envelope fields as command; payload is current ball movement/effect data |
| Client `ping` | `nonce`, `clientTime` (local monotonic ms, opaque to the server) |
| Server `welcome` | `playerId`, `connectionId`, `resumeToken`, `snapshot` — sent **only to that socket** |
| Server `snapshot` | `snapshot` |
| Server `ack` | `sessionId`, `connectionId`, `sequence`, `revision` |
| Server `presence` | `sessionId`, `roundNumber`, `puttIndex`, `sequence`, `serverTime`, `players` movement map |
| Server `pong` | Echoed `nonce`, `clientTime`, server-owned `serverTime` |
| Server `error` | Allowlisted `code`, `retryAfterMs: null \| integer` |

`hello` must match the route code and arrive within 10 seconds. Before admission, only hello is accepted; after admission, another hello is invalid. Ping is accepted only on an admitted socket. Welcome/snapshots/acks cannot be sent by clients. A bounded parser may inspect `version` to distinguish incompatible-version from other invalid messages; never log the raw payload. Disconnect after fatal rejection using documented WebSocket codes (1008 policy, 1009 oversized, 1013 transient overload); client status logic uses the allowlisted application error, not arbitrary exception strings. Invalid requests with no safe reply still close cleanly.

Command payloads are strict records defined by `validServerCommand`; `REPORT_SCORE` requires an explicit boolean `timedOut`. Actor-side `playerId` comes from the admitted socket binding. No public JOIN_ROOM command (hello performs admission), ADVANCE_PUTT or FINISH_ROUND. Transport authorization validates membership, controller permissions, current session/socket/round/putt and strictly increasing sequence. Explicit Leave is allowed for a current session/socket even if its UI has a stale round token. Phase/mode/scoring guards still belong to the lifecycle actor and cannot be inferred from successful schema validation.

Each newly admitted/resumed socket gets a server-generated random `connectionId`; sequences restart at 1. Commands and presence have **separate** sequence counters per connection. Persist the latest consumed command sequence; presence deduplication stays ephemeral. Repeated/older commands return `sequence-rejected` without mutation. Gaps are allowed. Rejected domain no-ops consume/commit sequence and ack with a new revision so they cannot later acquire a different meaning. On ack loss followed by reconnection, the authoritative welcome snapshot reconciles UI; do not blindly replay old commands. Server presence broadcasts have a persisted increasing sequence within `sessionId`, preventing a restart from sending lower sequences to surviving sockets. Client snapshots apply only increasing revisions for the current session; welcome installs/replaces the session and connection binding. Presence/snapshots from an old session/round/connection are ignored.

A public snapshot contains `roomCode, sessionId, rulesVersion, courseHash, revision, serverTime, controllerId, policy, seats, session`. `session = {node, context}` identifies an explicit lifecycle substate plus full domain fields (modes/maps/putts/roster/players/votes/deadlines/scores/totals/last). Public seats hold `playerId, joinOrder, connectedSince, resumeUntil`. There are at most four seats; historical player/total entries are bounded separately at 128, scorecards at six putts, series at nine maps. No resume secret/token hash/socket/actor implementation data is public. The public course hash fingerprints normalized course/config content; the browser compares it and rulesVersion with its build before enabling gameplay, rejecting incompatible content rather than silently simulating different maps. Validators cross-check membership and IDs. On history/message capacity exhaustion, fail with `history-full` and offer creating a new room; never silently truncate scores or remove reservations to admit a fifth player.

### Browser-facing adapter shape for #71

`connectServerRoom({ endpoint, roomCode, name, resume, clock, WebSocket }) -> Promise<Room>` resolves after validated welcome. Configuration may select local development endpoint; deployment defaults to same-origin WSS. `Room` exposes `localId`, `controllerId`, `isController`, `roomCode`, `snapshot`, `now()` (estimated server epoch), `send(command) -> boolean`, `sendPresence(payload) -> boolean`, `onSnapshot(listener)`, `onPresence(listener)`, `onStatus(listener)` (each returns disposer), `identity` (private resume data for this tab), and `close({leave: true})` (explicit departure). Closing after disposal/network failure does not imply explicit Leave. The adapter internally adds sequence/round/putt/session/socket fields; no browser host actor exists. Return false for invalid/disconnected sends. Application attaches player ID only for local solo; online identity is server-bound.

Statuses are `connecting`, `connected`, `reconnecting`, `disconnected`, `closed`, with structured allowlisted error code where relevant. Local feedback is immediate; connection loss cancels input and pauses local simulation publication. Retry with bounded exponential backoff plus jitter (0.5, 1, 2, 4, max 5 seconds), until grace expires or an unrecoverable response occurs. No auto-fresh join on expired resume, stale-code room replacement, or double-tab conflict. Leave/dispose abort pending joins and retries, closes sockets, removes listeners and prevents a late async welcome from resurrecting the room.

## Identity and connection handling

Backend uses Web Crypto to generate player/session/socket IDs and 32 random bytes encoded as 43 base64url characters for resume tokens. Persist only a SHA-256 token hash bound to environment/code/session/player. Compare hashes without leaking them; never broadcast or log raw tokens or hashes. Name or claimed player ID alone is never proof of identity. Tokens remain stable until explicit leave or grace expiry so ack/welcome loss cannot strand the previously issued token. Hash issuance and seat reservation are committed before welcome. No unacknowledged welcome token retry is guaranteed on first-ever admission; abandoned pending joins release their seat after liveness/grace bounds.

Store resume data in tab-scoped sessionStorage after welcome, never invitation URLs. Storage failure disables automatic resume without breaking normal admission. A valid resume with a still-live socket returns `identity-rejected`; it does not steal a seat or disconnect that player. After socket close/timeout a resume before the deadline attaches a new connectionId and supersedes the old binding. Invalid/expired tokens never reserve a seat or expose player history. Explicit Leave revokes the hash; historical scores can remain without a reusable identity.

Use hibernation auto-response ping/pong where possible; 15-second client heartbeat, 45-second silent-link timeout. Record/update last-seen liveness through a bounded attachment strategy; these timestamps may be ephemeral during healthy connected play, but when a disconnect/grace deadline is established it is durable. Resume grace starts when the server detects disconnection, not at an unverifiable client timestamp. Browser retries are bounded by the server-advertised deadline. Hibernation retains admitted sockets; a true socket loss/restart enters ordinary grace. #70 tests races between resume/expiry/old close callbacks with connection-generation checks.

## Limits and clock

`SERVER_ROOM_LIMITS` defines 64 KiB/frame, four members, eight pending unauthenticated handshakes per room, 10-second handshake timeout, 256 KiB/socket outbound queue, 10 commands/sec with burst 20, and 20 presence frames/sec with burst 30. Presence is coalesced/broadcast no faster than every 70 ms; drop obsolete positions rather than building a backlog. Critical transitions are reliable and bounded; close a slow socket and allow resume instead of accumulating unbounded queues. Pending admission checks and slot reservation are serialized; pending handshakes have a separate bounded pool but cannot over-admit final membership. Account-wide/IP admission limits are specified/configured in #69/#73 using trusted platform request metadata (no caller-supplied identity headers). These limits constrain server work; schema checks alone do not enforce rates.

Server lifecycle uses injected epoch milliseconds, stored as nonnegative safe integers. Use a stable logical epoch (`max(lastCommittedTime, wallClockNow)`) to tolerate small wall-clock regressions; no dependence on process uptime. Each deadline is an absolute timestamp. Browser samples pong/snapshot time using local monotonic send/receive timestamps and an RTT-based offset estimate; ignore unknown nonces and old sessions, prefer lowest-RTT samples and smooth corrections for display. Never trust client time for votes/scores/timeouts. Reconnect resumes server time without resetting deadlines. Clock offset estimation is not latency compensation or authoritative physics.

## Durable checkpoint and restore contract

`validRoomCheckpoint` validates a **separate** versioned persisted record, not a UI snapshot cast as XState state:

| Field | Purpose |
| --- | --- |
| `schemaVersion`, `rulesVersion`, `courseHash` | Persisted format + lifecycle implementation + normalized course/config fingerprint compatibility |
| `savedAt`, `snapshot` | Committed epoch/revision and complete public domain context/node/policy |
| `identities` | One entry per reserved/live seat: playerId, tokenHash, nullable connectionId, latest consumed command sequence |
| `deadlines` | Nullable absolute `voteAt`, `startAt`, `minimumPlayAt`, `fallbackAt`, `replayAt`, `controllerAt`, `emptyAt` |
| `nextJoinOrder` | Monotonic membership ordering, never inferred from object key order |
| `presenceSequence` | Latest server presence-broadcast sequence, reserved durably in blocks before emitting |

Connected seats have a connectionId; disconnected reserved seats have null connectionId and an absolute resumeUntil. EmptyAt exists when there are no live sockets. ControllerAt exists only for a disconnected controller held by a configured delay. Lifecycle substate and corresponding deadlines must match. Preserve 2500ms normal start, 1500ms minimum play, actual putt limit and 4000ms coordination fallback, and 2200ms replay delay. `play.active.replaying` has an explicit replayAt; this must not restart after reconstruction. Course practice retains fallback; replay does not. Catch-up never advances results without the required user command or invents missing votes. A past voting deadline with no valid votes follows the existing waiting behavior; no recurring immediate-alarm spin.

Persist node + all domain context (including score-recorded progress and series state), not raw opaque actor objects. #69/#70 add a restore entry point to the existing lifecycle module that maps this domain form to the pinned XState machine **without replaying entry actions that reset context or restart delays**. Disable reliance on XState's volatile timeout queue for server rooms: durable deadline reconciliation drives guarded internal timer events. Current public actor lacks this API. Do not claim passing contract tests prove actor restoration. Prove equivalence at every named node against uninterrupted actor runs in #70. The local solo actor keeps its existing clock/timers. A rendered flattened `getSnapshot()` or a raw XState persistence blob alone is not an adequate recovery format.

Commit admission, membership/disconnect/resume/expiry/controller changes, commands (including no-op dedup sequence), scores, state transitions and deadlines **before** acknowledging or broadcasting those changes. Transactionally update checkpoint and next alarm together; on storage failure, no success ack and no externally visible mutation. Before admitting a hello or authorizing any command, reconcile elapsed deadlines so a delayed alarm cannot extend expired identity/control privileges. Serialize messages/alarms/socket events through the room; do not hold mutable state across awaited storage without a serialized commit boundary. One durable revision per committed change; retry handlers validate session/revision/round before effects.

Only one Durable Object alarm exists: schedule the earliest lifecycle/controller/empty/grace deadline, reconcile due events in timestamp order and re-evaluate after each guarded committed transition. At equal timestamps process seat expiry, empty expiry and controller election before lifecycle timers, as `dueRoomDeadlines` specifies; do not score a player whose reservation expires at that instant. `dueRoomDeadlines` provides candidates, not a complete lifecycle reducer. Alarms are at-least-once; retries cannot score or advance a putt twice. Future deadline writes and next-alarm changes are atomic. Bounded catch-up batches reschedule continued work without resetting time. No always-running room interval or simulated 240Hz physics on the server.

Movement, input, interpolation samples, meshes/audio and rate-limit buckets are ephemeral. For server presence ordering, reserve a sequence block durably (e.g. 1024 numbers) and skip unused numbers after restart, instead of writing storage every 70 ms. A restored room does not invent an in-flight trajectory; a still-connected browser republishes current local state. After browser reload, if unfinished play has no saved local physics state, use an explicit recovery fallback: restart that player's ball from the tee, retain server strokes/score/round deadline, clear transient inventory/effects, and notify the player. Completed players/spectators do not gain another shot. Improving in-flight ball recovery requires a separate simulation-state contract.

Hibernation: recover connected WebSocket attachments with player/session/connection IDs; verify against durable identities before accepting messages. Attachments contain no resume token. No live socket lost merely because the JS object is reconstructed. True restart/deployment socket loss: mark those bindings disconnected, establish grace/controller/empty deadlines, send authoritative welcome on authenticated rejoin and reconcile elapsed timers. #70/#73 must measure and document platform behavior rather than assume a deployment preserves sockets.

On incompatible schema/rules/course hash, reject with checkpoint-incompatible/service unavailable; do not clear a live game silently or reinterpret state. #73 deploys compatible revisions, or explicitly drains rooms and documents the limitation. Rollback requires a compatible reader for any written checkpoint schema. Empty-room cleanup can reset an expired room; reset of incompatible retained state requires an explicit operational decision. Room state lives within provider/storage availability; server-owned rooms do not promise unlimited uptime.

## Implementation map and acceptance

| Issue / consumer | Required work after accepted contract |
| --- | --- |
| #68 local Cloudflare setup | Bind Worker/SQLite DO, static assets and same-origin upgrade route; validated policy config; local runtime tests, no remote account changes |
| #69 backend + `src/session/machine.js` | Decouple server authority/controller and membership-liveness semantics; reuse game rules; serialized admission, payload/rate/identity guards |
| #70 durable recovery | Domain checkpoint export/restore, durable alarms, grace/controller/expiry and hibernation adapters; node-by-node equivalence and crash-boundary tests |
| #71 `src/network`, `src/app/room.js` / app main | WebSocket adapter, authoritative room snapshots/epoch clock, solo preservation, secure resume/cancel/retry, no browser-host election |
| #71 UI/store/model | Replace `isHost` meaning with controller permission; label creator/controller accurately; remove normal ICE JSON; show service/rejoin states; coordinate with V1d |
| #72 tests/CI | Real local Worker and cross-browser WebSocket game/recovery tests, quotas/abuse/throughput, current-head checks |
| #73 deployment/Q1 | Authorized account/configuration, origin/secret handling, separate-network WSS sessions, compatible deploy/rollback and Free quota evidence |

N4a tests are contract/fixture/mock evidence only. `MockServerRoomBoundary` binds a pre-admitted fixture identity, checks wire/authority/freshness, invokes an injected reducer and persists before ack. It does not implement admission, game rules, score progression, durable storage or WebSockets. No mock assertion closes #69/#70/#72/#73. The new contract suite is wired into existing `npm run test:contracts`, so existing CI invokes it without a new job. No new script or runtime service is claimed.

## References

- [Cloudflare Hibernation WebSocket API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/): socket attachment/reconstruction and idle hibernation requirements.
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/): one alarm per object and at-least-once execution.
- [Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): active duration, message requests and storage are distinct usage dimensions. Free-tier capacity must be measured in #72.
