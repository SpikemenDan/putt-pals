# Agent guide

## Read first

1. docs/GITHUB_WORKFLOW.md: assignment, branch, PR, review and merge workflow.
2. docs/ISSUES.md and the live GitHub issue and linked PR: eligible work, ownership, allowed paths, dependencies and authorization. GitHub issues are the live queue; do not pick work from a stale local list.
3. docs/ENGINEERING_RULES.md: engineering rules, verification and reporting. Read before editing code.
4. PROJECT_STATUS.md: accepted state of main, confirmed owner decisions and known issues.
5. MODERNIZATION_PLAN.md: product direction (the game vision), confirmed scope, technology choices and stage status. Read when the task touches product scope.
6. ARCHITECTURE.md: module boundaries, shared contracts and the design for power-ups, hazards, modes and cosmetics. Read for gameplay or contract work.
7. TASKS.md: roadmap IDs, dependency graph and the vision backlog. Search it instead of reading it whole.

## Scope and authority

GitHub issues track work, claims, blockers and acceptance. When told to work on the next task, discover and claim an eligible issue using docs/ISSUES.md and the coordinator process; do not invent a task or duplicate another worker. A roadmap entry or a ready label alone does not authorize the whole backlog. Vision tasks in TASKS.md have GitHub issues (labels `vision`, `area:*`); each still needs a coordinator-confirmed claim, and tasks labelled `needs:integration-owner` go through the integration owner for `src/shared` and package changes.

Obtain user approval before commits under the current preference. Remote writes (push, issue or PR creation, comments), merges, deployments and paid provisioning require applicable user authorization; document bounded delegated actions in an assignment and do not ask again for what is already authorized. These workflow files do not grant authorization or launch agents.

The confirmed target is private friend rooms in desktop browsers with a normal hosted build. Single-file or offline distribution and native packaging are out of scope.

## Concurrent work

- Start or resume by reading current GitHub issues and related PRs. A coordinator confirms one worker per issue before edits. An empty assignee field does not prove a task is unclaimed; inspect the issue body, comments and active branches.
- Use one isolated clone or git worktree and one branch per task, normally `agent/<task-id>-<description>` from origin/main. Do not run concurrent agents in one working directory. Never reset, clean, stash or overwrite another agent's work.
- Open a draft PR once there is a meaningful change and remote-write authorization. Link the issue and keep one task per PR.
- Only the integration owner edits package.json, package-lock.json, build and CI configuration, and `src/shared` contracts. Workers request dependency or contract changes through that owner.
- Agree interfaces before parallel consumers build against them; use mocks that match the agreed contract while dependencies are unfinished.
- Report changed files, verification results, assumptions and failures in the issue or PR. Partial commits keep the issue ACTIVE until acceptance criteria are met; a ready worker submits for REVIEW and the coordinator closes the issue after accepted integration and verification.
- The coordinator owns shared status and roadmap docs (PROJECT_STATUS.md, TASKS.md, docs/ISSUES.md). Live GitHub claims supersede any snapshot.
- Integrate in dependency order, run current-head checks and obtain user merge approval unless explicitly delegated. Do not bypass branch rules or force-push shared branches. Do not publish, provision paid services or send external messages without authorization.

## Delegating mundane tasks to Gemini CLI

The owner uses Gemini CLI (Gemini Pro, `gemini -m pro`) for mundane work so other agents keep their budget for design-heavy tasks. Gemini follows this guide and docs/ENGINEERING_RULES.md like any other agent; GEMINI.md imports this file.

- **Good fits:** typo and formatting fixes in docs, link and reference checks, summarizing logs or CI output, listing and inventory commands, drafting PR descriptions or changelog text for review, boilerplate test scaffolding that a reviewer will read.
- **Not for Gemini:** `src/simulation`, `src/shared`, tuning values, course data, package and build files, CI configuration, anything that changes shot trajectories, and any remote write, merge or deployment.
- Run it headless and read-only unless an edit is the task: `gemini -m pro --approval-mode plan -p "<task>"`. Use `--approval-mode default` for edits and review the diff before committing. Do not use `--yolo`.
- Gemini works in its own worktree and branch, and commits only with the owner's approval, like every other agent.
