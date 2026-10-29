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
- **Risk versus reward.** Guard walls keep ordinary shots in play; deliberate drop-offs tempt bold players into hard hole-in-one shortcuts. Hole-in-one difficulty follows the course rating.
- **Trick shots.** Corner bouncers and interactive surfaces reward bank shots and unexpected angles.

### Game modes

| Mode | Rules |
| --- | --- |
| Party Circuit and Tournaments | Group matches against the clock with unlimited strokes, live scorecards and a crowned champion. Tournaments run 3, 6 or 9 maps. |
| Putt Pong | Cup pong in mini-golf form: sink putts to eliminate cups from the opponent's rack. |
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
- **Sequencing:** the framework and the power-ups that leave default trajectories unchanged (G1a-G1f, GM1, F1, C3) may start now. Tasks that change course geometry or physics for every shot (G1g, K1) stay after Q1's fresh difficulty sweep unless the owner un-gates them.

Code today versus these rules: the 8-player cap, the 8-colour palette, the 3 slots, free-for-all simultaneous play, advancing together and the 3/6/9-level tournaments already exist. Two gaps remain, both in task C3: the N4 server-room contract is capped at 4 members and must be raised to 8, and ranking is by total strokes with hole-in-ones breaking ties. Because every player plays the same pars, that orders players the same as strokes minus par and the scorecard already shows the relative score, but results and tournament standings should lead with the relative-to-par figure computed from completed putts.

### Putt Pong

Putt Pong is not played like the main game. It is a team mode: two sides of one or two players each (2 to 8 players in total). Each side owns a rack of 6 cups. Both sides putt at the same time each round, using the same putt, and the round ends when everyone has finished. Each sunk putt eliminates one cup from the opposing rack (the shooter picks the cup). The first side to eliminate the whole opposing rack wins; if rack counts are level after a set number of rounds, fewer strokes over par breaks the tie. No power-ups by default. These are working defaults the owner can adjust when GM2 is specified.

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
| M6 Release readiness (Q1 #18): fresh difficulty ladder, production-like preview, rollback, manual playtests | Blocked on N4 |
| Vision features (G1, K1, M1 and the new tasks in TASKS.md) | Not started; start order in the owner decisions above |

M4 exit gate: four-player real-browser games across separate networks through an authorized deployed Worker; controller departure, guest recovery after hibernation or restart, forged, stale and versioned messages, bounded queues and quota failure all tested; deployment and rollback documented. Contracts and lifecycle defaults (immediate controller succession, 30-second reconnect grace, 15-minute empty retention) are in docs/networking/SERVER_ROOMS.md; local setup is in docs/networking/CLOUDFLARE_SETUP.md. The browser stays trusted for ball physics; the server owns room coordination. N3 (managed TURN) is paused as an alternative, not a prerequisite.

M6 exit gate: a fresh checkout has documented setup, test and build commands; a production-like preview passes; release and rollback instructions are complete. Publishing to production and paid service provisioning need separate owner authorization. Because the shared cup rules changed (S2), Q1 must re-measure all 36 starter putts and review the five hard putts that no longer have a robust solution.

## Working rules

Physics changes, visual changes and refactors ship separately so parity tests stay meaningful. Anything that changes shot trajectories invalidates recorded difficulty and needs a fresh sweep. Follow AGENTS.md and docs/GITHUB_WORKFLOW.md: one issue, one branch and one PR per task; the coordinator owns shared contracts, dependency files and status docs.
