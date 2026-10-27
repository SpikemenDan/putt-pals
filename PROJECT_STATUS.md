# Project status

Last updated: 2026-10-27.

## Current objective

Accepted main (09eaf50) contains the integrated modular app: I1 #12 (PR #31) composes S1, D1, L1, N1, A1, R1 and U1 behind index.html/src/app, while the legacy page stays built until Q1 decides hosting. N2, R2 and T1 are ready; N3 waits on the provider/budget decision and Q1 on the remaining tasks. GitHub issues remain the live assignment source.

Confirmed user decisions: private friend rooms; desktop browsers; no requirement for a single offline HTML; prefer established libraries; support concurrent agent work.

## Repository baseline

- Three original files: putt-pals.html, tools.js, HANDOFF.md.
- No package.json, lockfile, standard build, or CI configuration found in the initial review.
- HTML contains Three.js r128 and PeerJS plus application code.
- Historical roadmap says P1–P32 done; P33–P61 unfinished. This is historical status, not fresh verification.
- 22 maps in the actual code; six starters and 36 starter putts.

## Initial review verification (historical)

| Command | Result |
| --- | --- |
| node --check tools.js | Passed |
| node tools.js check | Passed: syntax, 22 maps, no empty slots, starter par/penalty/time metadata |
| node tools.js surfaces | Passed: all 19 surface/timer checks |

Not run during this review: cups, mechanics, full/fast solver suites, rank, jsdom smoke, multiplayer smoke, real browser rendering, audio, real-network multiplayer. Historical pass counts in HANDOFF.md are not new results.

## Known issues and evidence

1. Fixed in B2: tools.js solve() previously initialized velocity with pw * 820 while game launch() used POWER=900. It now delegates to the same launch function. Exhaustive difficulty measurements still need recomputing.
2. LADDER contains recorded counts; rank checks those historical counts rather than recomputing current physics difficulty.
3. Legacy reference tools/exporters still couple to HTML source markers. Modern CLI commands now import course data/simulation directly; browser migration remains pending.
4. Historical architecture notes contain old constants such as R=6 and MAXS=8. Current game has R=5 and unlimited strokes within the timer, with timeout rules. Prefer current code and validated behavior.
5. Multiplayer clients report gameplay state; host coordination does not provide anti-cheat. Host migration is absent, and relay configuration is currently manual.

## Next implementation action

Use the live issue queue and confirm ownership before implementation. N1 #11 is delivered through PR #24; do not duplicate its adapters or score-contract fixes. See docs/reviews/N1_TRANSPORTS.md. Browser adoption and real-WebRTC validation remain downstream gates, not claims made by N1. A1 is owned by Codex root and delivered through PR #25; do not claim duplicate audio work. I1 is integrated (PR #31) and D1 closes with it. N2, R2 and T1 are eligible subject to live claims; N3 and Q1 remain blocked. No new task is launched by this status update.

## B2 verification — 2026-10-25

- node --check tools.js and node --check tests/solver-baseline.cjs: passed.
- node tools.js check: passed, 22 maps and 36 starter putts.
- node tools.js surfaces: 19/19 checks passed.
- node tools.js cups: 7/7 checks passed.
- node tools.js mechanics: 8/8 checks passed with the corrected solver.
- node tests/solver-baseline.cjs: launch initialization passed at nine angle/power combinations; solver delegation passed for the candidate and nine robustness trials; all 36 starter putts have robust shots at POWER=900.
- Measured solutions: tests/fixtures/solver-baseline.json includes source hashes, robustness offsets and zero-based map/putt indices. Regenerate with node tests/solver-baseline.cjs; it deliberately overwrites the measured fixture. These are first-robust-shot results, not full difficulty counts.
- Gameplay HTML and physics remained unchanged. Browser/jsdom/multiplayer checks were not run for B2. B2 installed no dependencies; it was subsequently committed as 3bfaebd at the user's request.

## B3 verification — 2026-10-25

