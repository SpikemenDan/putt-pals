# A1 procedural audio handoff

Issue: https://github.com/SpikemenDan/putt-pals/issues/10 . PR: https://github.com/SpikemenDan/putt-pals/pull/25 . Initial implementation commit: 263b367. Worker/coordinator/integration owner: Codex root / arshakir, branch agent/a1-procedural-audio, isolated worktree /private/tmp/putt-pals-a1. Base: accepted main 1387c22; C1 interfaces and S1 event payloads inspected. The user requested completing the next eligible task in the established implementation/commit/push/PR/review/CI/merge/post-merge workflow. This bounded assignment is A1; no deployments, paid provisioning or other backlog implementation.

## Delivery

- src/audio/adapter.js, recipes.js, index.js and README.md: literal legacy procedural recipes behind an injected, application-owned WebAudio domain-event adapter. Lazy gesture unlock, persistent mute/preview, camera listener, shared simulation-to-world conversion, remote sound policy, explicit event mapping and bounded voice ownership.
- tests/audio.test.cjs: nine deterministic instrumented-node scenarios, including recipe-level reference parity for all eleven cues, actual simulation shot/sink consumption, modern/legacy WebAudio positioning, concurrent unlock, mute/denied storage, failed creation/resume, capacity, twenty room resets and full disposal.
- package.json and CI add test:audio. No dependency/lockfile, simulation, shared contract, network, course or legacy HTML changes. The test reference VM is migration-only, like existing parity harnesses; production code imports literal recipes and never executes legacy source.

The adapter is reused across rooms. resetSession releases all voices; dispose removes handlers/nodes and closes its owned context exactly once. There are no new sound assets or a library upgrade. Existing synthesis parameters, master gain, noise length, spatial model and mute key are preserved. Graph cleanup is explicit; no sounds queue while locked and muted voices are stopped to avoid stale tails.

## Verification

- npm ci --ignore-scripts --offline: passed using existing locked dependencies, zero audit vulnerabilities.
- npm run test:audio: nine scenarios passed. All eleven legacy waveform/filter/envelope/start-stop signatures matched the reference. No real-browser listening claim.
- npm run build and node scripts/inventory-baseline.cjs --check: passed; embedded scripts and baseline inventory are unchanged.
- Full npm test: passed end-to-end, including check, shared contracts, simulation/session/network/audio, courses, CLI/solver parity, physics/mechanics and solo/practice/tournament/four-client jsdom smoke suites. Full output was captured locally in /private/tmp/a1-npm-test.log.
- Adapter syntax and git diff --check passed.

## Integration and remaining validation

The embedded browser remains unchanged. I1 must create one audio adapter per app, bind gestures once, consume local domain events once, derive remote stroke/completion events once, supply world camera vectors and course origins, map banner/putt transitions, update mute UI, reset on room departure and dispose on app teardown. Do not run both legacy snapshot inference and the new event playback. Preserve the legacy significance filter when routing bounce events; use post-collision speed. A timed-out sink and standalone timeout must not both trigger the same completion. HIO fanfare remains a separate banner cue.

Real-browser listening, sound balance, spatial feel, autoplay permissions and integrated join/leave behavior are not established by fake node checks. These remain explicit downstream I1/T1/manual release gates. This A1 delivery does not complete UI/audio browser integration or migration milestones. src/audio/README.md documents accepted event shapes, ownership and limits.

## Coordinator review and acceptance record

Coordinator review checked literal recipe parity, event directions/coordinates, one context per application, synchronous gesture resume, shared pending unlock/failed-context cleanup, mute persistence/preview, owned ended callbacks/nodes, partial allocation failure, idempotent unbind/reset/dispose, source capacity and downstream scope. No independent reviewer identity or real-browser listening is implied by this review.

PR #25 must pass current-head baseline-ci and merge under the user's bounded completion authorization. The associated status/roadmap acceptance records are effective only after merge and merged-main verification, which are recorded in #10. Current-head CI and final commit/merge identities are recorded in PR #25; do not infer hosted results from local tests. Real listening/autoplay remains the separate downstream gate described above.
