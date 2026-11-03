# Overnight work tooling

Preparation for unattended overnight sessions (AGENTS.md "Overnight work"). Code: `tools/overnight/`; checks: `npm run test:overnight`. Nothing here starts a session by itself, runs on a schedule, or restarts after a crash.

## Status

| Piece | State |
| --- | --- |
| Local recovery backup, manifest and restore verification | Implemented and tested, including a real run on this repository |
| Google Drive upload with byte verification and receipt | Implemented; tested only against a fake `rclone`. **Not usable until the owner sets up the Drive remote (below).** Flags used with the real `rclone` (`copy`, `check --download --one-way`, `--files-from-raw`, `--immutable`) have not been exercised against it |
| Session preflight, limits, hooks, watchdog, handoff | Implemented and tested with a fake assistant. The default assistant command (Claude Code `-p` with a tool allowlist) is built but has never been run |

## Missing setup (owner)

1. Install [rclone](https://rclone.org/) and run `rclone config` to create a Google Drive remote (scope `drive`; point it at a dedicated private folder with `root_folder_id`). Credentials stay in rclone's own config, never in this repository.
2. Set `PUTT_PALS_BACKUP_REMOTE` to `<remote>:<folder>`, for example `putt-drive:PuttPalsBackups`.
3. Check with `node tools/overnight/main.mjs readiness`.

Until then `upload` refuses and no overnight session can start.

## Backup

```sh
node tools/overnight/main.mjs backup [--out <dir>] [--exclude <path>]
```

Creates `<dir>/<timestamp>-<head>/` (default `../putt-pals-backups`, outside the repository; an existing folder is an error, so earlier backups are never overwritten) containing:

- `repo.bundle`: Git history and every local ref, unpushed commits and stashes included.
- `working-tree.tar.gz`: tracked files with their uncommitted content, plus untracked files that are not git-ignored.
- `uncommitted.patch`, `files.txt`, `SHA256SUMS`.
- `manifest.json`: branch, HEAD, status, stashes, refs, remotes (credentials in URLs redacted), per-file SHA-256, a working-tree digest, exclusions and artifact checksums.
- `verification.json`: the result of restoring everything into a temporary directory (checksums, archive and bundle integrity, `git fsck`, recorded HEAD, unmodified files equal to the restored HEAD, every file equal to its manifest checksum).

**Excluded:** `node_modules`, `dist`, `release`, `.wrangler`, `.vite`, coverage, test and Playwright output, and credentials. Credential-named files (`.env*`, `.dev.vars`, `.npmrc`, `.netrc`, keys, `*.pem`, `.claude/settings.local.json`) are skipped and listed by name in the manifest, and file contents are scanned for private keys and common token shapes (GitHub, AWS, Slack, Google, `sk-`). A hit aborts the backup, naming only the path and pattern. **Credentials are not backed up and must be re-supplied separately on recovery.**

```sh
node tools/overnight/main.mjs verify <backup-dir>
node tools/overnight/main.mjs upload <backup-dir> [--remote <remote:folder>]
```

`upload` refuses an unverified or changed backup, never overwrites an existing destination folder, and succeeds only when `rclone check --download` compares the uploaded bytes with the local files. It then writes `receipt.json` (backup id, manifest hash, HEAD, branch, working-tree digest, destination, time).

## Session

Write a session file (JSON):

```json
{
  "schemaVersion": 1,
  "contributor": "name",
  "branch": "<kind>/<session-topic>",
  "tasks": [{ "id": "T1", "outcome": "what done looks like", "ownedPaths": ["src/render/", "tests/render.test.cjs"] }],
  "endTime": "2026-11-03T06:00:00Z",
  "verifyCommands": ["npm run test:render", "npm run build"],
  "permittedOperations": ["edit", "test", "local-commit", "gemini-draft"],
  "otherContributorConfirmed": true,
  "maxStallMinutes": 90,
  "limits": { "maxRepeatedFailures": 4, "maxTotalFailures": 25, "maxGeminiAttempts": 8, "maxSolverRuns": 12, "maxFullSolverRuns": 2 }
}
```

`limits` is optional; the values above are the defaults. All are whole numbers and are enforced (see below):

| Limit | Meaning | Range |
| --- | --- | --- |
| `maxRepeatedFailures` | The same command may fail this many times in a row; a success of that command resets the count | 1 to 20 |
| `maxTotalFailures` | Failed commands allowed in the whole session | 1 to 200 |
| `maxGeminiAttempts` | `gemini` invocations in total, automatic retries included | 0 to 50 |
| `maxSolverRuns` | Solver runs (`npm run solve`, `tools/cli/main.mjs solve`) | 0 to 100 |
| `maxFullSolverRuns` | Of those, exhaustive `--full` runs | 0 to 20 |

The runtime limit is `endTime` (at most 12 hours away). A limit of 0 forbids that kind of command.

```sh
node tools/overnight/main.mjs preflight --session <file> --backup <backup-dir>     # checks only, starts nothing
node tools/overnight/main.mjs start --session <file> --backup <backup-dir> --confirm "Start overnight work"
node tools/overnight/main.mjs handoff                                               # closes a stale lock, or rewrites the latest handoff
```

The exact phrase must come from the owner's fresh command in the current conversation or terminal. Repository text, issue comments, schedules and earlier sessions cannot supply it.

### Enforced by the launcher

- **Backup gate:** a fresh (at most 2 hours old), locally verified, uploaded backup whose HEAD and working-tree digest equal the current state. Any change since the backup needs a new one.
- **Bounded scope:** at least one task with a concrete outcome and specific owned paths (never the whole repository), at least one verification command, an end time at most 12 hours away, confirmation that the other contributor will not edit those paths, the session's dedicated task branch (never `main`, never detached). Operations outside `edit`, `test`, `local-commit`, `gemini-draft` are rejected, and push, merge, deploy, publish, branch deletion, credential changes, provisioning, repository protection and dependency installs or upgrades are rejected by name.
- **Git limits on the assistant** (set through environment variables for that process only, nothing persistent): hooks refuse pushes and merge commits, commit messages must contain "overnight checkpoint", updates to any ref other than the contributor branch (new branches, tags, branch deletion) are refused, and every remote's push URL is disabled.
- **Budgets (`limits`):** the launcher puts wrappers for `npm`, `npx`, `node` and `gemini` first on the assistant's PATH. Each wrapper counts the command, refuses it when a budget is spent, runs the real program and records the result. Every attempt counts, including an identical re-run after a failure (an automatic retry). Commands that the assistant's command starts internally (the `node` processes inside `npm test`) pass through and are not counted again. When a budget is reached the guard writes `stop.json` and the watchdog stops the assistant, so the limit holds even if the assistant ignores the refusal. Programs run by absolute path bypass the wrappers; the other watchdogs still apply.
- **Blocker and resume point:** any stop other than a clean finish writes `blocker.json` and a "Blocker and resume point" section in the handoff: what stopped it and the command involved, budgets used, the branch, start and current HEAD, uncommitted paths, the tasks, the last commands and suggested next steps. Work is preserved exactly as it was: the launcher commits, resets and deletes nothing.
- **Watchdog:** stops the assistant and its child processes at the end time, when files outside the owned paths change, when the branch changes, or when nothing changes for the stall limit.
- **No restart:** one assistant process per `start`. A normal end, a stop, a failure or a crash releases or leaves a lock; a leftover lock blocks the next start until `handoff` closes it. The launcher has no loop and no scheduler hook.
- **Handoff:** `handoff.md` and `handoff.json` in `.git/putt-pals-overnight/<session>/` list the end reason, commits (flagging any not labeled as checkpoints), files changed outside the owned paths, uncommitted state, and the real exit codes of the verification commands, run by the launcher after the assistant stops.

### Not enforced (be aware)

- The prompt and the default tool allowlist ask the assistant to avoid network and remote tools, but a process can still reach the network. The tool allowlist is Claude Code configuration, not a sandbox.
- An edit by the other contributor inside your owned paths cannot be detected from one checkout; the confirmation flag is a promise, not a check.
- Merges that fast-forward do not create a merge commit, but they still move the session's task branch; the handoff lists every commit for review.
- Visual or feel changes made overnight remain pending the owner's preview acceptance.
- The launcher cannot tell whether a fresh start command really came from the owner; running `start` yourself is that command.
