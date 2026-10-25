# PUTT PALS v4 (PARTY CIRCUIT) — HANDOFF & LIVE PHASE TRACKER

Single source of truth. Any AI can continue from this file plus the three project files. Read A and B first, then the next phase in C.

Contents: A workflow rules | B current state | C phase checklist | F decisions | H architecture reference | J editing safely | K syntax check | N tools | L environment | I testing | M progress log | O verified solutions | playtest checklist | spec v2 triage | spec v2 (verbatim requirements).

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
- **Done:** P1 to P27. P20 to P22 (look, lighting, effects) were tested by the user in a browser and work. P23 was automated QA. P24 removed the stroke cap. P25 added per-putt par and timeout penalty data. P26 added per-map time limits and par + penalty timeout scoring. P27 added the paper scorecard.
- **Working:** nothing; next is P28 (rule 2: set `[WORKING]`, show this file, wait for the user's confirmation). **To do:** P28 to P61 (the Overhaul spec v2 at the bottom of this file).
- **Art decision (made by the user):** style B, the JoJo look, **replaces** the pastel look. Do the art phases P49 to P51 and P53 to P57 in that style. Until P49 the game still shows the pastel look from P20 to P22.
- **Files:** exactly three: `putt-pals.html` (game, three.js r128 and PeerJS inlined, 775 KB, works offline), `tools.js` (solver, arena generator, tests), `HANDOFF.md`.
- **Last green run (end of P27):** `node tools.js check` 22 maps, no empty slot, par, pen and time limit on all 36 starter putts; `rank` OK; `smoke` 242/242; `smoke-multi` 59/59; `surfaces` 19/19; `cups` pass; fast `solve 0 0`, `solve 20 2` and `solve 19 5` robust (`mechanics` not re-run) (layouts and physics unchanged since P24, so the other fast solves were not re-run); fast `solve 0 0` robust; fast `solve` robust on every putt of the six starter maps (indexes 0, 8, 20, 21, 5, 19).
- **Starter ladder (hardest last):** Switchback Garden (0, total 4,984 hole-in-one hits), Dune Serpent (8, 3,608), Frost Hollow (20, 2,949), Slime Springs (21, 2,417), Cyclone Ring (5, 1,117), Grand Finale (19, 833). The other 14 maps stay in `HOLES` as backlog.
- **Never seen by this AI:** a real browser. Everything visual is judged by the user.

## C. PHASE CHECKLIST (status: `[TODO]` `[WORKING]` `[DONE]` `[BUILT, NOT SEEN]` `[BLOCKED]`)
| # | Status | Phase (<=10 min) | Exit criterion |
|---|---|---|---|
| P1 | `[DONE]` | **File consolidation & baseline audit** (done; see the P1 log row) | 3 files only: `putt-pals.html` (libs inlined), `tools.js` (solver + arena generator + fast mode), `HANDOFF.md`. Syntax OK. `node tools.js solve 0 0` runs |
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
| P10 | `[DONE]` | HUD, lobby and room-code UI: function, layout, live scoreboard final pass (frosted-glass look is polished in the graphics group) | UI works on desktop and phone width |
| P11 | `[DONE]` | Putt-to-putt transition: ball/camera travel animation replacing the flash | Smooth warp |
| P12 | `[DONE]` | **Checkpoint: your playtest of the essentials** in a browser (the playtest checklist near the end of this file plus camera, spectator, audio, transition); the AI fixes whatever you report before level design starts | You confirm the essentials work |
| | | **GROUP 2: LEVEL DESIGN (starter ladder of 6 maps)** | |
| P13 | `[DONE]` | Map 1 BEGINNER — Switchback Garden: re-tune, 6 putts verified | Solver all green |
| P14 | `[DONE]` | Map 2 EASY — Dune Serpent (sand) | Solver all green |
| P15 | `[DONE]` | Map 3 MEDIUM — Frost Hollow (ice + walls), new | Solver all green |
| P16 | `[DONE]` | Map 4 MEDIUM-HARD — Slime Springs (slime, jump pads, teleporters), new | Solver all green |
| P17 | `[DONE]` | Map 5 HARD — Cyclone Ring (fans + tornadoes) | Solver all green |
| P18 | `[DONE]` | Map 6 EXPERT — Grand Finale (combined mechanics, smallest cups) | Solver all green |
| P19 | `[DONE]` | Starter ladder: difficulty metric (`tools.js rank`) over the six finished maps, voting grid shows the 6 starter maps only; re-tune a map if the ranking is not strictly increasing | Ranking printed and strictly increasing; smoke tests pass |
| | | **GROUP 3: GRAPHICS (last, so art never blocks gameplay)** | |
| P20 | `[DONE]` | Art A: soft pastel cartoon palette, bright sun, dreamlike 3D void environment; frosted-glass HUD look | Visible in browser (user confirms) |
| P21 | `[DONE]` | Art B: soft shadows, ambient-occlusion look, specular highlights | Shadows on ball/obstacles |
| P22 | `[DONE]` | VFX: ball trail, cup-sink confetti, wind-stream / tornado / pickup shaders | Effects present |
| P23 | `[DONE]` | Final QA: full solver run, smoke test, user playtest checklist, final handoff | All checks green |
| P24 | `[DONE]` | Rules A: remove the 8-stroke cap (`MAXS`); unlimited strokes inside the putt timer; fix every place that used `MAXS` as a default score | No cap in sim, UI and scoring; smoke tests updated and pass |
| P25 | `[DONE]` | Rules B: per-putt par and timeout penalty data (`par`, `pen` per chamber in `SPECS`, defaults from putt difficulty); show par in the HUD | Every putt has a par and a penalty; HUD shows par; `check` fails on a missing par |
| P26 | `[DONE]` | Rules C: per-map time limit (customizable, enforced minimum 120 s); on expiry assign `putt par + penalty` to unfinished players; advance only when all are sunk or timed out | Timeout score correct in a smoke test (single and multi); limit below 120 s rejected |
| P27 | `[DONE]` | Scorecard leaderboard UI: paper mini-golf card, holes 1 to 6, per-hole scores, totals, leader on top, stats (strokes, holes-in-one, timeouts); shown after each putt and from an in-game button | Renders for 1 to 4 players, sorted live; smoke test checks order |
| P28 | `[TODO]` | Practice mode A: mode selector on the lobby, solo room, pick any map from the vote grid | Practice starts any chosen map without voting; smoke test |
| P29 | `[TODO]` | Practice mode B: replay a single putt of any map (pick map and putt, restart/next/previous controls, no scoring or timer pressure) | Single putt loops; leaving returns to the lobby; smoke test |
| P30 | `[TODO]` | Camera: invert the drag-rotate/pan direction so it feels natural (audit current sign first) | Dragging right turns the view the natural way; test via `__pp.cam`; you confirm the feel |
| P31 | `[TODO]` | Wall transparency: raycast camera to ball each frame and fade walls in the way (alpha, per-wall material), restore when clear | Walls between camera and ball fade; ball, aim guide stay visible; smoke test for no errors |
| P32 | `[TODO]` | Physics constants: smaller ball radius `R`, slightly smaller cups, slightly lower turf friction (`k`), stronger power; keep sim, solver and render in sync | Constants changed in one place; `check`, `smoke` pass; solver runs |
| P33 | `[TODO]` | Re-solve and re-tune all six starter maps after P32 (fast solve, then `--full` counts, `rank`) | Robust shot on every putt; ladder still strictly increasing; per-putt min >= 60 hits |
| P34 | `[TODO]` | Corner bouncers A: triangular wedge element (`wg`) in the sim, the solver and the renderer | One test chamber verified: a clean-angle hit is redirected; solver models it |
| P35 | `[TODO]` | Corner bouncers B: place wedges on tight turns in the six starter maps, then re-solve them | Wedges present on turns; all putts still robust; ladder intact |
| P36 | `[TODO]` | Fans rework: smaller bounding box, compact nozzle model, strong directional impulse along the axis (sim + solver + render) | Fan chamber verified in the solver; smoke passes |
| P37 | `[TODO]` | Vortex rework: stronger suction with pull that varies with distance to the center (sim + solver + render) | Vortex chamber verified in the solver; smoke passes |
| P38 | `[TODO]` | Re-solve and re-tune the maps that use fans and vortexes (Cyclone Ring, Grand Finale, others if affected) and run `rank` | Robust shot on every putt; ladder intact |
| P39 | `[TODO]` | Floating islands: each putt is its own island in the sky (rock undersides, visible gaps, void between), spacing and camera framing | Six separate islands rendered; transitions still work; smoke passes; you confirm the look |
| P40 | `[TODO]` | Boundary walls: add `tools.js walls` to list open edges per chamber; add protective walls except at declared hazard edges (ramps, jump gaps, shortcuts) | Only declared edges stay open; all putts still robust |
| P41 | `[TODO]` | 3D topology A: curved elevation ramps (new primitive in sim, solver and render) | Test chamber verified; solver models it |
| P42 | `[TODO]` | 3D topology B: multi-tier platforms and vertical drops with landing floors | Test chamber verified; solver models it |
| P43 | `[TODO]` | 3D topology C: enclosed transport tubes (entry, path, exit, ball carried through) | Test chamber verified; solver models it |
| P44 | `[TODO]` | Hole-in-one difficulty bands by map rating (Easy map: medium HIO, Medium: hard, Hard: very hard); define the metric from `--full` counts and tune putts to the bands; every putt must still reach par | Per-map band table in this file; `rank` checks the bands |
| P45 | `[TODO]` | Power-up framework: spawn table with higher odds on weather maps, per-power-up effect hooks, multiplayer sync through presence | Spawns follow the table; hooks exist; smoke-multi passes |
| P46 | `[TODO]` | Power-ups: Lightning / Shockwave (radial push on opponent balls) and Wind Burst (vector push on nearby balls) | Both push opponents in a multi smoke test |
| P47 | `[TODO]` | Power-up: Tornado (localized vortex hazard dropped on the course, reuses the P37 vortex) | Placed tornado affects balls; expires; smoke test |
| P48 | `[TODO]` | Power-ups: Ice Trap (current putt floor frictionless for a time) and Slime Trap (walls lose bounciness) | Both apply and expire; tested in sim |
| P49 | `[TODO]` | Art: **JoJo look replaces the pastel look (user chose B after a preview)**: bold black outlines (inverted-hull) on every mesh, saturated flat palette, hard cel shadows (toon material); remove or restyle the P20 to P22 pastel values (fog, hemisphere, sun, void floor, pastel textures, soft sky, `dreamBits`, soft contact blob, pastel frosted HUD/menu CSS). Starting palette from the approved preview: deep violet sky `#3a1d7a` with yellow action rays, mint turf `#19d3a2`, pink walls `#ff4fa3`, yellow caption `#ffd23f`, 3 px black outlines | Outlines on all mesh types, no pastel leftovers; check, smoke, smoke-multi pass; you confirm the look |
| P50 | `[TODO]` | Art: halftone dots on turf, crosshatch on walls and rock, comic caption-box HUD (yellow panel, black border) and menus; same style on ramps, tubes, obstacles, fans, vortexes, balls | Every texture and UI panel uses the style; you confirm the look |
| P51 | `[TODO]` | Sky world: animated volumetric/particle clouds around the floating islands, drawn as comic clouds (white with black outline, halftone shading) to match B | Clouds animate smoothly; frame rate acceptable on a phone; you confirm the look |
| P52 | `[TODO]` | Audio cues for the new mechanics (wedge bounce, shockwave, wind burst, tornado, ice and slime traps, scorecard, timeout); the spec intro lists audio but gives no details, so use the existing synthesis style | New cues play through `SFX`; smoke test sees them |
| P53 | `[TODO]` | Weather A: Storm/Rain map (proposed: Cyclone Ring): rain shader, lightning flashes, boosted Lightning and Tornado spawn odds from the P45 table, in the JoJo style | Rain and lightning visible on that map only; spawn odds raised; smoke passes; you confirm the look |
| P54 | `[TODO]` | Weather B: Snow map (proposed: Frost Hollow): atmospheric snowfall, frosty terrain shader, boosted Wind and Ice spawn odds, in the JoJo style | Snow visible on that map only; spawn odds raised; smoke passes; you confirm the look |
| P55 | `[TODO]` | Distinct saturated color palette and thematic assets for each of the six maps (all in the B style) | Each map reads as its own place; you confirm the look |
| P56 | `[TODO]` | Sky extras: distant birds and dynamic sun flare lighting | Birds fly, flare responds to the camera angle; cheap enough for phones |
| P57 | `[TODO]` | Main menu: video-game layout (not a web page), grand title graphic in the B style (original lettering, no copied logo), continuously rotating 3D panorama of the maps behind it, **Solo** and **Friends** buttons in the bottom-left | Menu replaces the current start screen; Solo and Friends start the right flows; smoke tests updated; you confirm the look |
| P58 | `[TODO]` | Loading screen: map panorama background and rotating fun facts/tips at the bottom | Shown while a round loads; tips rotate; no errors in smoke |
| P59 | `[TODO]` | Menu audio: crisp synthesized sounds for button hover, click and menu transitions (same `SFX` style) | Every menu button and transition has a sound; mute still works; smoke sees them |
| P60 | `[TODO]` | In-game feedback: turn-ready audio cue when the ball has stopped and a stroke is allowed again, and a glowing ring beneath the player's own ball | Cue plays once per stop; ring follows only the player's ball; smoke test |
| P61 | `[TODO]` | Final QA v2: `check`, `rank`, `smoke`, `smoke-multi`, fast solve on all six maps, playtest checklist v2, final handoff | All checks green; checklist handed to the user |

## F. DECISIONS (the user can overrule at confirmation)
1. **Art (user, after the preview):** JoJo-style B replaces pastel: black outlines, halftone and crosshatch, saturated palettes, comic caption UI. Title and logos must be original lettering.
2. **Timer (P4, replaced by P26 for the starter maps):** each map has a `limit` in seconds that applies to each of its putts (a putt may override it with its own `limit`); the minimum is 120 s and the cap 600 s, and an invalid value is ignored, not applied. Maps without a valid `limit` (the 14 backlog maps) keep the old rule: per-putt limit = 120 s x max(1, par/2), capped at 300 s (`limitOf(map,putt)`), never under 2 minutes; the host's advance fallback adds 4 s. Spec v2 asks for a per-map customizable limit with a 120 s minimum (P26).
3. **Scope:** six starter maps first; the 14 older maps are backlog.
4. **Shadows:** true ray tracing is not possible in this r128 raster setup; P21 used soft shadow maps, a sky environment map for specular and a contact blob. Real screen-space AO was not done.
5. **Libraries are inlined** (about 775 KB); every patch uses exact anchors.
6. **Old solver results** from before P2 are discarded; use section O.
7. **Phase order** (changed at the user's request): essentials P7 to P12, levels P13 to P19, graphics P20 to P22, QA P23, then the second spec P24 to P61.
8. **Requirements already met by P1 to P23:** room codes, 15 s voting, Standard (6 putts) and Tournament 3/6/9, ball R=6, ice, slime, sand, fans, tornadoes, jump pads, teleporters, cup sizes per map, deterministic sine aim sway, three cameras, spectator, spatial audio, frosted HUD, putt-to-putt transition.

## H. ARCHITECTURE REFERENCE (as implemented)
Everything is inside one IIFE in `putt-pals.html`. Positions: sim uses (x,y) horizontal, z height; Three.js uses (x,z) horizontal, y up. Map data (from the code): `course(name,desc,tee,hole,tiles,extra)` with defaults `par:4,w:[],sand:[],ice:[],slime:[],q:[],pl:[],rp:[],pd:[],pit:[],fan:[],tp:[],tornado:[],movers:[]`. `tiles` = playable rectangles (everything else is void); `w` walls `[x,y,w,h]`; `sand`; `ice` and `slime` `[x,y,w,h]` (P4); `q` power-up blocks; `pl` platforms `[x,y,w,h,H]`; `rp` ramps `[x,y,w,h,dir,h0,h1]`; `pd` jump pads; `pit` water `[x,y,w,h]`; `fan` `[x,y,w,h,dx,dy,force]`; `tp` teleporter pairs `[ax,ay,bx,by,color]`; `tornado`, `movers`. Screen borders `B` are 16 px walls around the 800x500 canvas.

### 4.1 Constants
`R=6` (ball radius), `DT=1/240`, `G=700`, `MAXS=8` (max strokes / penalty), `LIMIT_BASE=120000`, `LIMIT_MAX=300000` (ms; see `limitOf` for the per-putt limit), `VOTE_SECS=15`, `CUP=17` (default cup radius), `CUP_MIN=8`, `cupOf(h)` (radius of a hole: `h.cup` clamped to 8..17, default 17; set `cup:N` on a putt or on a map, putt wins), `DEPTH=36`, `SWAY_W=2*PI/1.4`.

### 4.2 Room state (host-owned, replicated in snapshots)
`newRoom()` = `{phase,map,round,startAt,roster,putt,votes,deadline,mode,series,mapNo,totals,last}`
- `phase` is one of **`lobby | select | play | results`** (these are the only values `validRoom` accepts). `select` IS the voting phase. The addendum's `voting/intro/active/...` names are NOT implemented.
- `map` winning map index; `putt` 0..5 current putt; `round` increments every putt (used as the per-putt sync key `activeRound`); `startAt` host-time ms when the putt becomes playable (2.5 s after setting).
- `votes` `{peerId: mapIdx}`; `deadline` host-time ms when voting ends (0 until the first vote).
- `card` (P27, host-written): `{peerId:{n,s:[score per finished putt, null = absent],o:[1 = timed out]}}`; one entry is appended per roster player by `recordCard(r)` in the same `setRoom` that advances the putt (`nextPutt`) or ends the map (`finishMap`); reset to `{}` when a map starts (vote resolved, `playmap`, `startgame`) and when the room returns to the lobby. The putt in progress is NOT in `card`; clients read it live from presence. `card` totals use the same score expression as `finishMap`, so a card row total equals `last.sc`.
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
- Par/pen data (P25): `LADDER` is now a top-level const in `tools.js`; it feeds `rank` and the default par and penalty written by `arena`. Default par per putt from its `--full` hit count: >= 600 -> 2, >= 250 -> 3, else 4 (`parFromHits`). Default `pen` (strokes added to par on a timeout) from the map total: 4 when the total is under 1,500 (Hard maps), else 3 (`penFromTotal`). A chamber in `SPECS` can set `par` and/or `pen` to override the default. `arena` writes `par:N,pen:N` per putt and sets the map `par` to the sum of the putt pars.
- `rank` (P19) prints the six starter maps (indexes 0, 8, 20, 21, 5, 19) with total and per-putt hole-in-one counts from the recorded `--full` runs held in the `LADDER` array inside `tools.js`, and fails (`RANK FAILED`) if the order is not strictly harder, a map name or `STARTERS` slot does not match, or a putt is under 60 hits. Update `LADDER` whenever a map is re-tuned.
- `check` parses the game script, fails if `HOLES` has an empty slot (double comma), and (P25) fails if any putt of a STARTERS map lacks an integer `par` (2..6) or `pen` (1..6), a starter map does not have six putts, or a map `par` is not the sum of its putt pars. `node tools.js check` | `list` | `surfaces` | `cups` | `mechanics` | `mechanics` | `smoke` | `smoke-multi` | `solve <map> [putt] [--full]` | `arena ['Map Name']`.
- `smoke-multi` boots 4 jsdom windows (host + 3 guests) joined through `makeNet()`, an in-memory stand-in for PeerJS (same API surface the game uses; messages JSON-cloned and delayed 2-3 ms). It asserts: joining and host election, 4-player lobby roster, guest cannot start, first guest vote starts the countdown on the host and is visible to all, voting waits for everyone, majority map locks, six putts where the game WAITS for the last player and then advances all clients together, HIO banner visible on guests, totals per player, sole winner, guest cannot leave results, host returns all to the lobby, and a player dropping out mid-putt (host notices, the rest advance).
- `smoke` loads the real HTML in jsdom (WebGL, canvas and PeerJS are stubbed), plays a 3-map tournament in solo (maps 0, 8, 0) by calling the game's own `sink()` through a test hook (`window.__pp`, only active when `window.__PP_TEST` is set), and asserts: sway math, lobby -> start -> vote -> 6 putts -> results -> next vote -> champion -> lobby, cumulative totals (11/23/35), HIO banner, button labels, and zero runtime errors. Setup: `mkdir /tmp/jd && cd /tmp/jd && npm i jsdom`, then `NODE_PATH=/tmp/jd/node_modules node tools.js smoke` (about 90 s). Keep jsdom OUT of the project tree.
- `solve` runs the game's real physics headlessly (extracted by text markers: `const R=`, `\n];`, `let PI_=0`, `const NP=`, `function fresh(`, `function inside(`, `function frame(`; if you move those, update `load()`). It searches angle 0..360 in 0.5 deg steps x power 0.30..1.00 in 0.05 steps with a centered release (no sway). A putt PASSES if a shot also works at +-0.4 deg and +-2.5% power. Fast mode (default) stops at the first robust shot (seconds); `--full` counts all hits (about 80 s per putt) and is the basis for the difficulty metric.
- `mechanics` (P6) builds four test chambers from the `MECH` table in `tools.js` (0 fan, 1 teleporter, 2 jump pad, 3 tornado; NOT a playable map, built in memory only) and for each asserts a robust hole-in-one exists AND that the same shot fails with that mechanic removed. All 8 checks pass. Takes about 3 minutes. Notes: the game code already implemented all four mechanics and the solver runs them as static (no phase), so P6 changed `tools.js` only (the HTML is byte-identical to P5). The found shots are real but not always natural: the teleporter shot (6 deg, power 1) and the pad shot (177.5 deg, power .7, bouncing off the back wall and then over slime into the pad) work through bounces. A tornado that lifts the ball over a full wall was too chaotic for a robust shot (none found at radius 70 to 90, strength +-260 to +-300), so the tornado chamber uses smooth deflection around a partial wall instead.
- Layout rules for P15 to P18: (1) a jump pad launches at vz 400 (peak about 114), so the ball clears every wall (height 28) and can land in another chamber or off the tile; bound the landing or use slime/sand to control the speed; (2) tornado cores lift and fling the ball, so keep the ball path in the outer ring of a tornado (distance > 0.4 x radius); (3) teleporters keep the ball's velocity and have a 0.8 s cooldown, keep pairs inside one chamber.
- `arena` chamber keys (chamber-local, 228x198): `pd [x,y]`, `tp [ax,ay,bx,by,color]`, `fan [x,y,w,h,dx,dy,force]`, `tornado [x,y,radius,+-strength]`, plus `ice`, `slime`, `cup`. Empty optional keys are not written, so Dune Serpent regenerates byte-for-byte (checked). Switchback Garden regenerates identically except for an added empty `sand:[]`, which changes nothing at runtime (the generator always wrote `sand`; the map line never had it, true before P6 too). Do not run `arena` on it needlessly.
- `cups` (P5) fires a sweep of 462 shots (angle +-4 deg x power .35..1.0) at a flat 300-unit putt for radii 17, 14, 11, 8 using the game's real `step()` and asserts the clamp rules, that smaller cups are never easier, 8 is strictly harder than 17 but still possible, and that omitting `cup` equals 17. Current hit counts: 222 / 164 / 98 / 40. Takes about 15 s.
- Cup physics (P5), all scaled so radius 17 behaves exactly as before: the aim-assist pull toward the cup has reach `90*C/17` and strength `300*(C/17)^2`; the lip rebound is `1.15+0.6*(17-C)/9` (1.15 at 17, 1.75 at 8), so fast balls lip out of small cups; the render shader cut-out, sleeve, rim and ghost cups all use the hole's own radius. The `arena` generator accepts an optional per-chamber `cup` key in `SPECS`.
- `surfaces` (P4) rolls a ball at 300 u/s over a flat test hole of turf, sand, ice and slime using the game's real `step()` and asserts ice > turf > sand > slime in distance, plus the timer limits (120 s at par 2, 240 s at par 4, never under 120 s, capped at 300 s). Current distances: turf 237, sand 75, ice 1700, slime 44 units. Friction constants live in `step()`: turf k .85, platform .9, ice .12 (Coulomb drag 4), slime 5.5 (drag 45), sand 3.2; precedence sand < platform < ice < slime.
- Headless loader (`load()`): it extracts parts of the game script by text markers and stubs the DOM helpers (`$ toast pub aim openCard`). If the game code that `sink()`/`step()` run starts calling a NEW helper that lives outside the extracted parts, define a stub for it in the `load()` stub line, or every `solve`, `cups` and `surfaces` run crashes with a ReferenceError (this happened with `openCard` in P27 and was caught by the solver regression run, not by `smoke`).
- Limits: time-based obstacles are frozen at phase 0 (`R_` is null); sway and items are not modeled; it proves possibility, not difficulty.
- `arena` rewrites a map as six chambers from the `SPECS` table inside `tools.js`; if the name is not found in `HOLES` it APPENDS a new map line at the end of the array (P15; running it again replaces that line, so it is idempotent) (chamber-local coords 228x198; keys `t,c,w,sand,pit`). It matches the map's single `course('Name'...` line, so keep each map on one line. Extend `SPECS` and `arenaLine()` when adding ice, slime, pads, teleporters, fans, tornadoes.
- 1 CPU core in the build sandbox: run long jobs with `setsid nohup ... &` and poll.

## L. ENVIRONMENT NOTES
- No browser is available to the AI; the game has never been run in a real browser by it. Libraries are inlined, so the HTML needs no network except PeerJS's signaling server for multiplayer.
- 1 CPU core. Run long jobs with `setsid nohup ... > log &` and poll with `sleep`. Do not run two solver jobs at once (they slow each other down).
- Time guide: `solve <map>` (fast) takes seconds to a few minutes; `solve <map> --full` takes about 15 minutes per map with fans and tornadoes; `smoke` plus `smoke-multi` take about 4 minutes together.
- Tests need jsdom: `mkdir -p /tmp/jd && cd /tmp/jd && npm i jsdom`, then run `NODE_PATH=/tmp/jd/node_modules node tools.js smoke` (and `smoke-multi`). Expect 92/92 and 41/41 PASS lines at the end of P24.
- Work on copies in a scratch folder (`/home/claude/pp`); deliver the three files to `/mnt/user-data/outputs`. Uploaded files are read-only.
- Safe patching: exact-match scripts that assert one match per anchor and write only if every anchor matched; a failed assert means NOTHING was written, so re-measure after fixing it. Kill background jobs by PID, never with `pkill -f` (it kills its own shell).

## I. TESTING: WHAT IS PROVEN AND WHAT THE USER MUST CHECK
**Proven (headless, `tools.js smoke` and `smoke-multi`, simulated network, not real WebRTC):** the room state machine (lobby, mode, voting, six putts, advance, results, tournament, reset), 4 simulated players with a mid-putt disconnect, camera modes, free roam, audio triggers, putt transition, the six-card voting grid, and that the frame loop (trail, confetti, contact blobs) throws no errors.
**Never proven by tests:** real WebGL rendering, real drag input, real WebRTC (NAT, latency), performance on phones, anything that depends on how it looks or feels. P20 to P22 were checked by the user in a browser (works, no complaints).
**For the user:** the playtest checklist near the end of this file; report anything off and the next AI fixes it before adding features.

## M. PROGRESS LOG
| Date/Session | Event |
|---|---|
| earlier | Stages 1-5: sway, voting, 6-putt sequencing, putt timer, tournament, banners, frosted HUD, solver, two arena maps (verified under OLD physics), R=6, water splash |
| this session | Workflow changed to phased tracker; HTML audit found unlogged friction/sink/lib changes |
| reorder 2 | Phases regrouped at the user's request: essentials P7 to P12 (new P12 = your playtest checkpoint), level design P13 to P19, graphics P20 to P22, final QA P23; no code changed |
| reorder 1 | Ranking and voting-grid restriction moved after the six maps (they need finished maps); no code changed |
| P27 | DONE: paper scorecard. Game: host-owned `room.card` (see 4.2) recorded by `recordCard`; `cardData(r)` builds the rows (leader first by total strokes so far, the live putt counts like the side scoreboard; ties by name and shared rank; cells, total, +/- vs par over the counted holes, HIO and T/O counts); `renderCard(el,r)` draws a cream paper table (header Player, 1..n, Total, +/-, HIO, T/O; PAR row; leader row highlighted; under par circled, hole in one gold and underlined, live putt in italics, timeout marked `*`); text only through `textContent`. Overlay `#cardov` (opens by itself when you sink or time out, closes by itself when the next putt starts or on results or lobby, `Card` button in the top bar, `K` key toggles, Esc and the x button close; it refreshes every 200 ms while open). Results screen shows the card in `#endcard` below the text line (`#end` card widened to 720 px). CSS block `P27` with its own variables (`--pp-paper`, `--pp-ink`, `--pp-line`, `--pp-band`, `--pp-lead`, `--pp-red`, `--pp-gold`) so P49/P50 can restyle it. Tests: `smoke` +92 (242/242: per-putt auto-open, correct cell, earlier holes kept, closed at the next putt, header, PAR row, leader row, HIO mark, K, Esc, button, timeout `6*`, results card cells, total and +/-), `smoke-multi` +17 (59/59: sorted live, auto-open on every sink, card synced and closed on all 4 clients each putt, results order P1 P2 P4 P3 identical on all clients, card totals equal `last.sc`, a timeout shows `5*`, T/O 1, HIO 6, a dropped player is blank and has no row). Side effect: `tools.js` `load()` now stubs `openCard` (see section N). Not covered: how it looks or feels (jsdom has no layout), phone width, the host fallback with a stale presence (`q.round!==r.round` is not checked, same as `finishMap`), `mechanics` not re-run. |
| P26 | DONE: per-map time limit and par + penalty timeout. HTML: `limit:N` (seconds) in each starter map (Switchback Garden 120, Dune Serpent 150, Frost Hollow 150, Slime Springs 180, Cyclone Ring 210, Grand Finale 240). `LIMIT_MIN=120000`, `LIMIT_CAP=600000`, `validLimit(sec)`; `limitOf` uses a valid putt `limit`, else a valid map `limit`, else the old par-scaled default (120 s x par/2, cap 300 s). Under 120 s is REJECTED (ignored, the default applies), not raised. `TIMEOUT_SCORE` is gone: `timeoutScore(str,mi,pi)=max(str, parOf+penOf)` is used in `sink(true)`, `finishMap` (for a player with no recorded score it uses the player's `str` and the map's last putt) and the carry-over total. New `parOf(mi,pi)`. Rule kept from P24: a timeout never scores below the strokes already taken. Timeout toast now reads 'Time’s up! You score N (par + penalty).' (the old duplicate toast was overwritten at once anyway). Advance rule unchanged: all players done, or limit + 4 s host fallback. `tools.js`: `MAP_LIMIT` table, `arena` writes `limit` (Dune Serpent regenerates byte-identical on a copy), `check` fails on a missing or invalid starter limit, `load()` exports `validLimit parOf penOf timeoutScore`, `surfaces` +11 checks (declared limits, 90 s and 119.9 s and 700 s rejected, putt override, par + penalty scores), `smoke` +4 (150/150: timeouts after 3 and 0 strokes score 5, Dune Serpent putt 2 scores 6, limit 150 s, HUD starts near 2:30), `smoke-multi` +1 (42/42: guest P3 times out on putt 3 and all four clients see the same par + penalty score, totals match). NOT covered: `finishMap`'s fallback for a player with no recorded score (the dropped-player test removes the player instead), the real timer expiring (tests call `sink(true)` directly), anything in a browser. |
| P25 | DONE: per-putt `par` and `pen` data. Starter maps now carry them in the HTML (patched directly with exact-match asserts, not through `arena`, so layouts are byte-identical apart from these fields). Pars: Switchback Garden 2,2,2,2,2,2 (map par 12); Dune Serpent 2,3,2,3,3,2 (15); Frost Hollow 4,3,3,3,2,3 (18); Slime Springs 2,4,4,3,3,3 (19); Cyclone Ring 4,3,4,4,4,4 (23); Grand Finale 4,4,4,4,4,4 (24). `pen` is 3 on the first four maps and 4 on Cyclone Ring and Grand Finale. Map par (shown on the vote cards and used by the finish text) rose from 12 on every map to a strictly increasing 12 to 24. Game: new `penOf(mi,pi)` (default 3 if missing) next to `limitOf`; the HUD already printed `PAR` from the current putt (`H()` merges the putt data), so it now shows the real par per putt; test hook `__pp` gained `penOf`, `limitOf`, `holes`. `tools.js`: shared `LADDER`, `parFromHits`/`penFromTotal`, `arena` writes par and pen, `check` validates them. Tests: `smoke` 146/146 (+54: for each of 18 putts the data is valid, the HUD shows the right PAR, `penOf` matches), `smoke-multi` 41/41, `surfaces` pass, `rank` OK, fast `solve 0 0` OK. Side effect: timers now follow par (par 3 = 180 s, par 4 = 240 s) until P26. Timeout scoring is NOT changed yet (still the P24 placeholder, 8). Not seen in a browser; par bands are a first guess and can be hand-tuned in the HTML or SPECS. |
| P24 | DONE: stroke cap removed. `MAXS=8` is gone. Strokes are unlimited: `stop()` and `oob()` (water splash) no longer end the putt after 8 strokes; the presence validator accepts scores up to `MAX_SCORE=999` (before, anything over 8 would have been rejected by `validPresence`). Unfinished or timed-out players now score through the placeholder `timeoutScore(str)=Math.max(str,TIMEOUT_SCORE)` with `TIMEOUT_SCORE=8` (used in `sink(true)`, the results tally and the carry-over total), so a timeout can never score less than the strokes already taken. **P26 must replace this placeholder with putt par + penalty** (P25 adds the par and penalty data). The timer toast now says 'Penalty score.'. Presence gained `over` so other players hear the sad sink sound only for real timeouts (before it was `score >= 8`). Test hook `__pp` now also exposes `stop`, `oob`, `pub`. `smoke` +5 checks (92/92): 12 strokes keep playing, a splash after 12 strokes keeps playing, timeout after 12 strokes scores 12, timeout after 3 scores 8, state restored. `smoke-multi` 41/41, fast `solve 0 0` and `rank` still pass. Not covered by a test: a guest's presence with a score above 8 being accepted by the host (the `MAX_SCORE` change); not seen in a browser. |
| P23 | DONE: final QA on the finished build. `check` 22 maps no empty slots; `rank` OK (strictly harder each step); `smoke` 87/87; `smoke-multi` 41/41; fast solver `solve <map>` ALL PUTTS VERIFIED (robust shot on every putt) on all six starter maps: 0 Switchback Garden, 8 Dune Serpent, 20 Frost Hollow, 21 Slime Springs, 5 Cyclone Ring, 19 Grand Finale. Not re-run: the `--full` hole-in-one counts (about 90 minutes in total), so `rank` still uses the counts recorded in P8 to P18; the playtest checklist below is for the user. |
| P22 | DONE (user tested, works). `trail` (26 fading additive points, shader, tinted by ball color, reset on teleports), `burstConfetti` (90 particles when `me.mode` becomes `'sunk'`), fan wind streams use the soft `SOFT` sprite. Tornado particles and pickup auras already existed. Tunables: `TRN`, trail size 30 and alpha .6, `CN`, confetti speeds. |
| P21 | DONE (user tested, works). Shadow map is `PCFShadowMap` with `sun.shadow.radius=3.4`; `ENV` = sky environment map from `PMREMGenerator` inside try/catch (on failure there are simply no reflections) used by the ball, fan rings, pole and coin rings; `mkBlob`/`setBlob` draw a soft contact shadow under every ball. No real screen-space AO or wall-base darkening (r128 without post-processing). |
| P20 | DONE (user tested, works). PASTEL LOOK, TO BE REPLACED in P49: fog `0xf0d8ee` (1800 to 7000); hemisphere `0xe2f0ff`/`0xf2c9e8` at .9; sun `0xfff0cc` at 1.5; exposure 1.15; void floor `0xd9c8f4`; bump .5; pastel turf, brick, platform, ramp, sand, ice and slime textures in `ctex(...)` calls; sky fragment shader (peach to lilac, sun glow and disc, direction `(.35,.65,.5)`); `dreamBits` (30 floating pastel shapes) with `bobDreams(t)` next to `U.t.value=now/1000`; CSS: lavender menus with frosted cards, frosted violet HUD (`#info`, `#ctl`, `#sb`, top buttons). |
| P19 | DONE: starter ladder. `node tools.js rank` prints the six maps with totals and per-putt ranges from the recorded `--full` counts and fails if the order is not strictly harder, a name or `STARTERS` slot mismatches, or a putt is under 60 hits. `const STARTERS=[0,8,20,21,5,19]` limits the voting grid (cards numbered 01 to 06) and vote validation; the other 14 maps stay in `HOLES`. `smoke-multi` asserts exactly 6 cards. `rank` uses recorded counts, not a fresh solve. |
| P18 | DONE: Grand Finale converted (index 19, Expert, mixed mechanics, cups 8 to 10). Hits 110, 93, 149, 126, 164, 191 (total 833). The first draft totalled 3,128. Lessons: teleporter chambers are too forgiving for Expert (690 to 925 hits even at cup 8), so putt 1 became ice plus fan; a fan that pushes toward the cup widens a chamber; moving a guard wall or narrowing a cup pocket made putt 1 easier; putt 3 at cup 8 had no robust shot (cup 9 works). Process lessons: `pkill -f` matches its own command line and kills the shell (kill by PID); an edit script with a non-unique anchor aborts before writing, so the next run measures the OLD layout. |
| P17 | DONE: Cyclone Ring converted to the six-chamber arena (index 5, Hard, fans and tornadoes). Hits 107, 456, 123, 118, 111, 202 (total 1,117). Lessons: fan force above about 150 across the only route leaves no robust shot (first draft failed on putts 3 and 5 at 220 and 260; 110 fixed both); `--full` takes about 2.5 min per putt with fans and tornadoes. The tornado outer-ring rule (more than 0.4 x radius) was not hand-checked. |
| P16 | DONE: Slime Springs added as map index 21 (slime, jump pads, teleporters), Medium-Hard. Hits 673, 131, 230, 340, 520, 523 (total 2,417; putt 2 at 131 is the narrowest). Lessons: a jump pad launches at vz 400 and keeps its horizontal speed, so at the solver's minimum power the ball leaves the chamber; pads only work on a slow ball, so put slime before the pad; longer slime strips widen the power window; teleporter chambers are easy, so use small cups and a guard wall; each cup step down cuts hits about 0.6x. BUG FIXED: appending a second new map made `,,` (an empty slot in `HOLES`, so the index was 22 not 21); `arena` now adds a comma only when missing and `check` fails on an empty slot. |
| P15 | DONE: Frost Hollow added as map index 20 (ice and walls), Medium. Hits 199, 518, 532, 513, 709, 478 (total 2,949; the first layout was 5,363, too easy). Lesson: ice around the cup inflates hits because the ball keeps passing it; keep ice on the approach and turf at the cup. Cup -2 units cuts hits about 0.7x. `arena` now appends new maps. |
| P14 | DONE: Dune Serpent tuned as Easy (the user allowed easier maps where the ladder needs it). Hits 660, 519, 786, 402, 433, 808 (total 3,608, min 402; before: 1,703, min 96). Walls shortened and sand patches shrunk in putts 1, 2, 4, 5 and 6; the putt 6 tee no longer starts in sand. |
| P13 | DONE: Switchback Garden tuned as Beginner. `solve 0 --full` hits 612, 935, 663, 988, 879, 907 (min 612, total 4,984; floor was 600). Putt 1 wall and putt 5 pond were widened in `SPECS`. `arena` also writes an empty `sand:[]` (no effect). |
| P12 | DONE: the user played the essentials in a browser and reported that the game works and looks good; no fixes requested |
| P11 | DONE: the white warp flash is gone (the `#warp` element and CSS remain but nothing triggers them). New `puttTransition={startTime,duration:1500,from,to,arc,cp0,cl0}`: from putt 2 on, the ball arcs from the old cup to the new tee (smootherstep, arc height 70 + 0.18 x distance, max 200) while the camera follows from behind, pulls back and rises mid-flight, then settles; the camera eases in from its previous pose over the first 30 % (a first version snapped by 127 units, caught by the new test) and hands off to the normal camera without a jump. Input is blocked while it runs, a soft `warp` whoosh plays, reduced-motion makes it 1 ms. Test hooks `__pp.trans`, `__pp.ball`. `smoke` +5 checks (87/87): starts without the flash, ball arcs, ends in under 2.2 s, no camera step over 60 units per 40 ms sample, playable afterwards; smoke-multi 40/40. NOT proven: how it looks (speed, pull-back distance, whether 1.5 s feels right) |
| P10 | DONE: (1) phone layout: under 640 px the HUD bar, power bar, toast, inventory and scoreboard stop floating over the small canvas and stack around it (CSS block `P10` at the end of the stylesheet), smaller buttons and cards, banner capped to 92vw, narrower map cards. (2) Live scoreboard: header `SCOREBOARD | Putt | Total`, ranked by running total (this-putt strokes included, so it updates live), ties share a rank, `Putt` shows strokes or a check mark plus the result, spectators show `Watching`. (3) Timer pill turns red in the last 10 s. (4) Lobby: room label shows the code in capitals, player count and host or waiting, `Copy invite` is hidden in solo, `Join room` is disabled while the room code box is empty. `smoke` +6 checks (82/82; one catches the Join button being disabled at load, a bug found and fixed during P10), smoke-multi 40/40. NOT proven: any actual layout (jsdom has no layout engine; phone and desktop appearance, overlap, readability are for you), the frosted-glass polish is still P20 |
| P9 | DONE: WebAudio synthesis, no files. `audioOn()` creates the context on the first click/key/touch; master gain, mute via the `Sound` button or M (saved in localStorage `pp_mute`). Sounds (`SFX` table): putt, bounce, sink (plink + chime), sinkover, hio fanfare, power, event, splash, teleport, boing. Positioned through PannerNodes (equalpower, inverse distance, ref 250, rolloff .6) and the AudioListener follows the camera every frame, so free roam and world view work. Triggers are detected from state in `audioTick()` (called from `frame`, physics code untouched): stroke count up = putt, direction change over 40 deg = bounce, big jump while rolling = teleport, jump to rest = splash, vz spike = boing, mode `sunk` = sink; other players' strokes and sinks come from presence changes (their bounces are not heard). Banner sounds come from a MutationObserver on `#banner` (class hio/power/event). Test hooks `__pp.sfx`, `.muted`, `.audio`; `tools.js` has `makeFakeAC()`. `smoke` +6 checks (76/76), smoke-multi 40/40, solve 0 0, surfaces and cups re-run and pass. NOT proven: how anything sounds (volume balance, pitch, annoyance), real browser autoplay unlock, mobile |
| P8 | DONE: free-roam camera for players whose `me.mode` is `wait` (finished the putt) or `spectator` (late joiner). Controls: W/A/S/D or arrows, Q/E (or Space) down/up, Shift = fast, drag (left or right) to look, wheel = dolly. Starts from the current camera pose, clamped to x -300..1100, z -300..800, y 10..900. The View button/C show 'View: Free roam' and do nothing while it is active; the normal view returns on the next putt. Test hooks `__pp.cam` and `__pp.free`. `tools.js smoke` gained 7 checks (70/70, driven through `spectator` mode; the `wait` path is the same code but was not driven directly); smoke-multi 40/40. Feel is untested in a real browser |
| P7 | DONE: camera reduced to three views, `VN=['Ball cam','Hole view','World view']` with `MK=['follow','hole','strategic']` (the old Orbit and Cinematic modes are unreachable now). Ball cam = follow cam (right-drag/wheel/arrows rotate and zoom, wall collision avoidance). Hole view = raised, from the ball side of the cup, looking between cup and ball (the old straight-down view had a degenerate lookAt). World view = fixed overview of the whole 800x500 arena. Switching: `View:` button or the C key, velocities zeroed and the existing spring-damper eases the move. `tools.js smoke` gained 4 camera checks (63/63) and smoke-multi still passes (40/40). Look and feel is untested in a real browser |
| P6 | DONE: arena generator supports `pd`, `tp`, `fan`, `tornado` (plus `ice`, `slime`, `cup`); `tools.js mechanics` 8/8 (one test chamber per mechanic, robust shot found and fails without the mechanic); HTML unchanged since P5; surfaces and cups tests re-run and pass; arena regeneration is byte-identical for Dune Serpent; solve and smoke tests not re-run because the HTML is byte-identical to the P5 build that passed them |
| P5 | DONE: per-putt/per-map `cup` radius via `cupOf` (8..17, default 17) used by physics, solver, shader cut-out, cup meshes and ghost cups; pull and lip-out scale with the radius and are unchanged at 17; `tools.js cups` 8/8 (hits 222/164/98/40); maps 0 and 8 solutions unchanged; a temp copy with `cup:10` on putt 1 forced a different shot (57.5/.65), so the solver honors it; smoke and smoke-multi still pass |
| P4 | DONE: `ice` and `slime` tile arrays (sim friction, rendering, `arena` SPECS keys `ice`/`slime`), `limitOf` dynamic timer (120 s x par/2, 300 s cap) with m:ss HUD; `tools.js surfaces` 8/8; solve maps 0 and 8 unchanged; smoke 59/59 and smoke-multi 40/40 still pass |
| P3b | DONE: `tools.js smoke-multi` (4 simulated players, fake in-memory PeerJS); 40/40 pass incl. a mid-putt disconnect |
| P2 | DONE: maps 0 and 8 re-solved under the user's physics; 12/12 putts verified, no layout changes |
| P3 | DONE: `tools.js smoke` (jsdom, stubbed WebGL/Peer, test hook `window.__pp`); 59/59 pass; user hand-test checklist (now the playtest checklist near the end) |
| P1 | DONE: 3-file tree, libs inlined, `tools.js` with fast solver, idempotent arena generator, handoff folded |

## O. VERIFIED SOLUTIONS (current physics, `node tools.js solve <map>`, fast mode = first robust shot found)
Robust = also works at +-0.4 deg and +-2.5% power. Angle 0 = +x, increasing toward +y. Re-run after ANY physics or layout change; stored values can change.
| Map | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| 0 Switchback Garden (after P13) | 31/.95 | 25.5/.75 | 49.5/.45 | 27.5/.45 | 40/.5 | 13/.85 |
| 8 Dune Serpent (after P14) | 42/.75 | 312.5/.75 | 0/.40 | 70.5/.95 | 58/.80 | 23.5/1.0 |
| 20 Frost Hollow (after P15) | 19/.85 | 44/.6 | 14.5/.75 | 40.5/.85 | 16/.8 | 33.5/.9 |
| 21 Slime Springs (after P16) | 49/.85 | 0/.75 | 24/1.0 | 50.5/.8 | 37/.85 | 22/.75 |
| 5 Cyclone Ring (after P17) | 31/.8 | 13/.55 | 60/.85 | 31/.8 | 125.5/.7 | 330.5/1.0 |
| 19 Grand Finale (after P18) | 31.5/.85 | 0/.75 | 315/.8 | 50.5/.85 | 201.5/.75 | 139/.35 |
Dune Serpent after P14 (fast solve, putts 1 to 6): 42/.7, 15.5/.8, 0/.4, 68.5/.9, 58/.7, 24.5/.8.

Difficulty ladder so far (`solve <map> --full`, hole-in-one shots out of 10,800 tried; lower = harder):
| Map | Putts 1 to 6 | Total |
|---|---|---|
| 0 Switchback Garden | 612, 935, 663, 988, 879, 907 | 4,984 |
| 8 Dune Serpent | 660, 519, 786, 402, 433, 808 | 3,608 |
| 20 Frost Hollow | 199, 518, 532, 513, 709, 478 | 2,949 |
| 21 Slime Springs | 673, 131, 230, 340, 520, 523 | 2,417 |
| 5 Cyclone Ring | 107, 456, 123, 118, 111, 202 | 1,117 |
| 19 Grand Finale | 110, 93, 149, 126, 164, 191 | 833 |
Difficulty notes for P19: Dune Serpent putt 3 is a straight corridor shot (solved in 0.1 s, very wide solution set), while Dune Serpent putt 2 needed 87 s to find a robust shot (narrow). Solve time in fast mode is a rough hint of narrowness; the `--full` hit count is the real metric.

## Playtest checklist for the user (valid for the pastel build; re-run after P49)
Open `putt-pals.html` in a desktop browser first, then on a phone. Report anything that fails and I will fix it.
1. Menu: lavender background, frosted cards, six map cards numbered 01 to 06 (Switchback Garden to Grand Finale). Text readable?
2. Start a solo round on map 01. Sky, floating pastel shapes, colors: pleasant or too washed out? Do the floating shapes sit outside the course and not clip it?
3. Shadows: the ball and the trees/pole cast soft shadows; a dark soft blob sits under the ball and shrinks/fades when the ball is airborne.
4. Specular: the ball shows a bright reflection of the sky; fan rings, pole and the gold coin rings look glossy.
5. Aim and hit a putt: a glowing trail follows the ball, fades after it stops, and does not streak across the course when you go through a teleporter.
6. Sink a putt: confetti bursts and falls for about 2 seconds.
7. Fans show soft round wind particles; tornadoes and pickups still look right.
8. HUD (top bar, controls, scoreboard): frosted violet glass, text readable over the bright sky, nothing overlapping on a phone.
9. Play maps 04 to 06 (Slime Springs, Cyclone Ring, Grand Finale): every putt feels possible but hard; no putt feels impossible or trivial.
10. Frame rate: smooth on your phone? If not, say so and I will reduce the blur, the shadow map size (2048) and the floating shapes (30).
11. Multiplayer (2+ devices): join, vote, play a round; other players' balls show a contact shadow and no trail.
12. Scorecard (P27): sink a putt and the cream paper card opens by itself; K or the Card button toggles it; it closes when the next putt starts; the leader is on top and highlighted; after the last putt the results screen shows the full card. On a phone the card scrolls sideways inside itself. Readable? Too big over the course?

## Spec v2 triage (done against the P23 build)
Facts found by keyword search of the game script (not a full read; re-check at the start of each phase):
- Stroke cap: `MAXS=8` exists and is also the default score for unfinished players (`q.s[0]??MAXS`).
- Timer: `LIMIT_BASE=120000` (120 s) and `LIMIT_MAX=300000` already exist from P4, so the 120 s minimum is partly there; what is missing is a per-map customizable limit and the timeout score rule.
- Par: only a map-level default `par:4` in `course(...)`; no per-putt par, no penalty value.
- Practice: only a "Solo practice" label for a room without a code; no mode selector, no map or putt picker.
- Camera: drag-orbit exists in the follow camera; its direction has not been audited. No wall fading or camera-to-ball raycast.
- Sizes and feel: ball `R=6`, turf friction `k=0.85`, sand 3.2; no separate power constant found by the search.
- No triangular wedge/bouncer element. Fans, tornadoes, ice, slime, jump pads and teleporters exist (P6, P17, P18).
- Existing power-ups are `rev`, `zany`, `mag`, `steady` (pickups); none of the five in the spec exist yet.
- Layout: each putt is a chamber group placed with `OFF(i)` inside one arena; no sky islands, tubes or curved ramps. Ramps (`rp`), platforms (`pl`) and pits (`pit`) exist.
- Art: no outline, toon, halftone or hatching code; P20 added a soft pastel look instead.
- Results: the room has `totals` and `last` (scores per player) but no scorecard table.
Spec section to phase map: 1 -> P24 to P27; 2 -> P28, P29; 3 -> P30, P31; 4 -> P32 to P38; 5 -> P39 to P44; 6 -> P45 to P48; 7 -> P49 to P51 (toon and halftone, sky clouds), P53 to P56 (weather themes, palettes, birds and sun flare); 8 -> P57 to P60 (menu, loading screen, menu sounds, turn cue and ball ring); audio for new mechanics -> P52; QA -> P61.
Art decision made: style B (JoJo) replaces pastel. Nothing blocks P24 onward.
Ordering notes: P33, P35, P38 and P44 re-solve maps and can take a long time (fast solve a few minutes per map, `--full` about 15 minutes per map); keep the ladder strictly increasing with `rank` after each.

## Overhaul spec v2 (added by the user, pasted verbatim below)
STATUS: complete (the user re-sent it with the end of section 7 and a new section 8), triaged into P24 to P61 (see the triage section above); nothing from it is built yet.
DECIDED: after a side-by-side preview the user chose the JoJo look (B) to replace the pastel look built in P20 to P22.
NEXT STEP: P28 is next; set it `[WORKING]` and start it when the user confirms (rule 2).

--- BEGIN SPEC ---
# System & Development Task: Putt Pals Game Overhaul

You are an expert 3D web game developer specializing in Three.js/WebGL, custom physics solvers, shader programming, audio managers, and UI/UX design. 

Please refactor and upgrade the core mechanics, level design, UI/UX, audio cues, visual styling, and power-up systems for "Putt Pals" based on the specification breakdown below. Ensure code modularity and maintain readability.

---

## 1. Core Mechanics, Rules, Scoring & Leaderboard
* **Stroke Limit Removal, Time Limits & Timeout Penalty:**
  * Remove the 8-stroke cap completely. Players can take unlimited strokes within a per-level countdown timer.
  * Time limit must be customizable per level with a strictly enforced minimum of 2 minutes (120 seconds).
  * **Timeout Penalty:** If a player fails to sink the ball before the timer expires, assign them a custom default score calculated for that specific putt (e.g., `Putt Par + Penalty Strokes`).
  * Transition to the next hole/putt only when all players sink their ball or time runs out for remaining players.
* **Course Structure:**
  * Each level consists of exactly 6 distinct holes/putts.
* **Mini-Golf Scorecard Leaderboard:**
  * Implement an authentic physical mini-golf scorecard leaderboard UI displayed post-hole or accessible in-game.
  * Sort players dynamically with the current leader/winner at the top.
  * Display usernames, individual hole scores, cumulative totals, and relevant stats in clean tabular order.

## 2. Practice Mode & Mode Selection
* **Practice Mode Integration:**
  * Add a dedicated "Practice Mode" option in the UI.
  * Allow players to freely select any specific Map OR isolate and replay a single specific hole/putt within any map for targeted practice.

## 3. Camera Controls & Occlusion Shader
* **Camera Inversion Fix:**
  * Invert the camera rotation/pan controls so panning and aiming feel intuitive and natural (fix the current inverted behavior).
* **Wall Transparency (Occlusion Handling):**
  * Implement camera-wall raycasting or custom shader transparency. When the camera positioning passes behind or inside a wall geometry, render that wall segment dynamically transparent/alpha-faded so the player's view, aim guide, and ball remain unobstructed.

## 4. Physics Engine & Interactivity Fine-Tuning
* **Ball & Hole Sizing:**
  * Reduce the radius of the golf ball and scale down the target hole diameter slightly to increase precision difficulty.
* **Surface & Wall Mechanics:**
  * Increase floor friction/slipperiness slightly as baseline physics (fast, smooth rolling without feeling uncontrollable like pure ice).
  * Strengthen aiming power and magnitude vectors.
* **Corner Bouncers:**
  * Place triangular corner wedges/reflectors on tight turn boundaries to help vector redirection when hit at clean angles.
* **Environmental Entities:**
  * **Fans:** Reduce fan bounding size, make visual nozzles compact, and apply a strong, highly directional impulse force vector along their axis.
  * **Vortexes:** Overhaul vortex mechanics to exert stronger, dynamic gravitational suction with variable pull forces based on distance to the center.

## 5. Course Architecture, Geometry & Par Difficulty
* **Island Structure & Separation:**
  * Ensure each of the 6 putts is rendered as its own distinct floating island platform high in the sky, completely separated from adjacent putts.
* **Boundary Walls:**
  * Place protective side walls along most section boundaries to keep balls from constantly falling off, EXCEPT at designated hazardous ramps, jump gaps, or shortcut edges.
* **3D Geometry & Verticality:**
  * Introduce complex 3D topology: curved elevation ramps, multi-tiered platforms, vertical drops, and enclosed transport tubes.
* **Difficulty Scaling & Hole-in-One Targets:**
  * Every hole must be mathematically playable to achieve Par based on map rating.
  * Design hole geometry such that Hole-in-One paths are scaled higher in difficulty relative to the map rating:
    * *Easy Map:* Medium difficulty Hole-in-One path.
    * *Medium Map:* Hard difficulty Hole-in-One path.
    * *Hard Map:* Very Hard difficulty Hole-in-One path.

## 6. Power-Up System Expansion
* Implement the following interactive power-up abilities (available across all maps, with higher spawn probabilities on thematic weather maps):
  1. **Lightning / Shockwave:** Creates a radial force pulse that pushes opponent balls away.
  2. **Wind Burst:** Triggered vector push to blow surrounding balls.
  3. **Tornado:** Localized vortex hazard.
  4. **Ice Trap:** Temporarily renders the current putt floor frictionless.
  5. **Slime Trap:** Applies a slime modifier to walls, removing bounciness.

## 7. Visual Art Style, Textures & Skybox Environments
* **Unified Art Style & Custom Shading:**
  * Apply a high-contrast, stylized 3D anime/cartoon aesthetic inspired by *JoJo's Bizarre Adventure* (bold black outlines, vibrant ink crosshatching/action shading, dynamic color palettes).
  * **Texture Mapping:** Ensure ALL textures across all 3D meshes (turf, side walls, ramps, tubes, obstacles, fans, vortexes, balls, and UI elements) feature this cartoon toon-shader/halftone texture style so the entire world feels visually cohesive.
* **Environment & Sky World:**
  * Set all courses floating high in the sky featuring animated volumetric/particle clouds, distant birds, and dynamic sun flare lighting.
* **Dynamic Weather Themes:**
  * **Storm / Rain Map:** Dynamic rain shaders, lightning visuals, higher probability for Lightning/Tornado power-up spawns.
  * **Snow Map:** Atmospheric snowfall, frosty terrain shaders, higher probability for Wind/Ice power-up spawns.
  * Assign distinct color palettes and custom thematic assets to each map.

## 8. AAA Video Game UI, Audio & Player Feedback
* **Main Menu & Panorama:**
  * Replace browser-style UI with a polished video game main menu.
  * Feature a grand, stylized title graphic matching the *JoJo* aesthetic.
  * Background features a continuous 3D rotating panorama showcasing various maps.
* **Loading Screen & Fun Facts:**
  * Design an immersive loading screen featuring a map panorama background and rotating fun facts/tips at the bottom.
* **Menu Navigation:**
  * Place distinct **"Solo"** and **"Friends"** action buttons cleanly in the bottom-left corner of the main menu.
  * Add crisp, satisfying audio sound effects for all button hovers, clicks, and menu transitions.
* **In-Game Turn Cues & Audio:**
  * **Turn-Ready Audio Cue:** Play a distinct audio sound effect when the player's ball comes to a complete enough stop and they are legally cleared to take their next stroke.
  * **Active Ball Indicator:** Render a glowing, stylized indicator circle directly beneath the player's controlled ball to easily distinguish it from others.

---
--- END SPEC (complete; the user re-sent it with the missing end of section 7 and a new section 8) ---
