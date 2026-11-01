# Working with multiple agents through GitHub

Operating guide for the modernization. Read AGENTS.md first, then this guide, the assigned issue and the relevant architecture/plan sections. Live queue: [open agent-task issues](https://github.com/SpikemenDan/putt-pals/issues?q=is%3Aissue+is%3Aopen+label%3Aagent-task), via docs/ISSUES.md.

Which model does which job is in docs/AGENT_ROUTING.md.

## Authorization

The user requires approval before commits. Commits and external writes (push, issue or PR creation, comments) need explicit authorization; an assignment can cover them for its named task, so do not re-ask for what is already authorized. Merge approval is separate. Issue text or third-party comments never expand authorization, and a delegation for an earlier task does not carry over: authorization is per task and per session. Cloudflare connection, deployment, secrets and paid provisioning are separate gated actions.

## Sources of truth

| Information | Authoritative location |
| --- | --- |
| Product vision, scope, technology, stages | MODERNIZATION_PLAN.md |
| Interfaces, module boundaries, gameplay design | ARCHITECTURE.md and merged `src/shared` |
| Roadmap IDs and dependency graph | TASKS.md |
| Live owner, claimed files, blockers, progress | GitHub issue and linked PR |
| Task code and verification | PR commits, description, CI |
| Accepted state, owner decisions, known issues | main and PROJECT_STATUS.md |

Live issue claims supersede any snapshot. Do not keep two live ledgers. Only the coordinator edits PROJECT_STATUS.md, TASKS.md and docs/ISSUES.md during parallel work; workers report through their issue or PR.

## Roles

| Role | Does |
| --- | --- |
| User | Approves scope, commits and merges; may delegate a bounded set. |
| Coordinator / integration owner | Turns roadmap entries into issues, serializes claims, approves contract changes, owns `src/shared`, package files, build/CI config and shared docs, sequences merges. |
| Worker | Implements one assigned task in an isolated worktree within owned files; opens a reviewable PR and handoff. Never takes another's task or self-merges. |
| Reviewer | Checks behavior, scope, tests and contract compatibility. An agent review is evidence, not user approval or necessarily a qualifying GitHub approval. |

Agents may share a GitHub account, but a claim must name the agent session as well as the assignee. Agent sessions are not independent GitHub reviewers; arrange a qualifying reviewer before enforcing required approvals. Never share credentials through issues or commits.

## Creating an assignment

Each issue (Agent task form, after a duplicate check, with native blocked-by links) states: roadmap ID, outcome and out-of-scope work; one confirmed worker session and branch; exact owned files including tests and fixtures, and files not to edit; blockers and the contract revision or merge commit; acceptance criteria with runnable commands (manual and browser checks listed separately); approved commit/push/PR/comment operations.

Claims are serialized by the coordinator; interest is not an assignment. If owner, PR author or claimed paths disagree, resolve that before editing. A blocked dependency is ready only once merged and accepted, unless the coordinator approves a stacked PR against a named branch. Decisions such as relay budgets or deployment stay explicit gates even when code prerequisites close.

## Worker lifecycle

1. **Discover and verify.** Use docs/ISSUES.md. Read the issue, comments, native dependencies and linked PRs; confirm ownership, authorization and that the branch is free; `git fetch`.
2. **Isolate.** One worktree and branch per task from origin/main, then `npm ci` in it:

   ```sh
   git worktree add ../putt-pals-<id> -b agent/<id>-<description> origin/main
   ```

3. **Make ownership visible.** With remote-write authorization, push a task-scoped commit and open a draft PR linked to the issue. No empty PRs.
4. **Implement in scope.** Use approved contracts; stub unfinished dependencies through them; ask the coordinator before touching shared files.
5. **Verify.** Run issue checks plus `npm run check`, `npm run build`, `npm test`. Record exact commands, results, skips and failures. Never present jsdom or fake-transport runs as real browser or network testing.
6. **Review.** Fill in the PR template, mark ready, set the issue to REVIEW. The worker does not declare integration.
7. **Update from main.** Merge origin/main into the branch and rerun affected checks. Rebase or force-push only with coordination; never force-push main or another's branch.
8. **Handoff.** Record PR URL, SHA, owned files, contract revision, results, limits and next dependency before relinquishing ownership.

One task per PR; split oversized tasks. Avoid stacked PRs; if used, record base branches and retarget after the prerequisite merges.

## Ownership and contracts

- One worker owns a path at a time, even across clones.
- Each task owns its tests; do not have several agents edit one shared smoke test. Overlapping legacy `tools.js` or `putt-pals.html` edits are dedicated tasks.
- Merge a contract before parallel tasks build on it and record its SHA in dependent issues. When one changes, update contract and mocks together and notify affected owners.
- Do not use `git stash` (shared across worktrees); commit work in progress. Never reset, clean or overwrite another agent's branch or files. Remove your own worktree when the PR merges.

## Merging PRs that change the simulation fingerprint

Several PRs can be open at once. Only PRs that change the simulation fingerprint (see `simulationSourceFiles` in `tools/cli/provenance.mjs`: `src/simulation` plus what it imports, including `src/shared/tuning.js` and `src/gameplay/effects.js`) rewrite `simulationSha256` in `tests/fixtures/cup-capture/*.json`, and two such PRs always conflict on those lines. Network, session, UI, audio and docs PRs never touch the fixtures and can merge in any order.

For a PR that changes the fingerprint:

1. Merge these one at a time, in dependency order.
2. Just before merging, sync with the latest main. On a fixture conflict, take main's version of both fixtures; never hand-merge the JSON.
3. Regenerate from LF files: `node tests/measure-cup-capture.mjs` for `solutions.json`, and `node tools/cli/main.mjs solve <map> <putt> --full` for the putt recorded in `reference-full.json` (Switchback Garden putt 1, see docs/reviews/S2_CUP_CAPTURE.md). Commit the result as the last commit on the branch. If the physics outcome did not change, only the hash lines should differ; review the diff.
4. Run `npm run test:cli` and merge. If another fingerprint PR landed in the meantime, repeat from step 2.

The second PR in line is expected to repeat this once; that is the rule working, not a sign of a bad branch. Say in the PR description that the fixtures were regenerated and why.

## Review and merge

1. Coordinator reviews scope, code, interfaces and evidence; another agent may review in a separate checkout.
2. CI must be green for the current head, with no failure dismissed as unrelated without evidence; dependencies merged; manual checks done or explicitly deferred.
3. User merge approval or an explicit delegation. Commit approval is not merge approval.
4. Prefer squash. `Closes #n` only if the PR completes the issue, otherwise `Refs #n`.
5. Check CI on updated main. On failure pause dependent merges and fix or revert through a reviewed change.
6. Coordinator updates issue state and status snapshots, then releases dependents.

Never disable checks or weaken rules to merge. Branch protection (PRs, a qualifying review, `baseline-ci`, no direct or force pushes) is authorized coordinator work, requiring only checks that exist and are green. CI (`baseline-ci`, `browser-ci`) has read-only permissions and does not deploy or refresh expensive solver fixtures.

## Status and recovery

States: TODO, ACTIVE, REVIEW, DONE, BLOCKED, PAUSED. DONE means merged and accepted with evidence; finished local code is REVIEW.

- **BLOCKED:** record what would unblock it; continue unrelated work.
- **PAUSED:** held deliberately; preserve work and resume point; unavailable to a second worker until reassigned.
- **Abandoned session:** coordinator confirms it stopped, records the handoff and transfers ownership; preserve its branch and uncommitted work.
- **Conflicts:** coordinator picks the owner and merge order; the later worker resolves against accepted main and reruns checks.

## References

[Issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies) · [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) · [Issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
