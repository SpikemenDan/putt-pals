# Putt Pals

Desktop browser mini-golf with solo practice, private friend rooms and tournaments. The application is being modernized incrementally; the original game remains in `putt-pals.html`.

## Setup

Use Node.js 22.22.2+ on the 22.x line, 24.15.0+ on the 24.x line, or 26+. These match the pinned jsdom runtime requirements. Development was verified with Node 26.10.0 and npm 11.19.1. Install the exact dependency tree from the committed lockfile:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/putt-pals.html` (or the port Vite prints). The dev command also opens that page in your browser. Keep the `/putt-pals.html` path during this baseline stage; a root index entry will be introduced during module extraction.

Three.js and PeerJS remain embedded at their existing versions. Vite 8.3.5 and jsdom 30.1.3 are pinned development dependencies. No new runtime framework has been added yet. TypeScript, lint/format tooling and modular application code belong to the next extraction stages; there is no type-check or lint script yet.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run check` | Legacy tooling syntax, game syntax and course metadata checks |
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

Private online rooms still depend on PeerJS signaling, and some networks need a TURN relay. The existing lobby exposes manual ICE settings. Managed relay credentials, connection recovery and improved error states are planned; they are not implemented by adding Vite. Use solo mode to develop without online services.

## Contributing and agent coordination

Read [AGENTS.md](AGENTS.md) and [the GitHub workflow guide](docs/GITHUB_WORKFLOW.md) before editing. Each worker uses an assigned issue, isolated branch/worktree and linked PR. GitHub issues/PRs track live ownership; [TASKS.md](TASKS.md) is the coordinator's roadmap snapshot, and [PROJECT_STATUS.md](PROJECT_STATUS.md) records accepted integration state. Before issues exist, local task assignments are the bootstrap fallback.

Local templates live in `.github/ISSUE_TEMPLATE/agent-task.yml` and `.github/pull_request_template.md`. `.github/workflows/ci.yml` defines the `baseline-ci` job: install, syntax/data checks, build, physics and both jsdom smoke suites. Its [first hosted run passed](https://github.com/SpikemenDan/putt-pals/actions/runs/40247672160) for b333495. Branch protection, real task issues and agent runners require separate setup. No typecheck, lint, real-browser or deployment automation is claimed.

The migration reference inventory and manual Chrome captures are described in [docs/BASELINE.md](docs/BASELINE.md). Run `node scripts/inventory-baseline.cjs --check` to verify the source inventory and representative headless traces; `--write` intentionally regenerates it. Embedded library evidence and provenance limits are in [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

[ARCHITECTURE.md](ARCHITECTURE.md) and [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md) describe the migration. [HANDOFF.md](HANDOFF.md) retains historical requirements and feature logs, including stale architecture details.
