# Work tracking

Issues track substantial tasks, defects, dependencies and handoffs.
Small direct user requests do not require an issue.

## Starting work

Inspect relevant existing issues and PRs to avoid duplication.
Read comments and active claims when ownership is unclear.
A label or empty assignee field does not prove availability.

For substantial work, record:
- Contributor.
- Task branch.
- Outcome and scope.
- Affected paths.
- Dependencies.
- Acceptance criteria.
- Relevant verification.
- Remaining work.

Use one short-lived task branch per coherent task, created from updated main
(AGENTS.md, "Task-branch workflow"). Reuse it until the task is integrated and keep
unrelated roadmap items off it. Do not create worktrees or clones automatically.

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

## N4 reconciliation — 2026-11-02

N4a–N4f are integrated into main: PRs #74, #75, #81/#120, #122, #123 and #129; all corresponding issues are closed. N4g preview preparation is present via PR #141 (`78bfe7f`); PR #130 alone did not establish its presence on main. The preview is deployed, and hosted four-client physical-shot play plus maintenance/compatible-code-update recovery passed. Original game version `57061c95-7170-4bbf-96bc-55d3cf35e46e` is restored at 100%.

Parent #65 and N4g #73 remain open for preview deployment of the empty-room admission fix in PR #145 (`28072ff`) and separate-network validation, which the user deferred. Provider usage observations and idle-data limitations are recorded in docs/reviews/N4_SERVER_ROOMS.md. Bounded preview authorization is recorded in #73; production publication remains separate.
