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
| optional | Requires explicit coordinator/user selection, even after code prerequisites close |

Use one status label on each open agent task. Completed issues are closed; their native prerequisite links remain as history. Labels are maintained by the coordinator and can lag a just-merged PR, so read the issue and accepted code before acting.

## Issue index

This table links roadmap IDs to their issues; current state/ownership is always in GitHub. Completed C1/S1 issues were backfilled after their code landed; remaining work was created from the modernization plan. B4 captures M0's still-outstanding exhaustive difficulty sweep. C2 tracks misplaced shared-contract copies discovered in later main commits.

| ID | Issue | Scope |
| --- | --- | --- |
| C1 | [#3](https://github.com/SpikemenDan/putt-pals/issues/3) | Shared contracts (integrated) |
| S1 | [#5](https://github.com/SpikemenDan/putt-pals/issues/5) | Headless simulation (integrated) |
| B4 | [#4](https://github.com/SpikemenDan/putt-pals/issues/4) | Exhaustive corrected-launch difficulty sweep |
| C2 | [#19](https://github.com/SpikemenDan/putt-pals/issues/19) | Root shared-contract copy cleanup |
| R1 | [#6](https://github.com/SpikemenDan/putt-pals/issues/6) | Renderer/camera extraction |
| U1 | [#7](https://github.com/SpikemenDan/putt-pals/issues/7) | React UI and input |
| D1 | [#8](https://github.com/SpikemenDan/putt-pals/issues/8) | Course data and CLI migration (partial/active) |
| L1 | [#9](https://github.com/SpikemenDan/putt-pals/issues/9) | Room lifecycle/scoring (integrated) |
| A1 | [#10](https://github.com/SpikemenDan/putt-pals/issues/10) | Procedural audio adapter |
| N1 | [#11](https://github.com/SpikemenDan/putt-pals/issues/11) | Transport adapters |
| I1 | [#12](https://github.com/SpikemenDan/putt-pals/issues/12) | Application integration |
| N2 | [#13](https://github.com/SpikemenDan/putt-pals/issues/13) | Guest recovery/interpolation |
| N3 | [#14](https://github.com/SpikemenDan/putt-pals/issues/14) | Managed TURN |
| T1 | [#15](https://github.com/SpikemenDan/putt-pals/issues/15) | Integration/browser coverage |
| R2 | [#16](https://github.com/SpikemenDan/putt-pals/issues/16) | Three.js upgrade |
| P1 | [#17](https://github.com/SpikemenDan/putt-pals/issues/17) | Optional Rapier experiment |
| Q1 | [#18](https://github.com/SpikemenDan/putt-pals/issues/18) | Release readiness |

## Baseline at backlog setup

B1 was integrated through PR #1; C1 through PR #2 at c917618; S1 is on main at b9ebff0. Contract compatibility fixes landed in 4327196. D1's 543c383 is partial: the catalog/test/adapter files were committed at the root, and `node courses.test.cjs` fails to resolve `../tools/legacy-adapter.cjs`. See D1's live issue for the repair and remaining CLI/consumer work. Do not confuse these snapshot facts with a fresh claim or current test result.

Follow-up at the review cutoff: 9cdd12e adds stale metadata detection, also at the repository root. The catalog test still fails before assertions with the same adapter import error; root stale.js is part of D1 ownership. The issue records this as partial progress, not completed integration.

## Cleanup follow-up

The root-layout failures above are historical evidence, superseded by the cleanup: catalog modules are under src/courses/, the legacy adapter under tools/ and the course test under tests/. C2 duplicate shared-contract/test copies are removed; canonical implementations remain authoritative. Contract, simulation and course tests are explicitly wired into CI. D1 remains incomplete until geometry/consumer unification and CLI migration meet its full acceptance criteria. The user authorized this bounded integration directly on main with no concurrent workers.

## Accepted integration follow-up — 2026-10-26

D1's data/CLI delivery is merged through PR #22 (8dcf760); its remaining browser/integration acceptance stays in #8. L1 is merged through PR #23 (adf2045), verified and closed in #9. N1 #11 had integrated code prerequisites at that cutoff; the branch handoff below supersedes its unclaimed-ready snapshot. I1 remains blocked by its other prerequisites. Read live issues before acting; this snapshot does not assign or authorize another task.

## N1 branch follow-up — 2026-10-26

N1 #11 is claimed by Codex root on agent/n1-transports in /private/tmp/putt-pals-n1; implementation commit 72b7498 is prepared for review. The shared score limit is reconciled on that branch. Full local tests/build/inventory and nine network scenarios passed; no hosted CI, actual WebRTC or browser adoption is claimed. The user authorized documentation updates and pushing this task branch. No PR/merge has been performed or authorized by that instruction. N1 remains ACTIVE in the live queue until review submission; do not duplicate its implementation or treat its unmerged code as an accepted prerequisite. See docs/reviews/N1_TRANSPORTS.md.
