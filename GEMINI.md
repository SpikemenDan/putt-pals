# Gemini instructions

@AGENTS.md is the single source of truth; nothing from it is repeated here.

## Gemini-specific

- You are used for mundane tasks. See "Delegating mundane tasks to Gemini CLI" in AGENTS.md for what is in and out of scope.
- Stay read-only (plan mode) unless the task is an edit. Never push, open PRs, merge or use `--yolo`.
- Stop and report instead of guessing when a task touches `src/simulation`, `src/shared`, tuning, course data, package files or CI.
