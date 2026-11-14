# Roadmap

Roadmap and dependency snapshot, checked against live GitHub issues and PRs on 2026-11-14 (main `76165ab`). Check relevant issues, PRs and code before starting. Use the two-contributor workflow in docs/ISSUES.md and docs/GITHUB_WORKFLOW.md. Keep detailed progress in one task record; update this roadmap when scope or dependencies materially change.

Statuses: READY (eligible after dependency and overlap checks), ACTIVE, BLOCKED (concrete blocker named), PAUSED (deliberate hold), DONE.

## Open work

| ID | Status | Depends on | Scope |
| --- | --- | --- | --- |
| [N4 #65](https://github.com/SpikemenDan/putt-pals/issues/65) | CLOSED | none | Parent: server-owned Cloudflare rooms replace PeerJS. All children N4a-N4g (#66-#73) merged and closed; room coordinator, Durable Objects, and WebSocket flows verified on main |
| [N3 #14](https://github.com/SpikemenDan/putt-pals/issues/14) | CLOSED | n/a | Managed TURN; closed as superseded by N4 (no WebRTC path remains); reopen only if one is reintroduced |
| [Q1 #18](https://github.com/SpikemenDan/putt-pals/issues/18) | READY | none | Release readiness: verify a robust route within par on every putt under the final physics (replaces the hole-in-one refresh; scope to be updated on the issue), production-like preview, rollback, manual playtests |
| [M1 #36](https://github.com/SpikemenDan/putt-pals/issues/36) | ACTIVE (tracking) | V1 done | Menus, loading screen and feedback polish, now carrying VIS-M. Merged: M1b start screen (PR #114), M1e per-power-up sounds (PR #126), loading tips, [#173](https://github.com/SpikemenDan/putt-pals/issues/173) VIS-M1 Gaia loading globe and 3D level select (PR #208; issue still open), [#174](https://github.com/SpikemenDan/putt-pals/issues/174) VIS-M2 main menu (PR #212, issue closed; owner look acceptance pending per the PR). Open: [#175](https://github.com/SpikemenDan/putt-pals/issues/175) VIS-M3 party flow, [#176](https://github.com/SpikemenDan/putt-pals/issues/176) VIS-M4 solo flow (PR #220 open) |
| [G1 #34](https://github.com/SpikemenDan/putt-pals/issues/34) | CLOSED | none | Umbrella: power-ups, hazards and course mechanics; all children G1a-G1g (#88-#94) and GM1 (#95) merged and closed. GM2 moved to separate umbrella #96 |
| [GM2 #96](https://github.com/SpikemenDan/putt-pals/issues/96) | CLOSED | G1a, G1b | Umbrella: Putt Pong (1v1); all children GM2a-GM2d (#185-#188) merged and closed |
| [K1 #35](https://github.com/SpikemenDan/putt-pals/issues/35) | CLOSED | none | Umbrella: 3D course redesign; all children K0 (#104), K1a-K1d (#97-#100), W2 (#105), W3 (#106), CL1 (#102) and CL2 (#103) merged, verified, and accepted |
| [CL1 #102](https://github.com/SpikemenDan/putt-pals/issues/102) | CLOSED | none | Geometry integrity validator. PR #108 merged (7b92fed); mover findings in `GEOMETRY_INTEGRITY_EXCEPTIONS` confirmed and accepted by owner; issue closed |
| [S3 #86](https://github.com/SpikemenDan/putt-pals/issues/86) | CLOSED | T2 | PR #125 merged (smoother surfaces, cup fillet) and PR #156 merged (aim retune); SV1 (#87) par solver delivered; issue closed |
| [F1 #101](https://github.com/SpikemenDan/putt-pals/issues/101) | REVIEW | none | PR #132 merged (local ball and trail skins, celebrations); issue acceptance remains open |
| [CL2 #103](https://github.com/SpikemenDan/putt-pals/issues/103) | CLOSED | none | Render clipping fixes. PR #128 merged (camera collision, wall fade, depth-tested aim arrow); confirmed and accepted by owner; issue closed |
| [VIS-C #161](https://github.com/SpikemenDan/putt-pals/issues/161) | REVIEW | none | PR #171 merged (30-colour palette, unique per room, `PROTOCOL_VERSION` 2); owner look acceptance remains |

On 2026-10-29 the owner delegated implementation ordering (tasks that leave trajectories unchanged may start now) and decided that holes need only be possible in par, not in one shot. Order: S3 (merged) then SV1 (par solver) come before G1g and K1, which no longer wait for Q1 or N4. Labels lag merges; read the issue and main before acting.

## Vision backlog

Breakdown of the product vision in MODERNIZATION_PLAN.md and the design in ARCHITECTURE.md (Gameplay systems). GitHub issues were opened on 2026-10-29 with native blocked-by links. G1a (#88), G1b (#89), G1c (#90), G1d (#91), G1e (#92), G1f (#93), G1g (#94), GM1 (#95), SV1 (#87), S3 (#86), N4 (#65), T2 (#83), and K0 (#104) are merged and closed; umbrella G1 (#34) is closed; F1 and CL2 are merged and listed under Open work. Every row below is merged and its issue closed; umbrellas K1 (#35) and GM2 (#96) are closed. Each task keeps parity fixtures green when its effect is inactive, adds simulation tests, and lists its own owned paths when its issue is created.

| ID | Depends on | Scope |
| --- | --- | --- |
| [SV1 #87](https://github.com/SpikemenDan/putt-pals/issues/87) Par-route solver | #86 | Merged in PR #179 (2026-11-04), issue closed: multi-stroke solver proving a robust route within par for every putt, replacing the single-shot hole-in-one search, hit-count ladder and hole-in-one par defaults in `tools/cli`; par becomes an integer from 2 to 6 per putt; par defaults come from shortest robust route; new difficulty measure and fixtures; `rank` and `check` updated |
| [G1f #93](https://github.com/SpikemenDan/putt-pals/issues/93) Global hazards | #88 | Merged in PR #181 (2026-11-05), issue closed: timed room-owned records, snapshot lifecycle, deterministic simulation and selectors for Rain, Snow, Wind, targeted Lightning, Tornado and Hurricane. Details: [G1f evidence](docs/G1F_GLOBAL_HAZARDS.md) |
| [G1g #94](https://github.com/SpikemenDan/putt-pals/issues/94) Course mechanics | #87 | Merged in PR #183 (2026-11-05), issue closed: validated wedges/bouncers, stronger fan and finite vortex records, oriented portal pairs, renderer/solver support and five robust proof chambers. Details: [Implementation scope](docs/G1G_COURSE_MECHANICS.md) |
| [GM2a #185](https://github.com/SpikemenDan/putt-pals/issues/185) Multi-cup schema & racks | #88, #89 | Merged in PR #199, issue closed: Multi-cup course schema, per-cup capture and elimination events, 10-cup rack chamber, elimination physics, and course validation |
| [GM2b #186](https://github.com/SpikemenDan/putt-pals/issues/186) 1v1 turn-based session | #185 | Merged in PR #200, issue closed: Turn-based 1v1 session rules and state machine (alternating turns, 2 balls/turn, bonus balls, redemption sequence, round resets with alternating starter, and win condition) |
| [GM2c #187](https://github.com/SpikemenDan/putt-pals/issues/187) Visuals & HUD | #185 | Merged in PR #201, issue closed: 3D cup rack rendering, cup elimination feedback effect, HUD rack tracker, lobby game mode selector |
| [GM2d #188](https://github.com/SpikemenDan/putt-pals/issues/188) Integration & verification | #185-#187 | Merged in PR #202, issue closed: End-to-end 2-client match, practice solo flow, chip-shot cup landing tuning, Playwright browser tests |
| [K1a #97](https://github.com/SpikemenDan/putt-pals/issues/97) Islands and walls | #94, #87, #104 | Merged in PR #193, issue closed: Per-putt floating islands with designed gaps, guard walls, declared open edges, CL1 integrity checks, SV1 proof chambers and test coverage |
| [K1b #98](https://github.com/SpikemenDan/putt-pals/issues/98) Ramps and drops | #97 | Merged in PR #194, issue closed: Curved ramps and multi-tier drops with landing floors, analytical height/banking profiles, Three.js rendering, SV1 proof chambers and test coverage |
| [K1c #99](https://github.com/SpikemenDan/putt-pals/issues/99) Transport tubes | #98 | Merged in PR #195, issue closed: Enclosed tubes that carry and fling the ball between islands |
| [K1d #100](https://github.com/SpikemenDan/putt-pals/issues/100) Difficulty bands | #97-#99 | Merged in PR #196, issue closed: Difficulty bands by map rating measured with SV1 (par-based, no hole-in-one requirement), optional hole-in-one shortcuts on some putts, re-solved starter maps, fresh sweep |
| [K0 #104](https://github.com/SpikemenDan/putt-pals/issues/104) | #86, #102 | Merged in PR #191 (2026-11-05), issue closed: Volumetric 3D course model: stacked and overlapping surfaces, walls and ceilings over one footprint, clearance rules, solver support, proof chamber; existing courses stay bit-identical |
| [W2 #105](https://github.com/SpikemenDan/putt-pals/issues/105) | #104, #83 | Merged in PR #197, issue closed: Water in levels: splash and reset, shallow water, currents, toon water visuals, solver hazard handling |
| [W3 #106](https://github.com/SpikemenDan/putt-pals/issues/106) | #104, #83 | Merged in PR #198, issue closed: Wind zones in levels: steady, gusting and updraft fields, airborne-weighted push, visible streamlines; distinct from fans and the G1f Wind hazard |

## Putt Planet vision backlog (defined 2026-11-03)

Breakdown of the redefined vision in MODERNIZATION_PLAN.md. Tracked by the [VIS umbrella #170](https://github.com/SpikemenDan/putt-pals/issues/170) (GitHub issues opened 2026-11-03). As of 2026-11-14: VIS-T, VIS-D, VIS-V, VIS-W and VIS-U are merged with issues closed; VIS-C is merged in owner review; VIS-M is partly merged (see M1 #36); VIS-G (PR #217) and VIS-E (PR #221) have open PRs; VIS-A and VIS-R are not started. Settle the "Open decisions" in the plan that affect a task before starting it. Each task keeps current behavior and fixtures unchanged when its feature is off.

| ID | Depends on | Scope |
| --- | --- | --- |
| [VIS-T #160](https://github.com/SpikemenDan/putt-pals/issues/160) Tournament length 3/5/7 | none | Done: PR #159 merged, issue closed 2026-11-04 |
| [VIS-C #161](https://github.com/SpikemenDan/putt-pals/issues/161) Ball colours | none | At least 21 rainbow colours (light, standard, dark of seven hues) plus white, black, gray, brown and extras; unique per party, occupied colours marked unavailable, a disconnected player's colour reserved; colour picker showing the real ball. Merged in PR #171 (`PROTOCOL_VERSION` 2, `SERVER_ROOM_VERSION` 3); owner look acceptance remains |
| [VIS-D #162](https://github.com/SpikemenDan/putt-pals/issues/162) Disconnect, rejoin, late arrival | #65 N4, VIS-C | Merged in PR #206, issue closed: Reserved slots; saved reconnect identity token (local, no accounts); resume with strokes and remaining time before the hole closes; missed-hole scoring (max-hole score plus penalty, new tuning fields); late arrival into an open hole with penalties for earlier holes; scorecard marks penalties. |
| [VIS-V #163](https://github.com/SpikemenDan/putt-pals/issues/163) Voting and random picker | VIS-T | Merged in PR #207, issue closed: Votes for format, length, world, opening map and every next map; tie picker with one room-chosen result and a synchronized animation; repeat maps allowed. Server-room contract and session machine |
| [VIS-W #164](https://github.com/SpikemenDan/putt-pals/issues/164) Worlds and per-world gravity | S3 (merged), #104 K0 | Gaia, Ares and Luna as data: gravity profile in `src/shared/tuning.js`, course collection, environment settings; solver and test chambers run per world; difficulty evidence is redone per world. Merged in PR #213, issue closed: Gaia 700, Ares 490, Luna 315 units/s^2, Ares and Luna accepted by the owner after a local playtest on 2026-11-12. Ares and Luna gravity reach normal play once world selection (VIS-M4 #176) lands |
| [VIS-G #165](https://github.com/SpikemenDan/putt-pals/issues/165) Regions and named maps | VIS-W, #97-#100 K1 | Region data model, several named maps per region, and first content for each world. Owner decided 2026-11-11: islands hover over their region's scenery ground; Gaia keeps all 22 maps in six regions plus 2 new (24), Ares and Luna start with two regions of four maps each. Open: PR #217 (placeholder maps fill Gaia's regions to four playable slots) |
| [VIS-E #166](https://github.com/SpikemenDan/putt-pals/issues/166) Environment effects | VIS-W | Gaia rain/snow with slippery surface (already catalogued as G1f), Ares wind and Luna dust/solar visuals (visual only, no physics); the precipitation power-up is left out of the Ares and Luna pools (owner, 2026-11-11). Open: PR #221 |
| [VIS-A #167](https://github.com/SpikemenDan/putt-pals/issues/167) Arrival sequence | VIS-M, VIS-V | Launch countdown, skydive, cloud loading that covers map loading, establishing shot, move to the opening hole, zoom into the ball camera, synchronized "ready" from all active players, no cost to the hole timer; repeats for every selected map |
| VIS-M Menus (tracked in [M1 #36](https://github.com/SpikemenDan/putt-pals/issues/36), split into #173-#176) | M1 #36 | Planet loading screen with flying balls, Solo/Party/Custom/Settings menu, version label, Solo and Party flows, plane lobby, party code only after Create, colour pick before lobby. Owner decided 2026-11-11: Practice (including Putt Pong practice) inside Solo, Putt Pong as a Party vote format with exactly two players, No Power-Ups as a Custom rule. Merged: VIS-M1 (PR #208), VIS-M2 (PR #212); open: VIS-M3, VIS-M4 (PR #220) |
| [VIS-U #168](https://github.com/SpikemenDan/putt-pals/issues/168) Custom rules editor | DX1, DX2 | Player-facing rules editor over the validated tuning system; sliders with values, toggles, selectors, per-setting and global reset, then Play Solo or Host Party with those rules; online rules fixed at lobby creation and identical for all. Merged in PR #222, issue closed (`SERVER_ROOM_VERSION` 7) |
| [VIS-R #169](https://github.com/SpikemenDan/putt-pals/issues/169) Rename to Putt Planet | owner approval | Product name in UI, package, docs and hosting; separate from all behaviour work |

Existing tasks changed by the vision:

- **G1e #92 (Deployables):** delivered in PR #157 (merged 2026-11-04, issue closed) with the owner-approved force and designs, the vertical extent and airborne rules (contract revision 2) and server-room placement and hit checks; `PROTOCOL_VERSION` 3, `SERVER_ROOM_VERSION` 4. Separate-network validation stays with N4 #65.
- **K0 #104, K1a-K1d, W2 #105, W3 #106, SV1 #87, G1b Chip In:** all need airborne behaviour and per-world gravity in their acceptance checks.
- **M1 #36:** its menus scope is now part of VIS-M.
- **GM1 #95 (No Power-Ups):** becomes a Custom rule flag (owner, 2026-11-11); VIS-U (PR #222) has a Power-Ups rule, and VIS-M3 (#175) removes the lobby No power-ups toggle; server-owned rooms refuse `SET_POWERUPS`.

## Delivered

All merged to main; details in the PRs and docs/reviews/.

| Area | Tasks (issue, PR) |
| --- | --- |
| Baseline and tooling | W1 workflow and CI; B1 inventory (PR #1); B2 solver launch fix; B3 Vite and jsdom; B4 difficulty sweep (#4, PR #28); C2 root cleanup (#19) |
| Shared core | C1 contracts (#3); S1 headless simulation (#5); S2 cup capture (#54, PR #55); D1 course data and CLI (#8, PRs #22 and #31) |
| Application | #177 stale help text (PR #182); L1 room lifecycle (#9, PR #23); A1 procedural audio (#10, PR #25); N1 transports (#11, PR #24); R1 renderer (#6, PR #27); U1 React UI and input (#7, PR #29); I1 modular app (#12, PR #31); I2 and I2b WebGL fallback (#38 PR #40, #41 PR #45) |
| Networking | N2 guest recovery and interpolation (#13, PR #43); N2b browser specs (#47, PR #49); T1c join flake (#48, PR #50); N4a contracts (#66, PR #74); N4b local runtime (#68, PR #75); N4c coordination (#69, PRs #81/#120); N4d recovery (#70, PR #122); N4e browser adoption (#71, PR #123); N4f coverage/quota evidence (#72, PR #129) |
| Testing | T1 Playwright suites and browser-ci (#15, PR #37); room-full spec reads `MAX_PLAYERS` (PR #216); async rejection handling in world select and dev tool loading (PR #215) |
| Rendering | R2 Three.js 0.186.1 (#16, PR #53); R2w Windows GPU validation (#52, PR #56); R2c shader colours (#57, PR #63) |
| Look and feel | V1a toon foundation (#58, PR #67); V1b sky world (#59, PR #76); V1c palettes and weather (#60, PR #78); V1d comic HUD (#61, PR #79); V1 umbrella (#33); comic weather polish and caption-box HUD (PR #205); caption-box announcement banners (#203, PR #210) |
| Evaluation | P1 Rapier experiment (#17, PR #80): production adoption deferred |
| Vision backlog | T2 tuning module (#83, PR #109); G1a power-up framework (#88, PR #115); GM1 No Power-Ups flag (#95, PR #119); G1c aim sabotage (#90, PR #135); G1d ball auras (#91, PR #134); C3 eight-player rooms (#85, PR #133); U2 aim arrow (#84, PRs #107 and #156); VIS-T 3/5/7 tournaments (#160, PR #159); G1e Bumper and Orbital Bumper deployables (#92, PR #157); VIS-D disconnect, rejoin and late arrival (#162, PR #206); VIS-V voting and tie picker (#163, PR #207); VIS-W per-world gravity (#164, PR #213); VIS-U Custom rules editor (#168, PR #222) |


## Developer workflow improvements

Status per row; pending rows remain open until implementation and verification are recorded.
IDs below do not imply that GitHub issues have already been created.

| ID | Outcome | Dependencies |
| --- | --- | --- |
| DX1 | Audit/extend the validated configuration entry point; reuse existing settings, preserve defaults and remove duplicated adjustable values. Behaviour-preserving extraction merged in PR #209; duplicates inside `src/shared/tuning.js` and `src/shared/constants.js` were deferred | Existing tuning system |
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
