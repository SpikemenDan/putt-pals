# Legacy application baseline (B1)

Prepared on 2026-10-25/26 for migration review. Source: main commit b333495, with the game and tools unchanged on working branch agent/b1-browser-baseline. This is a reference inventory, not a claim that every feature has been playtested in a browser.

## Artifacts and reproduction

- tests/fixtures/source-inventory.json: source hashes, embedded dependency metadata, every course's geometry counts and putt rules, plus six representative headless trajectories.
- tests/fixtures/solver-baseline.json: B2's robust shot results for all 36 starter putts.
- tests/fixtures/browser-baseline/: seven native Chrome window screenshots and manifest.json, recording their hashes, dimensions, capture context and observations.
- docs/THIRD_PARTY.md: embedded library version/license evidence and provenance limits.

```sh
npm ci
npm run check
npm run build
```

The source inventory (`tests/fixtures/source-inventory.json`) is historical provenance recorded from the legacy page before its retirement; nothing regenerates it. The legacy page and tools.js were removed after commit b1a57c4; `git show b1a57c4:putt-pals.html` (or `:tools.js`) recovers them.

Trajectories use the game's actual launch and step functions. They assume a centered release, no power-ups, a fixed 1/240-second step and hazard time frozen at zero. One shot from the first putt of each starter is sampled every 240 ticks and at completion. All six end sunk with one stroke. They are useful for extraction parity, not exhaustive moving-hazard coverage, a real input replay, or a promise of bitwise equivalence across JavaScript engines. Compare positions/velocities with explicit tolerances when porting.

## Implemented behavior inventory

“Source” means inspected code; “jsdom” refers to the recorded B3 smoke suites; “Chrome” means this task's real UI observations. These evidence levels are deliberately separate.

| Area | Existing behavior | Evidence |
| --- | --- | --- |
| Entry | Name and room code; Play solo or Join room; expandable ICE settings | Source; Chrome landing/solo entry |
| Modes | Standard one map; tournaments of 3/6/9 maps; full-map solo practice; replay one putt | Source; all choices visible in Chrome; jsdom covers mode flows |
| Courses | 22 stored maps, six starter maps in voting, six putts per starter | Generated source inventory; six cards visible in Chrome |
| Voting | First vote starts a 15-second deadline; all votes can resolve early; deterministic tie selection | Source; jsdom; solo Chrome selection starts Switchback Garden |
| Round flow | Host owns lobby/select/play/results, synchronized start and putt advancement; spectators do not block the roster | Source; jsdom/fake-network checks |
| Shot input | Left drag/release controls angle and power; deterministic sine sway; Escape cancels; blur/pointer loss cancels input | Source; one real Chrome drag changes strokes 0 to 1 |
| Physics | Fixed 240 Hz custom simulation, surfaces, walls, ramps/platforms, out of bounds, cup lip contact | Source; B2 checks and generated representative traces; course rendered in Chrome |
| Mechanics | Sand, ice, slime, jump pads, teleporters, fans, tornadoes and moving obstacles | Source inventory; headless mechanic tests; not all playtested in Chrome |
| Rules | Unlimited strokes within timer; unfinished score is max(strokes, par + penalty); configurable putt/map limits | Source; jsdom/physics checks |
| Power-ups | Hole Magnet, Steady Aim, Rewind, Reversiball and Zanyball; three inventory slots; number keys 1–3 | Source; not exercised in this browser capture |
| Cameras | Ball cam, Hole view, World view; right drag, wheel and arrows; spectator free roam | Source; Chrome switches all three camera modes; jsdom covers free roam |
| HUD | Course/putt/par/strokes/timer; live ranked scoreboard; inventory/power display | Chrome references; source and jsdom |
| Scorecard | Six-hole paper card with pars, live total, +/−, HIO and timeout columns; Card/K opens; Escape closes | Chrome Card and Escape, live one-stroke card captured; jsdom checks scoring variants |
| Audio | Procedural spatial WebAudio; user gesture unlock; mute stored locally | Source; Chrome Sound control toggles and browser reports audio playing; sound quality/listening not verified |
| Quality | High/Low controls renderer pixel ratio and shadows | Chrome button labels change to Low and back to High; exact performance impact unmeasured |
| Rendering | Three.js r128, procedural course/ball materials, pastel scene, shadows, ghost cup/tee labels, wall fade, transitions and effects | Chrome renders course and three camera views; wall fade/effect cases mainly jsdom/source |
| Multiplayer | PeerJS/WebRTC host-and-guests; clients simulate/report their own ball; host snapshots about every 70 ms | Source and B3 four-client fake transport; real-network play not tested here |

