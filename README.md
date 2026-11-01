# Putt Pals

A fast-paced 3D multiplayer mini-golf game for desktop browsers. It blends arcade party chaos (power-ups, hazards, trick shots) with skill-based putting: easy to jump into with friends, with real depth for competitive players. Modes today: solo practice, single-putt replay, private friend rooms, and 3-, 6- and 9-map tournaments. Planned: Putt Pong, a No Power-Ups mode, a full power-up and hazard catalog, vertical courses and cosmetics. See [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md) for the vision and plan.

The modular app (`index.html` and `src/`) is the game. The original single-file version, `putt-pals.html`, is kept as a parity reference.

## Setup

Use Node.js 22.22.2+ on the 22.x line, 24.15.0+ on the 24.x line, or 26+ (the pinned jsdom runtime requires these). Install the exact dependency tree from the lockfile:

```sh
npm ci
npm run dev
```

Vite prints the local URL (normally `http://127.0.0.1:5173/`). The modular app is served at the root path; the legacy game is at `/putt-pals.html` (not opened by default). `dev` and `preview` open the root page. Use solo mode to develop without any online service.

## Commands

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
| `npm run build:portable` | Build `release/putt-pals/` and `release/putt-pals.zip`: unzip and double-click `index.html` (no server; rooms still need internet) |
| `npm run preview` | Serve the built game locally, normally at `http://127.0.0.1:4173/` |
| `npm run rooms:dev` | Run the local Worker room runtime (see [Cloudflare setup](docs/networking/CLOUDFLARE_SETUP.md)) |
| `npm run solve -- 0 0` | Find a robust shot for map 0, putt 0; add `--full` for an exhaustive search |
| `npm run rank` | Print recorded difficulty counts; these are stale and do not certify current difficulty |
| `npm run baseline:solver` | Regenerate the solver baseline fixture (several minutes; overwrites it) |

jsdom suites stub WebGL, canvas and audio and use fake networks. They do not prove real rendering, audio quality or WebRTC connectivity; use the Playwright suites and manual playtests for those. Exhaustive difficulty sweeps run separately from pull-request checks. Solver and fixture details are in [docs/BASELINE.md](docs/BASELINE.md) and [docs/reviews/B4_DIFFICULTY.md](docs/reviews/B4_DIFFICULTY.md).

## Online rooms

Browser rooms currently use PeerJS (client-trusted physics, host-owned room flow). The selected replacement is server-owned rooms on Cloudflare Workers and SQLite Durable Objects over WebSockets: the contract is in [docs/networking/SERVER_ROOMS.md](docs/networking/SERVER_ROOMS.md) and the local runtime in [docs/networking/CLOUDFLARE_SETUP.md](docs/networking/CLOUDFLARE_SETUP.md). Browser adoption and deployment are future work.

## Build and hosting

Deploy only the generated `dist/` directory to static HTTPS hosting. Development and preview servers bind to loopback and are not production hosts. Production deployment is a Q1 task and needs the owner's authorization.

## Contributing and agent coordination

Start with [AGENTS.md](AGENTS.md), [docs/ISSUES.md](docs/ISSUES.md) and [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md). The [GitHub agent backlog](https://github.com/SpikemenDan/putt-pals/issues?q=is%3Aissue+is%3Aopen+label%3Aagent-task) is the live work queue; each worker uses a confirmed issue, an isolated branch and a linked PR.

```sh
gh issue list --repo SpikemenDan/putt-pals --state open --label agent-task --label status:ready --search 'no:assignee'
```

An empty assignee field does not rule out a claim in the issue body or comments, so confirm one worker per issue with the coordinator before editing. Documents: [ARCHITECTURE.md](ARCHITECTURE.md) (modules, contracts, gameplay systems design), [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md) (vision, technology, stages), [TASKS.md](TASKS.md) (roadmap), [PROJECT_STATUS.md](PROJECT_STATUS.md) (accepted state and known issues), [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) (embedded library provenance) and [docs/reviews/](docs/reviews/) (per-task handoffs). Issue and PR templates and the CI workflow are in `.github/`.
