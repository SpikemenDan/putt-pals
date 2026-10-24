# PUTT PALS v4 (PARTY CIRCUIT) — HANDOFF & LIVE PHASE TRACKER

Single source of truth. Any AI can continue from this file plus the uploaded project files.

## A. WORKFLOW RULES (mandatory, from the user)
1. **Phases of at most 10 minutes each**, executed strictly top to bottom.
2. Before starting a phase: set it to `[WORKING]` in this file, show the file, and **wait for the user's confirmation**. When finished: set it to `[DONE]`, save the code files, and **ask whether to continue** to the next phase.
3. **Credit/token safeguard:** when near limits, stop, write the exact state here (`[WORKING]` + what is saved + the next command), and output all saved files before running out.
4. Never claim something works unless it was run. Mark untested work as untested. Patch the HTML only with exact-match scripts that assert one match per anchor, and syntax-check after every patch (section K).

## B. CURRENT STATE (read first)
- **P1 is `[DONE]`. Next: P2, waiting for the user's confirmation** (set to `[WORKING]` only after it).
- Project tree is now exactly three files: `putt-pals.html` (game, three.js + PeerJS inlined, 755 KB, works offline), `tools.js` (solver + arena generator + syntax check), `HANDOFF.md`.
- The user's version of the HTML had unlogged changes that are now the baseline: lower ground friction (turf k 0.85, sand 3.2, platforms 0.9, plus a velocity-dependent term), sink threshold `top-1.5`. Earlier solver results were produced under the OLD physics and are INVALID. Spot check under the new physics: map 0 putt 1 still has a robust hole-in-one (31 deg, power 0.95, found in 8.5 s). Maps 0 and 8 still need a full re-solve (P2).
- The game has never been opened in a browser by this AI; the user can run the checklist in section I.
- Scope notes: see section F (timer, 6-map scope, shadows).

## C. PHASE CHECKLIST (status: `[TODO]` `[WORKING]` `[DONE]`)
| # | Status | Phase (<=10 min) | Exit criterion |
|---|---|---|---|
| P1 | `[DONE]` | **File consolidation & baseline audit** (details in D) | 3 files only: `putt-pals.html` (libs inlined), `tools.js` (solver + arena generator + fast mode), `HANDOFF.md`. Syntax OK. `node tools.js solve 0 0` runs |
| P2 | `[TODO]` | Re-baseline physics: re-solve maps 0 and 8 under the user's friction; fix any failing putts | Every putt reports a robust hole-in-one |
| P3 | `[TODO]` | Headless smoke test (`tools.js smoke`, jsdom + stubbed WebGL/Peer): lobby -> vote -> 6 putts -> results -> tournament; plus user browser checklist | No runtime errors in the flow; user checklist handed over |
| P4 | `[TODO]` | Surfaces + timers: ice and slime tiles, dynamic putt timer of 2+ minutes (base 120 s, scaled by par), 8-stroke penalty kept | Surfaces affect friction in sim and solver; timer shown in HUD |
| P5 | `[TODO]` | Cup tuning: per-map cup radius (smaller on harder maps), lip-out and gravity pull | `cup` field per map; solver honors it |
| P6 | `[TODO]` | Jump pads, teleporters, fans, tornadoes usable inside chambers; solver models them (time-frozen) | One test chamber per mechanic verified |
| P7 | `[TODO]` | Starter ladder: difficulty metric (`tools.js rank`), voting grid shows the 6 starter maps only | Ranking printed and strictly increasing |
| P8 | `[TODO]` | Map 1 BEGINNER — Switchback Garden: re-tune, 6 putts verified | Solver all green |
| P9 | `[TODO]` | Map 2 EASY — Dune Serpent (sand) | Solver all green |
| P10 | `[TODO]` | Map 3 MEDIUM — Frost Hollow (ice + walls), new | Solver all green |
| P11 | `[TODO]` | Map 4 MEDIUM-HARD — Slime Springs (slime, jump pads, teleporters), new | Solver all green |
| P12 | `[TODO]` | Map 5 HARD — Cyclone Ring (fans + tornadoes) | Solver all green |
| P13 | `[TODO]` | Map 6 EXPERT — Grand Finale (combined mechanics, smallest cups) | Solver all green; ladder still strictly ranked |
| P14 | `[TODO]` | Art A: soft pastel cartoon palette, bright sun, dreamlike 3D void environment | Visible in browser (user confirms) |
| P15 | `[TODO]` | Art B: soft shadows, ambient-occlusion look, specular highlights | Shadows on ball/obstacles |
| P16 | `[TODO]` | VFX: ball trail, cup-sink confetti, wind-stream / tornado / pickup shaders | Effects present |
| P17 | `[TODO]` | Camera: ball cam, hole view, world view, eased switching | Toggle works |
| P18 | `[TODO]` | Free-roam spectator mode | Finished players can fly |
| P19 | `[TODO]` | Spatial audio via WebAudio synthesis (no audio files) | Putt, bounce, sink, banner sounds |
| P20 | `[TODO]` | HUD, lobby and room-code UI polish; live scoreboard final pass | Frosted-glass consistent |
| P21 | `[TODO]` | Putt-to-putt transition: ball/camera travel animation replacing the flash | Smooth warp |
| P22 | `[TODO]` | Final QA: full solver run, smoke test, user playtest checklist, final handoff | All checks green |

