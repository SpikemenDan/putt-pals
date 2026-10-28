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
| [N2 #13](https://github.com/SpikemenDan/putt-pals/issues/13) | READY | — | I1 integrated | src/network reconnect/interpolation | Guest recovery, stale/duplicate rejection, capacity and clean host-loss browser checks |
| [N3 #14](https://github.com/SpikemenDan/putt-pals/issues/14) | BLOCKED | — | Provider/budget decision (N1, I1 integrated) | services/turn-credentials; network configuration via integration owner | Secrets stay server-side; short-lived credentials; forced relay and separate-network tests |
| [T1 #15](https://github.com/SpikemenDan/putt-pals/issues/15) | ACTIVE | Claude (coordinator session) | C1; I1 integrated, so full browser/integration coverage can target the app | tests/integration, tests/browser | Partial delivery in draft PR #37 (Playwright solo/input/practice/multiplayer specs, browser-ci job). User-approved scope change 2026-10-27: legacy UI screenshot-parity test dropped because V1/M1 replace the pastel look; remaining: real-browser join/leave cleanup and legacy smoke assertions in tests/integration |
| [R2 #16](https://github.com/SpikemenDan/putt-pals/issues/16) | READY | — | I1 integrated | src/render, src/camera; dependency changes via integration owner | Three.js upgrade verified against reference views and desktop performance measurements |
| [P1 #17](https://github.com/SpikemenDan/putt-pals/issues/17) | BLOCKED | — | S1; optional | Isolated physics prototype | Rapier comparison for ramp/drop/tube; explicit adoption/defer recommendation |
| [Q1 #18](https://github.com/SpikemenDan/putt-pals/issues/18) | BLOCKED | — | N2, N3, T1, R2, B4 (I1, C2 done) | Integration owner: CI, release configuration, docs | Production-like preview, full acceptance matrix, rollback procedure and fresh-checkout instructions |
| [B4 #4](https://github.com/SpikemenDan/putt-pals/issues/4) | REVIEW | Claude (separate session) | B2 completed | Dedicated difficulty report/fixtures; no physics retuning | PR #28 merged 4e3eb9e; full-grid sweep of 36 starter putts in docs/reviews/B4_DIFFICULTY.md; issue awaiting close |
| [C2 #19](https://github.com/SpikemenDan/putt-pals/issues/19) | DONE | Codex / root | C1 completed | Root contracts.test.cjs, scoring.js, session.js only | Reconcile duplicate shared-contract copies; preserve canonical src/shared and tests/ behavior |
| [I2 #38](https://github.com/SpikemenDan/putt-pals/issues/38) | ACTIVE | Claude (side session) | I1 integrated; found by T1 | src/app startup, src/ui message, dedicated tests | Start screen still renders and a clear text-only message appears when WebGL is unavailable; starting a game does not crash |
| [V1 #33](https://github.com/SpikemenDan/putt-pals/issues/33) | BLOCKED | — | R2 | src/render, src/camera, src/ui styling | Original comic art direction (outlines, flat palette, cel shading, sky world, weather themes, per-map palettes); split into sub-issues and confirm details with the user first |
| [G1 #34](https://github.com/SpikemenDan/putt-pals/issues/34) | BLOCKED | — | Q1 | src/simulation, src/courses; contract changes via integration owner | Corner wedges, fan/vortex rework, power-up framework and abilities with multiplayer sync; split into sub-issues first |
| [K1 #35](https://github.com/SpikemenDan/putt-pals/issues/35) | BLOCKED | — | G1, P1 | src/courses, course data, tests | Floating islands, boundary walls, ramps/drops/tubes, hole-in-one difficulty bands, re-solved starter maps; split into sub-issues first |
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
