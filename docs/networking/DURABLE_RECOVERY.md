# Durable room recovery (N4d)

The Worker exports `RoomDurableObject` from `services/rooms/recovery-object.mjs`. It wraps the N4c coordinator in serialized storage transactions and uses Cloudflare's Hibernation WebSocket API. Browser physics remains local; N4E (#71) supplies the WebSocket client, pending integration. This document describes the local implementation, not deployed acceptance.

## Commit boundary

The SQLite-backed object stores one JSON value, `room-checkpoint`, using N4a checkpoint schema 1 (`server-room-1`). The record contains the validated domain node/context, roster/scores/tournament history, policy, identities with SHA-256 resume-token hashes, consumed command sequences, explicit absolute deadlines, membership order and a reserved presence sequence high-water mark. Raw resume tokens are never stored or attached to sockets. No physics positions, velocities, inventory or trajectories are stored.

A serialized operation buffers its success frames, commits the checkpoint and next alarm in one storage transaction, then publishes. Failed writes discard buffered frames, restore the previously committed domain state, and close connections with a transient service error. Explicit leave acknowledges before closing only after persistence succeeds. No-op commands still durably consume their sequence and revision. Checkpoint and alarm failures are tested independently of successful gameplay. A failed close callback is reconciled on the next successful operation, so lost socket-map entries cannot leave phantom live seats.

Presence, token-bucket rates and healthy-link timestamps are ephemeral. Presence sequence numbers are reserved durably in blocks of 1024 before publication; reconstruction skips unused numbers. Ordinary movement/heartbeat updates do not rewrite the domain checkpoint or continually postpone a pending alarm. Socket attachments retain identity binding and liveness across hibernation, never resume tokens. A publication failure after a successful commit may lose an acknowledgement; clients reconcile from the authoritative resume snapshot and must not blindly replay commands.

## Restore and deadlines

`createRoomSession({serverOwned: true, durable: true, restore, ...})` maps the explicit domain form to the pinned XState machine with `resolveState`. Entry actions are not replayed, and volatile `after` timers are disabled for durable actors. `exportDomain()` provides the portable node/context. The adapter validates the full checkpoint before calling the restore API. Solo actors continue using their original timers and interface.

Only the private `advanceDeadline` API can trigger durable timer transitions. It checks the expected round, node and absolute time. Public commands cannot submit timer events. The checkpoint includes the replay deadline, avoiding a restarted replay pause after reconstruction.

One durable alarm covers lifecycle timers, reconnect grace, controller transfer, empty retention, handshake expiry and silent-link detection. Due domain deadlines are processed in timestamp order; at equal timestamps, reservation expiry precedes empty expiry, controller election and lifecycle progression. Each domain transition is committed independently. Catch-up uses the original due timestamp, retaining countdown/round timing rather than starting delays at reconstruction time. Batches are bounded at 64 transitions; if further catch-up is needed the pending past alarm permits another attempt, and commands are not admitted against stale state. Repeated alarms and score replays cannot record a putt twice. A vote timeout with no votes returns to waiting without an immediate-alarm loop.

## Connection and retention behavior

Hibernation reconstructs live sockets from `getWebSockets()` and validated identity/connection-generation attachments. The same socket and command sequence binding continue. If a true runtime restart loses sockets, missing bindings are marked disconnected with server-observed grace and controller/empty deadlines. A valid token resumes the same seat and scores with a new connection ID; a live duplicate is rejected. Explicit leave revokes the identity immediately. Expired or forged resume credentials cannot silently create a fresh identity.

Reservations count toward room capacity. Capacity remains the accepted N4a value; C3 #85 owns eight-player alignment. Policy overrides are resolved only when creating a room and persist with that room. Controller departure preserves the session; delayed transfer, when configured, is durable. An unfinished map with no live or reserved participant is abandoned without fabricating scores. Empty retention removes the checkpoint and identity data; later reuse of the same code creates a new session ID.

A browser reload cannot recover an in-flight ball from this server state. N4e must implement the agreed tee-reset fallback while retaining server strokes and deadlines, and notify the player. Completed players remain completed.

## Active cost model

There is no always-running room interval or server physics loop. Durable actors schedule no volatile lifecycle/liveness/handshake timers. A short, at-most-70-ms presence-coalescing timer runs only while input is pending. Continuous play therefore keeps the object active; connected idle rooms can hibernate between messages/alarms.

The existing protocol uses nonce-bearing JSON pings and dynamic pongs, so this adapter handles them explicitly rather than substituting a fixed auto-response that would break the wire contract. Healthy clients send a heartbeat every 15 seconds (four incoming heartbeat events per client per minute). For N clients at the permitted sustained presence rate, input is at most 20N presence frames/sec and coalesced output is at most approximately 14.3N recipient frames/sec. With the current four-member contract that is 80 incoming presence frames/sec and roughly 57 recipient frames/sec. Presence reservations cost one checkpoint write per 1024 broadcasts, plus domain commands/transitions and bounded alarm changes; movement is not checkpointed per frame. These are protocol bounds, not measured provider billing. N4f owns traffic/Free-plan quota measurement; no paid plan is provisioned.

## Compatibility and rollback

Unknown schema/rules or a different normalized course hash fail closed with an incompatible-checkpoint response and preserve stored state for operator review. Do not silently reinterpret or erase a live checkpoint. Rollback requires a reader compatible with all checkpoint formats written by the deployed revision. Rolling back to pre-N4d code is unsafe for retained rooms: that code has no durable reader. Drain rooms under an explicitly authorized deployment/rollback procedure before such a rollback. No remote deployment or rollback was performed here.

## Verification

- `npm run test:session`: existing lifecycle tests plus durable domain restoration at every named node, practice/replay/tournament results, stale timer rejection and equivalence with uninterrupted actors.
- `node tests/rooms/durable-recovery.test.mjs`: deterministic storage/socket implementation tests, including checkpoint-before-publication, failed writes, reserved capacity, token/sequence rejection, controller policy, expiry/code reuse, repeated alarms and expiry/fallback ordering. These use fake storage and sockets.
- `node tests/rooms/hibernation-runtime.test.mjs`: actual local workerd/SQLite object eviction with hibernated sockets, wake on the same socket, duplicate command rejection after reconstruction, durable countdown alarms, forced socket loss, and authenticated resume after replacing the workerd process with persisted SQLite. This uses Miniflare/esbuild already pinned transitively by Wrangler; it installs no new dependency.
- `npm run test:rooms:local`: build, the recovery suites above, and the existing Wrangler routing/admission/reconnect/four-player six-putt game.

These are local runtime and deterministic checks. They do not prove deployed socket behavior, browser WebSocket integration, separate-network acceptance, provider quota performance or production rollback. N4f/N4g retain those gates.

Platform references: [Cloudflare WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [durable alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [transactional storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), and [XState persistence](https://stately.ai/docs/persistence). The implementation is tested against the repository's pinned XState and Wrangler/workerd versions.
