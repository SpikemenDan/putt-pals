# N1 transport review handoff

Issue: https://github.com/SpikemenDan/putt-pals/issues/11

Worker/integration owner: Codex root, branch `agent/n1-transports`, isolated worktree `/private/tmp/putt-pals-n1`, based on accepted main `b0dfb04` (C1 plus accepted fixes; L1 `adf2045`). Implementation commit: 72b7498. The user authorized the issue claim/status, local implementation and commit, then requested updating all relevant files and pushing the task branch. This documentation follow-up records that authorization. The user then requested completing N1 after the remaining PR/review/CI/merge/post-merge workflow was explained, delegating those bounded operations. PR #24 records the delivery and CI; issue #11 records accepted merge/post-merge verification. This acceptance record becomes effective only after those checks and merge; while the PR is unmerged N1 is REVIEW. Deployment and paid provisioning remain unauthorized and unperformed.

## Delivered locally

- `src/network/`: common JSON boundary and transport, solo/in-memory adapters, injected PeerJS adapter, host-to-L1 bridge and interface documentation.
- `tests/network.test.cjs`: nine scenarios covering four clients through six putts/results, 150-stroke scores, authority and identity binding, malformed/oversized/incompatible/stale/duplicate messages, validated snapshots, movement cadence, late spectators, capacity/disconnect/host loss, startup failures/timeouts/cancellation and listener cleanup.
- Integration-owner bounded shared changes: uncapped timeout helper and safe-integer presence scores/strokes; deprecated `MAX_SCORE` compatibility export becomes the safe-integer bound. Contract regression tests preserve zero penalty and reject fractional/negative/unsafe wire counts. L1 README's obsolete 99-cap warning is updated; no actor implementation changes.
- `package.json` and `.github/workflows/ci.yml` run `test:network`. No new dependencies or lockfile changes. No HTML, rendering, course or simulation algorithm edits.

The bridge binds events to current connection IDs before invoking L1, publishes authoritative actor snapshots immediately, and batches movement into dirty snapshots at 70 ms. It preserves the existing client-trusted simulation model. This does not authenticate accounts, provide anti-cheat, resume identity, interpolation or host migration.

## Verification

- `npm ci --ignore-scripts`: existing locked dependencies installed, audit reported zero vulnerabilities. Initial offline install failed because XState was not cached; it was not reported as passing.
- `npm run test:network`: passed nine scenarios, including fake PeerJS channels; no real WebRTC claim.
- `npm run test:contracts`: passed all nine groups, including new >99/zero-penalty and invalid-count regression assertions.
- `npm run test:session`: passed all 14 lifecycle scenarios.
- `npm run build`: passed, all embedded scripts preserved byte-for-byte.
- `node scripts/inventory-baseline.cjs --check`: passed; source hashes, embedded library versions, 22 courses and six traces unchanged.
- Full `npm test`: passed end-to-end, including contracts, simulation, session, network, courses, CLI full-grid/robust-solution parity, physics/mechanics and legacy solo/practice/tournament/four-client jsdom smoke suites. After final network boundary/resource refinements, `npm run test:network` passed all nine scenarios again; affected contract/session checks were also rerun successfully.
- `git -c core.whitespace=cr-at-eol diff --check` and syntax checks for every new network implementation module passed. No hosted CI or real-browser/network run is claimed.

## Integration notes and remaining gates

The browser still uses legacy networking. I1 must provide host/guest selection from invitation codes, fresh host session IDs, the existing Peer constructor and signaling/ICE configuration, connect/subscribe/join lifecycle, one host bridge and deterministic teardown. Names are plain text values and must be rendered as text. Local host authority comes from `transport.isHost`; actor snapshots retain the actor's host-view `isHost` field. Guest clocks use timestamp offset without RTT correction.

Raw messages use JSON strings, 64 KiB per envelope, strict version/session/round/putt/sequence checks and a four-link-member room consistent with C1/L1. Retained snapshot history is bounded to 128 entries and the byte limit; `send` returns false for oversized snapshots and reports a rejection through `subscribeStatus` rather than truncating score state. App integration must handle failed sends/end or recreate a room. Invalid inbound messages are dropped; there is no message-rate limiter or resumable identity in this task. Presence replicates ball coordinates/mode/strokes only; future effect messages require a reviewed schema.

Real-browser gameplay, actual WebRTC, restrictive/separate networks, TURN, reconnect, latency/interpolation and deployed-origin behavior have not been run. PR #24 triggers hosted baseline-ci; its current-head CI and merge evidence are recorded there. Post-merge checks are recorded in issue #11; no hosted result is inferred from local checks. Existing source/VM migration reference paths remain untouched. N1 local results do not complete I1, N2, N3, T1, D1's browser adoption, or release gates.

The user-requested documentation follow-up updates README.md, ARCHITECTURE.md, MODERNIZATION_PLAN.md, HANDOFF.md pointers, PROJECT_STATUS.md, TASKS.md, docs/ISSUES.md, docs/GITHUB_WORKFLOW.md and this review handoff. ARCHITECTURE.md is normalized to LF under .gitattributes while correcting current module/scoring descriptions. Historical feature decisions and verification logs are preserved; branch work is explicitly distinguished from accepted main. No product, source, dependency or test implementation changes are made by the documentation follow-up.

## Coordinator review and completion

PR: https://github.com/SpikemenDan/putt-pals/pull/24 . Coordinator review checked protocol direction/identity binding, command allowlists, score/phase/token guards, movement publication, pending-channel capacity, failure/cleanup paths and downstream scope. Review fixed inherited-property command names (`constructor`, `__proto__`, `toString`, `hasOwnProperty`) and added wire regressions; all nine network scenarios pass. No independent GitHub reviewer identity or browser/WebRTC acceptance is implied by coordinator review. Current-head CI must pass before merge; do not bypass repository rules.
