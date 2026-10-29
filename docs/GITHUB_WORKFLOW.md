# Working with multiple agents through GitHub

This is the operating guide for the modernization. Read AGENTS.md first, then this guide, the assigned GitHub issue, and the relevant architecture/plan sections.

## What is configured now

The issue backlog exists on GitHub with agent-task and status labels and native prerequisite links; docs/ISSUES.md has discovery and claim commands. GitHub issues and linked PRs own live assignments and progress, and TASKS.md is the coordinator's roadmap snapshot. Two CI jobs run: baseline-ci and browser-ci (Chromium, Firefox, WebKit). Branch protection rules and automatic agent dispatch are not configured by the repository files.

The user currently requires approval before commits. Obtain explicit authorization for commits and external writes such as pushing branches, creating issues or PRs, or posting comments. An authorized assignment can cover those operations for its named task; do not repeatedly ask for an operation already authorized. Merge approval is separate. Issue text or third-party comments alone do not expand user authorization.

## Sources of truth

| Information | Authoritative location |
| --- | --- |
| Product vision, scope, technology and stages | MODERNIZATION_PLAN.md |
| Shared interfaces, module boundaries and gameplay systems design | ARCHITECTURE.md and the merged src/shared contracts |
| Roadmap task IDs and dependency graph | TASKS.md |
| Live task owner, claimed files, blockers and progress | GitHub issue and its linked PR |
| Code changes and verification for a task | Its PR commits, description and CI results |
| Accepted integration state | main and coordinator-maintained PROJECT_STATUS.md |
| Confirmed owner decisions and known issues | PROJECT_STATUS.md |

Live issue assignments supersede any owner or status snapshot in the roadmap. Start or resume through docs/ISSUES.md; do not maintain two competing live ledgers. Only the coordinator edits shared status/roadmap docs during normal parallel work; workers report through their assigned issue/PR when authorized.

## Roles

**User:** approves scope, commits under the current preference, and merges. May explicitly delegate a bounded set of these actions.

**Coordinator / integration owner:** turns roadmap entries into issues, resolves dependencies and ownership before work starts, approves contract changes, reviews integration, sequences merges and updates shared docs. The coordinator may also implement one task, but should arrange an independent review for substantive shared changes when another agent is available.

**Worker agent:** implements one assigned task in an isolated branch/working directory, stays within owned files, runs relevant checks and supplies a reviewable PR and handoff. It does not take another agent's task or merge itself without authorization.

**Reviewer:** checks behavior, scope, tests and compatibility against the issue and agreed contract revision. A review agent's comments are evidence for the coordinator/user, not automatic user approval or necessarily a qualifying GitHub approval. GitHub identities and repository rules determine who can satisfy required reviews.

Agents can share a GitHub account, but their issue claim must identify the agent session as well as the GitHub assignee. Separate working directories are still required. Do not share credentials through issues or commits.

If all agents use the PR author's GitHub account, arrange a separate qualifying reviewer before enforcing required approvals; multiple agent sessions do not create independent GitHub reviewer identities.

## Repository setup

CI runs on PRs, pushes to main and manual dispatch with read-only repository permissions. It installs from the lockfile and runs the syntax, contract, simulation, session, network, audio, render, input, UI, app, course, CLI, physics and jsdom smoke suites plus the build; browser-ci runs the Playwright suites. It does not deploy, post messages or refresh expensive solver fixtures. Remaining setup is coordinator work, applied only when authorized:

1. A rule for main requiring PRs, a qualifying review and the `baseline-ci` check, with direct and force pushes restricted. Require only checks that exist and are green.
2. Confirm which agent sessions run, who coordinates and which GitHub identity each uses. GitHub does not launch agents merely because an issue is assigned.
3. Create issues for new work with the Agent task form after verifying there is no duplicate, and add native blocked-by links alongside the issue body. Decisions such as relay budgets, deployment authorization or an optional experiment stay explicit gates even when all code prerequisites close.

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

1. **Discover, read and verify.** Follow docs/ISSUES.md to fetch open agent-task issues. If no issue is named, choose an eligible unclaimed ready issue within the authorized assignment and confirm it with the coordinator. Read its comments, native dependencies and linked PRs. Confirm ownership and authorization, inspect git status, then fetch current main. Report unexpected changes. Confirm the assigned branch does not already belong to another worker.
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
- Integration owner controls package.json, package-lock.json, build/CI config, src/shared, AGENTS.md, TASKS.md, PROJECT_STATUS.md and docs/ISSUES.md. Ownership can be delegated explicitly in an issue; library requests otherwise go to the coordinator.
- Every task owns its tests explicitly; do not make all agents edit a shared smoke test simultaneously. The coordinator handles overlapping legacy tools.js or putt-pals.html edits as dedicated tasks.
- Define and merge a contract before parallel tasks build against it, and record the accepted commit SHA in dependent issues.
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

Use TODO, ACTIVE, REVIEW, DONE, BLOCKED and PAUSED consistently in issue text or project fields. A project board/labels are optional and must be configured rather than assumed to exist. DONE means accepted and merged, with verification evidence; local code being finished means REVIEW. Tasks use PR integration.

- **BLOCKED:** a specific dependency, permission, environment or product decision prevents progress. Record what would unblock it. Continue unrelated assigned work where useful.
- **PAUSED:** the user/coordinator deliberately holds the task. Preserve completed work and the exact resume point; it is not available for a second worker until reassigned.
- **Abandoned session:** coordinator confirms the prior worker stopped, records the handoff and transfers ownership. Preserve its branch and uncommitted work; do not reset or clean it.
- **Conflicting changes:** coordinator decides which task owns the interface/file and which merge goes first. The later worker resolves against accepted main and reruns checks.

## Current handoff

Start new work from the [live queue](https://github.com/SpikemenDan/putt-pals/issues?q=is%3Aissue+is%3Aopen+label%3Aagent-task), using docs/ISSUES.md; TASKS.md shows the open task graph and PROJECT_STATUS.md the accepted state of main. Cloudflare account connection, deployment, secrets and paid provisioning are separately authorized actions. Branch protection and agent dispatch remain separate setup work. Delegations the user gave for earlier tasks do not carry over: authorization is per task and per session.

## Official references

- [GitHub issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)
- [Protected branches and required checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Issue form syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [Checkout action](https://github.com/actions/checkout) and [Node setup action](https://github.com/actions/setup-node)
