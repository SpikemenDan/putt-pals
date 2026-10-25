# Modernization task ledger

Implementation authorized for an initial task on 2026-10-25. B2 is assigned below; other tasks remain unassigned. Parallel work is intended, but shared files must have one owner.

Statuses: TODO, ACTIVE, REVIEW, DONE, BLOCKED. DONE requires the stated verification and integration review. Record a concrete reason and dependency for BLOCKED; do not use it for ordinary unfinished work.

| ID | Status | Owner | Depends on | Scope / owned files | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| B1 | TODO | — | Implementation authorization | Baseline inventory and browser references; tests/fixtures | Behavior inventory, exact library versions/licenses, screenshots and observed limitations |
| B2 | DONE | Codex / root | Authorized 2026-10-25 | Legacy solver correction; tools.js and regression harness | Real launch reused; 36/36 starter putts robust; source-hashed results recorded |
| B3 | TODO | — | Implementation authorization | Integration owner: manifests, lockfile, dev/build/test configs | npm ci, runnable legacy baseline, documented scripts; smoke results recorded |
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

1. Coordinator confirms task eligibility, records owner and branch/worktree, and lists exact files owned in an assignment entry below.
2. Worker reads AGENTS.md, task dependencies and current status. Report unexpected local changes before editing.
3. Worker completes only assigned scope and records verification plus unresolved issues. Set REVIEW, not DONE.
4. Integration owner reviews, merges in dependency order, runs combined checks and marks DONE. Update PROJECT_STATUS.md with verified outcomes.
5. If scope crosses ownership boundaries, request a coordinator reassignment or contract change before editing those files.

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

Use this template when work begins:

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
