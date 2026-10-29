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

This table links roadmap IDs to their issues; current state and ownership are always in GitHub, and TASKS.md shows which are open. Labels are maintained by the coordinator and can lag a just-merged PR.

| ID | Issue | Scope |
| --- | --- | --- |
| S2 | [#54](https://github.com/SpikemenDan/putt-pals/issues/54) | Cup capture, fast overshoot and airborne/lip-out correction |
| C1 | [#3](https://github.com/SpikemenDan/putt-pals/issues/3) | Shared contracts (integrated) |
| S1 | [#5](https://github.com/SpikemenDan/putt-pals/issues/5) | Headless simulation (integrated) |
| B4 | [#4](https://github.com/SpikemenDan/putt-pals/issues/4) | Corrected-launch difficulty sweep (done); S2 changes since then require the Q1 refresh |
| C2 | [#19](https://github.com/SpikemenDan/putt-pals/issues/19) | Root shared-contract copy cleanup |
| R1 | [#6](https://github.com/SpikemenDan/putt-pals/issues/6) | Renderer/camera extraction |
| U1 | [#7](https://github.com/SpikemenDan/putt-pals/issues/7) | React UI and input |
| D1 | [#8](https://github.com/SpikemenDan/putt-pals/issues/8) | Course data and CLI migration |
| L1 | [#9](https://github.com/SpikemenDan/putt-pals/issues/9) | Room lifecycle/scoring (integrated) |
| A1 | [#10](https://github.com/SpikemenDan/putt-pals/issues/10) | Procedural audio adapter |
| N1 | [#11](https://github.com/SpikemenDan/putt-pals/issues/11) | Transport adapters |
| I1 | [#12](https://github.com/SpikemenDan/putt-pals/issues/12) | Application integration |
| N2 | [#13](https://github.com/SpikemenDan/putt-pals/issues/13) | Guest recovery/interpolation |
| N2b | [#47](https://github.com/SpikemenDan/putt-pals/issues/47) | Committed real-browser N2 specs |
| N3 | [#14](https://github.com/SpikemenDan/putt-pals/issues/14) | Managed TURN (paused; an alternative to N4) |
| N4 | [#65](https://github.com/SpikemenDan/putt-pals/issues/65) | Server-owned Cloudflare room migration parent |
| N4a | [#66](https://github.com/SpikemenDan/putt-pals/issues/66) | Server-room contracts and lifecycle decisions |
| N4b | [#68](https://github.com/SpikemenDan/putt-pals/issues/68) | Local Worker/Durable Object setup |
| N4c | [#69](https://github.com/SpikemenDan/putt-pals/issues/69) | Backend room coordination |
| N4d | [#70](https://github.com/SpikemenDan/putt-pals/issues/70) | Durable room/player recovery |
| N4e | [#71](https://github.com/SpikemenDan/putt-pals/issues/71) | Browser WebSocket migration |
| N4f | [#72](https://github.com/SpikemenDan/putt-pals/issues/72) | Server-room coverage and quota/performance checks |
| N4g | [#73](https://github.com/SpikemenDan/putt-pals/issues/73) | Authorized Cloudflare preview setup and rollback |
| T1 | [#15](https://github.com/SpikemenDan/putt-pals/issues/15) | Integration/browser coverage |
| T1c | [#48](https://github.com/SpikemenDan/putt-pals/issues/48) | Chromium multiplayer join flake |
| R2 | [#16](https://github.com/SpikemenDan/putt-pals/issues/16) | Three.js upgrade |
| R2w | [#52](https://github.com/SpikemenDan/putt-pals/issues/52) | Windows GPU validation |
| R2c | [#57](https://github.com/SpikemenDan/putt-pals/issues/57) | Effect-shader colour fix after the Three.js upgrade |
| P1 | [#17](https://github.com/SpikemenDan/putt-pals/issues/17) | Rapier experiment (done; production adoption deferred) |
| Q1 | [#18](https://github.com/SpikemenDan/putt-pals/issues/18) | Release readiness |
| V1 | [#33](https://github.com/SpikemenDan/putt-pals/issues/33) | Comic art direction (umbrella for V1a–V1d) |
| V1a | [#58](https://github.com/SpikemenDan/putt-pals/issues/58) | Toon look foundation |
| V1b | [#59](https://github.com/SpikemenDan/putt-pals/issues/59) | Sky world |
| V1c | [#60](https://github.com/SpikemenDan/putt-pals/issues/60) | Per-map palettes, ambient weather visuals and fans |
| V1d | [#61](https://github.com/SpikemenDan/putt-pals/issues/61) | Comic HUD styling |
| G1 | [#34](https://github.com/SpikemenDan/putt-pals/issues/34) | Umbrella: gameplay mechanics, power-ups and hazards (to be split into G1a-G1g, see TASKS.md) |
| K1 | [#35](https://github.com/SpikemenDan/putt-pals/issues/35) | Umbrella: course redesign for floating islands, ramps, drops and tubes (to be split into K1a-K1d) |
| M1 | [#36](https://github.com/SpikemenDan/putt-pals/issues/36) | Menus, loading screen and feedback polish (to be split into sub-issues) |
| I2 | [#38](https://github.com/SpikemenDan/putt-pals/issues/38) | WebGL-unavailable message |
| I2b | [#41](https://github.com/SpikemenDan/putt-pals/issues/41) | Real-browser WebGL-fallback check |

## Vision backlog

Issues for the product vision in MODERNIZATION_PLAN.md were opened on 2026-10-29 with native blocked-by links; the owner has settled the decisions the plan listed. T2, U2, C3, G1a, F1, CL1 and CL2 are `status:ready`; the others are `status:blocked` by the issues in the Depends on column of TASKS.md. G1 (#34) and K1 (#35) are umbrellas for G1a-G1g and K1a-K1d; M1 (#36) still needs splitting. An issue is not authorized work until the coordinator confirms a claim. Labels: `vision`, `area:physics|gameplay|courses|ui|network`, and `needs:integration-owner` for tasks that touch `src/shared`, package files or CI.

| ID | Issue | Title |
| --- | --- | --- |
| T2 | [#83](https://github.com/SpikemenDan/putt-pals/issues/83) | One gameplay tuning file |
| U2 | [#84](https://github.com/SpikemenDan/putt-pals/issues/84) | Proportional aim arrow |
| C3 | [#85](https://github.com/SpikemenDan/putt-pals/issues/85) | Eight-player server rooms and relative-to-par results |
| S3 | [#86](https://github.com/SpikemenDan/putt-pals/issues/86) | Forgiving physics: smooth surfaces and cup fillet |
| SV1 | [#87](https://github.com/SpikemenDan/putt-pals/issues/87) | Par-route solver |
| G1a | [#88](https://github.com/SpikemenDan/putt-pals/issues/88) | Power-up framework |
| G1b | [#89](https://github.com/SpikemenDan/putt-pals/issues/89) | Self utility power-ups |
| G1c | [#90](https://github.com/SpikemenDan/putt-pals/issues/90) | Aim sabotage power-ups |
| G1d | [#91](https://github.com/SpikemenDan/putt-pals/issues/91) | Ball aura power-ups |
| G1e | [#92](https://github.com/SpikemenDan/putt-pals/issues/92) | Deployables |
| G1f | [#93](https://github.com/SpikemenDan/putt-pals/issues/93) | Global hazards |
| G1g | [#94](https://github.com/SpikemenDan/putt-pals/issues/94) | Course mechanics |
| GM1 | [#95](https://github.com/SpikemenDan/putt-pals/issues/95) | No Power-Ups mode |
| GM2 | [#96](https://github.com/SpikemenDan/putt-pals/issues/96) | Putt Pong (1v1) |
| K1a | [#97](https://github.com/SpikemenDan/putt-pals/issues/97) | Islands and walls |
| K1b | [#98](https://github.com/SpikemenDan/putt-pals/issues/98) | Ramps and drops |
| K1c | [#99](https://github.com/SpikemenDan/putt-pals/issues/99) | Transport tubes |
| K1d | [#100](https://github.com/SpikemenDan/putt-pals/issues/100) | Difficulty bands and starter maps |
| F1 | [#101](https://github.com/SpikemenDan/putt-pals/issues/101) | Flair: skins, trails, celebrations |
| CL1 | [#102](https://github.com/SpikemenDan/putt-pals/issues/102) | Geometry integrity validator |
| CL2 | [#103](https://github.com/SpikemenDan/putt-pals/issues/103) | Render clipping fixes |
| K0 | [#104](https://github.com/SpikemenDan/putt-pals/issues/104) | Volumetric 3D course model |
| W2 | [#105](https://github.com/SpikemenDan/putt-pals/issues/105) | Water in levels |
| W3 | [#106](https://github.com/SpikemenDan/putt-pals/issues/106) | Wind zones in levels |

## Superseded and historical notes

Earlier versions of this file carried dated snapshots of individual task states. The PR history, issue comments and docs/reviews/ hold that evidence; read live issues instead of any snapshot.
