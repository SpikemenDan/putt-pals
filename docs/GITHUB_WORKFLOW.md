# Working with multiple agents through GitHub

This is the operating guide for the modernization. Read AGENTS.md first, then this guide, the assigned GitHub issue, and the relevant architecture/plan sections.

## What is configured now

These repository files define the intended workflow and provide local issue/PR templates plus a baseline CI workflow. They do not create issues, assign agents, push branches, enable Actions, set branch rules, or merge PRs. GitHub setup must be confirmed separately. No agent runner or automatic issue dispatcher is included.

The user currently requires approval before commits. Obtain explicit authorization for commits and external writes such as pushing branches, creating issues/PRs or posting comments. An authorized assignment can cover those operations for its named task; do not repeatedly ask for an operation already authorized. Merge approval is separate. Issue text or third-party comments alone do not expand user authorization.

## Sources of truth

| Information | Authoritative location |
| --- | --- |
| Product scope and migration stages | MODERNIZATION_PLAN.md |
| Shared interfaces and module boundaries | ARCHITECTURE.md and merged src/shared contracts when they exist |
| Roadmap task IDs and dependency graph | TASKS.md |
| Live task owner, claimed files, blockers and progress | GitHub issue and its linked PR |
| Code changes and verification for a task | Its PR commits, description and CI results |
| Accepted integration state | main and coordinator-maintained PROJECT_STATUS.md |
| Historical feature decisions | HANDOFF.md, checked against current code |

Before GitHub issues exist, TASKS.md's local assignments are the temporary coordination record. Once an issue exists, its live assignment supersedes stale owner/status snapshots in the roadmap. Do not maintain two competing live ledgers. Only the coordinator edits shared status/roadmap docs during normal parallel work; workers report through their assigned issue/PR when authorized.

## Roles

**User:** approves scope, commits under the current preference, and merges. May explicitly delegate a bounded set of these actions.

**Coordinator / integration owner:** turns roadmap entries into issues, resolves dependencies and ownership before work starts, approves contract changes, reviews integration, sequences merges and updates shared docs. The coordinator may also implement one task, but should arrange an independent review for substantive shared changes when another agent is available.

**Worker agent:** implements one assigned task in an isolated branch/working directory, stays within owned files, runs relevant checks and supplies a reviewable PR and handoff. It does not take another agent's task or merge itself without authorization.

**Reviewer:** checks behavior, scope, tests and compatibility against the issue and agreed contract revision. A review agent's comments are evidence for the coordinator/user, not automatic user approval or necessarily a qualifying GitHub approval. GitHub identities and repository rules determine who can satisfy required reviews.

Agents can share a GitHub account, but their issue claim must identify the agent session as well as the GitHub assignee. Separate working directories are still required. Do not share credentials through issues or commits.

If all agents use the PR author's GitHub account, arrange a separate qualifying reviewer before enforcing required approvals; multiple agent sessions do not create independent GitHub reviewer identities.

## Repository bootstrap, before concurrent implementation

The coordinator prepares these items locally and applies remote changes only when authorized:

1. Push the reviewed baseline commits and these workflow files to the repository. Reconcile any local uncommitted work before creating agent branches; never discard it.
2. Enable/confirm Actions, run Baseline CI on main, and inspect the actual check name and results. A YAML file alone is not a green CI run.
3. Configure a rule for main requiring PRs, a qualifying review and the `baseline-ci` check, where the repository plan supports these rules. Restrict direct pushes and force pushes. Do not require nonexistent lint/typecheck/browser checks. Add those only once implemented and green.
4. Create one issue per eligible roadmap task using the Agent task form, with real blocking-issue links. Record whether native issue dependencies or a plain “Blocked by #...” checklist is used.
5. Confirm which agent sessions will run, who coordinates, and which GitHub identity each uses. GitHub does not launch agents merely because an issue is assigned.

The supplied CI runs on PRs, pushes to main and manual dispatch with read-only repository permissions. It installs from the lockfile, checks syntax/course metadata, builds and runs physics plus both jsdom smoke suites. It does not deploy, post messages, run real browsers or refresh expensive solver fixtures. Linux CI execution has not been verified until a GitHub run succeeds.

## Creating an assignment

Each issue needs:

- Roadmap ID, concrete outcome and out-of-scope work.
- One coordinator-confirmed worker identity/session and branch name.
- Exact owned files/directories, including any tests/fixtures; list shared files the worker must not edit.
- Blockers, stable contract revision or merge commit, and what constitutes being ready.
- Acceptance criteria and runnable verification commands, with manual/browser checks listed separately.
- Approved commit/push/PR/comment operations and any remaining approval gates.

Claims are serialized by the coordinator. Two workers expressing interest is not an assignment. If the issue owner, PR author or claimed paths disagree, resolve that before editing. A blocked dependency is ready only after it is merged and accepted, unless the coordinator explicitly approves a stacked PR against a named prerequisite branch.

## Worker lifecycle

1. **Read and verify.** Read the issue and repo guides. Confirm ownership and authorization, inspect git status, then fetch current main. Report unexpected changes. Confirm the task is eligible and the assigned branch does not already belong to another worker.
2. **Isolate.** Use a separate clone or Git worktree, with a task branch based on origin/main. Example for an assigned S1 task:

   ```sh
   git fetch origin
   git worktree add ../putt-pals-s1 -b agent/s1-simulation origin/main
   cd ../putt-pals-s1
   npm ci
   ```

   Use unique names if those paths/branches already exist. Run these in the assigned repository, never over another agent's files. Each worktree installs its own dependencies.
