# Putt Planet plan

Product direction, technology choices and remaining stages. Live work is tracked in GitHub issues (docs/ISSUES.md); TASKS.md is the roadmap snapshot and PROJECT_STATUS.md records the accepted state of main.

Naming: the game is now called **Putt Planet** (owner vision, 2026-11-03). The repository, package and hosted names still say Putt Pals; renaming them is a separate task (VIS-R) and is not implied by this document.

## Product direction

Putt Planet is a colourful, fast, high-energy 3D multiplayer mini-golf game for the web. Players explore themed courses across planets and moons, alone or with friends, and the whole experience feels connected: the planet in the menu is the world you travel to, its regions contain playable courses, and the golf balls waiting in the plane become the players on the course. It mixes over-the-top arcade party chaos with skill-based putting: instantly easy to join with friends, with real mastery for competitive players. Confirmed scope: private friend rooms, desktop browsers, a normal hosted web build (no single-file or offline distribution, no native packaging, no public matchmaking, no accounts).

### Journey and menus (owner vision, 2026-11-03)

- **Loading screen.** The Putt Planet title and loading text over the curved horizon of a planet; golf balls occasionally fly across the sky. The planet shows recognisable regions, cities and landmarks (on Gaia: snowy poles, desert and tropical bands near the middle, other biomes between).
- **Main menu.** Three primary buttons: **Solo**, **Party** and **Custom**. A smaller but noticeable **Settings** button stays easy to find. The game version is shown bottom-left. Playful, polished and animated without making menus hard to navigate.
- **Solo.** Choose **Casual** (one map) or **Tournament** (**3, 5 or 7 maps**, cumulative scoring), then a destination (**Gaia, Ares or Luna**), then the opening region and map. In a tournament the player picks the next map after each finished map until the series length is reached.
- **Party.** **Host** creates a party; **Join** takes a party code in a text box with a Join button beside it. Players choose their ball colour before entering the lobby, the host included. A party code exists **only after the host creates the lobby**; opening the Party menu alone creates no room and no code. The lobby shows everyone's balls together in a plane, with their chosen colours.
- **Custom.** An attractive, interactive gameplay-rules editor. After adjusting settings the player chooses **Play Solo** or **Host Party** using those rules. See "Custom rules".
- **Launch and arrival.** After the destination and map are settled, a launch countdown runs. In Solo one golf ball jumps from the plane; in Party the group jumps together. The skydive transitions into a cloud loading sequence (clouds whizzing past the camera) that continues while the map loads. When loading finishes: the camera emerges from the clouds, a wide establishing shot reveals the whole map and its surroundings, the camera moves toward the opening hole, then zooms smoothly into the player's ball camera. The gameplay countdown begins only after every active player has finished the arrival sequence. The same arrival introduces every newly selected map, repeat maps included. Loading and cinematic time never consume the hole's gameplay timer.

### Worlds and gravity

A tournament takes place on one world. Each destination has its own visual identity, course collection, environment and gravity, and courses are designed around that world's physics.

| Destination | Identity | Gravity | Regions and environments |
| --- | --- | --- | --- |
| **Gaia** | Lively, Earth-inspired planet | Standard | Snow, desert, tropical, cities and further biomes |
| **Ares** | Rugged, Mars-inspired planet | Lower than Gaia | Hot, cold and temperate regions with distinct terrain |
| **Luna** | Gaia's barren moon | Lower than Ares | Craters, dust fields, rocky landscapes and lunar installations |

- Gravity must noticeably change shots, jumps, airtime and strategy. Today `gravity` in `src/shared/tuning.js` is one number (700 units/s^2); it becomes a per-world profile with Gaia as the shipped default, and the numbers for Ares and Luna are set by owner playtesting (not yet decided).
- Players choose maps through a view of the chosen world and its regions. Each region holds several individually named courses (for example the snowy trio Frostbite Falls, Glacier Glide and Aurora Ridge). Regions are places with their own identity, never one course recoloured.
- Suggested Gaia biomes: polar and alpine, desert, tropical, temperate forest, wetlands and volcanic, with cities and settlements inside them.
- **Environmental effects.** The core power-up set is the same everywhere. The precipitation power-up gives rain on warm Gaia maps and snow on cold Gaia maps, and both make the course slippery (gameplay). On Ares the equivalent effect is **wind** and on Luna it is **dust and solar activity**; these Ares and Luna effects are **visual only** (owner, 2026-11-03) and add atmosphere without changing physics. Effects must clearly communicate what is happening.

