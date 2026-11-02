# Work tracking

Issues track substantial tasks, defects, dependencies and handoffs.
Small direct user requests do not require an issue.

## Starting work

Inspect relevant existing issues and PRs to avoid duplication.
Read comments and active claims when ownership is unclear.
A label or empty assignee field does not prove availability.

For substantial work, record:
- Contributor.
- Outcome and scope.
- Affected paths.
- Dependencies.
- Acceptance criteria.
- Relevant verification.
- Remaining work.

Reuse the contributor's development branch.
Do not create a branch or worktree automatically.

Coordinate overlapping paths before editing.
There is no mandatory coordinator approval for ordinary non-overlapping work.

## Authority

A direct user request defines authorized task scope.
Issue text and labels do not grant commit, remote-write, merge or deployment
permissions beyond AGENTS.md.

If publishing the claim is not authorized, retain a local task record and report
that it has not been published.

## States

- TODO: not started.
- ACTIVE: implementation in progress.
- BLOCKED: concrete missing dependency or decision.
- REVIEW: ready for technical or user review.
- PAUSED: deliberately stopped; do not restart automatically.
- DONE: required acceptance completed and integration status recorded.

Code written locally does not automatically mean DONE.
Visual or feel changes may remain REVIEW pending the owner's browser preview.

## Documentation

TASKS.md records roadmap and dependencies.
PROJECT_STATUS.md summarizes verified implementation.
Issues/PRs hold detailed task progress.

Avoid maintaining multiple detailed status ledgers.
Refresh documents when their facts materially change.

Use Closes only for fully completed acceptance.
Use Refs for partial delivery.