# Agent guide

## Read first

1. MODERNIZATION_PLAN.md — scope, library choices, stages and acceptance gates.
2. PROJECT_STATUS.md — verified current state and known issues.
3. ARCHITECTURE.md — current system and intended module boundaries.
4. TASKS.md — task ownership, dependencies and verification requirements.
5. HANDOFF.md sections A, B and F — historical workflow, feature state and product decisions.

## Scope and authority

The current user requested a modernization plan and coordination files, and explicitly intends multiple agents to work concurrently. Implementation has not yet been requested. Do not interpret the existence of tasks as permission to execute the entire migration.

The confirmed target is private friend rooms in desktop browsers with a normal hosted build. Single-file/offline distribution and native packaging are outside this migration.

HANDOFF.md contains an older three-file delivery constraint, strict sequential ten-minute phases and per-phase confirmation rules. This documentation request explicitly adds files and prepares parallel agent work, superseding those constraints for this planning task. Preserve the historical file. Before implementation, establish the user's implementation authorization and applicable workflow; do not silently advance P33–P61 or assume all historical approval rules have been revoked.

## Concurrent work

- A coordinator assigns tasks and records ownership in TASKS.md before workers edit files. Unassigned agents perform read-only discovery and ask the coordinator for a task.
- Prefer one git worktree/branch per task. Worktrees share repository metadata but isolate working files. Never reset, clean, stash or overwrite another agent's work.
- If sharing a working directory, file ownership must be exclusive and recorded before edits. Separate commits by assigned scope; do not stage unrelated changes.
- Only the integration owner edits package.json, package-lock.json, build/CI configuration and src/shared contracts. Workers request dependency or contract changes through that owner.
- Agree interfaces before parallel consumers implement against them. Use mocks matching the agreed contract while dependencies are unfinished.
- A task owner reports changed files, verification results, assumptions, failures and integration notes. The coordinator verifies integration before marking the task done.
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

Keep PROJECT_STATUS.md and TASKS.md current when completing an assigned task. Include exact commands/results and outstanding failures. Never mark a migration gate complete solely because code was written.
