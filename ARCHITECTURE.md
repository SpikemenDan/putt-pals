# Architecture reference

Status: accepted modules and the legacy browser are distinguished below. N1 delivery is PR #24 (72b7498 plus review fixes), accepted when current-head CI passes and the PR merges; target-only modules remain proposals.

## Current implementation

- putt-pals.html: styles, screen markup, embedded Three.js r128 and PeerJS, and an application IIFE. Approximately 790 KB. The embedded browser runtime remains in place while extracted modules await adoption.
- tools.js: Node CLI for validation, map generation, physics solving, surface/cup/mechanic checks and jsdom/fake-network smoke tests.
- HANDOFF.md: historical roadmap and logs. Several architectural details are stale; verify against code rather than copying its constants.
- package.json / package-lock.json: pinned Vite 8.3.5 and jsdom 30.1.3 development dependencies, with npm commands for development, build, preview and existing checks. vite.config.mjs builds the legacy HTML to dist/putt-pals.html. scripts/check-build.cjs verifies preservation of all three embedded scripts. XState 5.33.3 is installed for the headless session actor. TypeScript and React are not installed yet.

The game has 22 maps and six starter courses with six putts each. Physics advances at 1/240 second, with a requestAnimationFrame accumulator. Simulation coordinates use x/y as the ground plane and z for height. Three.js uses y for height, so rendering swaps axes.

The embedded browser simulation still closes over mutable global player/course state and UI/publication functions. Accepted src/simulation/ exposes a headless engine with fixture parity; src/courses/ and tools/cli/ import validated geometry and the shared simulation. Legacy tools.js and migration reference exporters retain marker/VM extraction during parity and browser migration; normal modern CLI commands do not execute legacy source.

The embedded browser uses a code-derived PeerJS peer ID to select a host. An unavailable ID causes the joining browser to connect as a guest. Host snapshots are broadcast about every 70 ms. The host owns voting and room transitions; each browser simulates its own ball and reports positions, strokes and completion. This is a star topology with client-trusted gameplay, not authoritative server simulation. Signaling requires a service; some networks require TURN. Current host loss has no migration path.

## Extracted modules and N1 delivery

- Accepted main: src/shared/ contracts/mocks, src/simulation/ headless physics, src/courses/ normalized catalog and validation, tools/cli/ course/solver/arena commands, and src/session/ XState room lifecycle. A1 audio delivery is PR #25, effective after green CI, merge and verification. See src/session/README.md and docs/reviews/D1_DATA_CLI.md.
- N1 delivery (PR #24): src/network/ provides solo/in-memory/PeerJS adapters, validated JSON envelopes, sender binding and the host-to-session bridge. See src/network/README.md and docs/reviews/N1_TRANSPORTS.md. Nine network scenarios, full local tests/build and baseline inventory passed; no actual WebRTC or browser adoption result is claimed.
- N1 envelopes carry version/session/round/putt/sequence/sender/time fields, reject stale/duplicate/malformed/oversized data, and cap UTF-8 messages at 64 KiB. Commands bind playerId from the link. Current actor snapshots publish immediately; active-participant movement is batched at 70 ms. Names stay text values. This preserves client-trusted physics, without anti-cheat/accounts/host migration.
- N1 uses the existing C1/L1 four-member bound and safe-integer score counts, not a gameplay stroke cap. Pending links consume capacity; close/dispose cleans listeners and timers. The Peer constructor and signaling/ICE options are injected; no runtime library upgrade is introduced.
- Browser entry/composition (I1), render/camera (R1), React/input (U1), recovery/interpolation (N2), TURN (N3) and full browser coverage (T1) remain separate tasks. No N1 commit implies their acceptance. The build still preserves embedded scripts.

## Procedural audio boundary (A1, PR #25)

src/audio/ exports createAudioAdapter with injected context factory, storage, randomness and diagnostics. Construction creates no AudioContext; gesture unlock creates/resumes one context reused across rooms. play consumes known cues, handleEvent translates S1/application events, updateListener accepts world-space camera arrays, and simToWorld converts event positions. The legacy eleven recipes, spatial model, master gain and mute key are preserved. No physics callback, DOM lookup, Three.js import or audio-file dependency is added.

resetSession releases room voices without making another context. dispose removes explicit gesture bindings, stops/disconnects owned sources/filters/gains/panners, drops the noise buffer and awaits context close. Ended sources release their voice graphs. Concurrent unlock and failed partial initialization are coordinated; denied storage/resume cannot break gameplay. Nine instrumented-node scenarios compare all recipes against the legacy signatures and exercise actual simulation events, old/new WebAudio APIs, resource limits and repeated room cleanup. See src/audio/README.md and docs/reviews/A1_AUDIO.md.

PR #25 records acceptance only after green current-head CI, merge and post-merge checks; the embedded browser audio remains unchanged until I1. The app owns event deduplication, bounce significance filtering, banners, camera updates and cleanup. Real-browser listening/autoplay/spatial balance remain separate acceptance gates.

## Target layout

```text
src/
  app/            composition, session creation, lifecycle cleanup
  shared/         IDs, configuration, protocol and course schemas
  simulation/     state, shot application, fixed steps, collisions, events
  courses/        validated definitions, legacy adapters, generated data
  session/        XState lifecycle, voting, scoring, timers, practice
  network/        room interface, solo adapter, PeerJS adapter, interpolation
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
  turn-credentials/  minimal endpoint; only if TURN integration proceeds
```

Use a single npm project initially. Add workspaces only if the credential service's deployment/runtime requires a separate package; this does not justify a monorepo toolchain.

## Dependency direction

UI/input -> application commands -> session/simulation. Render and audio consume snapshots/events. Session talks to a transport interface; its PeerJS implementation owns connections. CLI tools import simulation and courses directly. Shared schemas/types import no browser adapters.

The application owns exactly one simulation scheduler and one rendering loop per session. Adapters have explicit start/dispose lifecycles. Events such as shot, bounce, sink, timeout and putt change drive sound/UI without callbacks from physics into browser APIs.

## Contracts to agree before implementation

These are design requirements, not existing API declarations:

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
- Network & Protocol: `PROTOCOL_VERSION = 1`, `MAX_PLAYERS = 4`, `SNAPSHOT_INTERVAL_MS = 70`, `VOTING_COUNTDOWN_SECONDS = 15`, `RECONNECT_GRACE_PERIOD_MS = 30000`, `MAX_PLAYER_NAME_LENGTH = 14`.

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

## Deferred architecture changes

Rapier requires its own evaluated physics migration. Colyseus or another authoritative game server is unnecessary for the confirmed initial private-room scope. Host migration, public matchmaking, accounts, persistence, native packaging and offline packaging remain deferred.

## Modular application (I1)

`index.html` loads `src/app/main.js`, which composes all modules through `createApp()` (src/app/README.md). The app owns one animation-frame loop, one 100 ms HUD tick and explicit disposal. Three.js 0.128.0 and PeerJS 1.5.4 are npm dependencies at the versions the legacy page embeds. `putt-pals.html` remains a separate, unchanged build input. Contract changes made as integration owner: `PLAYER_COLORS` is now the game's eight-colour palette (shared by renderer and UI), and presence accepts optional validated `effect` and `fx` fields. Production CSS is built unminified because Lightning CSS minification dropped standard `backdrop-filter` declarations; scripts/check-build.cjs guards the legacy CSS.