### Look and feel

- **Bold comic style.** Thick black outlines, action crosshatching, saturated colour and caption-box UI. The inspiration is a comic look; all lettering, characters, logos and art are original and nothing is copied from existing works.
- **Sky and planets.** Dynamic skies, birds and sun flares remain. Whether individual holes keep the floating-island-in-the-clouds layout on planet surfaces, or become ground-based planet courses, is an open owner decision (see "Open decisions" below); until then K1a keeps its current scope.
- **Atmosphere.** Courses carry their own weather, from rainstorms with lightning to snowy peaks, dust and wind. This ambient weather is visual only and is separate from the gameplay weather power-ups below.
- **Console feel.** Snappy arcade menus, punchy audio and glowing player markers, so it plays like a premium game rather than a web page.

### Courses

- **True 3D verticality.** Curving ramps, multi-tier drops and pneumatic tubes that fling balls from island to island.
- **Truly 3D levels, not a 2D map with ramps.** Today a course stores one floor height per (x, y), so nothing can pass over or under anything else. Levels should use the whole volume: bridges, overpasses, spirals and stacked tiers over the same footprint, walls and ceilings, drops between levels, with curves and ramps joining them. This needs a volumetric course model (K0) before the course redesign (K1a-K1d).
- **Water and wind in the levels.** Water bodies (splash and reset to the last safe spot with the stroke penalty, optional shallow water that slows the ball and currents that carry it) and wind zones (steady, gusting and updraft fields that push airborne balls most, with visible streamlines) become course elements, tasks W2 and W3. They are distinct from the existing `pit`, fans and tornadoes and from the timed Wind hazard power-up (G1f).
- **No clipping.** Objects must never visibly or physically intersect. A geometry-integrity validator (CL1) rejects overlapping solids and too-tight clearances on every course, and the renderer removes z-fighting, ball and trail poke-through and camera clipping (CL2). Every new course element must pass the validator.
- **Risk versus reward.** Guard walls keep ordinary shots in play; deliberate drop-offs tempt bold players into risky shortcuts, which may include a hole-in-one on some putts. A hole-in-one is an optional reward, never a requirement.
- **Par, not hole-in-one, defines a playable hole.** Every putt must be completable within its par; par is 2 to 6 strokes per putt. Courses can therefore be longer, multi-level and more complicated.
- **Trick shots.** Corner bouncers and interactive surfaces reward bank shots and unexpected angles.
- **Six holes per map.** A map is six holes (putts) on one course, as defined previously. A region holds several named maps.

#### Airborne balls and 3D obstacles (owner, 2026-11-03)

Maps are 3D, with ramps and other obstacles that lift the ball, and the Chip In power-up also launches it. The owner accepts the Bumper and Orbital Bumper force and designs as they are, but airborne play is where they get tricky. Everything that touches the ball must define what it does to an airborne ball, not only a rolling one:

- Bumpers and orbital bumpers need a volume (height as well as radius): which airborne heights they affect, how the bounce direction and kick apply to a ball moving up or down, and how the orbital pull acts on vertical velocity. Their rolling-ball force and look are unchanged.
- Ramps, drops, tubes, fans, wind zones, water and the cup must each state airborne behaviour, including landing, clearance over walls and ceilings, and what happens when an airborne ball passes through a deployed object.
- Gravity differs per world, so airtime, arcs and the apex a chip shot reaches differ per world. The solver and every test chamber must run per world.
- Simulation coordinates already keep z vertical; the deployed-object contract (`x`, `y` placement) needs a vertical extent before it is accepted (see G1e in TASKS.md).

### Game modes

