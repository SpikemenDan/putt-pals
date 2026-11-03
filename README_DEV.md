# Developer guide

For the two contributors: how to set up the project, run and host the website, and run overnight sessions. The product vision and rules live in [README.md](README.md), [AGENTS.md](AGENTS.md) and [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md); this file is the practical quick start and does not replace them.

## Who works where

| Contributor | Branch |
| --- | --- |
| SpikemenDan | `dev/spikemendan` |
| Partner | `dev/arshakir` |

- One reusable branch each. `main` holds integrated, verified work. Do not create a branch per task.
- Work only on your own branch and your own checkout. Never overwrite the other person's work, and tell each other before editing the same paths.
- Integrate through a pull request into `main`. After it merges, bring your branch up to date so old changes don't reappear:

```sh
git fetch origin
git switch dev/<your-branch>
git merge --ff-only origin/main
```

If `--ff-only` refuses because you have unmerged commits, use `git merge origin/main` and resolve any conflicts. Do not reset, clean or force-push.

## One-time machine setup (both of you)

1. Install Node.js: 22.22.2 or later on the 22.x line, 24.15.0 or later on 24.x, or 26+. Install Git. Install the GitHub CLI (`gh`) if you want to open PRs from the terminal.
2. Clone the repository and switch to your branch:

```sh
git clone https://github.com/SpikemenDan/putt-pals.git
cd putt-pals
git switch dev/<your-branch>
```

3. Install the exact dependencies and start the game:

```sh
npm ci
npm run dev
```

The game opens at `http://127.0.0.1:5173/`. Solo mode needs no online service. `npm run dev` also shows a **Display tuning** button (development only) with live sliders for arrow and ball presentation; see [docs/DISPLAY.md](docs/DISPLAY.md).

## Running the website

| Goal | Command | Notes |
| --- | --- | --- |
| Develop with hot reload | `npm run dev` | Solo play. The Display tuning panel is only here |
| Check the production build | `npm run build`, then `npm run preview` | Preview serves `dist/` at `http://127.0.0.1:4173/` |
| Online rooms on your machine | `npm run rooms:dev` | Builds, then runs the Worker and room objects at `http://127.0.0.1:8787`. Open two browser tabs with the same room code. No Cloudflare account or login needed |
| Verify the room runtime | `npm run test:rooms:local` | Runs a real local Worker. On the Windows machine used so far, Wrangler exited early; if it does the same for you, rely on CI for this check |
| Real-browser checks | `npm run test:browser` | Playwright. `npx playwright test --project=chromium` runs Chromium only |
| Everything else | `npm test` | Several minutes. Run focused suites (`npm run test:render`, and so on) while you work |

The room runtime is a Cloudflare Worker with one SQLite Durable Object per room. Details: [docs/networking/CLOUDFLARE_SETUP.md](docs/networking/CLOUDFLARE_SETUP.md) (local), [docs/networking/SERVER_ROOMS.md](docs/networking/SERVER_ROOMS.md) (contract) and [docs/networking/DURABLE_RECOVERY.md](docs/networking/DURABLE_RECOVERY.md).

### Hosting it online (Cloudflare)

- A hosted **preview** exists on Cloudflare Workers Free (Worker `putt-pals-rooms-preview`). It was deployed under the owner's authorization and recorded in [docs/networking/CLOUDFLARE_DEPLOY.md](docs/networking/CLOUDFLARE_DEPLOY.md), together with what was and was not verified. Separate-network play is still unverified. There is **no production** deployment.
- Deploying or redeploying needs the owner's explicit approval of the account, plan, resource names and scopes. Do not run `wrangler login`, `whoami`, deploy, or create tokens before that approval, and never put tokens in source, chat, GitHub or logs. The step-by-step procedure, rollback and approval worksheet are in the deploy doc.
- The pieces you can prepare without any account: `npm run build`, `node scripts/prepare-cloudflare-preview.mjs ...` (writes ignored local config, makes no network call) and `npx wrangler deploy --dry-run`. The doc lists the exact commands.
- The static site is just the generated `dist/` folder over HTTPS. The Worker serves it and routes `/api/rooms/<code>/socket` to the room object.

## Overnight sessions

An overnight session lets Claude work unattended on your own branch within strict limits. It never pushes, merges, deploys, installs dependencies or restarts itself, and it needs a verified backup in Google Drive first. Full details and limits: [docs/OVERNIGHT.md](docs/OVERNIGHT.md).

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

1. **Be ready.** You are on your own branch. Agree with your partner that they won't touch the paths you will own tonight.
2. **Write a session file outside the repository** (an untracked file inside it would change the working tree and invalidate the backup), for example `../putt-pals-sessions/tonight.json`:

```json
{
  "schemaVersion": 1,
  "contributor": "your-name",
  "branch": "dev/your-branch",
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

## Where things are

| Topic | Doc |
| --- | --- |
| Rules, permissions, overnight policy | [AGENTS.md](AGENTS.md) |
| Branches, PRs, CI, fingerprints | [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md) |
| Architecture and the legacy retirement record | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Roadmap and status | [TASKS.md](TASKS.md), [PROJECT_STATUS.md](PROJECT_STATUS.md) |
| Simulation and presentation settings | [docs/TUNING.md](docs/TUNING.md), [docs/DISPLAY.md](docs/DISPLAY.md) |
| Cloudflare local runtime and deployment | [docs/networking/CLOUDFLARE_SETUP.md](docs/networking/CLOUDFLARE_SETUP.md), [docs/networking/CLOUDFLARE_DEPLOY.md](docs/networking/CLOUDFLARE_DEPLOY.md) |
| Overnight backup and sessions | [docs/OVERNIGHT.md](docs/OVERNIGHT.md) |
