# Architecture reference

## Current state

`index.html` loads `src/app/main.js`, which composes the modules below through `createApp()` (src/app/README.md). The app owns one animation-frame loop, one 100 ms HUD tick and explicit disposal. `putt-pals.html` is the original single-file game, kept runnable as a separate build input and parity reference; do not extend it.

- **Simulation** (`src/simulation/`): headless, deterministic fixed-step physics at 240 Hz with explicit hazard time, domain events and no DOM, Three.js, React, PeerJS or WebAudio imports. Browser, CLI and solver share it. Simulation coordinates use x/y for the ground plane and z for height; Three.js uses y for height, so only render adapters swap axes.
- **Courses** (`src/courses/`): validated named records for all 22 courses (six starters, six putts each), legacy adapters, per-map palettes. `tools/cli/` imports this and the simulation for check, solve, rank and arena commands. The legacy `tools.js` still extracts code from the HTML for parity checks and physics regression tests.
- **Session** (`src/session/`): XState room lifecycle (lobby, voting, play, results), scoring, timers, practice and replay. Scoring rules are pure functions in `src/shared/scoring.js`.
- **Network** (`src/network/`): solo, in-memory and PeerJS transports behind one room-transport contract; validated envelopes with version, session, round, sequence and sender binding; guest recovery and remote interpolation. The browser is trusted for its own ball; the host owns room transitions. `src/network/contracts/` and `services/rooms/` hold the server-room (N4) wire contract and local Cloudflare Worker and Durable Object runtime, which are not yet connected to the browser. See docs/networking/SERVER_ROOMS.md.
- **Render and camera** (`src/render/`, `src/camera/`): Three.js 0.186.1 toon renderer with ink outlines, sky world, palettes and ambient weather. Weather runs in vertex shaders from a shared clock and lightning is a pure function of time, so every player sees the same flashes. Visual only; nothing reads or writes simulation state.
- **UI and input** (`src/ui/`, `src/input/`): React 19 screens and HUD with CSS Modules; pointer and keyboard commands in their own adapter. React never drives physics ticks or mesh transforms.
- **Audio** (`src/audio/`): procedural WebAudio adapter with injected context, storage and randomness; one context per app, gesture unlock, persistent mute, bounded voices and explicit teardown. It consumes simulation events and world-space listener positions.

Physics advances through a requestAnimationFrame accumulator. Online rooms still use PeerJS with a code-derived host; host loss has no migration path until N4 lands.

## Layout

