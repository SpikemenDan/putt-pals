# Architecture reference

## Implementation snapshot

Technical descriptions below come from the supplied repository snapshot. This documentation update does not certify newer main or implement the targets added below.

`index.html` loads `src/app/main.js`, which composes the modules below through `createApp()` (src/app/README.md). The app owns one animation-frame loop, one 100 ms HUD tick and explicit disposal. `index.html` and `src/` are the supported game. The legacy `putt-pals.html` and `tools.js` remain temporarily while required build, CLI and test consumers are migrated; they are scheduled for removal rather than permanent reference support.

- **Simulation** (`src/simulation/`): headless, deterministic fixed-step physics at 240 Hz with explicit hazard time, domain events and no DOM, Three.js, React, PeerJS or WebAudio imports. Browser, CLI and solver share it. Simulation coordinates use x/y for the ground plane and z for height; Three.js uses y for height, so only render adapters swap axes.
- **Courses** (`src/courses/`): validated named records for all 22 courses (six starters, six putts each), legacy adapters, per-map palettes. `tools/cli/` imports this and the simulation for check, solve, rank and arena commands. The legacy `tools.js` still extracts code from the HTML for parity checks and physics regression tests.
- **Session** (`src/session/`): XState room lifecycle (lobby, voting, play, results), scoring, timers, practice and replay. Scoring rules are pure functions in `src/shared/scoring.js`.
- **Network** (`src/network/`): online rooms use the v2 WebSocket client and `services/rooms/` Worker/SQLite Durable Object. The service owns room transitions, deadlines, checkpoint recovery and controller election; browsers remain trusted for ball physics and report bounded presence/scores. Solo stays local. Legacy transport fixtures remain for unit coverage. See docs/networking/SERVER_ROOMS.md and WEBSOCKET_CLIENT.md.
- **Render and camera** (`src/render/`, `src/camera/`): Three.js 0.186.1 toon renderer with ink outlines, sky world, palettes and ambient weather. Weather runs in vertex shaders from a shared clock and lightning is a pure function of time, so every player sees the same flashes. Visual only; nothing reads or writes simulation state.
- **UI and input** (`src/ui/`, `src/input/`): React 19 screens and HUD with CSS Modules; pointer and keyboard commands in their own adapter. React never drives physics ticks or mesh transforms.
- **Audio** (`src/audio/`): procedural WebAudio adapter with injected context, storage and randomness; one context per app, gesture unlock, persistent mute, bounded voices and explicit teardown. It consumes simulation events and world-space listener positions.

Physics advances through a requestAnimationFrame accumulator. Online controller departure preserves the server-owned match; the service elects another connected player. Deployment and separate-network acceptance remain N4G gates. Library versions are pinned in package.json (the source of truth). Production CSS is built unminified because Lightning CSS minification dropped standard `backdrop-filter` declarations; scripts/check-build.cjs currently guards legacy build output and must be migrated before that output is removed. Gameplay numbers live in `src/shared/tuning.js` (docs/TUNING.md).

## Layout

```text
src/
  app/            composition, session creation, lifecycle cleanup
  shared/         IDs, configuration, protocol and course schemas
  simulation/     state, shot application, fixed steps, collisions, events
  courses/        validated definitions, legacy adapters, generated data
  session/        XState lifecycle, voting, scoring, timers, practice
  network/        room interface, solo/in-memory adapters, server-room WebSocket client and contracts, interpolation; `peer.js` is a legacy PeerJS adapter that the online room path no longer uses
  render/         Three.js scene, meshes, effects, resource ownership
  camera/         camera modes, input-independent camera state
  input/          pointer and keyboard commands
  audio/          procedural WebAudio adapter
  ui/             React screens, HUD, scorecard, CSS Modules
tools/
  cli/            check, solve, rank, arena commands
tests/
  fixtures/       legacy reference trajectories and courses
  integration/    fake clocks/transports, lifecycle and scoring
  browser/        Playwright solo and multiplayer flows
services/
  rooms/             Cloudflare Worker and Durable Object room runtime (N4)
  turn-credentials/  paused alternative; only if N3 is explicitly resumed
```

The repo is a single npm project; the Worker runtime in `services/rooms/` is built through the same toolchain. Add workspaces only if a deployable needs its own package.

## Dependency direction

UI/input -> application commands -> session/simulation. Render and audio consume snapshots/events. Session talks to a transport interface; online rooms use the server-room WebSocket implementation, which owns the connection (solo and tests use in-memory transports). CLI tools import simulation and courses directly. Shared schemas/types import no browser adapters.

