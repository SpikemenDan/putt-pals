# Architecture reference

Status: current implementation described below; target modules are proposals.

## Current implementation

- putt-pals.html: styles, screen markup, embedded Three.js r128 and PeerJS, and an application IIFE. Approximately 790 KB. No build system or dependency manifest.
- tools.js: Node CLI for validation, map generation, physics solving, surface/cup/mechanic checks and jsdom/fake-network smoke tests.
- HANDOFF.md: historical roadmap and logs. Several architectural details are stale; verify against code rather than copying its constants.

The game has 22 maps and six starter courses with six putts each. Physics advances at 1/240 second, with a requestAnimationFrame accumulator. Simulation coordinates use x/y as the ground plane and z for height. Three.js uses y for height, so rendering swaps axes.

The simulation closes over mutable global player/course state and can call UI and publication functions. Tools extract selected function text from the HTML using markers and execute it in a Node VM. This is a temporary compatibility mechanism, not a reusable module boundary.

PeerJS uses a code-derived peer ID to select a host. An unavailable ID causes the joining browser to connect as a guest. Host snapshots are broadcast about every 70 ms. The host owns voting and room transitions; each browser simulates its own ball and reports positions, strokes and completion. This is a star topology with client-trusted gameplay, not authoritative server simulation. Signaling requires a service; some networks require TURN. Current host loss has no migration path.

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

The integration owner records actual signatures here before parallel dependent tasks start. Changing an agreed signature requires notifying every affected owner and updating tests/mocks together.

## Deferred architecture changes

Rapier requires its own evaluated physics migration. Colyseus or another authoritative game server is unnecessary for the confirmed initial private-room scope. Host migration, public matchmaking, accounts, persistence, native packaging and offline packaging remain deferred.