```text
src/
  app/            composition, session creation, lifecycle cleanup
  shared/         IDs, configuration, protocol and course schemas
  simulation/     state, shot application, fixed steps, collisions, events
  courses/        validated definitions, legacy adapters, generated data
  session/        XState lifecycle, voting, scoring, timers, practice
  network/        room interface, solo/in-memory/PeerJS adapters, interpolation, server-room contracts
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

UI/input -> application commands -> session/simulation. Render and audio consume snapshots/events. Session talks to a transport interface; its PeerJS implementation owns connections. CLI tools import simulation and courses directly. Shared schemas/types import no browser adapters.

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

## Agreed shared contracts (Task C1)

The contracts below are implemented in `src/shared/` and verified by `tests/contracts.test.cjs`:

### 1. Constants (`src/shared/constants.js`)
- Physics: `BALL_RADIUS = 5`, `DEFAULT_CUP_RADIUS = 15`, `MIN_CUP_RADIUS = 8`, `SHOT_POWER = 900`, `FIXED_TIMESTEP = 1 / 240`, `TURF_FRICTION = 0.75`.
- Surface drag multipliers: `turf: 1.0`, `sand: 3.5`, `ice: 0.15`, `slime: 6.0`.
- Limits & Rules: `MIN_TIMEOUT_SECONDS = 120`, `MAX_TIMEOUT_SECONDS = 600`, `DEFAULT_PAR = 2`, `DEFAULT_PENALTY = 3`, `STARTER_COURSE_INDICES = [0, 8, 20, 21, 5, 19]`.
- Network & Protocol: `PROTOCOL_VERSION = 1`, `MAX_PLAYERS = 8`, `SNAPSHOT_INTERVAL_MS = 70`, `VOTING_COUNTDOWN_SECONDS = 15`, `RECONNECT_GRACE_PERIOD_MS = 30000`, `MAX_PLAYER_NAME_LENGTH = 14`.

### 2. Coordinate transformations (`src/shared/coords.js`)
- Simulation: horizontal plane `[x, y]`, vertical elevation `z`.
- Three.js World: horizontal `x = simX + origin[0]`, vertical `y = simZ + BALL_RADIUS`, horizontal depth `z = simY + origin[1]`.
- Functions: `simToWorld(simX, simY, simZ, origin, heightOffset)`, `worldToSim(worldX, worldY, worldZ, origin, heightOffset)`, `simToWorldGround([simX, simY], origin)`.

### 3. Pure scoring calculations (`src/shared/scoring.js`)
- `calculateTimeoutScore(strokes, par, penalty)`: `Math.max(strokes, par + penalty)` after defensive input normalization; N1 removes the old 99-score cap and preserves zero penalties. Wire scores/strokes are nonnegative safe integers.
- `formatScoreEntry(score, timedOut, par, penalty)`: e.g. "1" or "2+3*".
- `summarizeScorecard(holes)`: computes total strokes, total par, +/- relative score, hole-in-ones, timeouts.
- `rankPlayers(players)`: ranks players by lowest total strokes, breaking ties by highest hole-in-ones.

### 4. Course validation & schemas (`src/shared/courses.js`)
- `validatePutt(putt)`: validates tee, hole, par (1..10), penalty (0..10), optional limitSeconds (120..600), cupRadius (8..15).
- `validateCourse(course)`: validates id, name, index, starter constraints (6 putts, in starter set).
- `normalizeLimit(limit)`: enforces 120..600 second bounds, defaulting to 120.

### 5. Protocol boundary validation (`src/shared/protocol.js`)
- `validatePresence(data, maxMaps)`: validates player name length, map index, coordinates, scores array, powerups.
- `validateRoomSnapshot(snapshot, maxMaps)`: validates room phase, map, round, start time, roster.
- `validateVote(vote, maxMaps)`: validates map voting index.
- `createMessageEnvelope(type, payload, senderId)`: standard envelope with version, timestamp, type, payload, senderId.

### 6. Simulation interface & domain events (`src/shared/simulation.js`)
- `createPlayerState(name, colorIndex, options)`: pure player simulation state record without global closures.
- `applyShot(player, angle, power, powerMultiplier)`: sets velocities, strokes, and emits shot event.
- `SimulationEventTypes`: `shot`, `bounce`, `surface_change`, `cup_lip`, `sink`, `hazard`, `out_of_bounds`, `rest`, `timeout`.
- Simulation contract: `addPlayer(id, name, colorIndex)`, `getPlayer(id)`, `launch(playerId, angle, power)`, `step(dt)`, `getSnapshot()`, `dispose()`.

### 7. Session lifecycle & state machine (`src/shared/session.js`)
- `SessionPhases`: `lobby`, `select`, `play`, `results`.
- `GameModes`: `standard`, `tournament_3`, `tournament_6`, `tournament_9`, `practice`, `putt_practice`.
- `SessionCommands`: `JOIN_ROOM`, `LEAVE_ROOM`, `SET_MODE`, `START_VOTING`, `CAST_VOTE`, `START_ROUND`, `ADVANCE_PUTT`, `FINISH_ROUND`, `RETURN_TO_LOBBY`.
- `resolveVote(votes, eligibleMaps, { round, connectedIds })`: deterministic winner; counts only integer votes for eligible maps (and connected voters when given). Ties match the legacy host: tied maps ascending, winner `tied[(round * 7 + validVotes) % tied.length]`. No valid votes returns the first eligible map.
- `canExecuteCommand(phase, command, isHost)`: phase and host command gating.

### 8. Transport interface (`src/shared/transport.js`)
- `ConnectionStates`: `disconnected`, `connecting`, `connected`, `reconnecting`, `closed`.
- `RoomTransportContract`: `connect()`, `send(msg)`, `subscribe(listener)`, `close()`, `now()`, `isHost`, `peerId`, `connectionState`.
- `isRoomTransport(transport)`: runtime contract conformance validator.

### 9. Render contracts & camera (`src/shared/render.js`)
- `CameraModes`: `ball`, `hole`, `world`, `free_roam`.
- `createRenderSnapshot(...)`: immutable render snapshot decoupling Three.js from simulation loops.
- `checkSightlineObstructions(cameraPos, ballPos, boundingBoxes)`: ray-AABB sightline test for wall fading.

### 10. High-fidelity mocks (`src/shared/mocks.js`)
- `createSampleCourse()`: sample course fixture for standalone testing.
- `MockSimulation`: headless simulation mock implementing `SimulationEngineContract`.
- `MockTransportHub` & `MockTransport`: in-memory multi-node virtual transport for fake-network integration tests.

Changing an agreed signature requires updating `src/shared/`, `tests/contracts.test.cjs`, and notifying affected task owners.

## Gameplay systems design (power-ups, hazards, modes, cosmetics)

Design rules for the product vision in MODERNIZATION_PLAN.md. These are targets, not existing APIs. Agree contracts and get integration-owner approval before changing `src/shared/`.

### Power-up framework

- **Catalog as data.** Each power-up is a plain record: id, name, group, whether it targets self, an opponent or the course, whether it is allowed in solo, spawn weight, duration (next shot, next turn, N impacts or seconds) and the hook it uses. The catalog is the single source for the UI, protocol validation, spawn table and solo filtering. Solo and Practice draw only from entries marked self-only.
- **Inventory.** Three slots, activated by click or keys 1-3 before a stroke. Activation arms an effect; several armed effects stack on one shot. Tournaments keep inventory across putts and rounds; other modes reset it. The pool is chosen by mode: the No Power-Ups mode spawns no boxes at all.
- **Effect hooks.** Effects change simulation inputs, not rendering. Hooks run at defined points of the fixed step: shot launch (Chip In adds vertical velocity; Steady Aim zeroes sway), per-tick forces (Hole Magnet, Love and Hate auras, vortices, wind), collision resolution (Ghost Ball skips wall and obstacle bounces; Sticky Ball zeroes the rebound), per-ball radius (Small and Tall Ball; the current code uses one global ball radius, so radius must become per-ball state) and global surface modifiers (rain and snow scale friction). With no effect armed, results must stay bit-identical to the current parity fixtures.
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
