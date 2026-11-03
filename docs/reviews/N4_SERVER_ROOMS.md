# N4 server-room acceptance and capacity

Starting revision: `3cbee66` (2026-10-31). N4D #122, N4E #123, and GM1 #119 are merged. This report covers local evidence; N4G deployment and separate-network acceptance remain gates.

## Hosted continuation and admission fix — 2026-11-02

This section supersedes the earlier unresolved full-map timeout and unauthenticated-provider status below. Separate-network validation was explicitly deferred by the user; Firefox was on the same Mac/internet connection as the automated Chromium clients.

### Hosted results

- `NODE_PATH=/private/tmp/putt-pals-n4-status/node_modules node /private/tmp/putt-pals-n4-status/node_modules/@playwright/test/cli.js test --config /private/tmp/putt-pals-n4-hosted/playwright.config.cjs multiplayer --project chromium`: **PASS**, one test, 2.8 minutes. Four isolated clients completed six physical simulated shots each, all clients agreed on scores/results, and traffic used hosted same-origin WSS. Run by itself after closing the other browser runs. Earlier concurrent-run timeout did not reproduce; resource contention is a plausible cause, not a proved diagnosis.
- Manual Firefox/macOS plus three automated Chromium clients, room `N4G9275`: six-putt map completed. Automated scores were `[1,1,1,1,1,1]`; manual scores were `[3,3,1,3,5,1]`, including a timeout on putt five. User confirmed reload/rejoin retained scores `[3,3,1,3]`. All clients used one internet connection; this does not fulfill the independent-network criterion.
- `NODE_PATH=/private/tmp/putt-pals-n4-status/node_modules node /private/tmp/putt-pals-n4-hosted/recovery-rollout.cjs`: final **PASS**, 22:53:04–22:53:32 UTC. Two browser clients completed a synthetic-score putt, then crossed immediate maintenance/game Durable Object code updates with forced socket closure. Both resumed on new sockets with identical player/session identities, completed scores, putt/round and absolute round start. One connected controller was consistently elected; automatic succession may change the controller after both sockets disconnect. The restored backend accepted score commands and advanced another putt. This verifies compatible hosted code-update recovery, not every possible provider crash.
- Maintenance API admission returned **503**, `Cache-Control: no-store`, `Retry-After: 60`; bounded polling allowed approximately 2.37 seconds for rollout propagation. Static HTML remains asset-served under the current routing rules; do not expect `/` to return 503.
- Harness iterations: an initial connected-socket-only comparison passed but was insufficient proof of fresh recovery; a stronger iteration hit propagation delay and safely restored the game; another incorrectly required the previous controller despite both clients disconnecting. The final test explicitly requires new sockets, one valid elected controller, and successful post-recovery commands. No runtime source was changed for these hosted checks.

### Deployment record

| Item | Verified value |
| --- | --- |
| Account / Worker | SpikemenDan / `putt-pals-rooms-preview` |
| Origin | https://putt-pals-rooms-preview.spikemendan.workers.dev |
| Original game version, restored at 100% | `57061c95-7170-4bbf-96bc-55d3cf35e46e` |
| Maintenance version uploaded for acceptance | `56829c13-2e98-4d0f-846c-14bc6137d7ea` (`n4g-maintenance-check`) |
| Final maintenance deployment | `7d4a393a-0b7c-4ddc-89e4-44c09b8f7bab` |
| Final restored game deployment | `d1efb74a-c19b-451e-8204-2c9199377d12` |
| Unchanged SQLite namespace / class | `3bf1f90737004e2186569fad5d7451b4` / `RoomDurableObject` |

The maintenance artifact came from accepted main source; existing deployed backend source-map content matched the checkout's course, physics tuning, room protocol, session and recovery modules after newline normalization. `npm run build`, `node tests/rooms/preview-config.test.mjs`, and `node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config .wrangler/deploy/preview-maintenance.json --outdir .wrangler/deploy/maintenance-bundle` passed before upload. `versions upload --config .wrangler/deploy/preview-maintenance.json --tag n4g-maintenance-check` changed no traffic. The exercise used `rollback 56829c13-2e98-4d0f-846c-14bc6137d7ea --yes --durable-objects-code-update-mode immediate` and restored with `versions deploy 57061c95-7170-4bbf-96bc-55d3cf35e46e@100 --yes --durable-objects-code-update-mode immediate`, both with the generated preview config. No production/custom-domain/paid-plan changes occurred. Final readback confirmed the original game at 100%; HTTPS returned 200.

### Provider observations

Read-only GraphQL queries used the existing Wrangler OAuth login in memory; credentials were never printed or persisted in evidence. Official dataset/units reference: https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/.

Namespace-filtered window **22:30–22:54 UTC**: 16,457 invocation requests, 55.112873856 GB-s duration, 18.973148 CPU seconds, 14 rows read and 253 rows written, with zero exceeded-CPU, exceeded-memory or fatal-internal errors reported. Daily maximum SQLite storage returned **225,280 bytes**. These sampled/aggregated namespace observations include multiple tests and retained rooms; invocation requests are not asserted to be billed request units, and they do not establish a per-human-match cost or an upper capacity guarantee. The idle window 22:54–22:55 returned no rows; treat this as missing/potentially delayed evidence, not zero idle cost. No quota was deliberately exhausted and no paid upgrade was enabled.

### Retained empty-room regression