## D. PHASE P1 DETAIL (the active phase)
1. Review the uploaded HTML diff against the last known version and record every change here (started in B).
2. Inline `three_min.js` and `peerjs_min.js` into the HTML as `<script>` blocks; tag the game script `<script id="game">` so tools find it without picking the longest script. Result: `putt-pals.html` (about 770 KB, works offline, fixes the filename mismatch).
3. Merge `solver.js` + `make_arena.py` into one `tools.js` (port the arena generator to JS, drop Python). Commands: `solve <map> [putt]`, `arena <map name>` (spec table inside), `check` (syntax). Add **fast mode** (stop at the first robust hit; seconds instead of ~80 s per putt).
4. Fold the needed reference text (sections H to L) into this file; delete the v3 HTML, the v4 addendum, the original architecture doc, and the old tool files.
5. Verify: syntax check passes; `node tools.js solve 0 0` runs and reports under the current physics.
Target tree: `putt-pals.html`, `tools.js`, `HANDOFF.md`.
**Result (done):** tree matches the target; `node tools.js check` -> SYNTAX_OK; `node tools.js list` lists 20 maps; `node tools.js solve 0 0` passes; `node tools.js arena 'Dune Serpent'` regenerates the existing map line byte-for-byte (idempotent). Old v3 HTML, addendum, architecture doc, Python script and split solver were removed.

## E. MASTER REQUIREMENTS (user) mapped to phases
- Files minimized -> P1. Room codes, 15 s voting, Standard (6 putts), Tournament 3/6/9 with champion -> built; verified in P3.
- 6 starter maps ranked beginner to expert, six visible putts per arena (ghost cups, tee labels), smaller cups = harder, rigorous hole-in-one paths -> P5, P7-P13.
- Ball R=6 (done), lower friction (user did part; P2/P4), 2+ minute dynamic timers with 8-stroke penalty -> P4, ponds z<14 (done), sand (done), ice/slime -> P4, fans/tornadoes/jump pads/teleporters -> P6.
- Deterministic sine aim sway, zero at crossings (done; check in P3).
- Art direction (pastel cartoon, bright sun, dreamy void, shadows, specular, particles, confetti) -> P14-P16.
- UI/camera (frosted glass, live scoreboard, ball/hole/world cams, spectator, spatial audio) -> P17-P20.

