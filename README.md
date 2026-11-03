# Putt Pals

A fast-paced 3D multiplayer mini-golf game for desktop browsers. It blends arcade party chaos (power-ups, hazards, trick shots) with skill-based putting: easy to jump into with friends, with real depth for competitive players. Modes today: solo practice, single-putt replay, private friend rooms, and 3-, 6- and 9-map tournaments. Planned: Putt Pong, a No Power-Ups mode, a full power-up and hazard catalog, vertical courses and cosmetics. See [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md) for the vision and plan.

The modular app (`index.html` and `src/`) is the game. The original single-file version was retired. The legacy page and tools.js were removed after commit b1a57c4; `git show b1a57c4:putt-pals.html` (or `:tools.js`) recovers them.

This README is the single guide for the two contributors: setup, running and hosting the website, commands, the working agreement and overnight sessions.

## Contents

- [Branch workflow](#branch-workflow)
- [Setup](#setup)
- [Commands](#commands)
- [Running the website](#running-the-website)
- [Online rooms and hosting](#online-rooms-and-hosting)
- [Contributing and AI workflow](#contributing-and-ai-workflow)
- [Overnight sessions](#overnight-sessions)
- [References](#references)

## Branch workflow

`main` holds integrated, verified work. Everything else happens on short-lived task branches.

- One branch per coherent feature, fix or cleanup, not per edit. Name it `<kind>/<short-topic>`, for example `feat/deployables`, `fix/room-admission` or `docs/task-branch-workflow`.
- Implementation, tests and documentation for a task share one branch. Reuse it until the task is merged, and keep unrelated roadmap items off it.
- Start each task from updated `main`, keeping any existing work safe:

```sh
git fetch origin
git switch -c <kind>/<topic> --no-track origin/main
```

- Open a focused PR when there is meaningful work to review. Pushes and merges still need your explicit say-so (or the AI's explicit authorization from you); see [AGENTS.md](AGENTS.md).
- After a merge, run the post-merge checklist in [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md): verify nothing unique is lost (for a squash merge, `git cherry origin/main <branch>` must show no `+` lines), remove the task's worktree if there was one, then `git branch -d <branch>`. Never `-D` or `--force`, and leave the remote branch until deletion is approved. Start the next task from updated `main` instead of reusing the old branch.
- Tell each other before editing the same paths. Never overwrite the other person's work, and never reset, clean or force-push to resolve a conflict.
- No worktrees or clones unless you both agree to work on two things at once.

The permanent `dev/spikemendan` and `dev/arshakir` branches are being retired. Do not add new work to them; check your own clone for unpushed work first (steps in [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md)).

## Setup

Both contributors, once per machine:

1. Install Node.js: 22.22.2 or later on the 22.x line, 24.15.0 or later on 24.x, or 26+ (the pinned jsdom runtime requires these). Install Git. Install the GitHub CLI (`gh`) if you want to open PRs from the terminal.
2. Clone the repository (you start on `main`; make a task branch before you edit, see [Branch workflow](#branch-workflow)):

```sh
git clone https://github.com/SpikemenDan/putt-pals.git
cd putt-pals
```

3. Install the exact dependency tree from the lockfile and start the game:

```sh
npm ci
npm run dev
```

Vite prints the local URL (normally `http://127.0.0.1:5173/`). The app is served at the root path, and `dev` and `preview` open it. In `npm run dev` a "Display tuning" panel (development only, [docs/DISPLAY.md](docs/DISPLAY.md)) adjusts presentation settings live. Use solo mode to develop without any online service.

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
| `npm run config:report` | Every DISPLAY and TUNING setting with default, range, units, restart rule and the files that read it; flags settings nothing reads (see [docs/DISPLAY.md](docs/DISPLAY.md)) |
| `npm run checks` | Recommend which of the commands above to run for your changed paths, and why; unknown paths fall back to the full suite (details in [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md)) |
| `npm run solve -- 0 0` | Find a robust shot for map 0, putt 0; add `--full` for an exhaustive search |
| `npm run rank` | Print recorded difficulty counts; these are stale and do not certify current difficulty |
| `npm run gemini:handoff -- --task ... --expect ... --file ...` | Bounded, read-only Gemini Pro handoff for routine drafts and summaries; refuses credentials and oversize input (see [docs/AGENT_ROUTING.md](docs/AGENT_ROUTING.md)) |
| `npm run test:gemini` | Gemini handoff limits, refusals and fallback, with a fake Gemini (nothing is sent) |
| `npm run overnight:backup` | Create and verify a local recovery backup (see [Overnight sessions](#overnight-sessions)) |
| `npm run overnight:readiness` | Check the Google Drive upload setup for overnight backups |

jsdom suites stub WebGL, canvas and audio and use fake networks. They do not prove real rendering, audio quality or WebRTC connectivity; use the Playwright suites and manual playtests for those. Exhaustive difficulty sweeps run separately from pull-request checks. Solver and fixture details are in [docs/BASELINE.md](docs/BASELINE.md) and [docs/reviews/B4_DIFFICULTY.md](docs/reviews/B4_DIFFICULTY.md).

## Running the website

| Goal | Command | Notes |
| --- | --- | --- |
| Develop with hot reload | `npm run dev` | Solo play. The Display tuning panel is only here |
| Check the production build | `npm run build`, then `npm run preview` | Preview serves `dist/` at `http://127.0.0.1:4173/` |
| Online rooms on your machine | `npm run rooms:dev` | Builds, then runs the Worker and room objects at `http://127.0.0.1:8787`. Open two browser tabs with the same room code. No Cloudflare account or login needed |
| Verify the room runtime | `npm run test:rooms:local` | Runs a real local Worker. On the Windows machine used so far, Wrangler exited early; if it does the same for you, rely on CI for this check |
| Real-browser checks | `npm run test:browser` | Playwright. `npx playwright test --project=chromium` runs Chromium only |
| Everything else | `npm test` | Several minutes. Run focused suites (`npm run test:render`, and so on) while you work |

## Online rooms and hosting

The modular app's online rooms are server-owned: the browser connects over WebSockets to a Cloudflare Worker with a SQLite Durable Object per room (contract in [docs/networking/SERVER_ROOMS.md](docs/networking/SERVER_ROOMS.md), local runtime in [docs/networking/CLOUDFLARE_SETUP.md](docs/networking/CLOUDFLARE_SETUP.md), recovery in [docs/networking/DURABLE_RECOVERY.md](docs/networking/DURABLE_RECOVERY.md), browser client in [docs/networking/WEBSOCKET_CLIENT.md](docs/networking/WEBSOCKET_CLIENT.md)). Ball physics is still client-trusted. PeerJS survives only as a legacy adapter (`src/network/peer.js`) that online rooms no longer use.

### Hosting it online (Cloudflare)

- A hosted **preview** exists on Cloudflare Workers Free (Worker `putt-pals-rooms-preview`). It was deployed under the owner's authorization and recorded in [docs/networking/CLOUDFLARE_DEPLOY.md](docs/networking/CLOUDFLARE_DEPLOY.md), together with what was and was not verified. Separate-network play is still unverified. There is **no production** deployment, and any production deployment is a Q1 task that needs the owner's authorization.
- Deploying or redeploying needs the owner's explicit approval of the account, plan, resource names and scopes. Do not run `wrangler login`, `whoami`, deploy, or create tokens before that approval, and never put tokens in source, chat, GitHub or logs. The step-by-step procedure, rollback and approval worksheet are in the deploy doc.
- The pieces you can prepare without any account: `npm run build`, `node scripts/prepare-cloudflare-preview.mjs ...` (writes ignored local config, makes no network call) and `npx wrangler deploy --dry-run`. The deploy doc lists the exact commands.
- The static site is the generated `dist/` folder over HTTPS. The Worker serves it and routes `/api/rooms/<code>/socket` to the room object. Development and preview servers bind to loopback and are not production hosts.

## Contributing and AI workflow

Start with [AGENTS.md](AGENTS.md) and
[docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md).

Two contributors use short-lived task branches (see [Branch workflow](#branch-workflow)). Main contains
integrated, verified changes. Create one branch per coherent task, not per small edit, and no
worktrees or clones unless you both authorize them.
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

The legacy single-file game was retired (see [ARCHITECTURE.md](ARCHITECTURE.md), "Legacy retirement").

## Overnight sessions

An overnight session lets Claude work unattended on a dedicated task branch within strict limits. It starts only on a fresh explicit command from you, with bounded scope, a runtime limit and a verified private Google Drive recovery backup. It never pushes, merges, deploys, installs dependencies or restarts itself. Code: `tools/overnight/`; checks: `npm run test:overnight`. Full details and limits: [docs/OVERNIGHT.md](docs/OVERNIGHT.md).

### One-time setup (each of you, on your own machine)

Each person sets up their own rclone remote and their own private Drive folder. Never share the rclone login between machines.

1. Install rclone (`winget install Rclone.Rclone` on Windows) and open a new terminal.
2. `rclone config`: new remote named `putt-drive`, storage type `drive`, scope **`drive.file`** (rclone can only see files it created), leave client id and secret blank, sign in with your own Google account in the browser.
3. `rclone mkdir putt-drive:PuttPalsBackups`
4. Tell the tools where to upload, then open a new terminal:

```sh
setx PUTT_PALS_BACKUP_REMOTE "putt-drive:PuttPalsBackups"
```

5. Check: `npm run overnight:readiness` should say "Google Drive upload is configured."

Notes: rclone's login token is in `%APPDATA%\rclone\rclone.conf`; keep it out of the repository and out of chat. If a token ever shows up somewhere it shouldn't, remove "rclone" at myaccount.google.com/permissions and sign in again. rclone's shared Google client id is being retired during 2026; if uploads suddenly fail, create your own client id (rclone.org/drive/#making-your-own-client-id).

### Each session

1. **Be ready.** Create a dedicated task branch for the session from updated `main` (see [Branch workflow](#branch-workflow)) and switch to it; it must not be `main` and should hold nothing but tonight's tasks. Agree with your partner that they won't touch the paths you will own tonight.
2. **Write a session file outside the repository** (an untracked file inside it would change the working tree and invalidate the backup), for example `../putt-pals-sessions/tonight.json`:

```json
{
  "schemaVersion": 1,
  "contributor": "your-name",
  "branch": "<kind>/<session-topic>",
  "tasks": [{ "id": "T1", "outcome": "what done looks like", "ownedPaths": ["src/render/", "tests/render.test.cjs"] }],
  "endTime": "2026-11-04T06:00:00Z",
  "verifyCommands": ["npm run test:render", "npm run build"],
  "permittedOperations": ["edit", "test", "local-commit", "gemini-draft"],
  "otherContributorConfirmed": true
}
```

`endTime` can be at most 12 hours away. `ownedPaths` must be specific files or folders, never the whole repository.

3. **Back up and upload.** The backup is valid for 2 hours and only for exactly this commit and working tree:

```sh
npm run overnight:backup
node tools/overnight/main.mjs upload "<backup folder it printed>"
```

4. **Dry run.** Starts nothing:

```sh
node tools/overnight/main.mjs preflight --session "<session file>" --backup "<backup folder>"
```

5. **Start.** Typing this command is your explicit start. It blocks until the session ends, so use a terminal you leave open and keep the computer awake:

```sh
node tools/overnight/main.mjs start --session "<session file>" --backup "<backup folder>" --confirm "Start overnight work"
```

### What is enforced

- No start without a fresh, verified, uploaded backup that matches the current state.
- The assistant's git (set up through environment variables for that process only) refuses pushes and merge commits, refuses any ref update except your branch, requires "overnight checkpoint" in every commit message, and has every remote's push URL disabled.
- A watchdog stops it at the end time, when it edits outside your owned paths, when the branch changes, or when nothing changes for 90 minutes.
- One assistant process per start. Nothing restarts it after a stop, crash or power loss.

Not enforced: a process can still use the network, and the tools cannot see your partner editing your paths. Review everything yourself afterwards.

### After a session

- Read `.git/putt-pals-overnight/<session id>/handoff.md`: commits, anything outside the owned paths, uncommitted work and the real results of your verify commands.
- Review the commits. Visual or feel changes stay pending your preview acceptance. Push, merge and deploy are still manual decisions.
- If the computer crashed mid-session, a lock blocks the next start. Close it with `node tools/overnight/main.mjs handoff`.
- The first real session should be short (30 to 60 minutes) and watched; the default Claude Code command has not been run unattended yet.

### Troubleshooting

| Message | Fix |
| --- | --- |
| "HEAD changed since the backup" or "the working tree changed" | Make a new backup and upload it |
| "the backup is N minutes old" | Same: new backup, upload, then start within 2 hours |
| "a session lock exists" | `node tools/overnight/main.mjs handoff` |
| "Google Drive upload is NOT ready" | Redo the setup above; open a new terminal after `winget` or `setx` |
| "Possible credentials found" | Remove the secret from the named file or add `--exclude <path>` to the backup command; the value is never printed |
| Backups pile up | Each is about 200 MB and growing. Local ones are in `../putt-pals-backups`; delete old ones by hand, and old Drive folders in `PuttPalsBackups` when you no longer need them |

Credentials (`.env*`, keys, tokens) are never backed up. On a recovery you must re-supply them yourself.

## References

- [AGENTS.md](AGENTS.md): rules, permissions and overnight policy.
- [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md): branches, PRs, CI and fingerprints.
- [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md): product vision and stages.
- [ARCHITECTURE.md](ARCHITECTURE.md): technical design and the legacy retirement record.
- [TASKS.md](TASKS.md): roadmap and dependencies.
- [PROJECT_STATUS.md](PROJECT_STATUS.md): implementation summary.
- [docs/ISSUES.md](docs/ISSUES.md): substantial work tracking.
- [docs/AGENT_ROUTING.md](docs/AGENT_ROUTING.md): model responsibilities.
- [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md): library provenance.
- [docs/DISPLAY.md](docs/DISPLAY.md) and [docs/TUNING.md](docs/TUNING.md): presentation and simulation settings.
- [docs/OVERNIGHT.md](docs/OVERNIGHT.md): overnight backup and session tooling in depth.
- [docs/networking/CLOUDFLARE_SETUP.md](docs/networking/CLOUDFLARE_SETUP.md) and [docs/networking/CLOUDFLARE_DEPLOY.md](docs/networking/CLOUDFLARE_DEPLOY.md): local runtime, hosted preview preparation, deployment record and rollback.
