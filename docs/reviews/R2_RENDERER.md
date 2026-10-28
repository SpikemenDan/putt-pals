# R2 renderer upgrade handoff

Status: implementation prepared for the user-approved commit on `agent/r2-three-upgrade`, base `1c7cc6b`. Push, PR, merge and accepted integration remain pending. Issue: https://github.com/SpikemenDan/putt-pals/issues/16 . Worker/coordinator: arshakir / Codex root. User confirmed resuming this session after an apparent ownership overlap; no second worker was launched here.

## Scope

Pin Three.js from 0.128.0 to 0.186.1. Keep the legacy HTML, simulation, course geometry, network and camera rules unchanged. Modernize display output and canvas texture color spaces, apply output chunks to custom effects, compensate the removed legacy light multiplier, and release PMREM render targets and shadow resources. Renderer diagnostics return detached counters for the profiling harness.

Owned changes include `src/render/`, package/lockfile as integration owner, renderer tests/probe/evidence and this handoff. A bounded adjustment to `tests/app.test.cjs` replaces the obsolete requirement that npm Three.js equals embedded r128: it now checks the pinned revision and compares legacy object topology/transforms/authored primitive dimensions/material kinds on all 22 maps. Historical exact geometry/shader parity is still tested independently against injected r128, while modern shader compatibility has its own suite. `tests/browser/render-migration.spec.cjs` tests a WebGL1-only desktop's graceful fallback. No shared status docs were changed.

## Migration sequence and sources

Local install + `node tests/render-modern.test.cjs` + `npm run build` passed at 0.138.3, 0.148.0, 0.158.0, 0.168.0, 0.178.0 and 0.186.1. Each step builds 52 putts and exercises 1,087 cup patches. These are local checked stages, not intermediate commits or hosted CI runs.

Consulted the [official migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide) and [maintainer lighting migration](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733). Relevant changes: r152 output/texture color spaces, r154 output shader chunks, r155 light intensity scaling, r158 bump mapping, r163 WebGL2 requirement and subsequent PBR/shadow changes. Current PBR shading intentionally differs; no exact pastel color match is claimed. Bump values were not retuned. WebGPU, a scene-framework replacement and the V1 art redesign are outside scope.

## Browser profiling

The user selected **this Mac, target 60 FPS** in this session: MacBookPro18,3, Apple M1 Pro (8 CPU / 14 GPU cores), 16 GB RAM. Chrome reports the real ANGLE Metal Apple M1 Pro renderer. The separate Windows laptop/Radeon/RTX note in the live issue was not measured on this Mac; this evidence must not be presented as verification of those GPUs.

Reproduce with dependencies installed, no other GPU workload running, and Chrome visible:

```sh
npx vite --force --host 127.0.0.1 --port 4174 --strictPort
node tests/render/profile.cjs test-results/render-profile
```

The probe requires the loaded revision to match package.json, preventing stale Vite optimization results. It runs at 1280×800 CSS pixels, DPR 2 (2560×1600 framebuffer), high quality/shadows, seven remote actors, names/auras and an aim guide. Each starter gets 60 warmup + 300 measured animation frames. Reports distinguish RAF intervals from CPU render-submission duration; neither is a GPU timer query or complete app frame profile. All 52 putts compile/render, then 12 identical map rebuilds check the resource plateau. Final effect/camera frames exercise trail/confetti and the three camera views.

Before report: `tests/fixtures/render-migration/r128.json`. It used the same migration-compatible renderer/probe with the original pinned library; compatibility branches preserve r128 shaders/light values. Its maximum recorded RAF interval was below 10 ms for each starter. The final after report is `tests/fixtures/render-migration/r186.json` and includes source hashes for the renderer and probe. One before/after Switchback screenshot pair is retained beside the reports; all six local captures remain in ignored `test-results/render-before/` and `test-results/render-after/`. Images are unedited browser captures. Camera/object layout remains recognizable; color management makes tree colors and PBR highlights differ. Dense remote-name overlap exists in the baseline too.

A first attempted baseline probe failed after starter captures because backlog courses can have no putts array; iteration now treats them as one build. An initial after probe was rejected on inspection because Vite served cached r128. Forced optimization fixed it; the revision guard prevents recurrence. Those failed/stale runs are not acceptance evidence. A preliminary after performance run overlapped browser checks; final uncontended measurements replace it.

