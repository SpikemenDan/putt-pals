# Putt Pals

A fast-paced 3D multiplayer mini-golf game for desktop browsers. It blends arcade party chaos (power-ups, hazards, trick shots) with skill-based putting: easy to jump into with friends, with real depth for competitive players. Modes today: solo practice, single-putt replay, private friend rooms, and 3-, 6- and 9-map tournaments. Planned: Putt Pong, a No Power-Ups mode, a full power-up and hazard catalog, vertical courses and cosmetics. See [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md) for the vision and plan.

The modular app (`index.html` and `src/`) is the game. The original single-file version, `putt-pals.html`, remains temporarily because legacy tools and tests depend on it. It will be removed after those consumers are migrated.

## Setup

Use Node.js 22.22.2+ on the 22.x line, 24.15.0+ on the 24.x line, or 26+ (the pinned jsdom runtime requires these). Install the exact dependency tree from the lockfile:

```sh
npm ci
npm run dev
```

Vite prints the local URL (normally `http://127.0.0.1:5173/`). The modular app is served at the root path; the legacy game is at `/putt-pals.html` (not opened by default). `dev` and `preview` open the root page. Use solo mode to develop without any online service.

## Commands

These commands describe the supplied repository snapshot. Workflow documentation changes do not migrate their implementations. Keep them synchronized as legacy tooling is retired.

| Command | Purpose |
| --- | --- |
| `npm run check` | Legacy tooling syntax, game syntax and course metadata checks |
| `npm run test:contracts` | Shared contracts, rules, schemas, mocks and server-room contracts |
| `npm run test:simulation` | Headless simulation parity and cup-capture tests |
| `npm run test:session` | Fake-clock room lifecycle, voting and scoring scenarios |
| `npm run test:network` | Transport and protocol scenarios, including fake multi-client rooms |
| `npm run test:audio` | Procedural audio recipes, event mapping and resource lifecycle |
| `npm run test:render` | Renderer and camera parity, toon style, palettes and weather |
| `npm run test:input` | Desktop input parity |
| `npm run test:ui` | React screens, UI store and cleanup |
| `npm run test:app` | Composed app flows, four clients and cleanup |
| `npm run test:courses` | Validate all 22 courses and detect stale inventory hashes |
| `npm run test:cli` | Course, solver and arena commands, file inputs and failure paths |
| `npm run test:physics` | Legacy surface, cup and mechanic checks; may take around a minute |
| `npm run test:integration` | Integration checks such as out-of-bounds handling |
| `npm run test:smoke` | Legacy solo, tournament, practice, scorecard and camera flows in jsdom |
| `npm run test:multiplayer` | Legacy four-client flow over an in-memory PeerJS substitute |
| `npm run test:browser` | Playwright real-browser suites (`npx playwright test --project=chromium` for Chromium only) |
| `npm run test:rooms:local` | Build, then check the local Cloudflare Worker and Durable Object runtime |
| `npm test` | The main suites above, sequentially; allow several minutes |
| `npm run build` | Build `dist/` and verify that the legacy page's scripts are preserved exactly |
| `npm run build:portable` | Build `release/putt-pals/` and `release/putt-pals.zip`: unzip and double-click `index.html` (no server; rooms still need internet). Unsupported legacy distribution path, pending retirement with its dependencies; offline distribution remains out of scope. Not run or verified in this documentation update |
| `npm run preview` | Serve the built game locally, normally at `http://127.0.0.1:4173/` |
| `npm run rooms:dev` | Run the local Worker room runtime (see [Cloudflare setup](docs/networking/CLOUDFLARE_SETUP.md)) |
| `npm run solve -- 0 0` | Find a robust shot for map 0, putt 0; add `--full` for an exhaustive search |
| `npm run rank` | Print recorded difficulty counts; these are stale and do not certify current difficulty |
| `npm run baseline:solver` | Regenerate the solver baseline fixture (several minutes; overwrites it) |

jsdom suites stub WebGL, canvas and audio and use fake networks. They do not prove real rendering, audio quality or WebRTC connectivity; use the Playwright suites and manual playtests for those. Exhaustive difficulty sweeps run separately from pull-request checks. Solver and fixture details are in [docs/BASELINE.md](docs/BASELINE.md) and [docs/reviews/B4_DIFFICULTY.md](docs/reviews/B4_DIFFICULTY.md).

## Online rooms

The modular app's online rooms are server-owned: the browser connects over WebSockets to a Cloudflare Worker with a SQLite Durable Object per room (contract in [docs/networking/SERVER_ROOMS.md](docs/networking/SERVER_ROOMS.md), local runtime in [docs/networking/CLOUDFLARE_SETUP.md](docs/networking/CLOUDFLARE_SETUP.md)). Ball physics is still client-trusted. Deploying a preview and testing across separate networks still need owner authorization; PeerJS remains in the legacy `putt-pals.html` and a legacy adapter (`src/network/peer.js`) that online rooms no longer use.

## Build and hosting

Deploy only the generated `dist/` directory to static HTTPS hosting. Development and preview servers bind to loopback and are not production hosts. Production deployment is a Q1 task and needs the owner's authorization.

## Contributing and AI workflow

Start with [AGENTS.md](AGENTS.md) and
[docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md).

Two contributors use one reusable development branch each. Main contains
integrated, verified changes. Do not create a branch or worktree per small task.
Direct implementation requests authorize scoped local commits; remote writes,
merges and deployment follow AGENTS.md.

Use issues for substantial work, dependencies and tracked defects. Coordinate
overlapping paths. Related small fixes may share a coherent PR.

Claude leads implementation and verification. Gemini Pro prepares routine drafts
and summaries for Claude to verify, without editing the active checkout.

Developer settings are documented in [docs/TUNING.md](docs/TUNING.md).
Configuration expansion and a development-only tuning panel are planned.
For appearance or game-feel proposals, present a local browser preview with
relevant controls before owner acceptance.

Legacy retirement is pending dependency migration and replacement verification.
Do not delete the legacy HTML/tooling before its active consumers are replaced.

Overnight work starts only on a fresh explicit user command, with bounded scope,
runtime limit and verified private Google Drive recovery backup. It does not
push, merge, deploy or automatically restart.

References:
- [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md): product vision and stages.
- [ARCHITECTURE.md](ARCHITECTURE.md): technical design.
- [TASKS.md](TASKS.md): roadmap and dependencies.
- [PROJECT_STATUS.md](PROJECT_STATUS.md): implementation summary.
- [docs/ISSUES.md](docs/ISSUES.md): substantial work tracking.
- [docs/AGENT_ROUTING.md](docs/AGENT_ROUTING.md): model responsibilities.
- [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md): library provenance.
