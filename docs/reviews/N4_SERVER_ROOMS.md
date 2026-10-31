# N4 server-room acceptance and capacity

Starting revision: `3cbee66` (2026-10-31). N4D #122, N4E #123, and GM1 #119 are merged. This report covers local evidence; N4G deployment and separate-network acceptance remain gates.

## Evidence map

| Concern | Repeatable check | Evidence type |
| --- | --- | --- |
| Four clients complete six putts with real shots and equal results | `tests/browser/multiplayer.spec.cjs` | Browser, WebGL, local Worker/WebSockets |
| Solo/practice, input, lifecycle cleanup | Existing browser specs | Browser |
| Tournament series, late spectator, controller departure during play | `tests/browser/server-room.spec.cjs` | Browser/UI with synthetic score reports; does not certify shot physics |
| Duplicate resume, malformed/version rejection | `server-room.spec.cjs` | Native browser WebSockets |
| Delayed frames and foreground switching | `server-room.spec.cjs` | Synthetic 150 ms application-send delay and two-second foreground switch; visibility state recorded, not a long-duration background-throttling certification |
| Reload and whole-object socket eviction recovery | `tests/browser/recovery.spec.cjs` | Browser plus actual Miniflare eviction |
| Absolute deadlines, grace expiry, reserved capacity, storage failure rollback | `tests/rooms/durable-recovery.test.mjs` | Adapter with fake storage/sockets/epoch |
| Hibernation, persisted process restart, deduplication | `tests/rooms/hibernation-runtime.test.mjs` | Actual local Workerd/SQLite |
| Origin, admission, routing, full game | `tests/rooms/local-runtime.test.mjs` | Actual local Wrangler/WebSockets |
| Input queue flooding and retained-byte bounds | `tests/rooms/inbound-queue.test.mjs` | Deterministic adapter test |

`npm run test:rooms:local` now includes the traffic measurement and runs in baseline CI. The browser matrix runs the service cases in Chromium, Firefox, and WebKit. The browser capacity case is tagged `@slow` and runs nightly/manually; local-runtime capacity checks run on every PR. Results for this branch are recorded below after verification.

Verification on 2026-10-31: `npm run test:rooms:local` passed (including build, deterministic failure/abuse checks, Workerd hibernation/process restart and the Wrangler four-player game). `npx playwright test --project=chromium tests/browser/server-room.spec.cjs` passed all three new cases in 202 seconds. The tournament uses the app's explicit Leave command and synthetic score reports; existing multiplayer coverage supplies physical-shot evidence. Firefox/WebKit and current-head CI results remain pending until the PR run completes. The existing Vite chunk-size warning and local Workerd alarm-cancellation diagnostic did not fail the checks.

## Measurements and limits

`node tests/rooms/traffic.test.mjs` instruments the actual durable adapter with fake storage and sockets. A four-player, three-map series with two-stroke reports produced 152 incoming frames (35,405 bytes), 666 outgoing frames (1,603,879 bytes), a maximum observed snapshot of 3,992 bytes, and a maximum observed checkpoint of 5,169 bytes. It made 133 checkpoint puts and 134 alarm writes. The movement sample sends 56 messages in 980 ms (57.14/second); only one checkpoint put reserves a presence sequence block. It does not persist ball positions per frame. The compressed series spans 72 simulated seconds and is not a typical human match duration.

The observed sizes are not worst-case claims. Hard application ceilings are 64 KiB per frame, 256 KiB per checkpoint, four seats including reservations/spectators, 128 historical identities, eight pending handshakes, 64 queued input frames, and 256 KiB retained input/output backlog. Historical scores and long names increase snapshots; admission reserves future score space and fails closed before overflow. Repeated series and final empty-room expiry are asserted. JSON payload size excludes SQLite indexes, pages and metadata.

## Free-plan estimate, checked 2026-10-31