Starter order and current data:

| Index | Course | Putts | Total par | Seconds per putt |
| --- | --- | --- | --- | --- |
| 0 | Switchback Garden | 6 | 12 | 120 |
| 8 | Dune Serpent | 6 | 15 | 150 |
| 20 | Frost Hollow | 6 | 18 | 150 |
| 21 | Slime Springs | 6 | 19 | 180 |
| 5 | Cyclone Ring | 6 | 23 | 210 |
| 19 | Grand Finale | 6 | 24 | 240 |

Constants observed: R=5, CUP=15, CUP_MIN=8, K_TURF=0.75, POWER=900. Historical difficulty counts and the constants in the removed legacy handoff notes are stale. This task does not retune maps or certify those rankings.

## Chrome capture procedure and observations

Local URL (historical): http://127.0.0.1:5173/putt-pals.html, served through Vite while the legacy page existed. Native Chrome UI was used; no DOM evaluation, test-hook calls, injected state, stub renderer or simulated network was used for these screenshots. Installed Chrome bundle version 155.0.8059.85 and macOS 26.6.2 were read from local application/system metadata. The running Chrome build was not separately queried. Screenshots are unedited native JPEG captures at 3024×1900, including browser chrome with only the game tab visible. The exact CSS viewport/device pixel ratio were not measured.

1. Capture landing. Enter the synthetic name Baseline and click Play solo.
2. Capture solo lobby. Inspect the mode menu: Standard, 3/6/9-map Tournament and both practice modes are present.
3. Start the default Standard mode and capture its six-course picker. An attempted native-menu selection did not change the mode, so these captures are Standard, not practice.
4. Click Switchback Garden; observe the start countdown, then wait for the real rendered course.
5. Capture Ball cam, then switch and capture Hole view and World view after the scene updates.
6. Drag on the course; observe strokes and live total become 1. This was not a successful sink and must not be described as a hole in one.
7. Click Card, capture the live paper scorecard, then close it with Escape. Toggle Sound Off and Quality Low, verify labels, and restore Sound On/Quality High.

| Reference | What it shows |
| --- | --- |
| 01-landing.jpg | Initial entry card and connection-settings disclosure |
| 02-solo-lobby.jpg | Synthetic player Baseline and Standard mode |
| 03-course-picker.jpg | All six starter cards and stated map pars |
| 04-switchback-ball-camera.jpg | Actual course, ball, pastel materials, shadows and HUD |
| 05-switchback-hole-camera.jpg | Hole view, cup/flag, wall layout and camera label |
| 06-switchback-world-camera.jpg | Six-chamber overview, tee/cup labels and water |
| 07-live-scorecard.jpg | Live one-stroke scorecard overlay over the rendered course |

These are visual references for review, not pixel-diff goldens: color selection, procedural textures, animation timing and countdowns are not seeded/frozen. Preserve the scene intent during extraction; exact incidental pixels need not match.

## Known discrepancies and validation limits

- Landing says “20 MAPS” while source data has 22. Record this existing text discrepancy; do not silently mix its fix into extraction.
- At the captured desktop size the side scoreboard truncates “SCOREBOARD” and the synthetic player's name. This is existing layout behavior, visible in the references.
- The pastel/high-exposure appearance is the current baseline. The comic art direction is a separate change; it has since landed in V1a-V1d.
- After restoring quality/sound and attempting a reload, Chrome showed a blank content area. The server still returned HTTP 200 and the game script. A later native capture attempt failed with ScreenCaptureKit error -3812 (“invalid parameter”). No browser-console evidence was available to attribute the blank view to game code versus browser/capture infrastructure. Do not mark reload as passing or file a confirmed product regression from this observation alone.
- Firefox access initially failed; the user requested Chrome. Chrome permission prompts interrupted early attempts, then allowed the captures above. No Firefox/Safari cross-browser coverage is claimed.
- Real-browser practice/replay, completing a full six-putt game, results, tournament completion, timeouts, reconnects, real WebRTC and forced TURN remain broader browser/network acceptance work. Existing jsdom results cover several of these flows but are not substitutes for real-browser evidence.
- No console-error-free claim, frame-time budget, audio-quality approval or GPU resource-leak result is made. B1 captures a representative migration baseline and explicitly records these limits.