The application owns exactly one simulation scheduler and one rendering loop per session. Adapters have explicit start/dispose lifecycles. Events such as shot, bounce, sink, timeout and putt change drive sound/UI without callbacks from physics into browser APIs.

## Contract principles

The concrete contracts are in the next section; these principles govern changes to them:

- Simulation: create state; apply a validated shot; advance a fixed tick using explicit simulation time; return domain events. Configuration and course data are explicit dependencies. Mutating internal state is acceptable for performance; public snapshots have clear ownership.
- Time/randomness: distinguish monotonic local time, synchronized room time and simulation ticks. Solver and tests supply deterministic hazard times and seeded randomness. Do not promise cross-browser bitwise equivalence for the custom engine.
- Session: accept typed commands, enforce phase/host guards, expose room snapshots and events. Score calculation and timeout rules are shared pure functions.
- Room transport: connect/create, subscribe, send commands/presence, observe connection state, close. Solo and fake adapters implement the same contract.
- Protocol: version, session ID, round ID, sender identity bound to connection, sequence, bounded payload. Resume identity must be separate from a temporary PeerJS connection ID.
- Courses: stable IDs, schema version, named geometry/mechanic records. Legacy numeric indices stay in an explicit mapping during transition.
- Rendering: explicit sim-to-world transform, snapshot interpolation, resource ownership/disposal. Visual interpolation never changes scoring or authoritative room transitions.
- UI: cached immutable snapshots and stable subscribe/getSnapshot methods; commands for input, no direct mutations of simulation state.

## Shared contracts

Implemented in `src/shared/` and verified by `tests/contracts.test.cjs`. Signatures and values live in code and that test, not here. Gameplay numbers live in `src/shared/tuning.js` (docs/TUNING.md).

| File | Purpose |
| --- | --- |
| `constants.js` | Physics, surface, limit, protocol and player constants |
| `coords.js` | Simulation (x/y plane, z up) to Three.js world transforms |
| `scoring.js` | Timeout score, score formatting, scorecard summary, ranking |
| `courses.js` | Putt and course validation, time-limit normalization |
| `protocol.js` | Presence, room snapshot and vote validation; message envelope |
| `simulation.js` | Player state, shot application, domain event types, engine contract |
| `session.js` | Phases, modes, commands, deterministic vote resolution, command gating |
| `transport.js` | Connection states and the room transport contract |
| `render.js` | Camera modes, immutable render snapshot, sightline test |
| `mocks.js` | Sample course, mock simulation and in-memory transports for tests |

Changing a shared interface requires updating its implementation, consumers, mocks and relevant contract tests together. Coordinate with the other contributor when their active work depends on the interface.


## Gameplay systems design (power-ups, hazards, modes, cosmetics)

Design rules for the product vision in MODERNIZATION_PLAN.md. These sections contain design targets and implementation details from the supplied snapshot; check code before assuming an API exists. Coordinate shared-contract changes with contributors working on dependent consumers and update validation, mocks and tests together.

### Power-up framework

- **Catalog as data.** Each power-up is a plain record: id, name, group, whether it targets self, an opponent or the course, whether it is allowed in solo, spawn weight, duration (next shot, next turn, N impacts or seconds) and the hook it uses. The catalog is the single source for the UI, protocol validation, spawn table and solo filtering. Solo and Practice draw only from entries marked self-only.
- **Inventory.** Three slots, activated by click or keys 1-3 before a stroke. Activation arms an effect; several armed effects stack on one shot. Tournaments keep inventory across putts and rounds; other modes reset it. The pool is chosen by mode: the No Power-Ups mode spawns no boxes at all.
- **Effect hooks.** Effects change simulation inputs, not rendering. Hooks run at defined points of the fixed step: shot launch (Chip In adds vertical velocity; Steady Aim zeroes sway), per-tick forces (Hole Magnet, Love and Hate auras, vortices, wind), collision resolution (Ghost Ball skips wall and obstacle bounces; Sticky Ball zeroes the rebound), per-ball radius (Small and Tall Ball use explicit effect overrides derived from the configured base radius) and global surface modifiers (rain and snow scale friction). With no effect armed, results must stay bit-identical to the current parity fixtures.
- **Determinism.** Randomness (box contents, Lightning direction) is injected and seeded; roaming Tornado and Hurricane paths are pure functions of synchronized room time so every client agrees without streaming positions.
- **Authority.** Physics stays client-trusted. An opponent-targeted effect travels as a validated effect message bound to the sender's connection and is applied by the target's own client; aura effects (Love, Hate) are applied by each client to its own ball while an opposing aura is active, because remote balls are non-colliding ghosts. Deployed objects (bumpers, vortices) are part of the synced room snapshot with an owner, an expiry and an impact count. Under N4 the server also validates the catalog id, inventory ownership and rate limits.
- **Aim effects.** 360° and 180° Aim are input-layer modes of the aim indicator (continuous spin, sweep); they never alter the launch maths beyond what the indicator shows.
- **Presentation.** Each power-up needs an icon, an activation banner, a ball aura or world indicator (the Orbital Bumper shows radius rings) and audio cues in the existing synthesis style, driven by domain events.

