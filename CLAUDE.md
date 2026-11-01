# Claude instructions

@AGENTS.md is the single source of truth; nothing from it is repeated here.

## Claude-specific

- Plan before editing `src/shared` or `src/simulation`; those changes need the integration owner and may alter shot trajectories.
- Search with Grep or Glob and read only the needed sections of the large docs (MODERNIZATION_PLAN.md, TASKS.md, ARCHITECTURE.md) instead of loading them whole.
- Hand mundane work (status snapshots, triage, PR drafts, doc syncs, log summaries) to Gemini per docs/AGENT_ROUTING.md and verify its draft before committing.
- Commit work in progress to your own branch; never `git stash` (shared across worktrees).
