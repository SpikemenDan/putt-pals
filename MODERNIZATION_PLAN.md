# Putt Pals plan

Product direction, technology choices and remaining stages. Live work is tracked in GitHub issues (docs/ISSUES.md); TASKS.md is the roadmap snapshot and PROJECT_STATUS.md records the accepted state of main.

## Product direction

Putt Pals is a fast, high-energy 3D multiplayer mini-golf game for the web. It mixes over-the-top arcade party chaos with skill-based putting: instantly easy to join with friends, with real mastery for competitive players. Confirmed scope: private friend rooms, desktop browsers, a normal hosted web build (no single-file or offline distribution, no native packaging).

### Look and feel

- **Bold comic style.** Thick black outlines, action crosshatching, saturated colour and caption-box UI. The inspiration is a comic look; all lettering, characters, logos and art are original and nothing is copied from existing works.
- **Sky archipelago.** Every putt is an isolated floating island in the clouds, with dynamic skies, birds and sun flares.
- **Atmosphere.** Courses carry their own weather, from rainstorms with lightning to snowy peaks. This ambient weather is visual only and is separate from the gameplay weather power-ups below.
- **Console feel.** Snappy arcade menus, punchy audio and glowing player markers, so it plays like a premium game rather than a web page.

### Courses

- **True 3D verticality.** Curving ramps, multi-tier drops and pneumatic tubes that fling balls from island to island.
- **Risk versus reward.** Guard walls keep ordinary shots in play; deliberate drop-offs tempt bold players into risky shortcuts, which may include a hole-in-one on some putts. A hole-in-one is an optional reward, never a requirement.
- **Par, not hole-in-one, defines a playable hole.** Every putt must be completable within its par; par is 2 to 6 strokes per putt. Courses can therefore be longer, multi-level and more complicated.
- **Trick shots.** Corner bouncers and interactive surfaces reward bank shots and unexpected angles.

### Game modes

| Mode | Rules |
| --- | --- |
| Party Circuit and Tournaments | Group matches against the clock with unlimited strokes, live scorecards and a crowned champion. Tournaments run 3, 6 or 9 maps. |
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

## What exists today

Built and on main: Standard and Tournament 3/6/9 modes with voting, practice and single-putt replay, timed unlimited strokes with timeout scoring, scorecards, spectator mode, three cameras with wall fading, a 3-slot inventory (keys 1-3) holding Hole Magnet and Steady Aim plus the legacy Rewind, Reversiball and Zanyball (retired by decision), `?` pickup blocks, fans, tornadoes, jump pads, portals, water, sand, ice and slime, procedural audio, the toon comic look, sky world, per-map palettes, ambient weather visuals and the comic HUD. Online rooms still use PeerJS; the server-owned room migration (N4) is in progress.

Not built: Putt Pong, the No Power-Ups mode, the power-ups listed above other than Hole Magnet and Steady Aim, gameplay weather, ramps, drops and tubes, floating-island course geometry, corner bouncers, skins and ace celebrations. The task breakdown is in TASKS.md.

### Room and scoring rules (owner decisions, 2026-10-29)

- Up to **8 players** per room, **3 inventory slots**.
- **Free-for-all, everyone at once.** Every player is on the same course and aims for the same hole in the current putt, all putting simultaneously with no turn order. A player who finishes early waits (spectating) for the others, even if one of them uses the whole time limit; the room moves to the next putt only when every player has finished (sunk or timed out), and everyone moves on together.
- **Win condition:** strokes minus par. The player with the lowest total relative to par after the 6 putts of a level wins. A casual game is one level; a tournament runs 3, 6 or 9 levels and the lowest total across them wins.
- **Skins are simply selectable** for now (no unlock progression); the choice is stored locally in the browser.
- **Legacy power-ups retired:** Rewind, Reversiball and Zanyball are removed in favor of the catalog above.
- **Solo pool** (Solo and Practice): the self-enhancing power-ups only: Chip In, Steady Aim, Hole Magnet, Ghost Ball, Small Ball, Tall Ball and Sticky Ball. Bumpers and the global weather items are excluded because they are course hazards that exist to affect other players.
- **Sequencing:** the framework and the power-ups that leave default trajectories unchanged (G1a-G1f, GM1, F1, C3) may start now. Physics and course changes follow the course and physics rules below (S3, then SV1, then G1g and K1).

