# Roadmap

Coordinator snapshot of the task graph. GitHub issues own live claims, status, blockers and acceptance; discover and claim work through docs/ISSUES.md and docs/GITHUB_WORKFLOW.md. Per-task verification evidence lives in each PR and in docs/reviews/. Workers report in their issue or PR rather than editing this file.

Statuses: READY (eligible for a coordinator-confirmed claim), ACTIVE, BLOCKED (concrete blocker named), PAUSED (deliberate hold), PROPOSED (planned here, no GitHub issue yet), DONE.

## Open work

| ID | Status | Depends on | Scope |
| --- | --- | --- | --- |
| [N4 #65](https://github.com/SpikemenDan/putt-pals/issues/65) | BLOCKED | children below | Parent: server-owned Cloudflare rooms replace PeerJS. Spec: docs/networking/SERVER_ROOMS.md |
| [N4c #69](https://github.com/SpikemenDan/putt-pals/issues/69) | ACTIVE | N4a, N4b | Room coordination on a Durable Object. PR #81 merged (333d06d); the issue is still open, so confirm what remains before claiming |
| [N4d #70](https://github.com/SpikemenDan/putt-pals/issues/70) | BLOCKED | #69 | Durable checkpoints, alarms, reconnect and controller recovery |
| [N4e #71](https://github.com/SpikemenDan/putt-pals/issues/71) | BLOCKED | #66, #69, #70 | Browser WebSocket room client replaces PeerJS rooms |
| [N4f #72](https://github.com/SpikemenDan/putt-pals/issues/72) | BLOCKED | #68-#71 | Cross-browser server-room tests, quota and performance checks |
| [N4g #73](https://github.com/SpikemenDan/putt-pals/issues/73) | BLOCKED | #68, #72 and owner authorization | Connect Cloudflare, deploy a preview, separate-network acceptance, rollback |
| [N3 #14](https://github.com/SpikemenDan/putt-pals/issues/14) | PAUSED | n/a | Managed TURN; an alternative to N4, not a prerequisite |
| [Q1 #18](https://github.com/SpikemenDan/putt-pals/issues/18) | BLOCKED | N4 #65 | Release readiness: fresh difficulty sweep of all 36 starter putts (S2 narrowed five hard putts), production-like preview, rollback, manual playtests |
| [M1 #36](https://github.com/SpikemenDan/putt-pals/issues/36) | READY | V1 done | Menu panorama, loading screen with tips, active-ball ring, menu and turn-ready sounds; split into sub-issues first |
| [G1 #34](https://github.com/SpikemenDan/putt-pals/issues/34) | BLOCKED | Q1 | Umbrella for gameplay mechanics and power-ups; split into G1a-G1g below |
| [K1 #35](https://github.com/SpikemenDan/putt-pals/issues/35) | BLOCKED | G1, Q1 | Umbrella for course redesign; split into K1a-K1d below |

G1 and K1 were gated behind Q1 by an earlier owner decision. On 2026-10-29 the owner left the order to the coordinator, so G1a-G1f, GM1, F1 and C3 may start now (they leave default trajectories unchanged); G1g and K1 change course geometry and physics and stay after Q1's fresh difficulty sweep unless the owner un-gates them.

## Vision backlog (PROPOSED)

Breakdown of the product vision in MODERNIZATION_PLAN.md and the design in ARCHITECTURE.md (Gameplay systems). Create GitHub issues with the Agent task form; native dependencies below become blocked-by links. Each task keeps parity fixtures green when its effect is inactive, adds simulation tests, and lists its own owned paths when its issue is created.

| ID | Depends on | Scope |
| --- | --- | --- |
| C3 Eight-player server rooms and relative-to-par results | none | Align the N4 server-room contract (currently 4 members) with the 8-player cap used by the app, its validators and mocks; lead results, scorecard and tournament standings with strokes minus par computed from completed putts. Touches the accepted N4 contract and `src/shared`, so it goes through the integration owner |
| G1a Power-up framework | none | Catalog data, 3-slot inventory with tournament carryover and single-play reset, stacking, hotkey and click activation, box spawn table, solo (self-enhancing) and No-Power-Ups filtering, validated effect messages, migrate Hole Magnet and Steady Aim, remove Rewind, Reversiball and Zanyball (including the `rev` and `zany` fx in the protocol and server-room contracts) |
| G1b Self utility | G1a | Chip In (lofted shot), Ghost Ball, Small Ball and Tall Ball (per-ball radius), Sticky Ball |
| G1c Aim sabotage | G1a | 360° Aim and 180° Aim as aim-indicator modes applied to opponents |
| G1d Ball auras | G1a | Love Ball and Hate Ball, applied by each client to its own ball |
| G1e Deployables | G1a | Bumper and Orbital Bumper (3 impacts, visible radius rings), synced objects |
| G1f Global hazards | G1a | Rain, Snow, Wind, targeted Lightning, roaming Tornado and Hurricane driven by synced room time; keep distinct from the visual-only ambient weather |
| G1g Course mechanics | Q1 sweep | Corner wedges and bouncers on tight turns, stronger fans, vortex rework, true portal pairs; re-solve affected maps |
| GM1 No Power-Ups mode | G1a | Pure Mini-Golf mode flag and mode selector; verify Practice and solo draw only self-enhancing power-ups |
| GM2 Putt Pong | G1a, G1b (lofted shot) | Turn-based cup-rack mode per MODERNIZATION_PLAN.md: sides with racks and shooter rotation (1v1 first, then teams), 10-cup racks, bonus balls, redemption and rounds, multi-cup course support with elimination events, rack field and renderer effect, turn phase in the session machine and server-room contract, lobby entry. Free-for-all on a polygon field is a later option |
| K1a Islands and walls | G1g, Q1 sweep | Per-putt floating islands with designed gaps, guard walls, declared open edges |
| K1b Ramps and drops | K1a | Curved ramps and multi-tier drops with landing floors; solver and test chambers |
| K1c Transport tubes | K1b | Enclosed tubes that carry and fling the ball between islands |
| K1d Difficulty bands | K1a-K1c | Hole-in-one bands by map rating, re-solved starter maps, fresh sweep |
| F1 Flair | none | Selectable ball skins, trail skins and hole-in-one celebrations; choice stored locally; validated cosmetic ids in presence |

## Delivered

All merged to main; details in the PRs and docs/reviews/.

| Area | Tasks (issue, PR) |
| --- | --- |
| Baseline and tooling | W1 workflow and CI; B1 inventory (PR #1); B2 solver launch fix; B3 Vite and jsdom; B4 difficulty sweep (#4, PR #28); C2 root cleanup (#19) |
| Shared core | C1 contracts (#3); S1 headless simulation (#5); S2 cup capture (#54, PR #55); D1 course data and CLI (#8, PRs #22 and #31) |
| Application | L1 room lifecycle (#9, PR #23); A1 procedural audio (#10, PR #25); N1 transports (#11, PR #24); R1 renderer (#6, PR #27); U1 React UI and input (#7, PR #29); I1 modular app (#12, PR #31); I2 and I2b WebGL fallback (#38 PR #40, #41 PR #45) |
| Networking | N2 guest recovery and interpolation (#13, PR #43); N2b browser specs (#47, PR #49); T1c join flake (#48, PR #50); N4a contracts (#66, PR #74); N4b local runtime (#68, PR #75) |
| Testing | T1 Playwright suites and browser-ci (#15, PR #37) |
| Rendering | R2 Three.js 0.186.1 (#16, PR #53); R2w Windows GPU validation (#52, PR #56); R2c shader colours (#57, PR #63) |
| Look and feel | V1a toon foundation (#58, PR #67); V1b sky world (#59, PR #76); V1c palettes and weather (#60, PR #78); V1d comic HUD (#61, PR #79); V1 umbrella (#33) |
| Evaluation | P1 Rapier experiment (#17, PR #80): production adoption deferred |
