# Putt Pals

A fast-paced 3D multiplayer mini-golf game for desktop browsers. It blends arcade party chaos (power-ups, hazards, trick shots) with skill-based putting: easy to jump into with friends, with real depth for competitive players. Modes today: solo practice, single-putt replay, private friend rooms, and 3-, 6- and 9-map tournaments. Planned: Putt Pong, a No Power-Ups mode, a full power-up and hazard catalog, vertical courses and cosmetics. See [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md) for the vision and plan.

The modular app (`index.html` and `src/`) is the game. The original single-file version was retired. The legacy page and tools.js were removed after commit b1a57c4; `git show b1a57c4:putt-pals.html` (or `:tools.js`) recovers them.

## Setup

Use Node.js 22.22.2+ on the 22.x line, 24.15.0+ on the 24.x line, or 26+ (the pinned jsdom runtime requires these). Install the exact dependency tree from the lockfile:

```sh
npm ci
npm run dev
```

Vite prints the local URL (normally `http://127.0.0.1:5173/`). The app is served at the root path, and `dev` and `preview` open it. In `npm run dev` a "Display tuning" panel (development only, docs/DISPLAY.md) adjusts presentation settings live. Use solo mode to develop without any online service. Contributors: see [README_DEV.md](README_DEV.md) for the full setup (website, online rooms, hosting) and the overnight-session procedure.

## Commands

Commands are listed as they exist in `package.json`; keep this table in sync when scripts change.

| Command | Purpose |
| --- | --- |
| `npm run check` | Course geometry, playable positions and resolved-rule checks (`tools/cli check`) |
| `npm run test:contracts` | Shared contracts, rules, schemas, mocks and server-room contracts |
| `npm run test:simulation` | Headless simulation parity and cup-capture tests |
| `npm run test:session` | Fake-clock room lifecycle, voting and scoring scenarios |
| `npm run test:network` | Transport and protocol scenarios, including fake multi-client rooms |
| `npm run test:audio` | Procedural audio recipes, event mapping and resource lifecycle |
| `npm run test:render` | Renderer and camera checks (legacy parity replays recorded output), toon style, palettes and weather |
| `npm run test:input` | Desktop input and camera transition checks |
| `npm run test:ui` | React screens, UI store and cleanup |
| `npm run test:app` | Composed app flows, four clients and cleanup |
| `npm run test:courses` | Validate all 22 courses and detect stale inventory metadata |
| `npm run test:cli` | Course, solver and arena commands, file inputs and failure paths |
| `npm run test:physics` | Surface friction, cup radius and mechanic-chamber checks on the shared simulation; may take around a minute |
| `npm run test:integration` | Integration checks such as out-of-bounds handling |
| `npm run test:overnight` | Overnight backup, upload gate, preflight and session-limit checks (fake rclone and assistant; about a minute) |
| `npm run test:browser` | Playwright real-browser suites (`npx playwright test --project=chromium` for Chromium only) |
| `npm run test:rooms:local` | Build, then check the local Cloudflare Worker and Durable Object runtime |
| `npm test` | The main suites above, sequentially; allow several minutes |
| `npm run build` | Build `dist/` (one page) and check headers, assets and that no development-only code ships |
| `npm run build:portable` | Build `release/putt-pals/` and `release/putt-pals.zip`: unzip and double-click `index.html` (no server; rooms still need internet). Not a supported distribution path (offline distribution is out of scope); not verified |
| `npm run preview` | Serve the built game locally, normally at `http://127.0.0.1:4173/` |
| `npm run rooms:dev` | Run the local Worker room runtime (see [Cloudflare setup](docs/networking/CLOUDFLARE_SETUP.md)) |
| `npm run solve -- 0 0` | Find a robust shot for map 0, putt 0; add `--full` for an exhaustive search |
| `npm run rank` | Print recorded difficulty counts; these are stale and do not certify current difficulty |
| `npm run overnight:backup` | Create and verify a local recovery backup (see [docs/OVERNIGHT.md](docs/OVERNIGHT.md)) |
| `npm run overnight:readiness` | Check the Google Drive upload setup for overnight backups |

jsdom suites stub WebGL, canvas and audio and use fake networks. They do not prove real rendering, audio quality or WebRTC connectivity; use the Playwright suites and manual playtests for those. Exhaustive difficulty sweeps run separately from pull-request checks. Solver and fixture details are in [docs/BASELINE.md](docs/BASELINE.md) and [docs/reviews/B4_DIFFICULTY.md](docs/reviews/B4_DIFFICULTY.md).

## Online rooms

The modular app's online rooms are server-owned: the browser connects over WebSockets to a Cloudflare Worker with a SQLite Durable Object per room (contract in [docs/networking/SERVER_ROOMS.md](docs/networking/SERVER_ROOMS.md), local runtime in [docs/networking/CLOUDFLARE_SETUP.md](docs/networking/CLOUDFLARE_SETUP.md)). Ball physics is still client-trusted. A hosted preview is deployed (see [docs/networking/CLOUDFLARE_DEPLOY.md](docs/networking/CLOUDFLARE_DEPLOY.md)); testing across separate networks and any production deployment still need owner authorization. PeerJS survives only as a legacy adapter (`src/network/peer.js`) that online rooms no longer use.

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

Developer settings: simulation settings in [docs/TUNING.md](docs/TUNING.md),
presentation settings in [docs/DISPLAY.md](docs/DISPLAY.md). `npm run dev` shows a
development-only "Display tuning" panel for the presentation settings (sliders,
reset, validated import/export); it is not in production builds. For appearance
or game-feel proposals, present a local browser preview with relevant controls
before owner acceptance.

The legacy single-file game was retired (see ARCHITECTURE.md, "Legacy retirement").

Overnight work starts only on a fresh explicit user command, with bounded scope,
runtime limit and a verified private Google Drive recovery backup. It does not
push, merge, deploy or automatically restart. Procedure and limits:
[docs/OVERNIGHT.md](docs/OVERNIGHT.md); contributor quick start:
[README_DEV.md](README_DEV.md).

References:
- [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md): product vision and stages.
- [ARCHITECTURE.md](ARCHITECTURE.md): technical design.
- [TASKS.md](TASKS.md): roadmap and dependencies.
- [PROJECT_STATUS.md](PROJECT_STATUS.md): implementation summary.
- [docs/ISSUES.md](docs/ISSUES.md): substantial work tracking.
- [docs/AGENT_ROUTING.md](docs/AGENT_ROUTING.md): model responsibilities.
- [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md): library provenance.
- [README_DEV.md](README_DEV.md): contributor setup, hosting and overnight sessions.
- [docs/DISPLAY.md](docs/DISPLAY.md) and [docs/TUNING.md](docs/TUNING.md): presentation and simulation settings.
- [docs/OVERNIGHT.md](docs/OVERNIGHT.md): overnight backup and session tooling.
- [docs/networking/CLOUDFLARE_DEPLOY.md](docs/networking/CLOUDFLARE_DEPLOY.md): hosted preview preparation, deployment record and rollback.
- [docs/networking/DURABLE_RECOVERY.md](docs/networking/DURABLE_RECOVERY.md) and [docs/networking/WEBSOCKET_CLIENT.md](docs/networking/WEBSOCKET_CLIENT.md): room recovery and the browser WebSocket client.
