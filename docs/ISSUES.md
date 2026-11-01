# Find and claim work from GitHub issues

The [GitHub agent backlog](https://github.com/SpikemenDan/putt-pals/issues?q=is%3Aissue+is%3Aopen+label%3Aagent-task) is the live work queue. Start there whenever the user asks you to work on the next task. Read this guide and docs/GITHUB_WORKFLOW.md before editing. TASKS.md describes the roadmap; its snapshot must not override a live issue claim, blocker or merged implementation.

## Agent startup

```sh
gh issue list --repo SpikemenDan/putt-pals --state open --label agent-task --json number,title,labels,assignees,url
gh issue list --repo SpikemenDan/putt-pals --state open --label agent-task --label status:ready --search 'no:assignee' --json number,title,url
gh pr list --repo SpikemenDan/putt-pals --state open --json number,title,headRefName,url
```

If the user names an issue, inspect that issue instead of choosing another. Otherwise choose a suitable ready issue from the live queue. Do not ask the user which task to do when the existing authorized assignment/coordinator process already answers that question. The backlog itself does not authorize working through every issue.

Before claiming:

1. Open the candidate issue, including comments and linked PRs, using `gh issue view NUMBER --repo SpikemenDan/putt-pals --comments` (replace NUMBER with its issue number).
2. Inspect native prerequisites with `gh api repos/SpikemenDan/putt-pals/issues/NUMBER/dependencies/blocked_by`. Confirm each blocker is integrated into main; inspect additional decisions in the body. A ready label is a hint, not proof that every requirement is met.
3. Check the issue body for a worker/session claim, active branch and owned paths. An empty GitHub assignee field does not guarantee the task is free, particularly when several agents use one GitHub account.
4. Fetch current main and inspect recent commits plus actual files. Branch names and commit messages are evidence of work, not proof of acceptance or passing tests. Report discrepancies instead of duplicating work or declaring a task done from its title.
5. Have the coordinator confirm one worker/session and exclusive paths. A coordinator acting as worker can record its own claim after checking there is no competing owner. If another agent is already active, choose different eligible work.

## Claim record

Record the following in the issue body or an authorized claim comment before editing:

```text
Status: ACTIVE
Worker GitHub identity + agent/session:
Coordinator confirmation:
Branch/worktree:
Owned paths, including tests:
Accepted dependency / contract commits:
Authorized operations and remaining approval gates:
Next action:
```

The coordinator assigns the appropriate GitHub identity where useful and replaces `status:ready` with `status:active`. GitHub assignees identify accounts; the worker/session field distinguishes concurrent agents on one account. Claims are confirmed serially; a comment alone cannot win a race against a conflicting claim.

Use an isolated checkout/worktree and task branch based on current main. Do not edit another agent's branch or working directory. Shared contracts, dependency files, CI and common status docs require explicit integration-owner delegation. Confirm legacy file placement and import paths before copying code between directories.

## Progress and completion

- Keep updates on the assigned issue and linked PR. Report the current commit, changed paths, exact verification commands/results, failures and next action. Do not make every worker edit TASKS.md or PROJECT_STATUS.md.
- Mark partial work ACTIVE, even when a commit lands. Record unmet acceptance criteria explicitly. If an environment/dependency prevents progress, use `status:blocked` with the concrete reason and release ownership only through the coordinator.
- When ready, use `status:review`, open/update one task PR and link the issue. Use `Closes #NUMBER` only for complete accepted work; use `Refs #NUMBER` for partial delivery.
- Close an issue only after accepted integration and verification. On completion, the coordinator checks downstream native dependencies and decision gates before replacing their `status:blocked` label with `status:ready`.
- Refresh the issue and main after interruptions. Closed issues are not new work; optional issues require explicit selection. If no eligible unclaimed issue exists, report the blockers rather than starting blocked or unplanned work.
- Follow the current user approval boundaries. The direct main push authorized for this backlog/docs setup does not authorize every future worker to bypass PR/review/merge approval.

## Labels

| Label | Meaning |
| --- | --- |
| agent-task | Work tracked through the modernization agent workflow |
| status:ready | Eligible for coordinator-confirmed claim, subject to dependency/decision checks |
| status:active | Owned/reserved or partially implemented; do not duplicate |
| status:blocked | Waiting on a prerequisite, decision or concrete blocker |
| status:review | Implementation prepared; acceptance/integration pending |
| status:paused | Deliberately held by the user or coordinator; do not resume without explicit go-ahead |
| optional | Requires explicit coordinator/user selection, even after code prerequisites close |

Use one status label on each open agent task. Completed issues are closed; their native prerequisite links remain as history. Labels are maintained by the coordinator and can lag a just-merged PR, so read the issue and accepted code before acting.

## Issue index

Roadmap IDs, dependencies and labels (`vision`, `area:physics|gameplay|courses|ui|network`, `needs:integration-owner` for tasks touching `src/shared`, package files or CI) are in TASKS.md; each row links its issue. Search by ID, for example `gh issue list --repo SpikemenDan/putt-pals --state all --search "G1b in:title"`. An issue is not authorized work until the coordinator confirms a claim; umbrellas G1 (#34) and K1 (#35) are tracking only.

## Superseded and historical notes

Earlier versions of this file carried dated snapshots of individual task states. The PR history, issue comments and docs/reviews/ hold that evidence; read live issues instead of any snapshot.