- Installed exact Vite 8.3.5 and jsdom 30.1.3 development dependencies and recorded the dependency tree in package-lock.json. Node engine requirements match jsdom; verified on Node 26.10.0 and npm 11.19.1.
- npm ci --cache /private/tmp/putt-pals-npm-cache --offline: passed, proving reinstall from the lockfile with the populated cache. Initial downloads required network approval. The temporary cache path is only a local verification detail; normal setup is npm ci.
- npm run build: passed; outputs dist/putt-pals.html. The build check compares embedded library/game script content exactly and verifies key UI elements.
- npm run check: passed, 22 maps and 36 starter putts. node --check scripts/check-build.cjs and node --check vite.config.mjs also passed.
- npm run test:smoke: SMOKE PASSED, with no runtime errors.
- npm run test:multiplayer: MULTI SMOKE PASSED, including four fake-network clients, voting, scoring, timeouts and disconnect handling.
- npm run test:physics: all 19 surface/timer, seven cup and eight mechanic checks passed. The npm test component commands were run individually; the full aggregate was not repeated.
- Vite createServer()/preview() HTTP checks: both returned the game successfully on temporary loopback ports; servers closed afterward. Sandbox loopback restrictions required approval for this verification.
- Game HTML hash still matches the B2 fixture. No runtime dependency upgrade or behavior change. jsdom uses stubbed graphics/audio and a fake network; real browsers and real WebRTC remain B1/later acceptance work.
- TypeScript, lint/format configuration, module extraction and CI are not added by B3. README.md documents the available commands and the temporary /putt-pals.html entry URL.
- B3 is committed as 216cd75. Temporary verification servers have been stopped.

## B1 pause and W1 handoff — 2026-10-25

- B1 is PAUSED, not complete: user held it to define the GitHub workflow. No browser reference screenshots or maintained inventory artifacts were created.
- Source inspection found Three.js r128/MIT and PeerJS 1.5.4/MIT metadata. This does not constitute browser verification.
- Browser inventory had native Firefox available, but selecting it returned “Computer Use permissions are not granted.” No permission changes were made. The local Vite server started for B1 was stopped after the user held the task.
- W1 adds docs/GITHUB_WORKFLOW.md, GitHub Agent task and PR templates, and a baseline-ci workflow. The workflow uses the already-existing npm commands; no application/dependency changes are part of W1.
- GitHub issues become the live owner/status record once created. TASKS.md is a coordinator-maintained roadmap/history snapshot; PROJECT_STATUS.md records accepted integration state. This avoids competing edits by workers.
- User approved committing and pushing W1's files. Hosted CI acceptance remains pending. Branch protection, task issue creation and agent dispatch are separate setup steps and have not been performed. This explicit bootstrap approval covers a direct push; subsequent tasks follow the PR workflow.
- Local W1 verification: YAML syntax parsed for both YAML files; CI job name, unique form field IDs and npm script references checked. npm run check, npm run build and git diff --check passed. These checks do not establish GitHub schema acceptance or a hosted runner result; physics/smoke implementations were unchanged and their suites were not repeated.

## B1 review handoff — 2026-10-25/26

- User resumed B1 and explicitly requested Chrome after Firefox access problems. Seven unedited Chrome screenshots are saved under tests/fixtures/browser-baseline/ with a manifest containing source hashes, dimensions, capture context and limitations.
- Real UI evidence: landing, solo lobby, six starter cards, actual rendered Switchback Garden, Ball/Hole/World cameras, one pointer-driven stroke, live scorecard, Escape close and sound/quality control labels. Sound and quality were restored to On/High. No successful sink or full browser game completion is claimed.
- docs/BASELINE.md inventories implemented behavior with source/jsdom/Chrome evidence separated. docs/THIRD_PARTY.md records Three.js r128 (0.128.0 inferred)/MIT and PeerJS 1.5.4/MIT source metadata and attribution limits.
- scripts/inventory-baseline.cjs generates/checks tests/fixtures/source-inventory.json: source/library hashes, all 22 course definitions' rule/geometry inventory and six representative one-stroke traces using real launch/step functions. Headless trace conditions are explicit and not a real input replay.
- Commands: node scripts/inventory-baseline.cjs --write; node scripts/inventory-baseline.cjs --check; node --check scripts/inventory-baseline.cjs; git diff --check. Passed. No dependency or game/tool changes required.
- Chrome showed blank content after reload; HTTP still served the game, and a later native capture failed with ScreenCaptureKit -3812. Root cause unresolved. Practice/results/tournament completion, console audit, audio quality, actual performance and real WebRTC/TURN are not browser-verified by B1.
- Hosted Baseline CI run 40247672160 succeeded for b333495: https://github.com/SpikemenDan/putt-pals/actions/runs/40247672160. This verifies W1's existing headless/build workflow on GitHub, not the new B1 artifacts.
- Status: REVIEW, not DONE; user approved the B1 commit and branch push. PR creation, integration and merge approval remain pending. No GitHub issues/PRs/settings changes or agent dispatch performed for B1.