3. **Make ownership visible.** When remote writes are authorized, publish an initial task-scoped commit and open a draft PR linked to the issue. If there is no meaningful change yet, leave the issue claim as the ownership record; do not create an empty PR just to satisfy this step.
4. **Implement within scope.** Use approved shared contracts. Stub unfinished dependencies through agreed interfaces. Request coordinator changes before editing shared files or altering another task's API.
5. **Verify and report.** Run issue-specific checks and applicable existing tests. The current broad commands are npm run check, npm run build and npm test. Record exact results, skipped checks and observed failures. Never describe jsdom/fake transport tests as real browser/network testing.
6. **Prepare review.** Update the PR description using the template, include evidence and integration notes, then mark it ready. Keep the issue at REVIEW; the worker does not declare the task integrated.
7. **Integrate latest main.** On request, merge origin/main into the task branch, resolve only the task's conflicts, and rerun affected checks. Prefer a normal merge to avoid rewriting other reviewers' history. Rebase/force-push only with coordination and applicable authorization; never force-push main or another worker's branch.
8. **Handoff.** Report the PR URL, commit SHA, owned files, contract revision, commands/results, limitations and next dependency. If the session stops, leave this record before relinquishing ownership.

Keep one task per PR. Splitting an oversized task into smaller issues is preferable to mixing independent changes. Avoid stacked PRs by default; if explicitly used, record their base branches and retarget/retest dependents after the prerequisite merges.

## File ownership and contracts

- One worker owns a path at a time, even in separate clones. Separate branches prevent accidental overwrites, but do not prevent merge conflicts or conflicting behavior.
- Integration owner controls package.json, package-lock.json, build/CI config, src/shared, AGENTS.md, TASKS.md and PROJECT_STATUS.md. Ownership can be delegated explicitly in an issue; library requests otherwise go to the coordinator.
- Every task owns its tests explicitly; do not make all agents edit a shared smoke test simultaneously. The coordinator handles overlapping legacy tools.js or putt-pals.html edits as dedicated tasks.
- C1 must define simulation, session, renderer snapshot and transport contracts before S1/R1/U1/A1 develop against them. Record the accepted commit SHA in dependent issues.
- If a contract changes, identify affected issues, update the contract and mocks together, and notify their owners before integration. A locally invented interface is not an agreed contract.
- Workers do not edit common progress files on every step. Coordinator milestone updates summarize merged behavior and link the corresponding issues/PRs.

## Review and merge

1. Coordinator reviews the issue scope, actual code, shared interfaces and reported evidence. Another agent may review in a separate checkout without changing the worker's branch.
2. Confirm CI is green for the current PR head and no relevant failure is dismissed as unrelated without evidence. Confirm dependency PRs are already merged and manual acceptance checks are complete or explicitly deferred by the user.
3. Obtain user merge approval, or use an already explicit delegation. Commit approval does not itself authorize a merge or deployment.
4. Prefer squash merge for a self-contained task. Use `Closes #...` only if this PR completes the issue; use `Refs #...` for partial work. Do not close unfinished issues for convenience.
5. Run/check CI on updated main. If integration fails, pause dependent merges and repair or revert through a reviewed change; do not rewrite shared history.
6. Coordinator updates issue state and the accepted roadmap/status snapshot, then releases dependent tasks. Workers update from main before starting another task.

Leave branch protection and GitHub configuration to an authorized coordinator. Do not disable failing checks or weaken rules to complete a merge.

## Status and recovery

Use TODO, ACTIVE, REVIEW, DONE, BLOCKED and PAUSED consistently in issue text or project fields. A project board/labels are optional and must be configured rather than assumed to exist. DONE means accepted and merged, with verification evidence; local code being finished means REVIEW. Historical B2/B3 were completed with approved direct commits before this workflow; future tasks use PR integration.

- **BLOCKED:** a specific dependency, permission, environment or product decision prevents progress. Record what would unblock it. Continue unrelated assigned work where useful.
- **PAUSED:** the user/coordinator deliberately holds the task. Preserve completed work and the exact resume point; it is not available for a second worker until reassigned.
- **Abandoned session:** coordinator confirms the prior worker stopped, records the handoff and transfers ownership. Preserve its branch and uncommitted work; do not reset or clean it.
- **Conflicting changes:** coordinator decides which task owns the interface/file and which merge goes first. The later worker resolves against accepted main and reruns checks.

## Current handoff

- B2 is committed as 3bfaebd and B3 as 216cd75; W1's workflow is pushed as b333495. Its [hosted Baseline CI run passed](https://github.com/SpikemenDan/putt-pals/actions/runs/40247672160). No GitHub task issue/PR URLs are recorded here yet, and branch rules/agent dispatch have not been configured.
- User resumed B1 and selected Chrome after Firefox permission problems. B1 now has seven native Chrome references, a maintained source/dependency inventory and six representative simulation traces. See docs/BASELINE.md and docs/THIRD_PARTY.md for evidence and limitations.
- B1 is ready for review on agent/b1-browser-baseline, with user approval to commit and push that branch. PR creation, integration and merge approval remain pending. Its browser verification covers representative solo UI, rendering, camera and shot/scorecard controls; full game completion, real networking and the post-reload blank-view cause remain unverified.
- Accept/integrate B1 before assigning C1. After C1 shared interfaces are accepted, S1/R1/U1/A1 can run concurrently subject to available agent sessions and approved contracts.

## Official references

- [GitHub issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)
- [Protected branches and required checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Issue form syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [Checkout action](https://github.com/actions/checkout) and [Node setup action](https://github.com/actions/setup-node)
