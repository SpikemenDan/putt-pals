# Modernization task ledger

Roadmap and historical integration snapshot, maintained by the coordinator. GitHub issues now own live claims, status, blockers and acceptance; start from docs/ISSUES.md and docs/GITHUB_WORKFLOW.md. The user authorized this backlog reconciliation and its direct push to main. Do not use historical local assignments to claim work that is already owned in GitHub.

Snapshot statuses: TODO, READY, ACTIVE, REVIEW, DONE, BLOCKED, PAUSED. Future tasks are DONE after accepted PR merge and verification; B2/B3 predate the PR workflow. BLOCKED identifies a concrete blocker; PAUSED records a deliberate user/coordinator hold. Workers report in their issue/PR, not by repeatedly editing this file.

| ID | Status | Owner | Depends on | Scope / owned files | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| W1 | DONE | Codex / root | Approved bootstrap commit/push | GitHub workflow docs, templates and baseline CI | b333495 pushed; hosted Baseline CI run 40247672160 succeeded |
| B1 | DONE | Codex / root | Integrated via PR #1 | Baseline inventory and browser references; tests/fixtures | PR #1 merged into main; source inventory and Chrome screenshots recorded |
| B2 | DONE | Codex / root | Authorized 2026-10-25 | Legacy solver correction; tools.js and regression harness | Real launch reused; 36/36 starter putts robust; source-hashed results recorded |
| B3 | DONE | Codex / root | Authorized 2026-10-25 | Integration owner: manifests, lockfile, dev/build/test configs | Lockfile reinstall, Vite build/HTTP checks, physics and both smoke suites passed |
| [C1 #3](https://github.com/SpikemenDan/putt-pals/issues/3) | DONE | Codex / root | B1, B2, B3 | Integration owner: src/shared, ARCHITECTURE.md, package.json, tests/contracts.test.cjs | All contracts implemented in src/shared, tests/contracts.test.cjs passing (9/9 suites), ARCHITECTURE.md updated |
| [S1 #5](https://github.com/SpikemenDan/putt-pals/issues/5) | DONE | Codex / root | C1 | src/simulation, tests/simulation.test.cjs, package.json | Headless simulation matches fixtures bitwise; 6 reference traces and all mechanic chambers pass |
| [R1 #6](https://github.com/SpikemenDan/putt-pals/issues/6) | DONE | Claude | C1 | src/render, src/camera | PR #27 merged f72a374; 52 course builds and live frames match legacy scenes; disposal verified; hosted CI passed |
| [U1 #7](https://github.com/SpikemenDan/putt-pals/issues/7) | DONE | Claude | C1 | src/ui, src/input; React dependency and test wiring | PR #29 merged e7a59ed; legacy text/shot parity, Chromium pixel parity, cleanup verified; hosted CI passed |
| [D1 #8](https://github.com/SpikemenDan/putt-pals/issues/8) | DONE | Codex / root; browser adoption via I1 | S1 | src/courses, tools/cli | Data/CLI via PR #22 (8dcf760); remaining browser-adoption scope delivered by I1 PR #31; closes with I1 |
| [L1 #9](https://github.com/SpikemenDan/putt-pals/issues/9) | DONE | Codex / root | S1, C1 | src/session | PR #23 merged adf2045; 14 fake-clock scenarios, full tests/build and hosted CI pass |
| [A1 #10](https://github.com/SpikemenDan/putt-pals/issues/10) | DONE* | Codex / root | C1 | src/audio; dedicated tests and test wiring | PR #25; nine audio scenarios and eleven-cue legacy parity; effective after green CI, merge and verification |
| [N1 #11](https://github.com/SpikemenDan/putt-pals/issues/11) | DONE* | Codex / root | C1, L1 integrated | src/network; bounded shared fixes and test wiring | PR #24; nine network scenarios/full tests/build pass; acceptance effective after green CI and merge |
| [I1 #12](https://github.com/SpikemenDan/putt-pals/issues/12) | DONE | Claude | S1, R1, U1, L1, A1, N1, D1 | Integration owner: src/app, entry points | PR #31 merged 09eaf50; app flows, build and suite pass; post-merge baseline-ci passed; see docs/reviews/I1_APP.md |
| [N2 #13](https://github.com/SpikemenDan/putt-pals/issues/13) | DONE | Claude (side session) | I1 integrated | src/network reconnect/interpolation | PR #43 merged 3f5d010; guest recovery, 8-player rooms, interpolation and actionable connection errors; real-WebRTC Chromium checks passed (ad hoc); Firefox/WebKit and committed browser specs still to do; see docs/reviews/N2_NETWORK.md |
| [N3 #14](https://github.com/SpikemenDan/putt-pals/issues/14) | PAUSED | — | Superseded by selected N4 WebSocket migration | Historical services/turn-credentials scope; no active work | N3 remains preserved as an alternative, not a prerequisite or fallback |
| [T1 #15](https://github.com/SpikemenDan/putt-pals/issues/15) | DONE | Claude (coordinator session) | C1; I1 integrated, so full browser/integration coverage can target the app | tests/integration, tests/browser | PR #37 merged 26d1025; Playwright solo, input, putt/course practice, lifecycle and four-player WebRTC specs pass in Chromium, Firefox and WebKit on browser-ci (WebKit multiplayer skipped until N3); legacy UI screenshot-parity test dropped (user-approved, V1/M1 replace the pastel look); see docs/reviews/T1_BROWSER.md |
| [R2 #16](https://github.com/SpikemenDan/putt-pals/issues/16) | DONE | Codex root | I1 integrated | src/render; dependency/tests/CI integration owner | PR #53 merged 62482f8; Three.js 0.186.1; Mac renderer probe meets 60 FPS. Windows validation done in R2w #52; washed-out effect shaders are being fixed in R2c #57 (PR #63); see docs/reviews/R2_RENDERER.md |
| [S2 #54](https://github.com/SpikemenDan/putt-pals/issues/54) | DONE | Codex root | S1 | src/simulation/physics.js, dedicated tests/evidence; coordinator test wiring | PR #55 merged 03e4db5; gravity-based cup drop, overshoot/airborne/lip-out regression coverage; 36 nominal / 31 robust starter solutions, difficulty follow-up in Q1 |
| [R2w #52](https://github.com/SpikemenDan/putt-pals/issues/52) | DONE | Claude (side session) | R2 integrated | Windows GPU validation | PR #56 merged 49b74e9; Windows validation in docs/reviews/R2_WINDOWS_GPU.md found custom effect shaders washed out on Three.js 0.186.1 (colour handling, not a driver issue) |
| [R2c #57](https://github.com/SpikemenDan/putt-pals/issues/57) | ACTIVE | Claude (side session) | R2 integrated | src/render/materials.js | PR #63 open; restore r128 effect-shader colours under the new colour pipeline; no restyle |
| [P1 #17](https://github.com/SpikemenDan/putt-pals/issues/17) | PAUSED | — | S1; optional; user-deferred | Isolated physics prototype | Rapier comparison for ramp/drop/tube; Rapier adoption deferred by the user and experiment preserved on agent/p1-rapier-prototype (6ba6115) |
| [Q1 #18](https://github.com/SpikemenDan/putt-pals/issues/18) | BLOCKED | — | N4 #65 plus I1, C2, T1, N2, R2, B4 done | Integration owner: CI, release configuration, docs | Production-like preview, full acceptance matrix, rollback procedure and fresh-checkout instructions |
| [B4 #4](https://github.com/SpikemenDan/putt-pals/issues/4) | DONE | Claude (separate session) | B2 completed | Dedicated difficulty report/fixtures; no physics retuning | PR #28 merged 4e3eb9e; full-grid sweep of 36 starter putts in docs/reviews/B4_DIFFICULTY.md; verified on main and closed |
| [C2 #19](https://github.com/SpikemenDan/putt-pals/issues/19) | DONE | Codex / root | C1 completed | Root contracts.test.cjs, scoring.js, session.js only | Reconcile duplicate shared-contract copies; preserve canonical src/shared and tests/ behavior |
| [I2 #38](https://github.com/SpikemenDan/putt-pals/issues/38) | DONE | Claude (side session) | I1 integrated; found by T1 | src/app startup, src/ui message, dedicated tests | PR #40 merged b449379; jsdom scenario in test:app (start screen, notice, solo play without a renderer); ad hoc Chromium check passed with and without WebGL; post-merge baseline-ci passed (run 40614037187). Committed browser spec and Firefox check moved to I2b #41 |
| [I2b #41](https://github.com/SpikemenDan/putt-pals/issues/41) | DONE | Claude (side session) | T1 harness merged (PR #37, 26d1025) | tests/browser WebGL-fallback spec | PR #45 merged db3245a; committed real-browser check of the WebGL-unavailable notice in Chromium and Firefox; no app behaviour changes |
| [T1c #48](https://github.com/SpikemenDan/putt-pals/issues/48) | DONE | Claude (side session) | T1 integrated | src/network/peer.js, tests/network.test.cjs | PR #50 merged b257e39: host repeats its welcome so Chromium guests don't miss it (fix for intermittent Chromium four-player join timeout in browser-ci) |
| [N2b #47](https://github.com/SpikemenDan/putt-pals/issues/47) | DONE | Claude (side session) | N2 integrated | tests/browser network specs | PR #49 merged 1c719e2; committed real-browser specs for N2 guest recovery, capacity and connection errors (Chromium + Firefox); closed by hand |
| [V1 #33](https://github.com/SpikemenDan/putt-pals/issues/33) | BLOCKED | — | R2 done; umbrella for V1a–V1d | src/render, src/camera, src/ui styling | Original comic toon look with smooth flat colours and no scenery clutter, delivered through V1a–V1d #58–#61; reference on reference/v1-toon-sample; stays open until all four close |
| [V1a #58](https://github.com/SpikemenDan/putt-pals/issues/58) | BLOCKED | — | R2c #57 | src/render, src/camera, src/ui | Toon look foundation (smooth flat-colour surfaces, thick black ink outlines, cel shading) |
| [V1b #59](https://github.com/SpikemenDan/putt-pals/issues/59) | BLOCKED | — | V1a #58 | src/render | Sky world (floating courses, comic clouds, birds, sun flare) |
| [V1c #60](https://github.com/SpikemenDan/putt-pals/issues/60) | BLOCKED | — | V1a #58 | src/render, src/courses, src/ui | Per-map palettes, ambient weather visuals (Frost Hollow snow, Cyclone Ring storm) and restyled fans |
| [V1d #61](https://github.com/SpikemenDan/putt-pals/issues/61) | BLOCKED | — | V1a #58 | src/ui | Comic HUD, scorecard, banners and lobby styling |
| [G1 #34](https://github.com/SpikemenDan/putt-pals/issues/34) | BLOCKED | — | Q1 | src/simulation, src/courses; contract changes via integration owner | Corner wedges, fan/vortex rework, power-up framework and abilities with multiplayer sync; split into sub-issues first. User decisions 2026-10-28: true portal pairs, stronger fans, Wind/Snow/Storm/Lightning as attack power-ups on opponents |
| [K1 #35](https://github.com/SpikemenDan/putt-pals/issues/35) | BLOCKED | — | G1, P1 | src/courses, course data, tests | Floating islands, boundary walls, ramps/drops/tubes, hole-in-one difficulty bands, re-solved starter maps; split into sub-issues first. Per-putt walled islands with designed gaps (user decision 2026-10-28) |
| [M1 #36](https://github.com/SpikemenDan/putt-pals/issues/36) | BLOCKED | — | V1 | src/ui, src/audio, tests | Menu panorama, loading screen with tips, active-ball ring, menu and turn-ready sounds; split into sub-issues first |

## Work allocation

Baseline tasks B1/B2/B3 are integrated. C1 #3 and S1 #5 are closed after integration. D1 data/CLI ports are integrated through PR #22 (8dcf760), with the handoff in docs/reviews/D1_DATA_CLI.md. D1 #8's remaining browser-adoption scope was delivered by I1 (PR #31, 09eaf50), so D1 closes with I1. L1 #9 is integrated through PR #23 (adf2045). Confirm live ownership before resuming any remaining task.

N1 delivery is in PR #24; its review handoff is docs/reviews/N1_TRANSPORTS.md. The DONE* record takes effect only after successful current-head CI and accepted PR merge; before then N1 is REVIEW. A1 delivery is PR #25, with its accepted-integration record below. Use the live ready queue for R1, U1, T1 and B4. C2 cleanup is complete and closed; L1 is integrated. C1/S1 dependencies are integrated; record current accepted contract commits, including 4327196 compatibility fixes. Assign only as many tasks as available agents, and finish/review tasks before creating more work. D1 and L1 follow the simulation. T1 can begin harness work against the contracts and add coverage as implementations land. I1 integrates these paths before networking behavior and library upgrades expand the scope.

## Claim and handoff protocol

1. Coordinator creates/updates the assigned GitHub issue using the Agent task form, confirms eligibility and one worker, and records exact owned paths, branch/worktree, dependencies, contract revision and allowed operations.
2. Worker reads AGENTS.md and docs/GITHUB_WORKFLOW.md, checks the live assignment, and starts in an isolated working directory from current main. GitHub issues are now the assignment source; entries below are historical context.
3. Worker completes assigned scope and hands off through a linked PR with exact verification results, failures and integration notes. Request REVIEW, not DONE; remote writes and commits need applicable authorization.
4. Integration owner reviews, obtains merge approval and merges in dependency order. After verification on main, it closes the issue and updates this roadmap and PROJECT_STATUS.md.
5. Resolve ownership/contract conflicts through the coordinator before editing shared files. Do not let every worker modify the shared progress docs.

## Assignment entries

### B2 — 2026-10-25

- Owner: Codex / root (implementation and integration review).
- Branch/worktree: existing main working directory; exclusive ownership, no concurrent workers.
- Owned files: tools.js; TASKS.md, PROJECT_STATUS.md and AGENTS.md for task status and authorization updates; tests/solver-baseline.cjs and tests/fixtures/solver-baseline.json for regression checks and measured results.
- Scope: reuse the real game launch function in the headless solver, verify shot initialization and run the fast solver across all starter putts. Exhaustive difficulty counts remain M0 follow-up work.
- Historical per-phase confirmation is satisfied for this bounded task by the user's instruction to get started; no feature-roadmap phases are being advanced.
- Changes: extracted the real launch() into the existing headless API and delegated all solver trials to it; added tests/solver-baseline.cjs and source-hashed measurements in tests/fixtures/solver-baseline.json.
- Verification: node --check tools.js; node --check tests/solver-baseline.cjs; node tools.js check; node tools.js surfaces (19 checks); node tools.js cups (7 checks); node tools.js mechanics (8 checks); node tests/solver-baseline.cjs (nine initialization combinations, solver delegation, 36/36 robust starter putts). All passed.
- Integration review: inspected the scoped diff and verified existing headless consumers still pass. No HTML, physics constants, layouts or library versions changed. An initial duplicate accumulator declaration failed the checks and was removed before the passing runs.
- Not tested: real browser, jsdom smoke and real multiplayer. Full difficulty counts remain stale and are not certified by these fast results. The temporary VM harness will be replaced by imports in M1.
- Next dependencies: B1 and B3 remain unassigned; C1 awaits both.

### B3 — 2026-10-25

- Owner: Codex / root, integration owner.
- Branch/worktree: main working directory; no concurrent workers.
- Owned files: package.json, package-lock.json, .gitignore, Vite/tool configuration, README.md, tooling checks and coordination/status/architecture/plan docs. tools.js only if required to make legacy smoke tests runnable with the pinned dependency.
- Scope: reproducible npm setup, Vite dev/build/preview, documented checks and locally installed jsdom. Preserve embedded runtime libraries and gameplay; module extraction remains M1.
- Changes: pinned Vite 8.3.5/jsdom 30.1.3, npm scripts and lockfile, Vite configuration, ignored build/dependency output, README setup instructions and script-preservation build check. No tools.js or game HTML edits needed.
- Verification: npm ci with populated offline cache; npm run build; npm run check; npm run test:physics; npm run test:smoke; npm run test:multiplayer; syntax checks for the build checker and Vite config; temporary dev/preview HTTP checks. All passed. npm test's component commands were run individually rather than repeating the whole suite.
- Integration review: game HTML hash matches the B2 fixture, source scripts survive the build exactly, manifests agree with the lockfile, installed Node satisfies pinned dependency engines, output/dependencies are ignored. npm reported zero dependency vulnerabilities at install time.
- Untested: actual browser rendering/audio and real-network connections. TypeScript/lint/format setup is deferred to M1; no such checks are claimed. B3 commit approved by the user.
- Next: B1 browser baseline remains unassigned; C1 still depends on B1. All temporary verification servers have been stopped.

### B1 — 2026-10-25

- Owner: Codex / root, integration owner; no concurrent workers.
- Owned files: tests/fixtures/browser-baseline/, docs/BASELINE.md, docs/THIRD_PARTY.md, baseline inventory tooling if needed, and coordination/status docs.
- Scope: inventory current behavior and embedded dependency evidence; capture real desktop browser reference views and observed limitations. No gameplay or runtime dependency changes. Commit only after user approval.
- State: PAUSED by the user while defining the GitHub workflow. No baseline files or screenshots were written. Local Vite server stopped. Firefox selection returned “Computer Use permissions are not granted”; resume needs a permitted browser environment and coordinator reassignment/confirmation.
- Source inspection only: embedded Three.js r128 / MIT and PeerJS 1.5.4 / MIT metadata found; maintained inventory artifacts and browser evidence remain unfinished.
- Resumed: user requested finishing the task. Working branch agent/b1-browser-baseline, exclusive working directory. Owned paths additionally include scripts/inventory-baseline.cjs and tests/fixtures/source-inventory.json. Browser access now works after the initial permission/time-out failures. No GitHub issue exists yet; this remains the documented local bootstrap assignment.
- Changes: docs/BASELINE.md behavior/evidence inventory, docs/THIRD_PARTY.md embedded dependency provenance, generated source inventory with 22 courses/36 starter putts and six one-stroke reference traces, and seven unedited Chrome reference screenshots with a source-hashed manifest.
- Coordinator-owned README.md and docs/GITHUB_WORKFLOW.md updated with the baseline handoff and confirmed hosted CI outcome.
- Browser evidence: solo entry, six-card selection, actual Switchback Garden rendering, all three cameras, pointer shot changing strokes 0 to 1, live scorecard and Escape, sound/quality label toggles and restore. User explicitly selected Chrome; Firefox is not claimed as tested.
- Limitations: practice/tournament completion, real WebRTC/relay, console audit, audio quality and performance remain unverified in the real browser. Blank content after reload and a later ScreenCaptureKit -3812 error are recorded without assigning a product cause.
- Verification: node scripts/inventory-baseline.cjs --write and --check passed; all six representative traces sunk in one stroke; screenshot JPEG formats, dimensions and hashes recorded and representative images visually inspected. Game/tools hashes match B2; no runtime/dependency changes. User approved committing and pushing agent/b1-browser-baseline; PR creation, integration and merge approval remain pending. C1 still awaits B1 acceptance.



### S1 — 2026-10-25

- Owner: Codex / root, worker / integration owner.
- Branch/worktree: agent/s1-simulation.
- Owned files: src/simulation/*, tests/simulation.test.cjs, package.json, TASKS.md, PROJECT_STATUS.md.
- Scope: Extract pure headless simulation engine from legacy HTML closures into `src/simulation/`. Pure JavaScript physics, fixed 240Hz stepping, explicit hazard time injection, domain events, and zero browser/DOM/renderer dependencies.
- Changes:
  - Implemented `src/simulation/physics.js`: pure collision routines for inside, rampHeight, surfaceHeight, contactHeight, cupOf, cupCollision, bounce, movingRect, sinkBall, outOfBounds, stopBall, and stepBall.
  - Implemented `src/simulation/engine.js`: `SimulationEngine` class managing players, step progression, event collection, snapshots, and disposal.
  - Implemented `src/simulation/index.js`: unified re-exports for the simulation module.
  - Added test suite `tests/simulation.test.cjs` verifying:
    - 9 launch angle/power combinations.
    - Bitwise sample parity against the 6 baseline traces in `tests/fixtures/source-inventory.json` (courses 0, 8, 20, 21, 5, 19).
    - 4 mechanic chambers (fan, teleporter, jump pad, tornado) in the 6-chamber arena.
    - Exact surface roll distances (turf=261.1, sand=75.0, ice=1699.7, slime=43.8).
    - SimulationEngine lifecycle, snapshots, settlement, and disposal guards.
  - Added `test:simulation` script in `package.json` and included in `npm test`.
- Verification:
  - `npm run test:simulation`: all parity checks passed with 100% bitwise trajectory match.
  - `npm run test:contracts`: all 9 contract suites passed.
  - `npm run check`: passed.
  - `npm run build`: passed.
- Integration notes:
  - Simulation is ready for downstream tasks: D1 (Courses schema/CLI imports), L1 (Session lifecycle state machine), and I1 (Runtime integration).

### C1 — 2026-10-25

- Owner: Codex / root, integration owner.
- Branch/worktree: agent/c1-shared-contracts.
- Owned files: src/shared/*, ARCHITECTURE.md, package.json, tests/contracts.test.cjs, TASKS.md, PROJECT_STATUS.md.
- Scope: Define and verify approved simulation, session, transport, snapshot, scoring, and domain event contracts, schemas, coordinate transforms, and high-fidelity mocks.
- Changes:
  - Added `src/package.json` declaring `"type": "module"` for clean ES module exports across `src/shared/`.
  - Implemented `src/shared/constants.js` with all baseline physics and game constants (BALL_RADIUS 5, CUP 15/8, POWER 900, 240Hz timestep, surface drag, player colors).
  - Implemented `src/shared/coords.js` with `simToWorld`, `worldToSim`, `simToWorldGround` transformations.
  - Implemented `src/shared/scoring.js` with `calculateTimeoutScore`, `formatScoreEntry`, `summarizeScorecard`, and `rankPlayers`.
  - Implemented `src/shared/courses.js` with putt and course validation schemas.
  - Implemented `src/shared/protocol.js` with boundary validation for untrusted presence, snapshot, and vote messages.
  - Implemented `src/shared/simulation.js` with domain events, player state factory, and `applyShot`.
  - Implemented `src/shared/session.js` with session commands, phases, and deterministic voting resolution.
  - Implemented `src/shared/transport.js` with `ConnectionStates` and `RoomTransportContract`.
  - Implemented `src/shared/render.js` with camera modes, render snapshot factory, and sightline obstruction raycasting.
  - Implemented `src/shared/mocks.js` with `MockSimulation`, `MockTransportHub`, and `MockTransport`.
  - Added comprehensive test suite in `tests/contracts.test.cjs` covering all 10 contract modules.
  - Updated `package.json` with `test:contracts` script integrated into `npm test`.
  - Updated `ARCHITECTURE.md` recording all agreed contracts.
- Verification:
  - `node tests/contracts.test.cjs`: all 9 contract suites passed with zero errors or warnings.
  - `npm run check`: passed.
  - `npm run build`: passed (preserved byte-for-byte embedded scripts).
  - `npm run test:physics`: passed (all 19 surface/timer, 7 cup, 8 mechanic checks).
  - `npm run test:smoke`: passed.
  - `npm run test:multiplayer`: passed (4 clients, voting, scoring, timeouts, disconnect).
  - `npm test`: passed all stages sequentially.
- Integration notes:
  - Contracts are ready for dependent implementation tasks (S1 Headless Simulation, R1 Renderer extraction, U1 React UI/Input, A1 Audio adapter, N1 Network transport, T1 Integration tests).

### W1 — GitHub workflow preparation

- Owner: Codex / root, coordinator; local documentation/configuration only.
- Owned files: docs/GITHUB_WORKFLOW.md, .github/ templates and CI, AGENTS.md, TASKS.md, PROJECT_STATUS.md, README.md and MODERNIZATION_PLAN.md.
- Scope: explain GitHub assignments, isolated branches, PRs, ownership, review/merge gates and recovery; provide task/PR templates and baseline CI definition. No remote issues, pushes, comments, settings changes or agent dispatch.
- Handoff: user approved committing and pushing the workflow files. Hosted CI acceptance remains pending; branch rules, task issue creation and agent dispatch are separate setup steps. This bootstrap uses the explicitly approved direct push; subsequent tasks follow the documented PR workflow.
- Verification: Ruby YAML parsing passed for the issue form and CI definition; issue field IDs are unique, baseline-ci exists, and all CI npm run commands resolve to existing scripts. npm run check, npm run build and git diff --check passed. This is local syntax/consistency validation, not a hosted Actions run or GitHub form-schema validation. Existing physics/smoke suites were not repeated because their code and commands are unchanged from B3.
- Hosted follow-up: commit b333495 was pushed under explicit bootstrap approval; Baseline CI run 40247672160 completed successfully. Branch protection, task issue creation and agent dispatch remain separate, unperformed setup steps.

Coordinator bootstrap assignment template (use the GitHub issue form once available):

```text
Task:
Owner:
Branch/worktree:
Owned files:
Contract revision:
Changes:
Commands and results:
Known failures / untested behavior:
Integration notes / next dependency:
```

## Issue-backlog reconciliation — 2026-10-26

- Created 16 roadmap/follow-up issues with native dependencies and status labels; backfilled C1 #3 and S1 #5 as completed. Added C2 #19 after root-level duplicate files were discovered, for 17 total tracked issues (15 open, two closed at this snapshot).
- Recent main: c917618 (C1), b9ebff0 (S1), 4327196 (zero-penalty/vote parity fixes), 543c383 (partial D1 catalog). Original C1/S1 REVIEW rows are superseded by integration evidence.
- Verified locally: npm run test:contracts, npm run test:simulation and npm run check pass. node courses.test.cjs fails with MODULE_NOT_FOUND for ../tools/legacy-adapter.cjs; actual catalog files are at the root rather than the intended src/courses/, tools/ and tests/ locations. Failure and remaining work are recorded in D1 #8; no implementation fix is claimed.
- C2 #19 owns root contracts.test.cjs/scoring.js/session.js audit only; D1 owns the separate root catalog files. New CLI/course integration, TypeScript/Zod adoption and extra CI wiring are not made complete by existing commit titles.
- Worker claims/progress stay in GitHub issues/PRs. The coordinator updates this snapshot at integration points; docs/ISSUES.md contains discovery and claim commands.

- Latest reviewed follow-up 9cdd12e adds stale metadata detection but places stale.js and related files at the root. After fast-forwarding that commit, node courses.test.cjs still fails before assertions with the same adapter import error. D1 #8 remains ACTIVE; this is progress, not completion.

## C2 and scoped D1 layout cleanup — 2026-10-26

- Worker/integration owner: Codex root. User confirmed no other agents are working and authorized committing this bounded cleanup directly on main; no PR merge or history rewrite is claimed.
- Moved index.js/legacy.js/stale.js into src/courses/, legacy-adapter.cjs into tools/ and courses.test.cjs into tests/, preserving file content. Removed only byte-identical root scoring.js/session.js/contracts.test.cjs copies after auditing imports; canonical src/shared/ and tests/ implementations are unchanged.
- Added npm run test:courses to npm test and explicit contract/simulation/course steps to CI. No new dependencies or gameplay/physics changes.
- D1 remains partial: the adapter still uses legacy VM/source extraction; full geometry, shared consumers and CLI migration remain required. T1 real-browser/integration coverage is also unfinished. Hosted CI and real-browser/network validation are not claimed by local checks.
- Verification: npm test passed end-to-end (check, contracts, simulation, courses, physics, solo/practice/tournament smoke and four-client fake-network smoke); npm run build passed with embedded scripts preserved; node scripts/inventory-baseline.cjs --check passed. All 10 catalog checks passed. CI YAML parsing/script-reference checks, byte-for-byte relocation checks and git -c core.whitespace=cr-at-eol diff --check passed.

## L1 accepted integration — 2026-10-26

- PR #23 merged as adf2045 with explicit user approval. L1 #9 is DONE/closed; no browser adoption or real-network result is implied.
- Local full npm test/build passed before merge; 14 lifecycle scenarios/contracts/build passed again on merged main. Latest PR CI: run 40355229967 succeeded. Post-merge baseline-ci passed on adf2045: https://github.com/SpikemenDan/putt-pals/actions/runs/40356477704 .
- N1 #11 is READY with C1/L1 accepted, unassigned pending a coordinator-confirmed claim. It must coordinate the shared 99-score validator/helper mismatch before transporting uncapped L1 scores. No N1 implementation or API change is authorized merely by this label.
- I1 still waits on R1/U1/A1/N1/D1 and its integration gates. D1's delivered data/CLI module is on main; remaining scope stays in its issue. No blanket backlog authorization, agent launch or deployment occurs here.
- Status docs edited here follow .gitattributes LF policy; unrelated ARCHITECTURE.md formatting is excluded.

## N1 branch review prepared — 2026-10-26

- Codex root implemented N1 in /private/tmp/putt-pals-n1, branch agent/n1-transports, based on b0dfb04. Implementation commit: 72b7498. User authorized the commit, subsequent coordination-file updates and branch push; PR creation/merge remain separate.
- Nine network scenarios, full npm test, build and baseline inventory passed locally; no actual WebRTC/browser adoption or hosted CI result. See docs/reviews/N1_TRANSPORTS.md for exact commands, changed paths and integration limits.
- N1 stays ACTIVE pending its review submission and accepted integration. I1 and N3 are not unblocked by an unmerged branch. The earlier N1 READY/99-limit notes are historical and superseded for this branch.

## N1 completion record — PR #24

The DONE* row is effective only after PR #24 merges with green current-head baseline-ci; it is a proposed integration record while on the PR branch. User delegated the explained PR/review/CI/merge/post-merge completion workflow. Issue #11 records final merge/verification evidence. N1 code prerequisites then become available to downstream owners, without completing I1/N2/N3/T1 or authorizing a new task.

## A1 completion record — PR #25

The A1 DONE* row becomes effective only after https://github.com/SpikemenDan/putt-pals/pull/25 merges with successful current-head CI and merged-main verification. Until then the live issue is ACTIVE/REVIEW. Worker/coordinator Codex root, branch agent/a1-procedural-audio, base 1387c22. The user requested completing the next eligible task in the established workflow; scope is A1 only.

The adapter preserves all eleven procedural sound recipes and handles lazy gesture unlock, mute persistence, listener coordinates, domain-event mapping and explicit node/context cleanup. Nine instrumented-node scenarios include legacy waveform/envelope/timing parity, actual simulation events and twenty room-reset cycles. See docs/reviews/A1_AUDIO.md for exact verification and limitations. Browser adoption/listening remains I1/T1/manual release work; no additional module or deployment is completed. I1 still requires its other accepted prerequisites.

## Coordinator update — 2026-10-27

- User-authorized cleanup. R1 #6 and U1 #7 closed after merge and green post-merge CI (PR #27 f72a374; PR #29 e7a59ed, run 40547543891).
- B4 PR #28 merged as 4e3eb9e from a separate session; #4 is left open for that session or the user to close.
- I1 #12 claimed by the user's request. D1 #8's remaining scope is browser adoption of the course modules, which I1 performs; D1 closes with I1 acceptance.
- Open integration findings carried into I1: the production build drops standard `backdrop-filter` declarations from legacy CSS (Lightning CSS keeps only the `-webkit-` form), and `PLAYER_COLORS` in src/shared differs from the game palette.

## R2 integration record — PR #53

The R2 DONE* row is effective only after [PR #53](https://github.com/SpikemenDan/putt-pals/pull/53) passes current-head CI, merges under the user's explicit authorization and has merged-main verification recorded in #16. Until then R2 is REVIEW. [R2w #52](https://github.com/SpikemenDan/putt-pals/issues/52) is the separate Windows GPU measurement follow-up requested for the Windows-capable agent; it does not block this R2 merge. No future art work is automatically launched.


## S2 cup-capture integration record — 2026-10-28

The S2 DONE* row is effective only after green current-head CI, authorized merge and merged-main verification recorded in #54. Until then the live issue is ACTIVE/REVIEW. User explicitly delegated the complete PR/review/CI/merge/post-merge workflow. Local full tests/build, 439 controlled trajectories and nine selected three-engine browser tests passed; details and shot-margin consequences are in docs/reviews/S2_CUP_CAPTURE.md. Five hard-map putts still have nominal hole-in-ones but no robust solution on the existing grid. Q1 retains the full 36-putt difficulty refresh and review/tuning decision; this correction does not claim an unchanged difficulty ladder or complete release acceptance. P1 remains user-deferred with evidence preserved on its separate unmerged branch (6ba6115).

## Coordinator update — 2026-10-28

- Main advanced to 44c082a (PR #62 merge).
- Closures with PR and merge commit: B4 #4 (PR #28 merged 4e3eb9e, verified on main and closed); I2b #41 (PR #45 merged db3245a); R2 #16 (PR #53 merged 62482f8); S2 #54 (PR #55 merged 03e4db5); R2w #52 (PR #56 merged 49b74e9); T1c #48 (PR #50 merged b257e39, fixing intermittent Chromium four-player join timeout); N2b #47 (PR #49 merged 1c719e2, committed real-browser N2 specs, closed by hand).
- PR #62 (no issue) merged 44c082a: browser test runs can share a machine (PeerServer free port, PP_TEST_PORT default 4173, opt-in PP_REUSE_SERVER=1). CI unchanged.
- R2c #57 ACTIVE with PR #63 open to restore effect-shader colours washed out by Three.js upgrade (src/render/materials.js; no restyle).
- V1 #33 is now an umbrella split into V1a–V1d (#58–#61): V1a is blocked by R2c #57, and V1b, V1c and V1d by V1a. The approved reference look is on reference/v1-toon-sample (scratch-v1/), not for merge.
- P1 #17 PAUSED: Rapier adoption deferred by user; experiment preserved on agent/p1-rapier-prototype (6ba6115).
- Q1 #18 waits on N4 #65 and its deployed acceptance gates; N3 #14 is paused and not a prerequisite.
- Confirmed user decisions (2026-10-28): V1 smooth flat-colour toon look with no scenery clutter; K1 per-putt walled islands with designed gaps; G1 true portal pairs, stronger fans, Wind/Snow/Storm/Lightning as attack power-ups on opponents; V1c ambient weather on Frost Hollow and Cyclone Ring is visual only. G1 and K1 still come after Q1.
- Local browser tests run Chromium only (npx playwright test --project=chromium); CI browser-ci covers Firefox and WebKit.
- Coordinator cleanup: deleted merged branches agent/n2b-network-browser-specs, agent/r2-three-upgrade, agent/s2-cup-capture and agent/t1c-diag, and superseded feature/d1-course-snapshot (tip ca68091).
- The conditional DONE* records for R2 (PR #53) and S2 (PR #55) earlier in this file are now accepted.


## N4 server-room plan and N4a/N4b accepted integrations — PRs #74/#75

The user selected server-owned rooms on Cloudflare Workers + SQLite-backed Durable Objects over WebSockets. N4 #65 replaces N3 as Q1's networking prerequisite; N3 #14 stays PAUSED with its local changes preserved. This supersedes the earlier Q1/TURN-only snapshot. PR #74 merged to main as `b30552f`; its contract implementation is `3e5985d` plus documentation follow-up `c4c7af5`. N4b PR #75 merged to main as `be77190`. Both PRs passed current-head baseline-ci and browser-ci (Chromium, Firefox and WebKit). The contract and lifecycle decisions in [docs/networking/SERVER_ROOMS.md](docs/networking/SERVER_ROOMS.md) are authoritative for N4 consumers; setup instructions are in [docs/networking/CLOUDFLARE_SETUP.md](docs/networking/CLOUDFLARE_SETUP.md). Current gameplay still uses PeerJS.

| ID / issue | Current status | Scope / dependency |
| --- | --- | --- |
| N4 #65 | BLOCKED | Tracking parent for accepted server-room migration and hosted validation |
| N4a #66 | DONE | Wire/checkpoint contracts, policy, mocks, tests and design; PR #74 merged as `b30552f` |
| N4b #68 | DONE | Local Cloudflare Worker/SQLite Durable Object tooling integrated as `be77190`; no account connection/deploy |
| N4c #69 | READY for coordinator-confirmed claim on `be77190` | Backend authority and room coordinator; admission, policy enforcement and gameplay rules |
| N4d #70 | BLOCKED on #69 | Durable room restoration, deadlines, reconnect and controller recovery |
| N4e #71 | BLOCKED on #66/#69/#70 | Browser WebSocket adoption; solo/local physics retained |
| N4f #72 | BLOCKED on #68/#69/#70/#71 | Cross-browser/local-runtime verification and usage limits |
| N4g #73 | BLOCKED on #68/#72 and deployment authorization | Cloudflare connection, authorized preview, actual separate-network acceptance and rollback |

Downstream issues use accepted main revisions `b30552f` (N4a contract) and `be77190` (N4b local runtime); workers must not use unmerged branches as accepted main. The contract's configurable defaults are immediate succession, 30-second grace and 15-minute empty retention, confirmed by the user. N4b does not implement room protocol, persistence/recovery, actual browser connection, paid service or production deployment.