## Update format for future owners

Append the date, task ID, concrete changes, exact verification commands/results, known failures and next dependency. Keep planned work distinct from completed/verified behavior. Do not include credentials or private relay tokens.

## C1 verification — 2026-10-25

- Implemented pure shared contracts and mocks in `src/shared/`:
  - `constants.js`: physics constants ($R=5$, $CUP=15/8$, $POWER=900$, $\Delta t=1/240$, drag coefficients), course limits, tournament starters, protocol version ($1$), player colors.
  - `coords.js`: bidirectionally tested transforms between simulation ground plane ($[x,y,z]$) and Three.js 3D world space ($[x, y+R, z]$).
  - `scoring.js`: pure calculation for timeout scoring ($Math.max(strokes, par + penalty)$), scorecard summaries, and tournament rankings with tie-breaking.
  - `courses.js`: schemas and validation for putts and courses, enforcing starter course constraints and time limits ($120..600$s).
  - `protocol.js`: message schemas and boundary validators for player presence, room snapshots, and guest votes.
  - `simulation.js`: pure player simulation state record factory, $applyShot$ launch physics, and typed domain events.
  - `session.js`: session phases, game modes, commands, and deterministic voting resolution with tie-breaking.
  - `transport.js`: connection states and room transport contract interface.
  - `render.js`: camera modes, immutable render snapshot factory, and AABB sightline obstruction raycasting for wall fading.
  - `mocks.js`: high-fidelity `MockSimulation`, `MockTransportHub`, and `MockTransport` for parallel consumer testing.
- `src/package.json`: configured `{"type": "module"}` to ensure seamless ES module imports without Node typeless warnings or impacting root CommonJS tools.
- `tests/contracts.test.cjs`: 9 test suites covering all modules, roundtrip transforms, scoring rules, schemas, and mocks. Passed 9/9.
- `package.json`: added `test:contracts` script and integrated it into `npm test`.
- `ARCHITECTURE.md`: updated with full contract specifications.
- Regression verification: `npm run check`, `npm run build`, `npm run test:physics`, `npm run test:smoke`, `npm run test:multiplayer`, and `npm test` all passed with zero errors.

## S1 verification — 2026-10-25

- Extracted headless simulation engine in `src/simulation/`:
  - `physics.js`: pure math and dynamics functions without global closures or browser APIs.
  - `engine.js`: `SimulationEngine` managing step loops, domain events, snapshots, and player states.
  - `index.js`: unified module interface.
- Bitwise parity verified against legacy fixtures:
  - All 6 starter reference traces from `tests/fixtures/source-inventory.json` matched at every recorded tick ($t=0, 240, 480$) and identical sink ticks ($562, 350, 555, 498, 217, 222$).
  - All 4 mechanic arena chambers (fan, teleporter, jump pad, tornado) verified to sink when active and fail when stripped.
  - All surface drag roll distances matched legacy values exactly ($turf=261.1, sand=75.0, ice=1699.7, slime=43.8$).
- Added `tests/simulation.test.cjs` and `npm run test:simulation`.
- All checks (`npm run check`, `npm run build`, `npm run test:contracts`, `npm run test:simulation`) pass with zero errors.

## Issue/backlog reconciliation — 2026-10-26

- GitHub backlog created with agent-task, status:ready/status:active/status:blocked/status:review and optional labels, plus native blocked-by links. See docs/ISSUES.md for every issue URL. Seventeen issues exist; C1 #3 and S1 #5 are closed after integration, while D1 #8 remains active and incomplete.
- 4327196: canonical shared scoring keeps a zero penalty, and voting matches legacy round-rotating tie-breaking with invalid/disconnected filtering. C1 issue notes were updated; these fixes supersede the original contract snapshot.
- 543c383: actual committed catalog files are root index.js, legacy.js, legacy-adapter.cjs and courses.test.cjs; the intended src/courses/ and tools/ directories are absent. node courses.test.cjs exits 1 (cannot resolve ../tools/legacy-adapter.cjs). The issue records path repair, runnable test wiring and remaining CLI/consumer work. The commit message alone is not passing-test evidence.
- Root contracts.test.cjs, scoring.js and session.js copies from 4327196 are tracked separately by C2 #19. This cleanup has disjoint root-file ownership from D1; canonical src/shared/ is integration-owner controlled.
- Verified on current main: npm run test:contracts, npm run test:simulation and npm run check passed. The failed course entry point was explicitly reproduced. No source, dependency, gameplay or CI implementation was changed by this coordination task.
- T1 #15 records that the current workflow lists legacy steps explicitly and does not yet run new contract/simulation scripts merely because npm test includes them. Q1 #18 additionally waits for B4/C2 completion. Native prerequisite links and human decision gates both matter.
- Agent guide, README, issue template, GitHub workflow, issue index and roadmap now tell workers to select/claim issues, inspect existing claims/dependencies, and report progress on their issue/PR. Branch protection and agent dispatch were not changed.

