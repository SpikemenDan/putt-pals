## Outcome

Describe the problem and resulting behavior.
Link the issue/roadmap item when applicable.
Use Closes only for complete acceptance; otherwise use Refs.

## Scope

- Contributor:
- Task branch (one coherent task; unrelated roadmap items go in separate PRs):
- Changes:
- Overlapping work coordinated, if applicable:
- Configuration or interface changes:

## Verification

List relevant commands and actual results, including current-head CI when available.
Identify skipped or blocked checks.
Distinguish unit/fake-network, real-browser and deployed-network evidence.

## Preview and owner acceptance

For appearance or game-feel changes:
- Local browser preview:
- Developer controls provided:
- Owner feedback:
- Approved values persisted:
- Acceptance still pending:

Use "Not applicable" when no interactive preview is relevant.

## After merge (checklist)

Only after an authorized merge; see docs/GITHUB_WORKFLOW.md, "Post-merge checklist".
- [ ] Merge confirmed on origin/main.
- [ ] No unique work lost: ancestry, or git cherry / file diff for a squash merge; no uncommitted, untracked or unpushed work; stashes untouched.
- [ ] Task worktree (if any) removed without --force.
- [ ] Local branch deleted with git branch -d (tip commit recorded). Remote branch left until deletion is authorized.

## Remaining work

List limitations, dependencies and incomplete acceptance criteria.
Do not present implementation alone as release acceptance.
This template does not grant merge or remote-write permission.