## Hosted CI evidence

[Baseline CI run 40247672160](https://github.com/SpikemenDan/putt-pals/actions/runs/40247672160) completed successfully for b33349584bdc7d446a0a8ec26cfbbaf06bf7dbd3. It runs the existing build/headless checks; it does not execute these native browser interactions. Branch protection, GitHub task issue creation and agent dispatch were not changed by this task.

## Review handoff

B1 artifacts are ready for review on agent/b1-browser-baseline. The user approved committing and pushing that branch. They do not authorize C1 automatically: the coordinator/user must accept the references and disclosed limitations and integrate the task before releasing its dependents. PR creation and merge approval remain separate. No gameplay, tool simulation logic, package dependencies or CI workflow changed in B1.

## SV1 par-route solver and report-only run (2026-11-04)

`tools/cli/par-solver.mjs` finds the shortest **robust** route of at most 6 strokes by driving the shared `SimulationEngine`. A hole-in-one is just a one-stroke route, never required. Par = `max(2, strokes)`. Robust means every stroke survives the S2 margin (angle +-0.007 rad, power +-0.025) and a non-final stroke leaves the ball at rest in play from which a local re-aim still finishes. Gravity is a solver parameter recorded in provenance; only the loaded value (700) can run until #164 injects gravity into the engine. A `none`/`budget` result is search-bounded (candidate grid, 1.5 M trial budget), not proof that no route exists.

Commands:

```sh
node tools/cli/main.mjs solve <map> <putt> [--full]        # one putt
npm run measure:par -- --out routes.json [--only 0/0,5/1]   # report-only run, parallel
node tools/cli/main.mjs check --routes routes.json          # par 2..6 plus a route within par
node tools/cli/main.mjs rank  --routes routes.json          # starters ranked by route difficulty
```

`check` without `--routes` enforces only the par 2..6 range. No per-map fixture is stored; the report is regenerated on demand. Difficulty per putt = strokes + 1 - min(1, margin/3) (margin = largest tested multiple of the S2 offsets still followed); a map sums its putts.

Report-only run over all 22 shipped maps (52 putts, current simulation, gravity 700):

| Outcome | Putts |
| --- | --- |
| Robust hole-in-one (1 stroke) | 39 |
| 2-stroke robust route | 8: 1/0, 7/0, 9/0, 10/0, 15/0, 17/0, 19/0, 19/2 |
| 3-stroke robust route | 1: 11/0 Fortress Spiral |
| No route found, candidate grid exhausted | 1: 18/0 Comet Run |
| No route found, trial budget exhausted | 3: 4/0 Clockwork Maze, 13/0 Hourglass, 16/0 Crescent Coast |

All 36 starter putts have a robust route within 6 strokes; only Grand Finale putts 1 and 3 (19/0, 19/2, the known S2 gaps) need two. Shipped pars were not changed or compared for fairness here: most putts have a robust hole-in-one, so shortest-route par would be 2 for most. The four non-starter putts without a route are search-limited findings, not verified impossibilities. Hourglass and Clockwork Maze have moving obstacles that the solver freezes at hazard time 0 (as the S2 solver did); Comet Run's likely route is three strokes and needs a wider robustness rule than "continuation of the same length".

Open owner decisions: narrowing the shared validator to par 2..6 (CLI-only today), changing shipped pars to shortest-route values, the `src/courses/arena.js` hole-in-one par defaults, time-aware moving hazards, and widening the robustness rule for Comet Run / Crescent Coast. Most shipped maps are expected to be redesigned under K0 (#104), so these are deliberately not pursued on today's maps.