- Reconciliation cutoff extended to 9cdd12e (stale course metadata detection). The follow-up changes root courses.test.cjs/index.js/legacy-adapter.cjs and adds root stale.js; intended module placement is still not repaired. Re-running node courses.test.cjs still exits 1 with the adapter import error. D1 issue updated; no implementation changes made by this coordinator.

## C2 and scoped D1 layout cleanup — 2026-10-26

- Worker/integration owner: Codex root. User confirmed no other agents are working and authorized committing this bounded cleanup directly on main; no PR merge or history rewrite is claimed.
- Moved index.js/legacy.js/stale.js into src/courses/, legacy-adapter.cjs into tools/ and courses.test.cjs into tests/, preserving file content. Removed only byte-identical root scoring.js/session.js/contracts.test.cjs copies after auditing imports; canonical src/shared/ and tests/ implementations are unchanged.
- Added npm run test:courses to npm test and explicit contract/simulation/course steps to CI. No new dependencies or gameplay/physics changes.
- D1 remains partial: the adapter still uses legacy VM/source extraction; full geometry, shared consumers and CLI migration remain required. T1 real-browser/integration coverage is also unfinished. Hosted CI and real-browser/network validation are not claimed by local checks.
- Verification: npm test passed end-to-end (check, contracts, simulation, courses, physics, solo/practice/tournament smoke and four-client fake-network smoke); npm run build passed with embedded scripts preserved; node scripts/inventory-baseline.cjs --check passed. All 10 catalog checks passed. CI YAML parsing/script-reference checks, byte-for-byte relocation checks and git -c core.whitespace=cr-at-eol diff --check passed.

## Accepted D1/L1 integration — 2026-10-26

- D1 data/CLI: PR #22 merged as 8dcf760; docs/reviews/D1_DATA_CLI.md records geometry, normalized schema/IDs, CLI file inputs, solver/arena parity, provenance and remaining browser gates. D1 #8 remains open; do not repeat the delivered ports.
- L1: PR #23 merged with user approval as adf2045, including 448f44f and ebab634. Pinned XState 5.33.3; explicit clocks/host guards; voting, synchronized starts, six-putt cards, uncapped scoring, 3/6/9-map totals, spectators/disconnects and practice/replay. test:session is wired into npm test and CI.
- Latest PR-head CI passed: https://github.com/SpikemenDan/putt-pals/actions/runs/40355229967 . Full local npm test/build and inventory/export checks passed before merge. On merged main, locked offline npm ci, npm run test:session (14 scenarios), npm run test:contracts and npm run build passed. No new browser/real-network adoption validation is claimed.
- Post-merge baseline-ci passed on adf2045: https://github.com/SpikemenDan/putt-pals/actions/runs/40356477704 .
- L1 #9 is closed after accepted integration; N1 #11 is ready for coordinator-confirmed claim. N1 must preserve identity binding and reconcile the shared protocol/helper's 99-score limit before networking L1. The module preserves larger stroke counts locally; shared contracts were not silently changed.
- I1/browser integration, real networking/recovery/TURN and B4 fresh difficulty measurements remain unfinished. No downstream module or production rollout is completed by this integration.
- This coordinator edit writes PROJECT_STATUS.md and TASKS.md with LF as required by .gitattributes. Unrelated ARCHITECTURE.md line-ending artifacts are excluded.

## N1 branch handoff — 2026-10-26

- Implementation commit 72b7498, branch agent/n1-transports, worker/integration owner Codex root. User authorized the claim, implementation, commit, documentation update and branch push. N1 remains unmerged; no release or downstream acceptance is claimed.
- Solo/in-memory/injected PeerJS adapters, connection-bound commands, version/session/round/putt/sequence validation, bounded JSON snapshots and host-to-L1 bridge. Movement is batched at 70 ms. Shared timeout/protocol checks preserve scores above 99 and zero penalties.
- Full npm test, npm run build and node scripts/inventory-baseline.cjs --check passed. Final npm run test:network passed nine fake-transport scenarios; contract and 14-scenario lifecycle checks also passed. Hosted CI, actual WebRTC and real-browser adoption were not run for this branch.
- README, architecture, workflow/issue/roadmap snapshots and review handoff are updated together. No PR creation, merge, deployment or paid provisioning is authorized by this push. I1/N2/N3/T1 and B4 remain open under their own gates.

