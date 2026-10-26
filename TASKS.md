# Modernization task ledger

Roadmap and historical integration snapshot, maintained by the coordinator. GitHub issues/PRs become the live ownership/progress record once created; until then, the local assignments below apply. Read docs/GITHUB_WORKFLOW.md. Implementation was authorized through B1; B1 is paused while the user-requested GitHub workflow files are prepared. Other implementation tasks remain unassigned.

Statuses: TODO, ACTIVE, REVIEW, DONE, BLOCKED, PAUSED. Future tasks are DONE after accepted PR merge and verification; B2/B3 predate the PR workflow. BLOCKED identifies a concrete blocker; PAUSED records a deliberate user/coordinator hold. Workers report in their issue/PR, not by repeatedly editing this file.

| ID | Status | Owner | Depends on | Scope / owned files | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| W1 | DONE | Codex / root | Approved bootstrap commit/push | GitHub workflow docs, templates and baseline CI | b333495 pushed; hosted Baseline CI run 40247672160 succeeded |
| B1 | REVIEW | Codex / root | Resumed by user; pending acceptance/integration | Baseline inventory and browser references; tests/fixtures | Source inventory, six traces, seven Chrome screenshots, limitations recorded |
| B2 | DONE | Codex / root | Authorized 2026-10-25 | Legacy solver correction; tools.js and regression harness | Real launch reused; 36/36 starter putts robust; source-hashed results recorded |
| B3 | DONE | Codex / root | Authorized 2026-10-25 | Integration owner: manifests, lockfile, dev/build/test configs | Lockfile reinstall, Vite build/HTTP checks, physics and both smoke suites passed |
| C1 | TODO | — | B1, B2, B3 | Integration owner: src/shared, ARCHITECTURE.md | Approved simulation, session, transport, snapshot and event contracts; matching mocks |
| S1 | TODO | — | C1 | src/simulation | Headless imported simulation matches fixtures; deterministic time input; no browser dependencies |
| R1 | TODO | — | C1 | src/render, src/camera | Extracted renderer preserves reference views; explicit coordinate transform and disposal |
| U1 | TODO | — | C1 | src/ui, src/input | React screens and desktop controls work with mock snapshots/commands |
| D1 | TODO | — | S1 | src/courses, tools/cli | Schemas pass for 22 maps; CLI imports simulation; generated arena parity and stale-metadata detection |
| L1 | TODO | — | S1, C1 | src/session | XState transitions, scoring, practice and timer checks pass with fake clock |
| A1 | TODO | — | C1 | src/audio | Existing synthesized audio preserved; domain-event adapter and cleanup verified |
| N1 | TODO | — | C1, L1 | src/network | Solo, fake and PeerJS adapters pass protocol/identity/host-guard checks |
| I1 | TODO | — | S1, R1, U1, L1, A1, N1, D1 | Integration owner: src/app, entry points | Complete solo/practice/tournament flows; production build; legacy tools no longer needed for runtime |
| N2 | TODO | — | I1 | src/network reconnect/interpolation | Guest recovery, stale/duplicate rejection, capacity and clean host-loss browser checks |
| N3 | TODO | — | N1, provider/budget decision | services/turn-credentials; network configuration via integration owner | Secrets stay server-side; short-lived credentials; forced relay and separate-network tests |
| T1 | TODO | — | C1; incremental work as modules land | tests/integration, tests/browser | Ports meaningful smoke assertions; real WebGL and multi-page sessions; no game-state injection in primary end-to-end flow |
| R2 | TODO | — | I1 | src/render, src/camera; dependency changes via integration owner | Three.js upgrade verified against reference views and desktop performance measurements |
| P1 | TODO | — | S1; optional | Isolated physics prototype | Rapier comparison for ramp/drop/tube; explicit adoption/defer recommendation |
| Q1 | TODO | — | I1, N2, N3, T1, R2 | Integration owner: CI, release configuration, docs | Production-like preview, full acceptance matrix, rollback procedure and fresh-checkout instructions |

## Work allocation

Initial parallel tasks: B1, B2 and B3, with exclusive file ownership. B2 owns tools.js while B3 arranges dependencies/configuration; coordinate if smoke setup would require editing tools.js.

After C1: S1, R1, U1 and A1 can proceed against approved contracts. Assign only as many tasks as available agents, and finish/review tasks before creating more work. D1 and L1 follow the simulation. T1 can begin harness work against the contracts and add coverage as implementations land. I1 integrates these paths before networking behavior and library upgrades expand the scope.

## Claim and handoff protocol

1. Coordinator creates/updates the assigned GitHub issue using the Agent task form, confirms eligibility and one worker, and records exact owned paths, branch/worktree, dependencies, contract revision and allowed operations.
2. Worker reads AGENTS.md and docs/GITHUB_WORKFLOW.md, checks the live assignment, and starts in an isolated working directory from current main. Local assignments below are only the bootstrap fallback.
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