Room `N4G6342` rejected admission as `history-full`. Local reproduction isolated the cause: `hasSnapshotCapacity` adds the hypothetical connected candidate while retaining a null controller, making the otherwise small snapshot fail protocol validation. A valid successor snapshot was only 1,063 bytes. The local fix selects the candidate as controller in the capacity preflight when the retained room has no controller; existing controller and capacity rules remain intact.

Changed runtime paths: `services/rooms/room-object.mjs`, `tests/rooms/durable-recovery.test.mjs`. The new regression recreates the durable actor after its final member leaves, then verifies new admission, retained session, controller authority and the ability to start voting. `node tests/rooms/durable-recovery.test.mjs` failed at the new admission assertion before the fix and passed afterward. `npm run test:rooms:local` then passed, including build, deterministic storage/admission/queue cases, actual Workerd hibernation/socket-loss recovery, local eight-seat capacity and a four-player six-putt game. The existing build-size warning and local alarm-cancellation diagnostic remain non-failing. `git diff --check` passed. **PR #145 delivers the user-approved fix (`28072ff`); the hosted evidence above is for the original deployment. The fix still needs preview deployment and hosted verification.**

Remaining acceptance: deploy and verify the empty-room fix delivered in PR #145; run four clients across at least two independent internet connections when the user resumes that deferred check; obtain a usable idle-retention measurement if provider data remains absent. N4g #73 and parent #65 remain open.

## Hosted preview checks — 2026-11-02

Target: https://putt-pals-rooms-preview.spikemendan.workers.dev/. The owner confirms deployment. This run used headless Chromium on macOS, with isolated browser contexts on one machine/network. It does **not** establish separate-network acceptance, Firefox/WebKit hosted coverage, or real background throttling.

Temporary harness: `/private/tmp/putt-pals-n4-hosted`, copied from main `6ccbc3d`. The config points directly at HTTPS, disables the local webServer, uses one worker and no retries, and disables traces/screenshots to avoid retaining resume credentials. Existing specs were adapted to WSS and same-origin hosted URL assertions. The join helper recognizes the spectator HUD and allows 30 seconds for hosted admission. A dedicated reconnect check counts connected players rather than historical player records. No production source was changed or redeployed.

Commands (prefix each Playwright invocation with `NODE_PATH=/Users/arshakir/git/putt-pals/node_modules node /Users/arshakir/git/putt-pals/node_modules/@playwright/test/cli.js`):

- `test --config /private/tmp/putt-pals-n4-hosted/playwright.config.cjs --project chromium`: 2 passed, 2 failed, 3.3 minutes. Protocol rejection and delayed-frame synchronization passed. Full physical-shot map timed out waiting for putt 2 after 90 seconds; its cause is unresolved (including deployed build/physics versus fixture compatibility). The tournament initially failed its spectator visibility helper despite a visible spectator HUD.
- `test --config /private/tmp/putt-pals-n4-hosted/playwright.config.cjs server-room --grep tournament --project chromium`: passed in 2.8 minutes after recognizing the spectator HUD. Three-map tournament completed with a late spectator and controller departure; scores were synthetic protocol reports, not physical strokes.
- `test --config /private/tmp/putt-pals-n4-hosted/playwright.config.cjs hosted-reconnect --project chromium`: passed in 39.2 seconds after correcting the connected-player assertion. Four isolated clients joined; controller departure transferred control; a guest went offline for two seconds with socket closure, then reconnected on a new socket with the same identity/session. Three connected players remained; historical departed-player records were preserved. This is a client-side interruption, not a provider restart.
- `curl -I --max-time 20 https://putt-pals-rooms-preview.spikemendan.workers.dev/`: HTTP 200, HTML `Cache-Control: no-cache`.
- `curl -I --max-time 20 https://putt-pals-rooms-preview.spikemendan.workers.dev/assets/index-BCaf2XbM.js`: HTTP 200, `public, max-age=31536000, immutable`. HTML also references `index-CoOa71FS.css`; asset names are observations, not a verified deployed commit/version ID.
- `node /Users/arshakir/git/putt-pals/node_modules/wrangler/bin/wrangler.js whoami`: reports **not authenticated**. No login, restart, rollback, publication or account change was attempted.

Remaining gates: successful full-map physical-shot acceptance (investigate the putt-2 timeout); four players over at least two independent networks; hosted restart/deploy recovery and schema-compatible rollback; deployed version IDs and provider request/duration/storage observations. N4g #73 and parent #65 remain open.

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

Verification on 2026-10-31: `npm run test:rooms:local` passed (including build, deterministic failure/abuse checks, Workerd hibernation/process restart and the Wrangler four-player game). `npx playwright test --project=chromium tests/browser/server-room.spec.cjs` passed all three cases in 202 seconds. PR #129 CI run 41253948924 passed baseline-ci and Chromium, Firefox and WebKit at head `78656be`. The tournament uses the app's explicit Leave command and synthetic score reports; existing multiplayer coverage supplies physical-shot evidence. The delayed-frame test attempts a foreground switch and records whether the browser actually reports the other page as hidden; when the browser remains visible, the report marks background throttling as not exercised rather than claiming coverage. A refreshed headless Chromium run remained visible, so real background throttling still needs a browser/environment that exposes visibility transitions. Current-head CI for the updated test is pending. The existing Vite chunk-size warning and local Workerd alarm-cancellation diagnostic did not fail the checks.

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
