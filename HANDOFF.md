# PUTT PALS v4 (PARTY CIRCUIT) — HANDOFF & LIVE PHASE TRACKER

Single source of truth. Any AI can continue from this file plus the uploaded project files.

## A. WORKFLOW RULES (mandatory, from the user)
1. **Phases of at most 10 minutes each**, executed strictly top to bottom.
2. Before starting a phase: set it to `[WORKING]` in this file, show the file, and **wait for the user's confirmation**. When finished: set it to `[DONE]`, save the code files, and **ask whether to continue** to the next phase.
3. **Credit/token safeguard:** when near limits, stop, write the exact state here (`[WORKING]` + what is saved + the next command), and output all saved files before running out.
4. Never claim something works unless it was run. Mark untested work as untested. Patch the HTML only with exact-match scripts that assert one match per anchor, and syntax-check after every patch (section K).
5. At the end of every phase, send ONE short commit message in the chat for the most recent phase only. Format it exactly like this, with the two labels in front:
   ```
   Summary: <one line in Title Case, imperative, no type prefix, e.g. "Add 4-Player Smoke Test Over a Fake Network">
   Description: <2-4 short sentences: what changed, how it was verified, what is still untested>
   ```
   Do NOT store commit messages in this file.

## B. CURRENT STATE (read first)
- **P1, P2, P3, P3b `[DONE]`. P4 `[DONE]`. P5 `[DONE]`. P6 `[DONE]`. P7 `[DONE]`. P8 `[DONE]`. P9 `[DONE]`. Next: P10 (waiting for the user's confirmation). Phase order: essentials P7 to P12 (camera, spectator, audio, UI, transition, your playtest), then level design P13 to P19 (six maps, ranking), then graphics P20 to P22, then final QA P23.** `node tools.js smoke` passes 76/76 (solo) and `node tools.js smoke-multi` passes 40/40 (4 players).
- Project tree is now exactly three files: `putt-pals.html` (game, three.js + PeerJS inlined, 755 KB, works offline), `tools.js` (solver + arena generator + syntax check), `HANDOFF.md`.
- The user's version of the HTML had unlogged changes that are now the baseline: lower ground friction (turf k 0.85, sand 3.2, platforms 0.9, plus a velocity-dependent term), sink threshold `top-1.5`. Maps 0 and 8 were re-solved under it in P2: all 12 putts pass (section O).
- The game has never been opened in a browser by this AI; the user can run the checklist in section I.
- Scope notes: see section F (timer, 6-map scope, shadows).

## C. PHASE CHECKLIST (status: `[TODO]` `[WORKING]` `[DONE]`)
| # | Status | Phase (<=10 min) | Exit criterion |
|---|---|---|---|
| P1 | `[DONE]` | **File consolidation & baseline audit** (details in D) | 3 files only: `putt-pals.html` (libs inlined), `tools.js` (solver + arena generator + fast mode), `HANDOFF.md`. Syntax OK. `node tools.js solve 0 0` runs |
| P2 | `[DONE]` | Re-baseline physics: re-solve maps 0 and 8 under the user's friction; fix any failing putts | Every putt reports a robust hole-in-one (met; no layout changes were needed) |
| P3 | `[DONE]` | Headless smoke test (`tools.js smoke`, jsdom + stubbed WebGL/Peer): lobby -> vote -> 6 putts -> results -> tournament; plus user browser checklist | No runtime errors in the flow; user checklist handed over |
| P3b | `[DONE]` | Multiplayer smoke test: 3-4 simulated players (host + guests) over a fake in-memory PeerJS; votes, putt sync, totals, a player dropping out | `tools.js smoke` covers 2+ players |
| P4 | `[DONE]` | Surfaces + timers: ice and slime tiles, dynamic putt timer of 2+ minutes (base 120 s, scaled by par), 8-stroke penalty kept | Surfaces affect friction in sim and solver; timer shown in HUD |
| P5 | `[DONE]` | Cup tuning: per-map cup radius (smaller on harder maps), lip-out and gravity pull | `cup` field per map; solver honors it |
| P6 | `[DONE]` | Jump pads, teleporters, fans, tornadoes usable inside chambers; solver models them (time-frozen) | One test chamber per mechanic verified |
| | | **GROUP 1: ESSENTIALS (gameplay, controls, sound, UI function)** | |
| P7 | `[DONE]` | Camera: ball cam, hole view, world view, eased switching | Toggle works (jsdom: no errors; look and feel is for your playtest) |
| P8 | `[DONE]` | Free-roam spectator mode | Finished players can fly |
| P9 | `[DONE]` | Spatial audio via WebAudio synthesis (no audio files) | Putt, bounce, sink, banner sounds |
| P10 | `[TODO]` | HUD, lobby and room-code UI: function, layout, live scoreboard final pass (frosted-glass look is polished in the graphics group) | UI works on desktop and phone width |
| P11 | `[TODO]` | Putt-to-putt transition: ball/camera travel animation replacing the flash | Smooth warp |
| P12 | `[TODO]` | **Checkpoint: your playtest of the essentials** in a browser (checklist in section I plus camera, spectator, audio, transition); the AI fixes whatever you report before level design starts | You confirm the essentials work |
| | | **GROUP 2: LEVEL DESIGN (starter ladder of 6 maps)** | |
| P13 | `[TODO]` | Map 1 BEGINNER — Switchback Garden: re-tune, 6 putts verified | Solver all green |
| P14 | `[TODO]` | Map 2 EASY — Dune Serpent (sand) | Solver all green |
| P15 | `[TODO]` | Map 3 MEDIUM — Frost Hollow (ice + walls), new | Solver all green |
| P16 | `[TODO]` | Map 4 MEDIUM-HARD — Slime Springs (slime, jump pads, teleporters), new | Solver all green |
| P17 | `[TODO]` | Map 5 HARD — Cyclone Ring (fans + tornadoes) | Solver all green |
| P18 | `[TODO]` | Map 6 EXPERT — Grand Finale (combined mechanics, smallest cups) | Solver all green |
| P19 | `[TODO]` | Starter ladder: difficulty metric (`tools.js rank`) over the six finished maps, voting grid shows the 6 starter maps only; re-tune a map if the ranking is not strictly increasing | Ranking printed and strictly increasing; smoke tests pass |
| | | **GROUP 3: GRAPHICS (last, so art never blocks gameplay)** | |
| P20 | `[TODO]` | Art A: soft pastel cartoon palette, bright sun, dreamlike 3D void environment; frosted-glass HUD look | Visible in browser (user confirms) |
| P21 | `[TODO]` | Art B: soft shadows, ambient-occlusion look, specular highlights | Shadows on ball/obstacles |
| P22 | `[TODO]` | VFX: ball trail, cup-sink confetti, wind-stream / tornado / pickup shaders | Effects present |
| P23 | `[TODO]` | Final QA: full solver run, smoke test, user playtest checklist, final handoff | All checks green |

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
- 6 starter maps ranked beginner to expert, six visible putts per arena (ghost cups, tee labels), smaller cups = harder, rigorous hole-in-one paths -> P5, P13-P19.
- Ball R=6 (done), lower friction (user did part; P2/P4), 2+ minute dynamic timers with 8-stroke penalty -> P4, ponds z<14 (done), sand (done), ice/slime -> P4, fans/tornadoes/jump pads/teleporters -> P6.
- Deterministic sine aim sway, zero at crossings (done; check in P3).
- Art direction (pastel cartoon, bright sun, dreamy void, shadows, specular, particles, confetti) -> P20-P22.
- UI/camera (frosted glass, live scoreboard, ball/hole/world cams, spectator, spatial audio) -> P7-P11.

## F. DECISIONS THE AI MADE (user can overrule at confirmation)
1. **Timer (done in P4):** per-putt limit = 120 s x max(1, par/2), capped at 300 s (`limitOf(map,putt)`). Par 2 arena putts get 120 s, par 3 gets 180 s, par 4 or more gets 240 s (300 s cap). Never below 2 minutes. The host's advance fallback uses the same limit + 4 s. HUD shows m:ss.
2. **Scope:** 20 maps -> 6 starter maps first. The other 14 are backlog after P23. Proposed ladder: Switchback Garden, Dune Serpent, Frost Hollow (new), Slime Springs (new), Cyclone Ring, Grand Finale. Names and themes are editable.
3. **Shadows:** true ray tracing is not possible in this Three.js r128 raster setup; P21 uses soft shadow maps plus AO-style shading and specular highlights to look close.
4. **Inlining the libraries** makes the HTML about 770 KB; patching still works because every patch uses exact anchors.
5. Old solver results are discarded (see B).
6. **Phase order (changed twice at the user's request):** essentials first (P7 to P12), then level design (P13 to P19), then graphics (P20 to P22), then final QA (P23). The difficulty ranking sits after the six maps because it needs finished maps. When P15 and P16 add Frost Hollow and Slime Springs, the AI will append them to the end of `HOLES` (indices 20 and 21) so no existing index changes (not yet confirmed by the user; overrule at P15). Until P19 the voting grid still lists all maps. Judgment calls the user can move: audio sits in the essentials; the frosted-glass look of the HUD sits in the graphics group while its function and layout sit in P10.

## H. ARCHITECTURE REFERENCE (as implemented)
Everything is inside one IIFE in `putt-pals.html`. Positions: sim uses (x,y) horizontal, z height; Three.js uses (x,z) horizontal, y up. Map data (from the code): `course(name,desc,tee,hole,tiles,extra)` with defaults `par:4,w:[],sand:[],ice:[],slime:[],q:[],pl:[],rp:[],pd:[],pit:[],fan:[],tp:[],tornado:[],movers:[]`. `tiles` = playable rectangles (everything else is void); `w` walls `[x,y,w,h]`; `sand`; `ice` and `slime` `[x,y,w,h]` (P4); `q` power-up blocks; `pl` platforms `[x,y,w,h,H]`; `rp` ramps `[x,y,w,h,dir,h0,h1]`; `pd` jump pads; `pit` water `[x,y,w,h]`; `fan` `[x,y,w,h,dx,dy,force]`; `tp` teleporter pairs `[ax,ay,bx,by,color]`; `tornado`, `movers`. Screen borders `B` are 16 px walls around the 800x500 canvas.

### 4.1 Constants
`R=6` (ball radius), `DT=1/240`, `G=700`, `MAXS=8` (max strokes / penalty), `LIMIT_BASE=120000`, `LIMIT_MAX=300000` (ms; see `limitOf` for the per-putt limit), `VOTE_SECS=15`, `CUP=17` (default cup radius), `CUP_MIN=8`, `cupOf(h)` (radius of a hole: `h.cup` clamped to 8..17, default 17; set `cup:N` on a putt or on a map, putt wins), `DEPTH=36`, `SWAY_W=2*PI/1.4`.

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
- `node tools.js check` | `list` | `surfaces` | `cups` | `mechanics` | `mechanics` | `smoke` | `smoke-multi` | `solve <map> [putt] [--full]` | `arena ['Map Name']`.
- `smoke-multi` boots 4 jsdom windows (host + 3 guests) joined through `makeNet()`, an in-memory stand-in for PeerJS (same API surface the game uses; messages JSON-cloned and delayed 2-3 ms). It asserts: joining and host election, 4-player lobby roster, guest cannot start, first guest vote starts the countdown on the host and is visible to all, voting waits for everyone, majority map locks, six putts where the game WAITS for the last player and then advances all clients together, HIO banner visible on guests, totals per player, sole winner, guest cannot leave results, host returns all to the lobby, and a player dropping out mid-putt (host notices, the rest advance).
- `smoke` loads the real HTML in jsdom (WebGL, canvas and PeerJS are stubbed), plays a 3-map tournament in solo (maps 0, 8, 0) by calling the game's own `sink()` through a test hook (`window.__pp`, only active when `window.__PP_TEST` is set), and asserts: sway math, lobby -> start -> vote -> 6 putts -> results -> next vote -> champion -> lobby, cumulative totals (11/23/35), HIO banner, button labels, and zero runtime errors. Setup: `mkdir /tmp/jd && cd /tmp/jd && npm i jsdom`, then `NODE_PATH=/tmp/jd/node_modules node tools.js smoke` (about 90 s). Keep jsdom OUT of the project tree.
- `solve` runs the game's real physics headlessly (extracted by text markers: `const R=`, `\n];`, `let PI_=0`, `const NP=`, `function fresh(`, `function inside(`, `function frame(`; if you move those, update `load()`). It searches angle 0..360 in 0.5 deg steps x power 0.30..1.00 in 0.05 steps with a centered release (no sway). A putt PASSES if a shot also works at +-0.4 deg and +-2.5% power. Fast mode (default) stops at the first robust shot (seconds); `--full` counts all hits (about 80 s per putt) and is the basis for the difficulty metric.
- `mechanics` (P6) builds four test chambers from the `MECH` table in `tools.js` (0 fan, 1 teleporter, 2 jump pad, 3 tornado; NOT a playable map, built in memory only) and for each asserts a robust hole-in-one exists AND that the same shot fails with that mechanic removed. All 8 checks pass. Takes about 3 minutes. Notes: the game code already implemented all four mechanics and the solver runs them as static (no phase), so P6 changed `tools.js` only (the HTML is byte-identical to P5). The found shots are real but not always natural: the teleporter shot (6 deg, power 1) and the pad shot (177.5 deg, power .7, bouncing off the back wall and then over slime into the pad) work through bounces. A tornado that lifts the ball over a full wall was too chaotic for a robust shot (none found at radius 70 to 90, strength +-260 to +-300), so the tornado chamber uses smooth deflection around a partial wall instead.
- Layout rules for P15 to P18: (1) a jump pad launches at vz 400 (peak about 114), so the ball clears every wall (height 28) and can land in another chamber or off the tile; bound the landing or use slime/sand to control the speed; (2) tornado cores lift and fling the ball, so keep the ball path in the outer ring of a tornado (distance > 0.4 x radius); (3) teleporters keep the ball's velocity and have a 0.8 s cooldown, keep pairs inside one chamber.
- `arena` chamber keys (chamber-local, 228x198): `pd [x,y]`, `tp [ax,ay,bx,by,color]`, `fan [x,y,w,h,dx,dy,force]`, `tornado [x,y,radius,+-strength]`, plus `ice`, `slime`, `cup`. Empty optional keys are not written, so Dune Serpent regenerates byte-for-byte (checked). Switchback Garden regenerates identically except for an added empty `sand:[]`, which changes nothing at runtime (the generator always wrote `sand`; the map line never had it, true before P6 too). Do not run `arena` on it needlessly.
- `cups` (P5) fires a sweep of 462 shots (angle +-4 deg x power .35..1.0) at a flat 300-unit putt for radii 17, 14, 11, 8 using the game's real `step()` and asserts the clamp rules, that smaller cups are never easier, 8 is strictly harder than 17 but still possible, and that omitting `cup` equals 17. Current hit counts: 222 / 164 / 98 / 40. Takes about 15 s.
- Cup physics (P5), all scaled so radius 17 behaves exactly as before: the aim-assist pull toward the cup has reach `90*C/17` and strength `300*(C/17)^2`; the lip rebound is `1.15+0.6*(17-C)/9` (1.15 at 17, 1.75 at 8), so fast balls lip out of small cups; the render shader cut-out, sleeve, rim and ghost cups all use the hole's own radius. The `arena` generator accepts an optional per-chamber `cup` key in `SPECS`.
- `surfaces` (P4) rolls a ball at 300 u/s over a flat test hole of turf, sand, ice and slime using the game's real `step()` and asserts ice > turf > sand > slime in distance, plus the timer limits (120 s at par 2, 240 s at par 4, never under 120 s, capped at 300 s). Current distances: turf 237, sand 75, ice 1700, slime 44 units. Friction constants live in `step()`: turf k .85, platform .9, ice .12 (Coulomb drag 4), slime 5.5 (drag 45), sand 3.2; precedence sand < platform < ice < slime.
- Limits: time-based obstacles are frozen at phase 0 (`R_` is null); sway and items are not modeled; it proves possibility, not difficulty.
- `arena` rewrites a map as six chambers from the `SPECS` table inside `tools.js` (chamber-local coords 228x198; keys `t,c,w,sand,pit`). It matches the map's single `course('Name'...` line, so keep each map on one line. Extend `SPECS` and `arenaLine()` when adding ice, slime, pads, teleporters, fans, tornadoes.
- 1 CPU core in the build sandbox: run long jobs with `setsid nohup ... &` and poll.

## L. ENVIRONMENT NOTES FROM THE PREVIOUS SESSIONS
- No browser was available to the AI; the game could not be run there. Libraries are now inlined, so the HTML needs no network except PeerJS's signaling server for multiplayer.
- 1 CPU core. Long jobs: `setsid nohup`.
- Outputs lived in `/mnt/user-data/outputs`.

---------------------------------------------------------------------
## I. TESTING: WHAT IS PROVEN AND WHAT THE USER MUST CHECK
**Proven by `tools.js smoke` and `smoke-multi` (simulated network, not real WebRTC) (P3, 59/59 pass):** the room state machine in solo (lobby, mode select, voting, six-putt sequencing, host advance when all done, results, tournament standings, champion, reset), vote winner locking the map, score carry-over (`tot`), HIO banner text, deterministic sine sway math (zero at every crossing, peak equals spread, grows with power), and no runtime exceptions during all of it.
**NOT proven (stubbed or not exercised):** anything visual (HUD overlay layout, frosted glass, ghost cup markers, warp flash, banners' look and timing), real WebGL rendering, real drag-to-shoot input, real WebRTC/PeerJS behavior (NAT, latency, packet loss, signaling), the putt timer and penalty path in a real browser (the limit math is tested by `tools.js surfaces`, the HUD m:ss text and the ice/slime look are not), no map uses ice or slime yet (P15, P16), no map sets a smaller cup or uses a pad, teleporter, fan or tornado inside a chamber yet, how those look inside a chamber is unchecked (P13 to P18; the cup look at radius 8 to 14 and whether it feels fair is for you to judge in a browser), a late joiner or spectator mid-map, tie votes, more than 4 players (code cap is 8 guest connections = 9 players, untested), mobile layout.
**User hand-test checklist (open `putt-pals.html` in a browser):**
1. Play solo: lobby shows mode select; Start -> voting grid; a map card shows vote count after clicking; countdown then play. The canvas fills the stage; HUD pill, buttons, scoreboard, power bar and toast are visible and do not overlap badly (also try a phone-width window).
2. Drag back: arrow is hidden at rest, appears only while dragging, sways left-right as a smooth sine, and releasing as it crosses center shoots perfectly straight.
3. Switchback Garden: the other five cups show as dark discs with CUP/TEE labels; holing out plays a bright warp flash and the new tee/cup are correct. After putt 6 the results show the winner; tournament shows standings and "Next map vote".
4. Let a putt run out the clock (2:00 at par 2; the HUD pill counts down as m:ss): penalty toast, 8 strokes, game advances. (Tip: temporarily lower `LIMIT_BASE` in the HTML to test faster.)
5. Press C or the View button: Ball cam, Hole view, World view cycle with a smooth move; check that Hole view shows both ball and cup and that World view shows the whole arena.
6. Sound (click the page first): putt thump, bounce ticks off walls, plink and chime in the cup, fanfare on a hole in one, splash in water. Pan and distance should follow where the ball is relative to the camera; the Sound button and M mute everything.
7. Sink a putt early (or join a room mid-map as a spectator): WASD/QE fly, Shift is faster, drag looks around, the next putt returns to the normal camera.
8. Two tabs (host and guest, same room code): the guest's vote counts, countdown shows on both, scores sync, guest cannot start or change anything.
Report anything off and the next AI fixes it before adding features.

## M. PROGRESS LOG
| Date/Session | Event |
|---|---|
| earlier | Stages 1-5: sway, voting, 6-putt sequencing, putt timer, tournament, banners, frosted HUD, solver, two arena maps (verified under OLD physics), R=6, water splash |
| this session | Workflow changed to phased tracker; HTML audit found unlogged friction/sink/lib changes |
| reorder 2 | Phases regrouped at the user's request: essentials P7 to P12 (new P12 = your playtest checkpoint), level design P13 to P19, graphics P20 to P22, final QA P23; no code changed |
| reorder 1 | Ranking and voting-grid restriction moved after the six maps (they need finished maps); no code changed |
| P9 | DONE: WebAudio synthesis, no files. `audioOn()` creates the context on the first click/key/touch; master gain, mute via the `Sound` button or M (saved in localStorage `pp_mute`). Sounds (`SFX` table): putt, bounce, sink (plink + chime), sinkover, hio fanfare, power, event, splash, teleport, boing. Positioned through PannerNodes (equalpower, inverse distance, ref 250, rolloff .6) and the AudioListener follows the camera every frame, so free roam and world view work. Triggers are detected from state in `audioTick()` (called from `frame`, physics code untouched): stroke count up = putt, direction change over 40 deg = bounce, big jump while rolling = teleport, jump to rest = splash, vz spike = boing, mode `sunk` = sink; other players' strokes and sinks come from presence changes (their bounces are not heard). Banner sounds come from a MutationObserver on `#banner` (class hio/power/event). Test hooks `__pp.sfx`, `.muted`, `.audio`; `tools.js` has `makeFakeAC()`. `smoke` +6 checks (76/76), smoke-multi 40/40, solve 0 0, surfaces and cups re-run and pass. NOT proven: how anything sounds (volume balance, pitch, annoyance), real browser autoplay unlock, mobile |
| P8 | DONE: free-roam camera for players whose `me.mode` is `wait` (finished the putt) or `spectator` (late joiner). Controls: W/A/S/D or arrows, Q/E (or Space) down/up, Shift = fast, drag (left or right) to look, wheel = dolly. Starts from the current camera pose, clamped to x -300..1100, z -300..800, y 10..900. The View button/C show 'View: Free roam' and do nothing while it is active; the normal view returns on the next putt. Test hooks `__pp.cam` and `__pp.free`. `tools.js smoke` gained 7 checks (70/70, driven through `spectator` mode; the `wait` path is the same code but was not driven directly); smoke-multi 40/40. Feel is untested in a real browser |
| P7 | DONE: camera reduced to three views, `VN=['Ball cam','Hole view','World view']` with `MK=['follow','hole','strategic']` (the old Orbit and Cinematic modes are unreachable now). Ball cam = follow cam (right-drag/wheel/arrows rotate and zoom, wall collision avoidance). Hole view = raised, from the ball side of the cup, looking between cup and ball (the old straight-down view had a degenerate lookAt). World view = fixed overview of the whole 800x500 arena. Switching: `View:` button or the C key, velocities zeroed and the existing spring-damper eases the move. `tools.js smoke` gained 4 camera checks (63/63) and smoke-multi still passes (40/40). Look and feel is untested in a real browser |
| P6 | DONE: arena generator supports `pd`, `tp`, `fan`, `tornado` (plus `ice`, `slime`, `cup`); `tools.js mechanics` 8/8 (one test chamber per mechanic, robust shot found and fails without the mechanic); HTML unchanged since P5; surfaces and cups tests re-run and pass; arena regeneration is byte-identical for Dune Serpent; solve and smoke tests not re-run because the HTML is byte-identical to the P5 build that passed them |
| P5 | DONE: per-putt/per-map `cup` radius via `cupOf` (8..17, default 17) used by physics, solver, shader cut-out, cup meshes and ghost cups; pull and lip-out scale with the radius and are unchanged at 17; `tools.js cups` 8/8 (hits 222/164/98/40); maps 0 and 8 solutions unchanged; a temp copy with `cup:10` on putt 1 forced a different shot (57.5/.65), so the solver honors it; smoke and smoke-multi still pass |
| P4 | DONE: `ice` and `slime` tile arrays (sim friction, rendering, `arena` SPECS keys `ice`/`slime`), `limitOf` dynamic timer (120 s x par/2, 300 s cap) with m:ss HUD; `tools.js surfaces` 8/8; solve maps 0 and 8 unchanged; smoke 59/59 and smoke-multi 40/40 still pass |
| P3b | DONE: `tools.js smoke-multi` (4 simulated players, fake in-memory PeerJS); 40/40 pass incl. a mid-putt disconnect |
| P2 | DONE: maps 0 and 8 re-solved under the user's physics; 12/12 putts verified, no layout changes |
| P3 | DONE: `tools.js smoke` (jsdom, stubbed WebGL/Peer, test hook `window.__pp`); 59/59 pass; user hand-test checklist in section I |
| P1 | DONE: 3-file tree, libs inlined, `tools.js` with fast solver, idempotent arena generator, handoff folded |

## O. VERIFIED SOLUTIONS (current physics, `node tools.js solve <map>`, fast mode = first robust shot found)
Robust = also works at +-0.4 deg and +-2.5% power. Angle 0 = +x, increasing toward +y. Re-run after ANY physics or layout change; stored values can change.
| Map | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| 0 Switchback Garden | 31/.95 | 25.5/.75 | 49.5/.45 | 27.5/.45 | 49.5/.45 | 13/.85 |
| 8 Dune Serpent | 42/.75 | 312.5/.75 | 0/.40 | 70.5/.95 | 58/.80 | 23.5/1.0 |
Difficulty notes for P19: Dune Serpent putt 3 is a straight corridor shot (solved in 0.1 s, very wide solution set), while Dune Serpent putt 2 needed 87 s to find a robust shot (narrow). Solve time in fast mode is a rough hint of narrowness; the `--full` hit count is the real metric.