Cloudflare documents 100,000 Durable Object request units/day, 13,000 GB-s/day, five million SQLite rows read/day, 100,000 rows written/day and 5 GB storage. Incoming WebSocket messages use a 20:1 billing ratio; outgoing messages are unmetered. Connection upgrades and alarms also consume requests; alarm writes and key-value writes/deletes count toward SQLite rows. Excess Free operations fail, with daily limits resetting at midnight UTC. [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

These are planning estimates from the application cadence, not measured Cloudflare charges:

- Four clients at one position every 70 ms plus a JSON ping every 15 seconds send about 206,674 messages/hour, or 10,334 request units/hour before commands, upgrades and alarms. A 100,000-unit allowance supports **less than 9.7 active room-hours/day**, shared across the account. At the admitted presence ceiling of 20/client/second, the analogous bound falls below 6.9 room-hours/day. Admission limits do not prevent abusive requests from consuming allowance.
- Conservatively charging a continuously active room at 0.128 GB uses 460.8 GB-s/hour, allowing about 28.2 room-hours/day from duration alone. Sparse hibernating traffic can cost less; 70 ms batching timers and frequent presence make continuous activity the safer estimate during play. No hosted duration discount is assumed.
- Budgeting 500 row writes per 30-minute series (a rounded allowance above the compressed sample for liveness alarms, presence sequence reservations and cleanup) gives 200 such series/day from writes alone. This is an assumption to replace with hosted analytics; request units are likely tighter at continuous movement.
- At the 256 KiB checkpoint ceiling, payload-only storage for 10,000 retained rooms is about 2.62 GB. SQLite overhead, historical objects and other account data reduce headroom. The 15-minute empty-room policy bounds domain retention but does not prove immediate physical storage reclamation.

The front Worker's Free allowance is 100,000 requests/day and 10 ms CPU/invocation. Each WebSocket upgrade counts once there; routed WebSocket messages do not count again as front-Worker requests. Asset traffic, logs, retries and other account projects still need account-level checks. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

There is no automatic paid upgrade or gameplay downgrade. Storage failures withhold success frames, restore the last committed checkpoint, and close affected sockets with a transient service failure. The browser retries within its grace window, then stops and explains recovery expiry. A platform quota rejection before the Worker runs may expose only a connection failure. Local injected failures validate safe handling, not Cloudflare's hosted quota response.

## N4G deployment and separate-network checklist

1. Obtain explicit account/deployment authorization. Confirm Free plan, current allowances, exact origin configuration, preview namespace isolation and rollback revision. Never expose resume tokens in URLs, logs, screenshots or reports.
2. Open four desktop clients across at least two independent internet connections, including a restrictive network if available. Record browser/OS, build/course hash, server revision, approximate latency and test date.
3. Complete a standard map with real shots, then a tournament; verify scores, timers and results on all clients. Join a spectator mid-map and confirm promotion only on the next map.
4. Close the controller during play. Confirm the remaining players continue with unchanged deadline/scores and one connected controller. Return the former controller within grace and verify it does not reclaim controls automatically.
5. Interrupt a guest network, return within grace, then repeat beyond grace. Check same-seat recovery versus an explicit fresh join. Duplicate the tab identity and verify rejection without an extra seat.
6. Background a client for at least two minutes; return and compare room time, deadlines and roster. Record actual browser throttling. Repeat with measured network latency/loss; distinguish proxy-injected delay from real internet measurements.
7. Verify WSS, exact-origin rejection, malformed/old-version rejection, full room and reserved capacity. Exercise an isolated preview restart/compatible rollout and confirm checkpoint recovery. Test incompatible rollback behavior without destroying retained checkpoints.
8. Inspect provider analytics for request units, duration, storage reads/writes/bytes and errors over a measured active game and an idle retained room. Replace the estimates above with observed rates; check alerts and failure behavior near a deliberately bounded test quota. Do not exhaust a shared production allowance.
9. Record rollback outcome and current-head CI. N4/Q1 remain incomplete until this hosted evidence is accepted.