## F. DECISIONS THE AI MADE (user can overrule at confirmation)
1. **Timer:** the build uses 45 s per putt; your directive says 2+ minutes dynamic. P4 changes it to base 120 s scaled by par (re-solve unaffected; only the clock changes).
2. **Scope:** 20 maps -> 6 starter maps first. The other 14 are backlog after P22. Proposed ladder: Switchback Garden, Dune Serpent, Frost Hollow (new), Slime Springs (new), Cyclone Ring, Grand Finale. Names and themes are editable.
3. **Shadows:** true ray tracing is not possible in this Three.js r128 raster setup; P15 uses soft shadow maps plus AO-style shading and specular highlights to look close.
4. **Inlining the libraries** makes the HTML about 770 KB; patching still works because every patch uses exact anchors.
5. Old solver results are discarded (see B).

## H. ARCHITECTURE REFERENCE (as implemented)
Everything is inside one IIFE in `putt-pals.html`. Positions: sim uses (x,y) horizontal, z height; Three.js uses (x,z) horizontal, y up. Map data (from the code): `course(name,desc,tee,hole,tiles,extra)` with defaults `par:4,w:[],sand:[],q:[],pl:[],rp:[],pd:[],pit:[],fan:[],tp:[],tornado:[],movers:[]`. `tiles` = playable rectangles (everything else is void); `w` walls `[x,y,w,h]`; `sand`; `q` power-up blocks; `pl` platforms `[x,y,w,h,H]`; `rp` ramps `[x,y,w,h,dir,h0,h1]`; `pd` jump pads; `pit` water `[x,y,w,h]`; `fan` `[x,y,w,h,dx,dy,force]`; `tp` teleporter pairs `[ax,ay,bx,by,color]`; `tornado`, `movers`. Screen borders `B` are 16 px walls around the 800x500 canvas.

### 4.1 Constants
`R=6` (ball radius), `DT=1/240`, `G=700`, `MAXS=8` (max strokes / penalty), `LIMIT=45000` (ms per putt), `VOTE_SECS=15`, `CUP=17`, `DEPTH=36`, `SWAY_W=2*PI/1.4`.

### 4.2 Room state (host-owned, replicated in snapshots)
`newRoom()` = `{phase,map,round,startAt,roster,putt,votes,deadline,mode,series,mapNo,totals,last}`
- `phase` is one of **`lobby | select | play | results`** (these are the only values `validRoom` accepts). `select` IS the voting phase. The addendum's `voting/intro/active/...` names are NOT implemented.
- `map` winning map index; `putt` 0..5 current putt; `round` increments every putt (used as the per-putt sync key `activeRound`); `startAt` host-time ms when the putt becomes playable (2.5 s after setting).
- `votes` `{peerId: mapIdx}`; `deadline` host-time ms when voting ends (0 until the first vote).
- `mode` `'standard'|'tournament'`; `series` 1/3/6/9; `mapNo` maps completed; `totals` `{peerId:{n,t,w}}` (name, cumulative strokes, map wins); `last` `{map,sc,names,win}` of the map just finished.
- Only the host calls `R_.setRoom(...)`. Guests send `{type:'vote',map}`; the host validates (integer 0..HOLES.length-1, phase `select`) and keys the vote by the connection id.

### 4.3 Flow (all driven from `syncRoom()` every 100 ms, host side makes the transitions)
1. `lobby`: host picks mode (`#mode` select: 1/3/6/9) and presses Start -> `select` with `votes:{}`, `deadline:0`, mode/series set, `mapNo:0`, `totals:{}`.
2. `select`: players click map cards -> `R_.vote(i)`. Host: all voted -> resolve immediately; else first vote sets `deadline=now+15s`; at deadline resolve. Winner = most votes, ties broken deterministically (`tied[(round*7+voteCount)%tied.length]`). Host then sets `phase:'play', putt:0, round+1, startAt:now+2500, roster:<ids with names>`.
3. `play`: on `activeRound!==r.round`, each client rebuilds the course (`buildAll`), `PI_=r.putt`, resets `me` via `fresh()` but carries `me.tot` (sum of earlier putts; unfinished putt counts MAXS). Putt 0 shows the waiting card with countdown; putts 1..5 keep the game on screen and play the warp flash (`#warp`).
4. Host advances via `nextPutt(r)` when every roster player's presence has `round===r.round && done`, or when `now > startAt+LIMIT+4000`. `nextPutt`: if `putt+1<NP(map)` -> `{putt+1, round+1, startAt:now+2500}`; else `finishMap(r)`.
5. `finishMap(r)`: computes each roster player's map score `(tot)+(s[0]??MAXS)` from presence, updates `totals`, `win` (lowest; ties share), sets `phase:'results'`, `mapNo+1`, `last`.
6. `results`: `fin()` + `showResults(r)` print scores, winner banner, tournament standings, and on the final map the champion banner. Host button `#again`: label "Next map vote" (tournament with maps left -> `select`, votes cleared) or "Back to lobby" (resets mode/totals).

