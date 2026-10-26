# Putt Pals

Desktop browser mini-golf with solo practice, private friend rooms and tournaments. The application is being modernized incrementally; the original game remains in `putt-pals.html`.

## Setup

Use Node.js 22.22.2+ on the 22.x line, 24.15.0+ on the 24.x line, or 26+. These match the pinned jsdom runtime requirements. Development was verified with Node 26.10.0 and npm 11.19.1. Install the exact dependency tree from the committed lockfile:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/putt-pals.html` (or the port Vite prints). The dev command also opens that page in your browser. Keep the `/putt-pals.html` path during this baseline stage; a root index entry will be introduced during module extraction.

Three.js and PeerJS remain embedded at their existing versions. Vite 8.3.5 and jsdom 30.1.3 are pinned development dependencies. XState 5.33.3 powers the extracted headless session module. Shared contracts, simulation and course/CLI modules are available, and N1 adds transport adapters through PR #24 and A1 adds the [procedural audio adapter](src/audio/README.md) through PR #25; the shipped browser still uses its legacy embedded game. TypeScript, React and lint/format tooling remain planned; there is no type-check or lint script yet.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run check` | Legacy tooling syntax, game syntax and course metadata checks |
| `npm run test:contracts` | Canonical shared contract, rule, schema and mock tests |
| `npm run test:simulation` | Extracted headless simulation parity and lifecycle tests |
| `npm run test:session` | Fourteen fake-clock room lifecycle, voting and scoring scenarios |
| `npm run test:network` | Nine transport/protocol scenarios, including four fake clients and PeerJS-shaped channels |
| `npm run test:audio` | Nine procedural-recipe, domain-event and WebAudio resource/lifecycle scenarios |
| `npm run test:cli` | Imported course/solver/arena commands, parity, file inputs and failure paths |
| `npm run test:courses` | Validate all 22 courses and detect stale inventory/source hashes |
| `npm run test:physics` | Surface/timer, cup and mechanic checks; may take around a minute |
| `npm run test:smoke` | Solo, tournament, practice, scorecard and camera behavior in jsdom |
| `npm run test:multiplayer` | Four jsdom clients using an in-memory PeerJS substitute |
| `npm test` | All of the above checks, sequentially; allow several minutes |
| `npm run baseline:solver` | Check launch parity, solve 36 starter putts and overwrite the measured baseline fixture; allow several minutes |
| `npm run solve -- 0 0` | Find a robust shot for map 0, putt 0; use `--full` for an expensive exhaustive search |
| `npm run rank` | Inspect historical difficulty counts; these are stale and do not certify current difficulty |
| `npm run build` | Produce `dist/putt-pals.html` and verify that all three runtime scripts are preserved exactly |
| `npm run preview` | Serve the built game locally, normally at `http://127.0.0.1:4173/putt-pals.html` |

jsdom now installs in this project; no temporary directory or NODE_PATH configuration is necessary. Smoke tests stub WebGL, canvas and audio. Multiplayer smoke tests simulate networking. These tests do not prove real rendering, audio quality, WebRTC connectivity or TURN behavior.

The solver fixture at `tests/fixtures/solver-baseline.json` records the first robust shot per putt, source hashes and robustness offsets. Regeneration intentionally changes that fixture when the solver or game changes. Exhaustive difficulty rankings require a separate full sweep.

## Build and hosting

Vite currently processes the existing HTML without extracting or upgrading its embedded runtime scripts. The build check protects that baseline; it does not certify rendering. Deploy only the generated `dist/` directory to static HTTPS hosting, with `/putt-pals.html` as the game URL. Development and preview servers bind to loopback by default; they are not production hosts. Hosting setup and deployment are not part of this baseline task.

Private online rooms still depend on PeerJS signaling, and some networks need a TURN relay. The existing lobby exposes manual ICE settings. N1 provides [modular adapters and connection status](src/network/README.md), with its [review handoff](docs/reviews/N1_TRANSPORTS.md); module acceptance is recorded in PR #24, while I1 browser adoption remains outstanding. Managed relay credentials and guest recovery remain planned. Use solo mode to develop without online services.

## Contributing and agent coordination

Start with [AGENTS.md](AGENTS.md), [the issue discovery/claim guide](docs/ISSUES.md) and [the GitHub workflow](docs/GITHUB_WORKFLOW.md). The [GitHub agent backlog](https://github.com/SpikemenDan/putt-pals/issues?q=is%3Aissue+is%3Aopen+label%3Aagent-task) is now the live work queue. Agents asked to pick up work inspect ready issues, comments, native dependencies and existing claims before choosing a task. Each worker uses a confirmed issue, isolated branch/worktree and linked PR. [TASKS.md](TASKS.md) remains the coordinator's roadmap snapshot; [PROJECT_STATUS.md](PROJECT_STATUS.md) records integration evidence.

```sh
gh issue list --repo SpikemenDan/putt-pals --state open --label agent-task --label status:ready --search 'no:assignee'
```

An empty assignee field does not rule out a claim in the issue body/comments. Confirm one worker/session with the coordinator before editing, and report progress on the issue rather than making every worker edit shared status files.

Local templates live in `.github/ISSUE_TEMPLATE/agent-task.yml` and `.github/pull_request_template.md`. `.github/workflows/ci.yml` defines the `baseline-ci` job: install, syntax/data checks, build, physics and both jsdom smoke suites. Its [first hosted run passed](https://github.com/SpikemenDan/putt-pals/actions/runs/40247672160) for b333495. Real task issues, workflow labels and native prerequisite links are now set up; branch protection and agent runners remain separate setup. The workflow explicitly runs contract, simulation, session, network, audio, course and CLI suites as well. N1 current-head CI and acceptance evidence are recorded in [PR #24](https://github.com/SpikemenDan/putt-pals/pull/24); local checks alone do not establish hosted acceptance. T1 still owns further integration/browser coverage. No typecheck, lint, real-browser or deployment automation is claimed.

The migration reference inventory and manual Chrome captures are described in [docs/BASELINE.md](docs/BASELINE.md). Run `node scripts/inventory-baseline.cjs --check` to verify the source inventory and representative headless traces; `--write` intentionally regenerates it. Embedded library evidence and provenance limits are in [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

[ARCHITECTURE.md](ARCHITECTURE.md) and [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md) describe the migration. [HANDOFF.md](HANDOFF.md) retains historical requirements and feature logs, including stale architecture details.
