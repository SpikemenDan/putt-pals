# Roadmap

Roadmap and dependency snapshot from the supplied repository. Historical task states below have not been refreshed from live GitHub. Check relevant issues, PRs and code before starting. Use the two-contributor workflow in docs/ISSUES.md and docs/GITHUB_WORKFLOW.md. Keep detailed progress in one task record; update this roadmap when scope or dependencies materially change.

Statuses: READY (eligible after dependency and overlap checks), ACTIVE, BLOCKED (concrete blocker named), PAUSED (deliberate hold), DONE.

## Open work

| ID | Status | Depends on | Scope |
| --- | --- | --- | --- |
| [N4 #65](https://github.com/SpikemenDan/putt-pals/issues/65) | BLOCKED | children below | Parent: server-owned Cloudflare rooms replace PeerJS. Spec: docs/networking/SERVER_ROOMS.md |
| [N4g #73](https://github.com/SpikemenDan/putt-pals/issues/73) | BLOCKED | admission fix preview deployment; deferred separate-network acceptance | Preview is deployed; physical-shot full map and hosted maintenance/recovery passed. Empty-room history-full fix passes locally and is delivered in PR #145 (`28072ff`), pending preview deployment. User deferred separate-network acceptance; idle metrics have no rows. Evidence: docs/reviews/N4_SERVER_ROOMS.md |
| [N3 #14](https://github.com/SpikemenDan/putt-pals/issues/14) | CLOSED | n/a | Managed TURN; closed as superseded by N4 (no WebRTC path remains); reopen only if one is reintroduced |
| [Q1 #18](https://github.com/SpikemenDan/putt-pals/issues/18) | BLOCKED | N4 #65 | Release readiness: verify a robust route within par on every putt under the final physics (replaces the hole-in-one refresh; scope to be updated on the issue), production-like preview, rollback, manual playtests |
| [M1 #36](https://github.com/SpikemenDan/putt-pals/issues/36) | READY | V1 done | Menus, loading screen and feedback polish. Merged so far: M1b start screen over a rotating panorama (PR #114), M1e per-power-up sounds (PR #126). Confirm what remains and split into sub-issues before claiming |
| [G1 #34](https://github.com/SpikemenDan/putt-pals/issues/34) | ACTIVE (tracking) | none | Umbrella, not claimable: power-ups, hazards and course mechanics; children G1a-G1g, GM1 and GM2 are sub-issues |
| [K1 #35](https://github.com/SpikemenDan/putt-pals/issues/35) | ACTIVE (tracking) | none | Umbrella, not claimable: 3D course redesign; children K0, K1a-K1d, W2, W3, CL1 and CL2 are sub-issues |
| [U2 #84](https://github.com/SpikemenDan/putt-pals/issues/84) | ACTIVE | none | Proportional aim arrow. Codex local follow-up on `feat/u2-aim-preview` owns the input mapping, shared defaults, preview chamber and affected evidence; claim not published. Owner approved 600 full-power speed and 0.18 canvas pull fraction in local preview. PR #107 merged (b1a5419) as "Refs", not "Closes"; this local follow-up is not yet integrated |
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

## Putt Planet vision backlog (defined 2026-11-03)

Breakdown of the redefined vision in MODERNIZATION_PLAN.md. Tracked by the [VIS umbrella #170](https://github.com/SpikemenDan/putt-pals/issues/170) (GitHub issues opened 2026-11-03; nothing is claimed). Only VIS-T has code, in PR #159. Settle the "Open decisions" in the plan that affect a task before starting it. Each task keeps current behavior and fixtures unchanged when its feature is off.

| ID | Depends on | Scope |
| --- | --- | --- |
| [VIS-T #160](https://github.com/SpikemenDan/putt-pals/issues/160) Tournament length 3/5/7 | none | Replace 3/6/9 with 3/5/7 in the session machine (`src/session`), UI model (`src/ui/model.js`), server-room contract, scorecards, tests and docs (BASELINE.md, session README). Touches `src/shared` contracts, so it needs integration-owner coordination |
| [VIS-C #161](https://github.com/SpikemenDan/putt-pals/issues/161) Ball colours | none | At least 21 rainbow colours (light, standard, dark of seven hues) plus white, black, gray, brown and extras; unique per party, occupied colours marked unavailable, a disconnected player's colour reserved; colour picker showing the real ball. Changes the player and protocol contracts, so it needs integration-owner coordination and a protocol version decision |
| [VIS-D #162](https://github.com/SpikemenDan/putt-pals/issues/162) Disconnect, rejoin, late arrival | #65 N4, VIS-C | Reserved slots; saved reconnect identity token (local, no accounts); resume with strokes and remaining time before the hole closes; missed-hole scoring (max-hole score plus penalty, new tuning fields); late arrival into an open hole with penalties for earlier holes; scorecard marks penalties. Replaces "late joins stay spectators for the map" in `src/session/README.md`. Server-room contract change, so coordinate with N4 |
| [VIS-V #163](https://github.com/SpikemenDan/putt-pals/issues/163) Voting and random picker | VIS-T | Votes for format, length, world, opening map and every next map; tie picker with one room-chosen result and a synchronized animation; repeat maps allowed. Server-room contract and session machine |
| [VIS-W #164](https://github.com/SpikemenDan/putt-pals/issues/164) Worlds and per-world gravity | S3 (merged), #104 K0 | Gaia, Ares and Luna as data: gravity profile in `src/shared/tuning.js`, course collection, environment settings; solver and test chambers run per world; difficulty evidence is redone per world. Gravity numbers need owner playtesting (preview with developer controls) |
| [VIS-G #165](https://github.com/SpikemenDan/putt-pals/issues/165) Regions and named maps | VIS-W, #97-#100 K1 | Region data model, several named maps per region, and first content for each world. Needs the island-versus-surface decision and the content-volume decision |
| [VIS-E #166](https://github.com/SpikemenDan/putt-pals/issues/166) Environment effects | VIS-W | Gaia rain/snow with slippery surface (already catalogued as G1f), Ares wind and Luna dust/solar visuals (visual only, no physics) |
| [VIS-A #167](https://github.com/SpikemenDan/putt-pals/issues/167) Arrival sequence | VIS-M, VIS-V | Launch countdown, skydive, cloud loading that covers map loading, establishing shot, move to the opening hole, zoom into the ball camera, synchronized "ready" from all active players, no cost to the hole timer; repeats for every selected map |
| VIS-M Menus (tracked in [M1 #36](https://github.com/SpikemenDan/putt-pals/issues/36), no separate issue) | M1 #36 | Planet loading screen with flying balls, Solo/Party/Custom/Settings menu, version label, Solo and Party flows, plane lobby, party code only after Create, colour pick before lobby. Split #36 into sub-issues first |
| [VIS-U #168](https://github.com/SpikemenDan/putt-pals/issues/168) Custom rules editor | DX1, DX2 | Player-facing rules editor over the validated tuning system; sliders with values, toggles, selectors, per-setting and global reset, then Play Solo or Host Party with those rules; online rules fixed at lobby creation and identical for all |
| [VIS-R #169](https://github.com/SpikemenDan/putt-pals/issues/169) Rename to Putt Planet | owner approval | Product name in UI, package, docs and hosting; separate from all behaviour work |

Existing tasks changed by the vision:

- **G1e #92 (Deployables):** the Bumper and Orbital Bumper force and designs are approved. The contract draft must add a vertical extent and airborne rules (see "Airborne balls and 3D obstacles" in the plan) before the integration owner accepts it.
- **K0 #104, K1a-K1d, W2 #105, W3 #106, SV1 #87, G1b Chip In:** all need airborne behaviour and per-world gravity in their acceptance checks.
- **M1 #36:** its menus scope is now part of VIS-M.
- **GM1 #95 (No Power-Ups):** becomes a Custom rule flag if the owner confirms (plan, Open decisions).

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
| DX3 | Done (2026-11-02, merged in PR #146): legacy consumers inventoried and migrated, `putt-pals.html`, `tools.js` and legacy-only infrastructure removed; see ARCHITECTURE.md | Replacement test coverage and build checks |
| DX4 | Tooling done and tested (2026-11-02, merged in PR #146): backup, manifest, restore verification, Drive upload gate with receipt; see docs/OVERNIGHT.md. **Open:** owner-designated Drive destination and rclone remote; real upload unverified | Owner-designated Drive destination and authorized access |
| DX5 | Tooling done and tested (2026-11-02, merged in PR #146): preflight, enforced limits, watchdog, handoff; the default assistant command has never been run. Blocked from starting by DX4 setup | DX4 |
| DX6 | Inspect redundant local branches and present a named deletion list | Actual developer checkout inspection; owner approval before deletion |
| DX7 | Retire the permanent `dev/*` contributor branches: each contributor checks their own clone for unpushed work, outstanding work becomes focused task branches, then a named cleanup list is approved (docs/GITHUB_WORKFLOW.md) | DX6, owner approval before deletion |

DX1 extraction preserves current behavior. Retuning needs separate verification.
DX2 remains disabled in ordinary production builds by default. Appearance/feel
proposals require a local browser preview and owner feedback before acceptance.
DX3 preserves useful regression coverage and provenance.
DX5 has no scheduled start, remote writes or automatic restart.