### 4.4 Key functions (search by name)
- `H(i=me.h)` returns map `i` with the CURRENT putt's overrides (`tee,hole,par`) via `Object.create`; cached by `(map,PI_)`. All physics/render code must call `H()` not `HOLES[...]` for tee/hole/par. `NP(i)` = number of putts (1 if the map has no `putts`).
- `step()` one 1/240 s physics substep. `surf,contact,cupCollision,sink,oob,bounce,stop,launch`. `sink(true)` = penalty (MAXS strokes).
- `shotAngle(p,t)`, `sway(p,t)`, `spread(p)`; `swT` stores the last drawn sway time so release matches the on-screen arrow.
- `announce(title,sub,kind)` banner queue (`kind` = `hio|power|event`). HIO banner is fired from `tick()` when any presence has `done && s[0]===1`.
- `buildAll(index)` builds meshes; contains the ghost cup/tee markers for the non-current putts.
- `peerRoom`/`soloRoom` transports (PeerJS host/guest; room id `puttpals-circuit-v5-<code>`). `vote(m)` exists on both.
- Presence fields: `n,c,h,x,y,z,s,round,done,mode,str,tot,effect,fx`. Validated by `validPresence` (extra fields pass through; trusted).
- HUD DOM: `#stage` wraps `#bar,#cv,#ctl,#inv,#toast,#sb`; `#banner` and `#warp` are body-level fixed overlays. `#game,#waiting,#mapselect,#end` are the screens.

### 4.5 Map data (current)
- `HOLES` has 20 entries built with `course(name,desc,tee,hole,tiles,extra)`.
- A map with `putts:[{tee,hole,par}...]` x6 is "converted". Others still play one putt (`NP=1`).
- Converted maps use the **six-chamber arena**: one tile `[40,40,720,420]`, perimeter walls and two vertical + one horizontal divider (thickness 12) in `w`, chambers in a 3x2 grid, each ~228x198 inner. Tile edges are cliffs (ball falls = splash/out of bounds); so ALL routes must be bounded by explicit walls.
- Chamber origins (inner top-left): (46,46) (286,46) (526,46) (46,256) (286,256) (526,256). Putt k uses chamber k.

### 4.6 Map index list (0-based, same order as `HOLES`)
0 Switchback Garden (CONVERTED), 1 Clover Crossing, 2 Moonshot, 3 Portal Archipelago, 4 Clockwork Maze, 5 Cyclone Ring, 6 Skybridge, 7 Pinwheel, 8 Dune Serpent (CONVERTED), 9 Twin Peaks, 10 Wind Tunnel, 11 Fortress Spiral, 12 Bounce Harbor, 13 Hourglass, 14 Thunder Basin, 15 Portal Labyrinth, 16 Crescent Coast, 17 Elevator Alley, 18 Comet Run, 19 Grand Finale.

---------------------------------------------------------------------

## J. HOW TO EDIT THE HTML SAFELY
- The file has very long single-line functions. Do NOT hand-edit with large rewrites. Patch with a Python script using `s.replace(a,b)` and `assert s.count(a)==1` for every anchor; write the file only after all asserts pass (an earlier patch aborted halfway because one anchor matched 4 times; nothing was written, which is the safe outcome).
- Keep user-visible text via `textContent` (no `innerHTML` for peer data).
- Use `H()` for the active hole; keep `me.s` (<=1 entry) and presence validation compatible.
- Typographic apostrophes in UI text.

