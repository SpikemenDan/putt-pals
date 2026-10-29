# Agent guide

## Read first

1. MODERNIZATION_PLAN.md: product direction (the game vision), confirmed scope, technology choices and stage status.
2. docs/GITHUB_WORKFLOW.md: assignment, branch, PR, review and merge workflow.
3. docs/ISSUES.md and the live GitHub issue and linked PR: eligible work, ownership, allowed paths, dependencies and authorization. GitHub issues are the live queue; do not pick work from a stale local list.
4. PROJECT_STATUS.md: accepted state of main, confirmed owner decisions and known issues.
5. ARCHITECTURE.md: module boundaries, shared contracts and the design for power-ups, hazards, modes and cosmetics.
6. TASKS.md: roadmap IDs, dependency graph and the proposed vision backlog.

## Scope and authority

GitHub issues track work, claims, blockers and acceptance. When told to work on the next task, discover and claim an eligible issue using docs/ISSUES.md and the coordinator process; do not invent a task or duplicate another worker. A roadmap entry or a ready label alone does not authorize the whole backlog. Vision tasks marked PROPOSED in TASKS.md need a GitHub issue, settled owner decisions (listed in MODERNIZATION_PLAN.md) and a coordinator-confirmed claim before implementation.

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

## Engineering rules

- Keep behavior changes, physics tuning, refactors and visual redesigns in separate PRs. Anything that changes shot trajectories invalidates recorded difficulty; say so and plan a fresh sweep.
- Browser, CLI and solver import the same simulation (`src/simulation/`). It must not import DOM, React, Three.js, PeerJS or WebAudio; inject clocks and randomness and return domain events.
- Keep simulation coordinates x/y horizontal and z vertical; convert only in renderer adapters.
- Validate network messages and course files at their boundaries; static types do not validate runtime data. Keep names and peer content text-only and secrets out of bundles and source control.
- Keep React state out of physics ticks and mesh transforms.
- Use the libraries chosen in MODERNIZATION_PLAN.md; document alternatives before adding a dependency, and do not replace working domain code because a library exists.
- Gameplay features from the vision (power-ups, hazards, modes, cosmetics) follow ARCHITECTURE.md's design: catalogs are data, effects are simulation hooks that leave results bit-identical when inactive, randomness is injected and seeded, roaming hazards derive from synchronized room time, opponent effects travel as validated messages, solo and No Power-Ups pools are filtered by catalog flags, and cosmetics never affect physics. New course elements need a test chamber that proves a robust shot exists and fails without the element. Course acceptance is a verified robust route within the putt's par (2 to 6 strokes); a hole-in-one is optional and must not be required.
- Art is original. The comic style is an inspiration only; do not copy characters, logos, lettering or artwork from existing works.
- `putt-pals.html` and `tools.js` are the legacy parity reference. Avoid changing them; if a change is unavoidable, patch with exact-match asserted replacements and run `node tools.js check` afterward.

## Verification and reporting

Use the commands that exist in package.json and the README command table; do not claim planned scripts or CI checks exist. Missing dependencies mean blocked or not run, not passed. Report real-browser and real-network validation separately from jsdom and fake transports. Run the suites relevant to your paths and the build before submitting.

Record exact commands, results and outstanding failures in the issue or PR. Never mark a gate complete because code was written. Follow docs/GITHUB_WORKFLOW.md for claim, pause, transfer and conflict handling.
