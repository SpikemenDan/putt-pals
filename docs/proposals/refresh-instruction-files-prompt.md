# Prompt: refresh the instruction and status files

Copy the block below to a Claude session started in a fresh worktree (`agent/docs-refresh-instructions` from origin/main). It is docs-only; the coordinator/integration owner approves AGENTS.md, TASKS.md and PROJECT_STATUS.md edits.

```text
You are working in SpikemenDan/putt-pals. Task: bring the instruction and status files up to date with main. Docs only: change no code, package.json, lockfile or CI. One branch (agent/docs-refresh-instructions from origin/main), one draft PR, no merge.

Read first: AGENTS.md, docs/GITHUB_WORKFLOW.md, docs/ISSUES.md, TASKS.md, PROJECT_STATUS.md, ARCHITECTURE.md, README.md, and `git log --oneline -40 origin/main`. Verify every claim against the repo and `gh issue/pr list --repo SpikemenDan/putt-pals` before writing it. Do not guess; if something cannot be verified, leave it and list it in the PR body.

Known stale or missing items to fix (verify each first):
1. PROJECT_STATUS.md: "Accepted main" is 333d06d (N4c). Update to current main and record merged work: U2 aim arrow (#107), T2 tuning module (#109, docs/TUNING.md), CL1 geometry validator (#108, with the two open mover waivers for Hourglass and Elevator Alley and the Fortress Spiral cup move to [400,298] awaiting owner confirmation), and the dev/preview change if PR #110 has merged.
2. TASKS.md and docs/ISSUES.md: mark T2, U2 and CL1 per live GitHub state (U2 #84 and CL1 #102 stay open pending owner decisions unless GitHub says otherwise); note that S3 (#86) is now unblocked by T2. Keep the live GitHub issue as the source of truth.
3. ARCHITECTURE.md: the "Modular application (I1)" paragraph still says Three.js 0.128.0 (package.json has 0.186.1) and duplicates the intro. Reconcile with package.json, remove the duplication, and mention src/shared/tuning.js as the single home for gameplay numbers.
4. AGENTS.md engineering rules, add short rules for: (a) gameplay numbers live in src/shared/tuning.js (validated; docs/TUNING.md lists fields); no new literals in simulation, input or renderer; (b) new course data must pass the CL1 validator and any waiver goes in GEOMETRY_INTEGRITY_EXCEPTIONS with owner approval; (c) src/simulation or src/shared edits change the simulation fingerprint in tests/fixtures/cup-capture/*.json; compute it from committed (LF) files, not a Windows CRLF checkout, because CI hashes LF; (d) git stash is shared across worktrees: never stash, commit WIP instead; (e) the modular app (index.html, src/) is the game, `npm run dev` and `preview` open it, and new visuals or features never go in putt-pals.html.
5. README.md command table and Quick start: make sure they match package.json scripts exactly (check after PR #110) and describe where the legacy page lives.
6. docs/GITHUB_WORKFLOW.md "Current handoff": make it point to the live queue only (no dated snapshot) and add the stash and worktree cleanup guidance.
7. Add a short repo-level CLAUDE.md that points to AGENTS.md (one source of truth, no duplicated rules).
8. Remove any reference to files that no longer exist (e.g. HANDOFF.md) and fix broken relative links; run a link/path check over the touched files.

Verification: `npm run check` and `npm run build` still pass; list every file you changed and each claim you verified in the PR body. Finish the PR body with the line: 🤖 Generated with [Claude Code](https://claude.com/claude-code). End commit messages with the Co-Authored-By line your environment gives you.
```