## K. SYNTAX CHECK (run after every patch)
`node tools.js check` (parses the `<script id="game">` block). It proves only that the JS parses, not that it behaves.

## N. TOOLS (`tools.js`)
- `node tools.js check` | `list` | `solve <map> [putt] [--full]` | `arena ['Map Name']`.
- `solve` runs the game's real physics headlessly (extracted by text markers: `const R=`, `\n];`, `let PI_=0`, `const NP=`, `function fresh(`, `function inside(`, `function frame(`; if you move those, update `load()`). It searches angle 0..360 in 0.5 deg steps x power 0.30..1.00 in 0.05 steps with a centered release (no sway). A putt PASSES if a shot also works at +-0.4 deg and +-2.5% power. Fast mode (default) stops at the first robust shot (seconds); `--full` counts all hits (about 80 s per putt) and is the basis for the difficulty metric.
- Limits: time-based obstacles are frozen at phase 0 (`R_` is null); sway and items are not modeled; it proves possibility, not difficulty.
- `arena` rewrites a map as six chambers from the `SPECS` table inside `tools.js` (chamber-local coords 228x198; keys `t,c,w,sand,pit`). It matches the map's single `course('Name'...` line, so keep each map on one line. Extend `SPECS` and `arenaLine()` when adding ice, slime, pads, teleporters, fans, tornadoes.
- 1 CPU core in the build sandbox: run long jobs with `setsid nohup ... &` and poll.

## L. ENVIRONMENT NOTES FROM THE PREVIOUS SESSIONS
- No browser was available to the AI; the game could not be run there. Libraries are now inlined, so the HTML needs no network except PeerJS's signaling server for multiplayer.
- 1 CPU core. Long jobs: `setsid nohup`.
- Outputs lived in `/mnt/user-data/outputs`.

---------------------------------------------------------------------
## I. BROWSER SMOKE TEST CHECKLIST (never yet done — do this first if possible)
Solo (`Play solo`):
1. Lobby shows mode select; Start opens voting; one vote -> map starts at once (solo has 1 player).
2. Pick map 0: countdown, then game. HUD overlay: info pill top-left, buttons top-right, scoreboard right, power bar bottom, items/toast bottom-left/center. Check the canvas still fills `#stage` (`resize()` uses `cv.parentNode.clientWidth`).
3. Drag back: arrow appears only while dragging; it sways as a sine; releasing at the zero crossing shoots straight; Esc cancels.
4. Ghost cups "CUP n" and "TEE n" labels for the other five putts are visible and the current cup/flag is correct.
5. Sink the ball: putt-start banner "PUTT 2 / 6", warp flash, new tee/cup/camera. Repeat to putt 6; results show total, winner banner, button "Back to lobby".
6. Let a putt time out: penalty toast, 8 strokes, advances.
7. Hole-in-one banner on a 1-stroke sink (use the solver solution angle/power).
8. Tournament 3 maps: standings after each map, "Next map vote" button, champion banner at the end.
Two tabs (host + guest): votes from the guest count; countdown on both; scoreboard totals sync; guest cannot change phases; leaving/rejoining behaves.
Known risk areas: `#stage` absolute positioning on mobile; `backdrop-filter` support; `announce` spam when many HIO; unfinished/disconnected players holding up `done` checks (the +4 s timeout is the backstop); spectators joining mid-map.

---------------------------------------------------------------------

## M. PROGRESS LOG
| Date/Session | Event |
|---|---|
| earlier | Stages 1-5: sway, voting, 6-putt sequencing, putt timer, tournament, banners, frosted HUD, solver, two arena maps (verified under OLD physics), R=6, water splash |
| this session | Workflow changed to phased tracker; HTML audit found unlogged friction/sink/lib changes |
| P1 | DONE: 3-file tree, libs inlined, `tools.js` with fast solver, idempotent arena generator, handoff folded |