Code today versus these rules: the 8-player cap, the 8-colour palette, the 3 slots, free-for-all simultaneous play, advancing together and the 3/6/9-level tournaments already exist. Two gaps remain, both in task C3: the N4 server-room contract is capped at 4 members and must be raised to 8, and ranking is by total strokes with hole-in-ones breaking ties. Because every player plays the same pars, that orders players the same as strokes minus par and the scorecard already shows the relative score, but results and tournament standings should lead with the relative-to-par figure computed from completed putts.

### Course and physics rules (owner decisions, 2026-10-29)

- **Par up to 6 per putt.** Every putt must be possible in par (2 to 6 strokes). The old rule that every putt has a robust single-shot hole-in-one is removed, in exchange for 3D courses and more complicated level design.
- **Less strict physics.** The simulation should be more forgiving to play. Which parts feel too strict has not been specified yet; the candidates are the cup-capture window (tightened by S2), aim sway and spread, wall rebound energy, resting thresholds and the shot-accuracy margins the solver demands. A retune changes trajectories, so it ships as its own deliberate behavior change (S3) with the owner playtesting, and recorded difficulty is redone afterwards.
- **Smoother, slippier surfaces.** Today the ball loses speed from three sources on turf: an exponential drag (`TURF_FRICTION` 0.75 in `src/shared/constants.js`, scaled up to 15% by speed), a constant "Coulomb" drag of 30 (hard-coded in `src/simulation/physics.js`) and the slope terms. That reads as grass. The target feel is a smooth pastel putting surface: noticeably lower turf drag so putts roll out longer, and ice with almost no friction (currently exponential 0.12 and constant 4) so the ball keeps gliding until it meets a wall. Starting points to playtest, not final numbers: turf exponential about 0.5 with constant drag about 15, ice exponential about 0.02 with constant drag 0. Sand and slime keep their roles but are retuned relative to the new turf. Lower friction makes shots travel further, so shot power, aim sway and wall behavior are tuned together.
- **One tuning file.** Every gameplay number a developer may want to change lives in a single, documented, validated tuning module (surface friction per type, constant drag, shot power, gravity, cup size and depth, fillet shape, bounce energy, sway period and spread, drag-to-power mapping, power-up durations and strengths, timers and limits), with the shipped defaults in one place and no magic numbers left in the physics. Changing a value is a one-line edit; tests read the same file so a retune updates expectations deliberately. This is task T2.
- **Easier cups: a downward fillet.** The edge of every hole gets a smooth rounded slope down into the cup, so balls that arrive near the rim are guided in instead of skating across it. Physics and the rim mesh must share one profile. It must work with the cup-capture rules from S2 (slow centred balls fall, fast or airborne balls can cross, grazes can still lip out) and is part of the S3 retune.
- **Aim guide: a simple arrow.** The indicator becomes an arrow showing direction and power, not a prediction of where the ball ends up. Its length grows in direct proportion to the pull from zero, with no minimum length, so a small pull gives a short arrow. As power rises the aim gets less straight and the arrow sways back and forth, as the current deterministic sway already does (releasing at a zero crossing is a dead-straight shot). The drag-to-power mapping should feel proportional and less sensitive. This is task U2.
- **Solver and acceptance change.** Course acceptance becomes "a robust route exists within par", proven by a multi-stroke solver (SV1) that replaces the single-shot hole-in-one search, the hit-count ladder and the hole-in-one-based par defaults. Mechanic test chambers (fan, portal, jump pad, tornado) may stay single-shot proofs of one element.
- **Order:** S3 (forgiving physics), then SV1 (par solver and difficulty measure), then the course work (G1g, K1), which no longer waits for Q1 or N4. Q1 then verifies par-achievability under the final physics instead of hole-in-one robustness.

### Putt Pong

Putt Pong is not played like the main game. It is turn-based and works like cup pong, played with chip shots.