### Course elements

The current course model is a heightfield (`surfaceHeight(course, x, y)` returns one floor per point), which cannot express an overpass or interior. The volumetric model (K0) adds multiple surfaces at different heights over one footprint, vertical walls and ceilings, and picks the floor under the ball by its height; existing 2D courses must stay bit-identical. Water bodies (splash and reset, shallow drag, currents) and wind zones (direction and strength fields, steady, gusting from synced room time, and updrafts) are course records read by the simulation and drawn by the renderer; their numbers live in the tuning file. A geometry-integrity validator (CL1) rejects interpenetrating solids and insufficient clearances, and is a gate for every new element.

New primitives (corner wedge, curved ramp, multi-tier drop, transport tube) need course schema records, simulation support, renderer meshes, solver support and a test chamber that proves a robust shot exists and fails without the element, as the existing mechanic chambers do. Tubes carry the ball along a path and release it with its exit velocity. Islands are per-putt geometry with visible gaps; guard walls bound normal routes and drop-offs are declared open edges. Any change to course geometry or physics requires re-solving affected putts and a fresh difficulty sweep. A putt is accepted when a multi-stroke solver finds a robust route within its par (2 to 6); a single-shot hole-in-one is neither required nor guaranteed, and par defaults come from the shortest robust route.

### Game modes

A mode is session configuration: whether power-ups are on, scoring rules, inventory carryover and win condition. Pure Mini-Golf is a flag on the existing lifecycle. Putt Pong is turn-based and 1v1 only for now, unlike the simultaneous main game, so it needs its own session rules in `src/session/` (shooter turns, bonus balls, redemption, rounds), course support for many cups with per-cup state and elimination events in the simulation, a rack scene in the renderer and its own scoring. Its base shot is the lofted chip. Larger player counts are deferred; avoid hard-coding exactly two players where that costs nothing.

### Cosmetics

Ball skins, trail skins and ace celebrations are data records applied by the renderer and HUD (trail colour and shape, ball material or texture, banner and fanfare). They never affect physics. A chosen cosmetic travels in presence as a validated catalog id, never as raw peer-supplied content. Persistence is local to the browser until the owner decides on unlock progression or accounts.

## Deferred architecture changes

Rapier was evaluated and production adoption is deferred (docs/reviews/P1_RAPIER.md); revisit only if the ramp, drop and tube work in K1 proves the custom physics inadequate, and treat it as a separate physics migration that re-solves every course. A general authoritative game server is unnecessary: N4 keeps ball physics in the browser and gives the server room coordination only. Public matchmaking, accounts, native packaging and offline packaging remain out of scope.

## Course geometry integrity (CL1)

Every course, shipped or new, must pass `checkGeometryIntegrity` (`src/courses/integrity.js`, helpers in `src/courses/geometry.js`). It runs inside `validateCourseDefinitions`, `validateCourseDocument`, and therefore `node tools/cli/main.mjs check`, `parseCourseDocument` and `npm run test:courses`. Each violation names the map, the putt (or "all" for map-level elements) and the element ids (`w[3]`, `rp[0]`, `movers[1]`, `tee`, `hole`).

Rejected: walls through ramps or platforms; ramps/platforms through each other (unless coplanar platforms), over pits, or off the floor tiles; mover travel through walls, over pits or off the floor; bumper, pad and teleporter anchors off the floor or within `HAZARD_WALL_CLEARANCE` of a wall; tees within `SPAWN_WALL_CLEARANCE` and cups within cup radius + `CUP_WALL_MARGIN` of a wall; tees and cups straddling a platform ledge; ramp ends whose neighbouring surface differs by more than `RAMP_SEAM_STEP_MAX` (a gap or a step the physics ledge bounce would snag on). Launch-ramp high ends, edge-of-world drops and points inside walls are not seams. Touching faces are fine; overlap must exceed `OVERLAP_TOLERANCE` on both axes.

All clearances are named exported constants in `integrity.js`. A reviewed, deliberate overlap goes in the named allow-list `GEOMETRY_INTEGRITY_EXCEPTIONS` with course id, rule, exact element ids and a reason; exceptions need owner approval and are reported in the PR. The check is static: it does not prove reachability, difficulty or dynamic hazard behaviour.