| Mode | Rules |
| --- | --- |
| Party Circuit and Tournaments | Group matches against the clock with unlimited strokes, live scorecards and a crowned champion. Tournaments run **3, 5 or 7 maps** on one world (changed from 3, 6 or 9 on 2026-11-03). |
| Putt Pong | Turn-based 1v1 cup pong with chip shots: a 10-cup rack at each end, bonus balls and a redemption shot. Details below. |
| No Power-Ups (Pure Mini-Golf) | Competitive mode with no power-ups: line, angle and touch only. |
| Practice Suite | Relaxed solo play: explore any course or drill one hole repeatedly. |

### Power-ups

- Floating boxes sit on fairways, tight curves and high-risk shortcut lines; rolling through one grants an ability.
- Players hold up to 3 power-ups and choose before a stroke, by clicking a slot or pressing 1, 2 or 3.
- Power-ups stack on one shot (for example Steady Aim with Chip In or Ghost Ball).
- Tournaments carry unused power-ups across holes and rounds; single-play games reset inventory between games.
- Solo and Practice draw only from self-enhancing power-ups. PvP sabotage, targeted strikes and opponent disruption are removed from their pool.

| Group | Power-ups |
| --- | --- |
| Player advantages | Chip In (lofted shot over walls and hazards), Steady Aim (no aim sway or power oscillation for one turn), Hole Magnet (pulls the ball into the cup when close), Ghost Ball (passes through walls and obstacles for one turn) |
| Aim sabotage | 360° Aim (opponent's aim indicator spins continuously), 180° Aim (sweeps back and forth) |
| Ball modifiers | Love Ball (pulls nearby opponent balls in), Hate Ball (repels them), Sticky Ball (sticks to the first wall touched), Small Ball and Tall Ball (resize for one shot) |
| Deployables | Bumper (pinball bouncer, gone after 3 impacts), Orbital Bumper (same, plus a visible gravity ring that bends nearby shots) |
| Weather and hazards | Rain (less friction), Snow (more friction), Lightning (strikes a chosen player's ball in a random direction), Wind (global gust in a chosen direction), Tornado (roaming cyclone that flings balls), Hurricane (roaming vortex that pulls balls in) |

### Player expression

Collectible ball skins and trail skins (speed lines, elemental auras, comic sparks), plus custom hole-in-one celebrations with banners, fanfare and screen effects.

**Ball colours.** At least **21 rainbow colours**: light, standard and dark variations of red, orange, yellow, green, blue, indigo and violet. Further colours: white, black, gray and brown, with room for pink, cyan, gold and silver. The picker shows the real ball appearance and makes the selection obvious. Colours are **unique within a party**; occupied colours are marked unavailable, and a disconnected player's colour stays reserved for their return. Today's palette has 8 colours, so this changes the shared player and protocol contracts (VIS-C).

### Voting and match flow (owner, 2026-11-03)

- When the host presses **Play** in a party, the party votes on: (1) Casual or Tournament; (2) 3, 5 or 7 maps, if Tournament wins; (3) Gaia, Ares or Luna; (4) the opening region and map. A launch countdown follows. In a tournament players vote for the next map after each finished map; scores carry forward and final results close the series.
- **Ties.** A tied map vote picks randomly from the tied maps only. Other ties (format, length, destination) use the same picker. An animated random picker cycles through the tied options and reveals the winner; every player sees the same animation and result, so the result is chosen once by the room and broadcast.
- **Repeat maps are allowed.** Played maps stay selectable; a repeat is introduced by the same arrival sequence.
- Gameplay stays free-for-all and simultaneous with a per-hole timer (see "Room and scoring rules").

### Disconnects, rejoining and late arrivals (owner, 2026-11-03)

- A disconnected player never holds up the match: any action that needs them is skipped while the others continue. Their identity, colour, score and progress stay reserved in the lobby.
- **Rejoin.** If the player returns to the same lobby with the same username before the current hole's timer expires and before the hole closes, they resume from their saved position with their stroke count and remaining time. If the hole closes first, they receive a missed-hole penalty, and again for each further missed hole.
- **Late arrival.** If the current hole is open and its timer has not expired, a late arrival enters it with the time remaining. They receive penalty strokes for every earlier hole they missed. If the hole has closed, they start at the next hole.
- **Missing play never improves a score.** A missed hole scores the configured maximum-hole score plus the missed-hole penalty, never zero strokes. The scorecard marks these penalties clearly.
- **Identity.** The username is what players see. A saved reconnect identity (a local token created on join, with no account or sign-in) proves ownership of the player slot so nobody else can take it, and rejoining restores the original player record.

### Custom rules

Custom opens a gameplay rules editor built from the existing validated gameplay configuration (`src/shared/tuning.js`, documented in docs/TUNING.md; this is the verified source, not an `inputs.md`). Numeric settings are labelled sliders with visible values; other settings are toggles and selectors. Likely categories: ball physics, shot power, aiming controls, timers, power-ups and match rules, limited to what the game supports. Players can see current values, adjust within supported limits, reset one setting and restore all defaults. Settings carry the same precision a developer has, in player-friendly language. Rules chosen for a party are fixed when the lobby is created or the match starts and are never changed mid-match; every participant must be on the same values. Secrets, authentication and service quotas are never exposed. The developer tuning panel (DX2) remains separate and development-only.

## Implementation snapshot

The implementation paragraphs and stage statuses below are historical notes from the supplied plan. They have not been freshly checked against GitHub or runtime code. Some lag PROJECT_STATUS.md (including No Power-Ups, cosmetics, catalog power-ups and the eight-player server cap). Read the supplied PROJECT_STATUS.md for the later documented snapshot and verify code/live issues before taking action. This warning does not change the product vision or confirmed target rules.

Built and on main: Standard and Tournament 3/6/9 modes with voting, practice and single-putt replay, timed unlimited strokes with timeout scoring, scorecards, spectator mode, three cameras with wall fading, a 3-slot inventory (keys 1-3) holding Hole Magnet and Steady Aim plus the legacy Rewind, Reversiball and Zanyball (retired by decision), `?` pickup blocks, fans, tornadoes, jump pads, portals, water, sand, ice and slime, procedural audio, the toon comic look, sky world, per-map palettes, ambient weather visuals and the comic HUD. Online rooms now use the server-owned WebSocket service (N4D #122 and N4E #123 merged); N4F coverage/quota evidence is merged (PR #129); N4G preview preparation is restored on main (PR #141). Hosted recovery and rollback acceptance passed on 2026-11-02; the discovered empty-room admission fix and deferred separate-network check remain.

Not built: Putt Pong, the No Power-Ups mode, the power-ups listed above other than Hole Magnet and Steady Aim, gameplay weather, ramps, drops and tubes, floating-island course geometry, corner bouncers, skins and ace celebrations. The task breakdown is in TASKS.md.

### Room and scoring rules (owner decisions, 2026-10-29)

- Up to **8 players** per room, **3 inventory slots**.
- **Free-for-all, everyone at once.** Every player is on the same course and aims for the same hole in the current putt, all putting simultaneously with no turn order. A player who finishes early waits (spectating) for the others, even if one of them uses the whole time limit; the room moves to the next putt only when every player has finished (sunk or timed out), and everyone moves on together.
- **Win condition:** strokes minus par. The player with the lowest total relative to par after the 6 putts of a level wins. A casual game is one level (map); a tournament runs 3, 5 or 7 levels on one world and the lowest total across them wins. Missed holes score the configured maximum-hole score plus a missed-hole penalty (see "Disconnects, rejoining and late arrivals"). The 3, 5, 7 lengths replace 3, 6, 9 (owner, 2026-11-03).
- **Skins are simply selectable** for now (no unlock progression); the choice is stored locally in the browser.
- **Legacy power-ups retired:** Rewind, Reversiball and Zanyball are removed in favor of the catalog above.
- **Solo pool** (Solo and Practice): the self-enhancing power-ups only: Chip In, Steady Aim, Hole Magnet, Ghost Ball, Small Ball, Tall Ball and Sticky Ball. Bumpers and the global weather items are excluded because they are course hazards that exist to affect other players.
- **Sequencing:** the framework and the power-ups that leave default trajectories unchanged (G1a-G1f, GM1, F1, C3) may start now. Physics and course changes follow the course and physics rules below (S3, then SV1, then G1g and K1).

Code today versus these rules: the 8-player cap, the 3 slots, free-for-all simultaneous play and advancing together already exist and stay (the cap of 8 players and 3 power-up slots is reconfirmed on 2026-11-03; unused power-ups carry over between maps in a tournament). The 30-colour palette, unique per room (VIS-C, PR #171), and 3/5/7-map tournaments (VIS-T, PR #159) replaced the old 8-colour palette and 3/6/9 tournaments on main in November 2026. Late joiners are spectators for the whole current map in `src/session/README.md`; the new late-arrival rules replace that (VIS-D). C3 (PR #133) aligned the N4 server-room contract with eight players and added strokes-minus-par results.

### Course and physics rules (owner decisions, 2026-10-29)

- **Par up to 6 per putt.** Every putt must be possible in par (2 to 6 strokes). The old rule that every putt has a robust single-shot hole-in-one is removed, in exchange for 3D courses and more complicated level design.
- **Less strict physics.** The simulation should be more forgiving to play. The owner named the problems: too much friction on turf (it should feel like smooth pastel, not grass), ice that should have almost none, and cups that are hard to sink (the fillet below). Further candidates, to be judged in playtests after those: the cup-capture window (tightened by S2), aim sway and spread, wall rebound energy, resting thresholds and the shot-accuracy margins the solver demands. A retune changes trajectories, so it ships as its own deliberate behavior change (S3) with the owner playtesting, and recorded difficulty is redone afterwards.
- **Smoother, slippier surfaces.** Today the ball loses speed from three sources on turf: an exponential drag (`TURF_FRICTION` 0.75 in `src/shared/constants.js`, scaled up to 15% by speed), a constant "Coulomb" drag of 30 (hard-coded in `src/simulation/physics.js`) and the slope terms. That reads as grass. The target feel is a smooth pastel putting surface: noticeably lower turf drag so putts roll out longer, and ice with almost no friction (currently exponential 0.12 and constant 4) so the ball keeps gliding until it meets a wall. Starting points to playtest, not final numbers: turf exponential about 0.5 with constant drag about 15, ice exponential about 0.02 with constant drag 0. Sand and slime keep their roles but are retuned relative to the new turf. Lower friction makes shots travel further, so shot power, aim sway and wall behavior are tuned together.
- **One tuning file.** Every gameplay number a developer may want to change lives in a single, documented, validated tuning module (surface friction per type, constant drag, shot power, gravity, cup size and depth, fillet shape, bounce energy, sway period and spread, drag-to-power mapping, power-up durations and strengths, timers and limits), with the shipped defaults in one place and no magic numbers left in the physics. Changing a value is a one-line edit; tests read the same file so a retune updates expectations deliberately. This is task T2.
- **Easier cups: a downward fillet.** The edge of every hole gets a smooth rounded slope down into the cup, so balls that arrive near the rim are guided in instead of skating across it. Physics and the rim mesh must share one profile. It must work with the cup-capture rules from S2 (slow centred balls fall, fast or airborne balls can cross, grazes can still lip out) and is part of the S3 retune.
- **Aim guide: a simple arrow.** The indicator becomes an arrow showing direction and power, not a prediction of where the ball ends up. Its length grows in direct proportion to the pull from zero, with no minimum length, so a small pull gives a short arrow. As power rises the aim gets less straight and the arrow sways back and forth, as the current deterministic sway already does (releasing at a zero crossing is a dead-straight shot). The drag-to-power mapping should feel proportional and less sensitive. The spread cone is removed; only the arrow remains. This is task U2.
- **Solver and acceptance change.** Course acceptance becomes "a robust route exists within par", proven by a multi-stroke solver (SV1) that replaces the single-shot hole-in-one search, the hit-count ladder and the hole-in-one-based par defaults. Mechanic test chambers (fan, portal, jump pad, tornado) may stay single-shot proofs of one element.
- **Order:** CL1 and CL2 can start now; S3 (forgiving physics), then SV1 (par solver and difficulty measure), then the course work (G1g, K1), which no longer waits for Q1 or N4. Q1 then verifies par-achievability under the final physics instead of hole-in-one robustness.

### Putt Pong

Putt Pong is not played like the main game. It is turn-based and works like cup pong, played with chip shots.

**1v1 only.** The field has a rack of **10 cups** (four tiers: 4, 3, 2, 1) at each end, one rack per player. The first player chips toward the opposing end, then the other player takes a turn, and turns keep alternating.

- **Eliminating cups.** A ball that lands in a cup eliminates that cup; which cup is decided by where the ball lands.
- **Bonus balls.** A turn is two balls. Sinking two in a row earns two extra balls, and the shooter keeps going.
- **Round end and redemption.** A round ends when all of one player's cups are gone. That player then gets a redemption: one ball, and every ball that goes in earns an extra ball. The redemption ends on a miss.
- **Next round.** If the redeeming player eliminates every remaining cup of the opponent, both racks reset and a new round starts from the beginning. This repeats.
- **Winner.** The game ends when a round ends and the player with no cups left fails the redemption; the player who eliminated their cups wins.

Assumptions confirmed by the owner (2026-10-29): "the other person" in the redemption rule means the player who lost all their cups (as in cup pong); two balls per normal turn; the starting player alternates each round.

**More than two players is deferred.** The owner will brainstorm it later, once the game is fully developed. Do not build team or free-for-all variants now; only avoid hard-coding "exactly two" into the session model where that costs nothing.

**Engineering consequences.** Putt Pong needs: a lofted chip shot as its base shot (the Chip In mechanic, G1b); courses with many cups (the current course schema and cup physics handle one hole per putt, so cups become a list with per-cup enabled state, elimination events and a renderer cover or removal effect); a turn-based phase in the session machine and server contract, where main-game rooms are simultaneous; and a field layout with rack geometry at each end. No power-ups by default.

### Open decisions

Raised by the 2026-11-03 vision; nothing below is decided or scheduled.

- Skins unlocking through play or an account (not needed now).
- **Island versus planet-surface courses.** The current plan has each putt on an isolated floating island (K1a). The vision places courses in regions on planets. Keep islands, move to ground-based courses, or mix.
- **Where Practice, Putt Pong and No Power-Ups live in the menu.** The vision names only Solo, Party and Custom. Likely homes: No Power-Ups as a Custom rule (GM1 flag), Practice under Solo, Putt Pong a Party/Custom option. Needs the owner.
- **Gravity numbers** for Gaia, Ares and Luna, and whether gravity is a Custom setting.
- **Missed-hole numbers:** the maximum-hole score and the missed-hole penalty (tuning fields to be added) and how a rejoining player's hole timer is held while they are away.
- **Course content volume.** How many regions and named maps each world ships with first, and how many of the 22 existing maps are kept, moved to a world or retired.
- **Ares and Luna environment power-up.** Their environment is visual only; whether the weather power-up still exists there as a cosmetic item, or is replaced, is not stated.
- **Late join and rejoin across a tournament:** how a late arrival's penalties are scored in a tournament total.
- **Product rename** from Putt Pals to Putt Planet in code, package and hosting (VIS-R).

## Technology

| Responsibility | Choice (installed) |
| --- | --- |
| Build and dev | Vite 8, npm with package-lock.json, plain JavaScript ES modules |
| Rendering | Three.js 0.186.1, direct (no scene abstraction) |
| Menus and HUD | React 19 with CSS Modules; physics ticks and mesh transforms stay out of React state |
| Room lifecycle | XState 5 |
| Networking today | Modular app: WebSockets to a server-owned room (Cloudflare Worker, SQLite Durable Object; N4 adoption merged, preview deployment and compatible-code-update recovery verified), client-trusted ball physics. Legacy `putt-pals.html`: PeerJS 1.5.4 |
| Networking target | Deployed Cloudflare rooms accepted on separate networks (N4F/N4G) |
| Audio | Procedural WebAudio synthesis, no audio files |
| Tests | Node test scripts, jsdom smoke tests, Playwright (Chromium, Firefox, WebKit) |
| CI | GitHub Actions: baseline-ci and browser-ci |

TypeScript, Zod, Vitest, ESLint and Prettier were considered and are not adopted. Add one only with a concrete need, as a separate reviewed change. Avoid accounts, matchmaking, Redux, a monorepo toolchain and a general ECS unless a requirement demands them. Rapier was evaluated (docs/reviews/P1_RAPIER.md) and production adoption is deferred: it did not simplify the game and would change shot trajectories and difficulty.

## Stages

| Stage | State |
| --- | --- |
| M0 Baseline: inventory, solver launch fix, parity fixtures | Done |
| M1 Build and module extraction: Vite, shared contracts, headless simulation, adapters | Done |
| M2 Course data and validation: 22 validated courses, CLI imports the real simulation | Done |
| M3 UI and lifecycle: React screens, XState room lifecycle, input adapter, modular app | Done |
| M4 Server-owned rooms (N4, #65): contracts, local runtime, room coordination, durable recovery and browser adoption are merged; N4F coverage/quota evidence and N4G preview preparation are on main; hosted recovery/rollback passed; admission fix integration and deferred separate-network acceptance remain | In progress |
| M5 Three.js upgrade and desktop rendering validation | Done |
| Look and feel (V1a-V1d): toon style, sky world, palettes, ambient weather, comic HUD | Done |
| M6 Release readiness (Q1 #18): par-achievability check under final physics, production-like preview, rollback, manual playtests | Blocked on N4 |
| Vision features (G1, K1, M1 and the new tasks in TASKS.md) | Not started; start order in the owner decisions above |
| Putt Planet vision (VIS-W worlds and gravity, VIS-C colours, VIS-T tournament length, VIS-V voting, VIS-D disconnect and rejoin, VIS-A arrival, VIS-M menus, VIS-U custom rules, VIS-G regions, VIS-E environment, VIS-R rename) | Defined 2026-11-03; not started; see TASKS.md and Open decisions |

M4 exit gate: four-player real-browser games across separate networks through an authorized deployed Worker; controller departure, guest recovery after hibernation or restart, forged, stale and versioned messages, bounded queues and quota failure all tested; deployment and rollback documented. Contracts and lifecycle defaults (immediate controller succession, 30-second reconnect grace, 15-minute empty retention) are in docs/networking/SERVER_ROOMS.md; local setup is in docs/networking/CLOUDFLARE_SETUP.md. The browser stays trusted for ball physics; the server owns room coordination. N3 (managed TURN) is paused as an alternative, not a prerequisite.

M6 exit gate: a fresh checkout has documented setup, test and build commands; a production-like preview passes; release and rollback instructions are complete. Publishing to production and paid service provisioning need separate owner authorization. Because the physics will be retuned (S3) and acceptance changes from hole-in-one robustness to par achievability (SV1), Q1 verifies that every putt has a robust route within its par under the final physics, instead of refreshing the old hole-in-one counts.

## Working rules

Preserve the product vision and confirmed gameplay decisions in this document.

AGENTS.md defines operating rules. docs/GITHUB_WORKFLOW.md defines integration.
Use one short-lived task branch per coherent feature, fix or cleanup, created from
updated main. Do not create a branch, worktree or issue for every small edit.
Coordinate overlapping edits.

Direct implementation requests authorize scoped local commits. Remote writes,
merges, deployment and public publishing follow AGENTS.md's permission boundaries.

Claude leads implementation and verification. Gemini Pro handles worthwhile
routine drafts, summaries and text processing; Claude verifies and applies them.
Gemini does not concurrently edit the checkout.

Extend the existing validated configuration system. Reuse existing settings,
preserve defaults during extraction and identify intentional retuning separately.
Provide a development-only tuning panel with relevant sliders, toggles, selectors,
reset and validated import/export. For appearance or feel changes, present a
local browser preview before owner acceptance. Persist approved settings and
rerun affected checks.

Retire legacy runnable HTML/tooling after migrating required build and test
dependencies. The modular application is the sole supported implementation.

Overnight work requires a fresh explicit user start command, bounded scope,
runtime limit and verified private Google Drive recovery backup. No scheduled
starts, remote writes, pushes, merges, deployments or automatic restarts.

These decisions do not imply that pending tooling has been implemented.