## N1 accepted-integration record — PR #24

This record becomes effective only when https://github.com/SpikemenDan/putt-pals/pull/24 is merged after successful current-head baseline-ci; before that N1 remains REVIEW. The user explicitly requested completing N1 after PR/review/CI/merge/post-merge steps were explained, authorizing those bounded operations.

N1 delivers the documented transport/host bridge and uncapped-score contract, including regression rejection of inherited-property command names. Local network/contract/session/build/inventory checks pass; full local regression evidence is above. CI and merge results are linked from PR #24 and issue #11. Post-merge verification is recorded in the issue. Accepted N1 makes its code prerequisite available to I1/N3; I1 still needs its other modules and N3 still needs its provider/budget assignment. Browser adoption, actual WebRTC, recovery and TURN remain separate acceptance work.

## A1 accepted-integration record — PR #25

This record becomes effective only after PR #25 merges following successful current-head CI and merged-main verification recorded in #10; until then A1 is ACTIVE/REVIEW. Base main 1387c22, worker/coordinator Codex root. The user requested completing the next task in the established implementation/commit/push/PR/review/CI/merge/post-merge workflow, bounded to A1.

A1 extracts the existing eleven procedural sounds behind a domain-event adapter with injected context/storage/randomness, one context per app, gesture unlock, persistent mute, world-space listener positioning, shared coordinate conversion, bounded voices and explicit teardown. Nine deterministic audio scenarios preserve legacy synthesis signatures and verify failure handling, ended-node release and twenty room resets. Build and baseline inventory pass; full regression/hosted CI results and exact commands are recorded in docs/reviews/A1_AUDIO.md and PR #25. No dependency, physics or legacy HTML changes.

Actual listening, sound balance, browser autoplay and integrated room joins/leaves remain unverified I1/T1/manual acceptance; no browser audio adoption or deployment is implied. Audio consumers must preserve legacy bounce significance filtering and emit each timeout/banner/remote stroke once. A1's code prerequisite becomes available to I1 on accepted merge, without unblocking its other missing modules.

N1 follow-up evidence: post-merge baseline-ci passed on 1387c22, https://github.com/SpikemenDan/putt-pals/actions/runs/40386990190 . This confirms the earlier N1 integration record; no new browser/network validation is implied.

## R1/U1 integration and coordinator cleanup — 2026-10-27

- R1 merged via PR #27 (f72a374) and U1 via PR #29 (e7a59ed); both passed hosted CI before and after merge. Handoffs: docs/reviews/R1_RENDERER.md, docs/reviews/U1_UI_INPUT.md.
- Known issues found during U1: (1) `npm run build` drops standard `backdrop-filter` from the legacy page, so built glass panels lose their blur in Chrome/Firefox (dev server unaffected; the build check does not cover CSS); (2) `PLAYER_COLORS` in src/shared/constants.js does not match the game palette. Both are assigned to I1.
- Real-browser evidence so far: U1 Chromium pixel parity for menus/HUD (scripts/ui-visual-parity.cjs). Real WebGL output, audio and WebRTC remain unverified until I1/T1.

## I1 integration — 2026-10-27

- I1 merged via PR #31 (09eaf50); current-head and post-merge baseline-ci passed (run 40591136455). Local `npm test`, `npm run build` and `node scripts/inventory-baseline.cjs --check` passed. Handoff: docs/reviews/I1_APP.md; overview: src/app/README.md.
- D1 #8 closes with I1: its remaining browser-adoption scope was delivered there.
- Both U1 findings are fixed in I1: the build no longer minifies CSS, so standard `backdrop-filter` survives (asserted by scripts/check-build.cjs), and `PLAYER_COLORS` is now the game palette.
- Unblocked: N2 and R2 are READY; T1 stays READY and can now cover the integrated app. N3 stays BLOCKED on the provider/budget decision; Q1 stays BLOCKED on N2, N3, T1, R2 and B4.
- Not verified: Firefox/WebKit, real GPUs and frame rate, WebRTC across separate networks/TURN, guest recovery and real-browser audio listening. Hosting index.html instead of the legacy page is a Q1 decision.