## Verification and remaining gates

- `npm run test:render`: historical 12-scenario parity suite plus installed-library migration suite.
- `npm run test:app`: 12 scenarios passed after replacing the obsolete r128 version assumption.
- `npm run build`: passed at every staged version; legacy scripts/CSS remain byte-for-byte, modular page/assets present. Existing large-chunk warning remains; final bundle is larger than r128.
- `node scripts/inventory-baseline.cjs --check`: passed; unchanged legacy sources, all 22 courses and six traces.
- `npm test`: passed end-to-end (including all local contract, simulation, lifecycle, networking, audio, rendering, input, UI, app, course, CLI, physics, integration and legacy solo/multiplayer suites). The final strengthened dimension assertion was rerun separately with `npm run test:app` (12 scenarios, passed); no production code changed afterward.
- `npx playwright test solo.spec.cjs input.spec.cjs practice.spec.cjs webgl-unavailable.spec.cjs --project=chromium --project=firefox --project=webkit`: 14 passed, 1 expected WebKit capability-disable skip, 13 minutes. Built modular app, real browser engines, actual pointer input, replay, full six-putt maps and real two-minute timeout scoring. No console/page errors in the successful normal-rendering flows. WebKit is Playwright's engine, not an actual Safari release.
- `npx playwright test render-migration.spec.cjs --project=chromium`: 1 passed. WebGL1 verified available, WebGL2 fault-injected unavailable; notice/solo UI remain usable and renderer stays null without page errors.
- Syntax checks for the new scripts/spec and `git diff --check`: passed.

The user approved committing this delivery after its explanation. Hosted CI, PR, merge, real Safari, separate integrated/discrete Windows GPUs and production deployment remain unperformed. Keep the issue active until review evidence and acceptance are settled; do not unblock art/release work solely because local code exists.

## Final M1 Pro measurements

Final Chrome probe exited successfully with the other test browsers stopped: all six average RAF intervals meet the 16.7 ms budget; no page/console errors; 52 putt builds and 12 repeated rebuilds. The final three resource samples are identical (100 geometries, 24 textures, 21 programs). These are renderer counters, not measured GPU bytes or proof of zero driver allocations.

| Starter | Mean frame interval (ms) | p95 interval (ms) | p95 CPU render submission (ms) |
| --- | ---: | ---: | ---: |
| Switchback Garden | 8.33 | 9.00 | 4.00 |
| Dune Serpent | 8.33 | 9.10 | 4.10 |
| Frost Hollow | 8.33 | 9.20 | 4.20 |
| Slime Springs | 8.33 | 9.20 | 4.80 |
| Cyclone Ring | 8.33 | 9.10 | 4.70 |
| Grand Finale | 8.33 | 9.20 | 5.40 |

Observed frame pacing remains approximately 120 FPS in this renderer workload. CPU submission p95 increased from the r128 range of 0.8–3.4 ms to 4.0–5.4 ms in the final run; this is not an optimization or a claim of equal headroom. Current Three.js also draws more triangles/passes (33,376 / 141 versus 21,567 / 91 in the repeated-map snapshots). The user-selected 60 FPS frame budget passes on this Mac. Complete-app frame time, other hardware, GPU timer queries and thermal/endurance profiling are separate measurements.

Final lockfile verification: `npm ci --offline --cache /private/tmp/putt-pals-npm-cache` passed; installed-library migration checks, `npm run build`, baseline inventory and scoped whitespace checks passed afterward. The local probe server and test browsers were stopped after recording evidence. The user approved the commit; remote publication and integration remain pending.

## Authorized integration

The user approved pushing and merging R2, with Windows laptop validation moved to [R2w #52](https://github.com/SpikemenDan/putt-pals/issues/52) for the other Windows-capable agent. These measurements do not block this merge; they remain unperformed. Current main `3593c7e` was merged into this branch before CI. PR #51 had accidentally replaced the normal CI with the T1c throwaway diagnostics despite its handoff saying they must not merge. As integration owner, this branch restores the accepted `baseline-ci` and three-engine `browser-ci` workflow from `1c7cc6b`, preserving the diagnostic source/harness and excluding only the explicitly named diagnostic `join repro` from normal CI. T1c source fixes and its open PR #50 remain owned by that worker. Hosted results and final merge evidence belong in the issue/PR.