## Developer configuration

Extend the existing validated `src/shared/tuning.js` system into one documented
developer-configuration entry point. Do not introduce competing default stores.

Group configuration by domain:
- Physics and dimensions.
- Shot strength and input mapping.
- Aim-arrow presentation and sway.
- Camera behavior.
- Session rules and timers.
- Power-ups and hazards.
- Rendering and audio.

Each setting has one authoritative default, validation, units where relevant,
allowed ranges, dependencies and a description of its behavior impact.
Browser, simulation, renderer, CLI, solver and server import the same relevant
settings instead of copying defaults.

Ball dimensions agree between collision geometry and rendering. Arrow length and
thickness are presentation settings; shot strength and drag-to-power mapping are
separate behavior/input settings. Existing settings such as ball.radius,
shotPower and DISPLAY aim.arrowMaxLength should be reused, not recreated.

Keep course data and intentional per-ball effect overrides explicit.
Configuration extraction preserves current shipped values and behavior.
Retuning is separately identified and verified.

Online gameplay uses a compatible gameplay-configuration identity/version.
Reject or resolve mismatches rather than silently simulating different rules.
Local presentation/accessibility preferences may differ without changing rules.
Do not change authoritative settings during a shared match.

Credentials, authentication and unrestricted infrastructure limits are excluded
from developer gameplay controls. The configuration expansion is a target until
its consumers, validation and documentation have been implemented and verified.

## Developer tuning panel

Provide a development-only panel with:
- Numeric sliders showing units, ranges, current values and defaults.
- Boolean toggles and enumerated selectors.
- Reset controls.
- Validated override import/export.
- Clear indication of temporary preview overrides.

Keep the panel disabled in ordinary production builds by default. Temporary
values must not silently become shipped defaults or affect ordinary online rooms.

Safe presentation settings may update live. Physics, dimensions and session-rule
changes require preview reset/restart so existing state cannot become invalid.
Do not mutate authoritative rules halfway through a match.

For proposed appearance or feel changes, open a local Claude-browser preview,
provide relevant controls and request owner feedback before final acceptance.
Persist approved values and rerun affected checks. If browser access is absent,
provide the local URL and steps and mark interactive acceptance pending.

This panel is planned until implementation and verification are recorded.

## Legacy retirement

Inventory every active consumer of `putt-pals.html` and `tools.js`.
Migrate required CLI commands, regression checks, test helpers, build inputs,
script-preservation checks and documentation to the modular application.
Preserve useful independent regression fixtures and required provenance.

Remove obsolete files only after replacement coverage and build checks pass.
Do not weaken useful tests to obtain a passing migration.
Git history preserves historical source; a second runnable game is unnecessary.
Legacy references above describe temporary dependencies, not permanent support.

### Legacy consumer inventory and migration status (DX3)

| Consumer | Uses legacy for | Replacement | Status |
| --- | --- | --- | --- |
| `npm run check`, `solve`, `rank` | `tools.js check/solve/rank` | `tools/cli` | Migrated |
| `npm run test:physics` | `tools.js surfaces/cups/mechanics` | `tests/physics.test.cjs` | Migrated |
| `npm run test:smoke`, `test:multiplayer` | `tools.js smoke/smoke-multi`: ~120 UI and ~60 multiplayer assertions driven through the legacy DOM | `app`, `ui`, `session`, `network` suites and Playwright specs, not yet mapped assertion by assertion | Open: coverage gap analysis needed |
| `tests/render.test.cjs`, `audio.test.cjs`, `app.test.cjs` (library parity), `simulation.test.cjs`, `courses.test.cjs`, `cli.test.cjs` | Parity against the legacy renderer, sounds, Three r128 topology, physics and course data | Recorded fixtures with provenance | Open |
| `tools/legacy-adapter.cjs`, `tests/support/legacy-dom.cjs`, `tests/solver-baseline.cjs`, `scripts/export-*.cjs`, `inventory-baseline.cjs`, `aggregate-difficulty.mjs` | VM and HTML extraction | Retire with the parity tests, keep recorded outputs | Open |
| `tools/cli validate`, `tests/fixtures/source-inventory.json` | Hashes of `putt-pals.html` and `tools.js` | Hash only the exported data | Open |
| `vite.config.mjs`, `scripts/check-build.cjs`, `public/_headers`, `tests/rooms/local-runtime.test.mjs`, `scripts/ui-visual-parity.cjs`, `docs/THIRD_PARTY.md` | Second built page and script-preservation check | Drop the legacy page and its check | Open |

Nothing is removed until the open rows have replacement coverage.
