# Agent routing

Use the cheapest model that can do the task safely. Gemini output is always a draft that Claude or the coordinator verifies before commit; Gemini gets its own worktree like any agent and follows [GEMINI.md](../GEMINI.md).

| Task | Model |
| --- | --- |
| Refresh PROJECT_STATUS.md, TASKS.md or docs/ISSUES.md snapshots from `gh issue/pr list` output | Gemini Pro |
| Triage issues and PRs, duplicate checks, summaries and handoff notes | Gemini Pro |
| Draft PR descriptions and issue text from a diff or template | Gemini Pro |
| Sync README command table and docs with package.json; link and path checks | Gemini Pro |
| Summarize long CI logs or test output | Gemini Pro |
| Formatting, renames in docs, boilerplate test scaffolds | Gemini Pro |
| Simulation, physics, tuning and fingerprints | Claude |
| `src/shared` contracts, protocol, session rules | Claude |
| Course geometry, solver, difficulty sweeps | Claude |
| Networking, Durable Objects, recovery | Claude |
| Reviews of substantive shared changes; final verification | Claude |

## Running Gemini

Headless, from the task's worktree:

```sh
gh issue list --repo SpikemenDan/putt-pals --label agent-task --state open --json number,title,labels,assignees | gemini -p "Summarize ownership and blockers per issue. Output markdown only; mark anything uncertain."
```

Pipe in only the data the task needs. Review the result and the diff before committing; any edit to a coordinator-owned file still needs the integration owner.

Gemini CLI 0.66 exits with code 55 in an untrusted folder. For piped-text tasks, run it from an empty scratch directory with `--skip-trust`; do not skip trust inside a worktree that has project config. It also needs network access to the Gemini API: if it fails with `fetch failed`, do the task directly instead of retrying.
