# Agent guide

## Read first

1. MODERNIZATION_PLAN.md — scope, library choices, stages and acceptance gates.
2. docs/GITHUB_WORKFLOW.md — GitHub assignment, branch, PR, review and merge workflow.
3. docs/ISSUES.md and the live GitHub issue/linked PR — discover eligible work, confirm ownership, allowed paths, dependencies and authorization. GitHub issues are now set up; use them instead of selecting from a stale local TODO list.
4. PROJECT_STATUS.md — accepted integration state and known issues.
5. ARCHITECTURE.md and MODERNIZATION_PLAN.md — module contracts, scope and stages.
6. TASKS.md — roadmap IDs, dependency graph and historical progress snapshots.
7. HANDOFF.md sections A, B and F — historical workflow, feature state and product decisions.

## Scope and authority

Baseline and shared-simulation work have landed on main. GitHub issues now track remaining work, claims, blockers and acceptance. When instructed to work on the next task, discover and claim an eligible issue using docs/ISSUES.md and the coordinator process; do not invent a task or duplicate another worker. A roadmap entry or ready label alone does not authorize the entire backlog.

The user authorized creating/updating the issue backlog and committing/pushing this coordination update directly to main. That exception is limited to this setup task; ordinary implementation work still follows assigned issues, isolated task branches and the documented review/approval process.

Obtain user approval before commits under the current preference. Remote writes (push, issue/PR creation, comments), merges, deployments and paid provisioning require applicable user authorization; document bounded delegated actions in an assignment and do not ask again when already authorized. These local workflow files do not grant that authorization or automatically launch agents.

The confirmed target is private friend rooms in desktop browsers with a normal hosted build. Single-file/offline distribution and native packaging are outside this migration.

The user's GitHub workflow request establishes separate agent branches and PRs for future authorized tasks, superseding HANDOFF.md's three-file delivery and strictly sequential phase process for this modernization workflow. Preserve the historical file and product requirements. The old P33–P61 feature roadmap is not authorized by a modernization assignment. Existing user approval requirements still apply.

## Concurrent work

- Start/resume by reading current GitHub issues and related PRs. A coordinator confirms one worker/session per issue before edits. An empty assignee field is not proof a task is unclaimed; inspect its body/comments and active branches. Do not fall back to historical local assignments when GitHub already has the live record.
- Use one isolated clone or git worktree and branch per task, normally agent/<task-id>-<description> based on origin/main. Do not run concurrent agents in the same working directory. Never reset, clean, stash or overwrite another agent's work.
- Open a draft PR once a meaningful initial change and remote-write authorization exist. Link the issue and keep one task per PR. GitHub assignment does not itself launch an agent.
- Only the integration owner edits package.json, package-lock.json, build/CI configuration and src/shared contracts. Workers request dependency or contract changes through that owner.
- Agree interfaces before parallel consumers implement against them. Use mocks matching the agreed contract while dependencies are unfinished.
- A task owner reports changed files, verification results, assumptions, failures and integration notes in its authorized issue/PR. Partial commits remain ACTIVE until all acceptance criteria are met. A ready worker submits for REVIEW; the coordinator closes the issue only after accepted integration and verification. Explicitly authorized direct integrations are recorded as such, not described as unperformed PR merges.
- Keep shared status/roadmap docs coordinator-owned; workers do not all edit TASKS.md or PROJECT_STATUS.md. Live GitHub claims supersede stale roadmap snapshots.
- Integrate dependencies in merge order, run current-head checks and obtain user merge approval unless explicitly delegated. Do not bypass branch rules or force-push shared branches.
- Do not commit or merge changes belonging to another task without coordination. Do not publish, provision paid services, or send external messages without applicable authorization.

## Engineering rules

- Preserve gameplay during extraction; separate intentional behavior changes, physics tuning and visual redesigns.
- Browser and solver import the same simulation. No regex/VM source extraction in the final architecture.
- Simulation code must not import DOM, React, Three.js, PeerJS or WebAudio. Inject clocks/randomness and return domain events.
- Keep simulation coordinates x/y horizontal and z vertical during extraction. Convert only in renderer adapters until a separately reviewed coordinate migration exists.
- Validate network messages and course files at boundaries. Do not trust static types for runtime data.
- Keep user names and peer content text-only. Keep secrets out of client bundles and source control.
- Avoid using React state for physics ticks or mesh transforms.
- Use libraries selected in the plan; document alternatives before expanding the dependency set. Do not replace working domain code merely because a library exists.
- Before changing the legacy HTML, follow HANDOFF.md's exact-match/asserted patching instructions and run node tools.js check afterward.

## Verification and reporting

Before build setup, available checks include node --check tools.js, node tools.js check, node tools.js surfaces and node tools.js cups. Smoke tests require jsdom; missing dependencies mean blocked/not run, not passed. Rank currently uses historical counts and cannot establish current difficulty.

After setup, use the commands actually present in package.json. Do not claim planned scripts or CI checks already exist. Report real-browser and real-network validation separately from jsdom and fake transports.

Workers record exact commands/results and outstanding failures in their issue/PR handoff. The coordinator updates PROJECT_STATUS.md and TASKS.md at accepted integration points. Never mark a migration gate complete solely because code was written. Follow docs/GITHUB_WORKFLOW.md for claim, pause, transfer and conflict handling.
