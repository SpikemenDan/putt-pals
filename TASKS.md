# Roadmap

Roadmap and dependency snapshot from the supplied repository. Historical task states below have not been refreshed from live GitHub. Check relevant issues, PRs and code before starting. Use the two-contributor workflow in docs/ISSUES.md and docs/GITHUB_WORKFLOW.md. Keep detailed progress in one task record; update this roadmap when scope or dependencies materially change.

Statuses: READY (eligible after dependency and overlap checks), ACTIVE, BLOCKED (concrete blocker named), PAUSED (deliberate hold), DONE.

## Open work

| ID | Status | Depends on | Scope |
| --- | --- | --- | --- |
| [N4 #65](https://github.com/SpikemenDan/putt-pals/issues/65) | BLOCKED | children below | Parent: server-owned Cloudflare rooms replace PeerJS. Spec: docs/networking/SERVER_ROOMS.md |
| [N4g #73](https://github.com/SpikemenDan/putt-pals/issues/73) | BLOCKED | admission fix integration; deferred separate-network acceptance | Preview is deployed; physical-shot full map and hosted maintenance/recovery passed. Empty-room history-full fix passes locally and is committed as `28072ff`, pending integration/deployment. User deferred separate-network acceptance; idle metrics have no rows. Evidence: docs/reviews/N4_SERVER_ROOMS.md |
| [N3 #14](https://github.com/SpikemenDan/putt-pals/issues/14) | PAUSED | n/a | Managed TURN; an alternative to N4, not a prerequisite |
| [Q1 #18](https://github.com/SpikemenDan/putt-pals/issues/18) | BLOCKED | N4 #65 | Release readiness: verify a robust route within par on every putt under the final physics (replaces the hole-in-one refresh; scope to be updated on the issue), production-like preview, rollback, manual playtests |
| [M1 #36](https://github.com/SpikemenDan/putt-pals/issues/36) | READY | V1 done | Menus, loading screen and feedback polish. Merged so far: M1b start screen over a rotating panorama (PR #114), M1e per-power-up sounds (PR #126). Confirm what remains and split into sub-issues before claiming |
| [G1 #34](https://github.com/SpikemenDan/putt-pals/issues/34) | ACTIVE (tracking) | none | Umbrella, not claimable: power-ups, hazards and course mechanics; children G1a-G1g, GM1 and GM2 are sub-issues |
| [K1 #35](https://github.com/SpikemenDan/putt-pals/issues/35) | ACTIVE (tracking) | none | Umbrella, not claimable: 3D course redesign; children K0, K1a-K1d, W2, W3, CL1 and CL2 are sub-issues |
| [U2 #84](https://github.com/SpikemenDan/putt-pals/issues/84) | ACTIVE | none | Proportional aim arrow. PR #107 merged (b1a5419) as "Refs", not "Closes"; the issue stays open until the owner has judged the new drag feel by hand |
| [CL1 #102](https://github.com/SpikemenDan/putt-pals/issues/102) | ACTIVE | none | Geometry integrity validator. PR #108 merged (7b92fed); the issue stays open because two mover findings (Hourglass `movers[0]`, Elevator Alley `movers[0]`) are waived in `GEOMETRY_INTEGRITY_EXCEPTIONS` pending owner approval. Confirm what remains before claiming |
| [S3 #86](https://github.com/SpikemenDan/putt-pals/issues/86) | REVIEW | T2 | PR #125 merged (smoother surfaces, cup fillet); issue open, acceptance and the fresh difficulty sweep pending. Unblocks SV1 |
| [C3 #85](https://github.com/SpikemenDan/putt-pals/issues/85) | REVIEW | none | PR #133 merged (eight-player server rooms, strokes-minus-par results); issue acceptance remains open |
| [F1 #101](https://github.com/SpikemenDan/putt-pals/issues/101) | REVIEW | none | PR #132 merged (local ball and trail skins, celebrations); issue acceptance remains open |
| [CL2 #103](https://github.com/SpikemenDan/putt-pals/issues/103) | REVIEW | none | PR #128 merged (camera collision, wall fade, depth-tested aim arrow); issue acceptance remains open |
| [G1b #89](https://github.com/SpikemenDan/putt-pals/issues/89) | REVIEW | G1a | PR #118 merged (self utility power-ups); issue acceptance remains open |

On 2026-10-29 the owner delegated implementation ordering (tasks that leave trajectories unchanged may start now) and decided that holes need only be possible in par, not in one shot. Order: S3 (merged) then SV1 (par solver) come before G1g and K1, which no longer wait for Q1 or N4. Labels lag merges; read the issue and main before acting.

## Vision backlog

Breakdown of the product vision in MODERNIZATION_PLAN.md and the design in ARCHITECTURE.md (Gameplay systems). GitHub issues were opened on 2026-10-29 with native blocked-by links. G1a (#88), GM1 (#95) and T2 (#83) are closed; S3, C3, F1, CL2 and G1b are merged and listed under Open work. Status labels on the remaining rows can lag merges: G1c-G1f depend only on the closed G1a and SV1 only on merged S3, so their code prerequisites are met, but dependency and overlapping-work checks are still required. #34 (G1) and #35 (K1) are umbrellas. Each task keeps parity fixtures green when its effect is inactive, adds simulation tests, and lists its own owned paths when its issue is created.

| ID | Depends on | Scope |
| --- | --- | --- |
| [SV1 #87](https://github.com/SpikemenDan/putt-pals/issues/87) Par-route solver | #86 | Multi-stroke solver proving a robust route within par for every putt, replacing the single-shot hole-in-one search, hit-count ladder and hole-in-one par defaults in `tools.js` and `tools/cli`; par becomes an integer from 2 to 6 per putt (the shared validator currently allows 1 to 10); par defaults come from the shortest robust route; new difficulty measure and fixtures; `rank` and `check` updated. Coordinate contract changes with affected active work and update consumers/tests together |
| [G1c #90](https://github.com/SpikemenDan/putt-pals/issues/90) Aim sabotage | #88 | 360° Aim and 180° Aim as aim-indicator modes applied to opponents |
| [G1d #91](https://github.com/SpikemenDan/putt-pals/issues/91) Ball auras | #88 | Love Ball and Hate Ball, applied by each client to its own ball |
| [G1e #92](https://github.com/SpikemenDan/putt-pals/issues/92) Deployables | #88 | Bumper and Orbital Bumper (3 impacts, visible radius rings), synced objects |
| [G1f #93](https://github.com/SpikemenDan/putt-pals/issues/93) Global hazards | #88 | Rain, Snow, Wind, targeted Lightning, roaming Tornado and Hurricane driven by synced room time; keep distinct from the visual-only ambient weather |
| [G1g #94](https://github.com/SpikemenDan/putt-pals/issues/94) Course mechanics | #87 | Corner wedges and bouncers on tight turns, stronger fans, vortex rework, true portal pairs; re-solve affected maps |
| [GM2 #96](https://github.com/SpikemenDan/putt-pals/issues/96) Putt Pong | #88, #89 (lofted shot) | Turn-based 1v1 cup-rack mode per MODERNIZATION_PLAN.md: 10-cup racks, bonus balls, redemption and rounds, multi-cup course support with elimination events, rack field and renderer effect, turn phase in the session machine and server-room contract, lobby entry. More than two players is deferred by the owner |
| [K1a #97](https://github.com/SpikemenDan/putt-pals/issues/97) Islands and walls | #94, #87, #104 | Per-putt floating islands with designed gaps, guard walls, declared open edges |
| [K1b #98](https://github.com/SpikemenDan/putt-pals/issues/98) Ramps and drops | #97 | Curved ramps and multi-tier drops with landing floors; solver and test chambers |
| [K1c #99](https://github.com/SpikemenDan/putt-pals/issues/99) Transport tubes | #98 | Enclosed tubes that carry and fling the ball between islands |
| [K1d #100](https://github.com/SpikemenDan/putt-pals/issues/100) Difficulty bands | #97-#99 | Difficulty bands by map rating measured with SV1 (par-based, no hole-in-one requirement), optional hole-in-one shortcuts on some putts, re-solved starter maps, fresh sweep |
| [K0 #104](https://github.com/SpikemenDan/putt-pals/issues/104) | #86, #102 | Volumetric 3D course model: stacked and overlapping surfaces, walls and ceilings over one footprint, solver support; existing courses stay bit-identical |
| [W2 #105](https://github.com/SpikemenDan/putt-pals/issues/105) | #104, #83 | Water in levels: splash and reset, shallow water, currents, toon water visuals, solver hazard handling |
| [W3 #106](https://github.com/SpikemenDan/putt-pals/issues/106) | #104, #83 | Wind zones in levels: steady, gusting and updraft fields, airborne-weighted push, visible streamlines; distinct from fans and the G1f Wind hazard |

## Delivered

All merged to main; details in the PRs and docs/reviews/.

| Area | Tasks (issue, PR) |
| --- | --- |
| Baseline and tooling | W1 workflow and CI; B1 inventory (PR #1); B2 solver launch fix; B3 Vite and jsdom; B4 difficulty sweep (#4, PR #28); C2 root cleanup (#19) |
| Shared core | C1 contracts (#3); S1 headless simulation (#5); S2 cup capture (#54, PR #55); D1 course data and CLI (#8, PRs #22 and #31) |
| Application | L1 room lifecycle (#9, PR #23); A1 procedural audio (#10, PR #25); N1 transports (#11, PR #24); R1 renderer (#6, PR #27); U1 React UI and input (#7, PR #29); I1 modular app (#12, PR #31); I2 and I2b WebGL fallback (#38 PR #40, #41 PR #45) |
| Networking | N2 guest recovery and interpolation (#13, PR #43); N2b browser specs (#47, PR #49); T1c join flake (#48, PR #50); N4a contracts (#66, PR #74); N4b local runtime (#68, PR #75); N4c coordination (#69, PRs #81/#120); N4d recovery (#70, PR #122); N4e browser adoption (#71, PR #123); N4f coverage/quota evidence (#72, PR #129) |
| Testing | T1 Playwright suites and browser-ci (#15, PR #37) |
| Rendering | R2 Three.js 0.186.1 (#16, PR #53); R2w Windows GPU validation (#52, PR #56); R2c shader colours (#57, PR #63) |
| Look and feel | V1a toon foundation (#58, PR #67); V1b sky world (#59, PR #76); V1c palettes and weather (#60, PR #78); V1d comic HUD (#61, PR #79); V1 umbrella (#33) |
| Evaluation | P1 Rapier experiment (#17, PR #80): production adoption deferred |
| Vision backlog | T2 tuning module (#83, PR #109); G1a power-up framework (#88, PR #115); GM1 No Power-Ups flag (#95, PR #119) |


## Developer workflow improvements

These tasks are pending until implementation and verification are recorded.
IDs below do not imply that GitHub issues have already been created.

| ID | Outcome | Dependencies |
| --- | --- | --- |
| DX1 | Audit/extend the validated configuration entry point; reuse existing settings, preserve defaults and remove duplicated adjustable values | Existing tuning system |
| DX2 | Development-only tuning panel: sliders, toggles, selectors, reset, validated import/export and safe restart semantics | DX1 |
| DX3 | Inventory legacy consumers, migrate required capabilities/checks, then remove putt-pals.html, tools.js and obsolete infrastructure | Replacement test coverage and build checks |
| DX4 | Recovery backup: Git history/local refs, working files, manifest, restore verification and private Drive upload verification | Owner-designated Drive destination and authorized access |
| DX5 | Explicit-start overnight runner with bounded scope/time, local checkpoints, stop behavior and handoff | DX4 |
| DX6 | Inspect redundant local branches and present a named deletion list | Actual developer checkout inspection; owner approval before deletion |

DX1 extraction preserves current behavior. Retuning needs separate verification.
DX2 remains disabled in ordinary production builds by default. Appearance/feel
proposals require a local browser preview and owner feedback before acceptance.
DX3 preserves useful regression coverage and provenance.
DX5 has no scheduled start, remote writes or automatic restart.