**1v1 only.** The field has a rack of **10 cups** (four tiers: 4, 3, 2, 1) at each end, one rack per player. The first player chips toward the opposing end, then the other player takes a turn, and turns keep alternating.

- **Eliminating cups.** A ball that lands in a cup eliminates that cup; which cup is decided by where the ball lands.
- **Bonus balls.** A turn is two balls. Sinking two in a row earns two extra balls, and the shooter keeps going.
- **Round end and redemption.** A round ends when all of one player's cups are gone. That player then gets a redemption: one ball, and every ball that goes in earns an extra ball. The redemption ends on a miss.
- **Next round.** If the redeeming player eliminates every remaining cup of the opponent, both racks reset and a new round starts from the beginning. This repeats.
- **Winner.** The game ends when a round ends and the player with no cups left fails the redemption; the player who eliminated their cups wins.

Assumptions to confirm: "the other person" in the redemption rule means the player who lost all their cups (as in cup pong); two balls per normal turn; the starting player alternates each round.

**More than two players is deferred.** The owner will brainstorm it later, once the game is fully developed. Do not build team or free-for-all variants now; only avoid hard-coding "exactly two" into the session model where that costs nothing.

**Engineering consequences.** Putt Pong needs: a lofted chip shot as its base shot (the Chip In mechanic, G1b); courses with many cups (the current course schema and cup physics handle one hole per putt, so cups become a list with per-cup enabled state, elimination events and a renderer cover or removal effect); a turn-based phase in the session machine and server contract, where main-game rooms are simultaneous; and a field layout with rack geometry at each end. No power-ups by default.

### Still open

Whether skins should one day unlock through play or an account (not needed now).

## Technology

| Responsibility | Choice (installed) |
| --- | --- |
| Build and dev | Vite 8, npm with package-lock.json, plain JavaScript ES modules |
| Rendering | Three.js 0.186.1, direct (no scene abstraction) |
| Menus and HUD | React 19 with CSS Modules; physics ticks and mesh transforms stay out of React state |
| Room lifecycle | XState 5 |
| Networking today | PeerJS 1.5.4 (client-trusted physics, host-owned room transitions) |
| Networking target | Cloudflare Workers with a SQLite-backed Durable Object per room, over WebSockets (N4) |
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
| M4 Server-owned rooms (N4, #65): contracts, local Worker runtime and room coordination are merged; durable recovery, browser adoption, cross-browser coverage and an authorized preview deployment remain | In progress |
| M5 Three.js upgrade and desktop rendering validation | Done |
| Look and feel (V1a-V1d): toon style, sky world, palettes, ambient weather, comic HUD | Done |
| M6 Release readiness (Q1 #18): par-achievability check under final physics, production-like preview, rollback, manual playtests | Blocked on N4 |
| Vision features (G1, K1, M1 and the new tasks in TASKS.md) | Not started; start order in the owner decisions above |

M4 exit gate: four-player real-browser games across separate networks through an authorized deployed Worker; controller departure, guest recovery after hibernation or restart, forged, stale and versioned messages, bounded queues and quota failure all tested; deployment and rollback documented. Contracts and lifecycle defaults (immediate controller succession, 30-second reconnect grace, 15-minute empty retention) are in docs/networking/SERVER_ROOMS.md; local setup is in docs/networking/CLOUDFLARE_SETUP.md. The browser stays trusted for ball physics; the server owns room coordination. N3 (managed TURN) is paused as an alternative, not a prerequisite.

M6 exit gate: a fresh checkout has documented setup, test and build commands; a production-like preview passes; release and rollback instructions are complete. Publishing to production and paid service provisioning need separate owner authorization. Because the physics will be retuned (S3) and acceptance changes from hole-in-one robustness to par achievability (SV1), Q1 verifies that every putt has a robust route within its par under the final physics, instead of refreshing the old hole-in-one counts.

## Working rules

Physics changes, visual changes and refactors ship separately so parity tests stay meaningful. Anything that changes shot trajectories invalidates recorded difficulty and needs a fresh sweep. Follow AGENTS.md and docs/GITHUB_WORKFLOW.md: one issue, one branch and one PR per task; the coordinator owns shared contracts, dependency files and status docs.
