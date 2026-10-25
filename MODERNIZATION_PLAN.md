# Putt Pals modernization plan

Status: planned; implementation has not started.

## Confirmed scope

- Private rooms for friends.
- Desktop browsers only. Native applications are outside this migration.
- Normal hosted web application; a single downloadable HTML and offline distribution are not required.
- Use established libraries where they remove maintenance work.
- Multiple agents may work concurrently using AGENTS.md and TASKS.md.
- Preserve existing game modes, scoring, starter courses, controls, camera behavior and audio during extraction. The art direction recorded in HANDOFF.md remains a future product requirement; it is not a migration acceptance criterion.

## Recommendation

Incrementally extract and modernize the existing game. Keep its custom physics initially and keep PeerJS for private rooms. Establish a shared simulation and trustworthy tests before upgrading rendering or changing behavior. Do not implement the unfinished P33–P61 feature backlog as part of this migration.

## Technology decisions

| Responsibility | Choice | Reason and limits |
| --- | --- | --- |
| Development/build | TypeScript, Vite, npm with package-lock.json | Standard module builds and reproducible installs. Run TypeScript checking explicitly; Vite transpilation is not a type check. |
| 3D rendering | Three.js | Preserve existing renderer and shaders; upgrade from r128 as a separate milestone. Use direct Three.js rather than adding a second scene abstraction during extraction. |
| Menus and HUD | React, CSS Modules | Replace imperative screen construction with components. Keep physics and per-frame mesh updates outside React. Preserve existing visuals before any redesign. |
| Room lifecycle | XState | Model lobby, voting, playing, results and disconnect states with explicit events and guards. Separate room lifecycle from individual ball states. |
| Boundary validation | Zod | Validate course files and untrusted network messages with shared schemas and explicit limits. TypeScript alone does not validate incoming data. |
| Networking | PeerJS/WebRTC | Appropriate to private friend rooms; preserve browser host coordination initially. Add versioning, connection status and tested recovery behavior. |
| Restrictive networks | Managed TURN service plus a small credential endpoint | Remove manual ICE JSON from the normal player flow. Credentials are short lived; provider secrets stay on the endpoint. Provider and spending limit must be selected before provisioning. |
| Unit and integration tests | Vitest | Port useful existing physics, scoring, room and fake-network checks. Use fake clocks and explicit dependencies. |
| Browser tests | Playwright | Test actual WebGL initialization, controls, browser lifecycle and multi-page sessions in Chromium, Firefox and WebKit. Real Safari remains a manual release check where available. |
| Formatting and lint | ESLint and Prettier | Conventional TypeScript/React tooling; avoid large unrelated format changes. |
| CI | GitHub Actions, if this repository is hosted on GitHub | Install from the lockfile, typecheck, lint, test and build. Use equivalent CI if hosted elsewhere. |

Use stable compatible versions selected at implementation time, pinned through the lockfile. Initially preserve the exact embedded Three.js and PeerJS versions to separate extraction failures from upgrades. Identify their version and license metadata before replacing the embedded copies.

Keep WebAudio synthesis: the current procedural spatial audio is useful domain work, and replacing it with an audio library offers no demonstrated benefit. Avoid adding a database, accounts, matchmaking, Redux, a monorepo orchestrator, or a general ECS without a concrete requirement.

## Stages and acceptance gates

### M0 — Establish the baseline

1. Inventory implemented behavior from code, including practice, single-putt replay, tournaments, timeout scoring, spectator and wall fading.
2. Record the legacy artifact and dependency versions/licenses. Keep the original HTML runnable throughout migration.
3. Add a reproducible local jsdom setup and run existing smoke and multiplayer smoke checks. Capture failures honestly rather than updating assertions to fit them.
4. Fix the solver's hardcoded shot power of 820 to use the gameplay constant POWER=900. Make the solver use the same launch path as gameplay when the shared simulation becomes available.
5. Capture representative shot trajectories, results, event sequences and browser screenshots. Distinguish legacy parity fixtures from the intentional solver correction.
6. Recompute robust solutions and difficulty measurements for all 36 starter putts using corrected launch behavior. Old LADDER counts cannot certify the new configuration. If courses fail, record tuning as separate gameplay work; do not hide it in extraction.

Exit: baseline checks and known failures are documented; solver and gameplay use the same shot power; visual references and a reproducible command set exist. Slow difficulty sweeps run separately from fast pull-request checks.

### M1 — Add the build and extract modules

1. Add npm scripts, Vite, TypeScript, linting and formatting. Allow temporary JavaScript during extraction, with a tracked path to strict TypeScript.
2. Move libraries to package dependencies, CSS to stylesheets and game code to modules, preserving behavior and legacy coordinate conventions.
3. Introduce a simulation API that accepts state, course, configuration, simulation time and randomness as explicit inputs. Return state changes and domain events, not DOM updates or network calls.
4. Have browser gameplay and the CLI solver import that same module. Remove VM execution and source-marker slicing only after equivalence is verified.
5. Separate input, renderer, camera, audio and network adapters. Make resource and event-listener cleanup explicit.

Exit: development and production builds run; extracted representative shots match the baseline within documented tolerances; the solver imports the actual simulation; no physics import depends on browser APIs or Three.js.

### M2 — Normalize course data and validation

1. Convert positional map tuples into named, validated records with stable course IDs, putt IDs and a schema version. Keep an adapter to legacy tuples until all consumers migrate.
2. Make course data the single source for gameplay, renderer, solver and difficulty metadata. Retain all 22 current maps, showing only the six starters in normal voting.
3. Port arena generation into typed data transformations. Generate assets/data, not JavaScript replacements inside HTML.
4. Validate geometry dimensions, references, playable bounds, cup sizes, tee/cup positions, pars, penalties and timers. Validate all loaded courses in CI.
5. Tie difficulty output to the simulation/configuration version and course content hash. Report stale results instead of treating recorded counts as current evidence.

Exit: every course validates, generated starter maps match their source, and no source-text patching is needed for course tools.

### M3 — UI and lifecycle migration

1. Build React components for lobby, room status, map voting, HUD, scorecard, results and practice controls, using CSS Modules.
2. Implement room lifecycle with XState and typed commands/events. First preserve existing transition rules, tie breaking, timers and scoring.
3. Publish immutable UI snapshots at an appropriate rate. React subscribes through useSyncExternalStore; renderer reads simulation snapshots directly. Do not drive 240 Hz physics through React state.
4. Keep pointer/keyboard input in its own adapter and preserve existing shot-release sway behavior. Clean up bindings on leaving a session.
5. Add desktop keyboard navigation, labels, focus management and resize handling.

Exit: all existing modes complete through the actual UI; practice and tournament behavior, scorecards, spectators and timeouts match the baseline. No duplicate loops, event handlers or audio contexts after repeated joins/leaves.

### M4 — Harden private-room networking

1. Preserve the host-and-guests topology and current trust model first. The host owns room transitions; clients still simulate their balls. This is not anti-cheat or server-authoritative physics.
2. Put PeerJS behind the shared room interface and test it through a fake transport.
3. Define a protocol version, session/round IDs, message sequence numbers, payload size limits and Zod schemas. Reject incompatible clients, stale rounds, malformed values and unauthorized room commands.
4. Choose and enforce an explicit room capacity, including spectators, in both transport and UI. Do not silently inherit inconsistent existing connection limits.
5. Add interpolated remote movement and measure snapshot size/rate. Keep immediate local shot feedback and critical state transitions reliable.
6. Add connection progress, timeouts, retry and clear disconnect behavior. For a guest reconnect, use a short-lived host-issued resume identity; retain roster and scores for a defined grace period. Test identity restoration and duplicate/stale messages.
7. Keep host loss explicit: end the room with an actionable return-to-lobby path. Automatic host migration is deferred because it requires more than reconnecting a PeerJS peer.
8. Integrate managed TURN with short-lived credentials from a minimal endpoint. Confirm the signaling provider, service limits and credential origin restrictions. Keep direct connections when available.

Exit: four-player real-browser sessions finish a full game; invalid and stale messages are rejected; guest recovery works within the chosen grace period; host loss has a clean outcome. Verify direct and forced-relay connections, including players on separate networks. Fake networking alone is insufficient.

### M5 — Upgrade Three.js and verify desktop rendering

1. Upgrade the renderer in reviewable steps using the Three.js migration guide. Address outputEncoding/texture encoding changes, lighting, shader compatibility and deprecated APIs.
2. Preserve existing colors and art intent with before/after reference views. A library upgrade must not silently become an art redesign.
3. Profile scene rebuilds, allocation and rendering before optimizing. Reuse/dispose geometry, textures and materials correctly; apply instancing or batching only where measurements justify it.
4. Measure frame times on a named desktop reference device, including integrated graphics. Target 60 FPS on that agreed device and choose practical quality defaults based on measurements.

Exit: reference views are reviewed, supported desktop browsers render without errors, and repeated map changes do not accumulate GPU resources or listeners. Publish the measured performance baseline and any limitations.

### M6 — Release and retire legacy paths

1. Configure CI for npm ci, formatting/lint, tsc --noEmit, Vitest, production build and browser smoke tests. Keep exhaustive solver sweeps scheduled or manually invoked.
2. Deploy the static build to a preview environment and the TURN credential endpoint separately. Verify HTTPS, signaling, relay and asset loading from the deployed origin.
3. Set immutable caching for hashed assets and appropriate HTML caching. Protocol/configuration versions detect incompatible tabs rather than corrupting rooms after an update.
4. Complete manual desktop playtests covering controls, camera, sound, practice, tournaments, four-player rooms and network loss.
5. Keep a tested rollback artifact; archive legacy code after migration acceptance and retire marker-based tools and temporary adapters.
6. Replace stale HANDOFF.md architecture statements with a pointer to maintained docs; preserve historical feature decisions and logs.

Exit: a fresh checkout has documented setup/test/build commands; production-like preview passes; release and rollback instructions are complete. Publishing to production and paid service provisioning remain separate actions requiring the relevant user authorization.

## Optional physics experiment, after M1

Evaluate Rapier in an isolated prototype of a ramp, vertical drop and transport tube. Use its rigid-body collisions and queries while keeping golf-specific cup capture, surface drag, teleporters and scoring as explicit gameplay code. Replacing the engine will change trajectories and invalidate difficulty counts even if both engines are deterministic.

Compare gameplay feel, solver runtime, browser initialization, deployment size and integration complexity. Adopt only if the prototype materially simplifies the planned 3D topology. If selected, schedule a separate physics migration and retune/revalidate all starter courses; it is not a drop-in dependency upgrade.

## Parallel execution

Follow TASKS.md dependencies. Parallelize inventory and baseline collection first. After shared interfaces are frozen, separate simulation, renderer and UI owners can work concurrently with mocks. Course tools and tests can follow approved contracts. A single integration owner controls dependency manifests, lockfiles, shared contracts and milestone merges. Networking starts its behavior changes after room rules are characterized.

Each task should fit a reviewable change and have an explicit verification command. Do not equate a milestone with a single large PR. Preserve a runnable integration branch after each merge.

## Decisions still needed before dependent work

- TURN provider and monthly budget, before provisioning or endpoint integration. Local architecture and tests can proceed without this decision.
- Hosting target and CI provider, before deploying previews.
- Exact private-room capacity and guest reconnect grace period; proposed defaults are four active players and 30 seconds, subject to confirmation when M4 starts.
- Reference desktop hardware for performance acceptance, before setting M5 budgets.

## Sources

- [Vite guide](https://vite.dev/guide/) and [features](https://vite.dev/guide/features)
- [Three.js migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [React external-store integration](https://react.dev/reference/react/useSyncExternalStore)
- [XState state machines](https://stately.ai/docs/machines)
- [Zod validation](https://zod.dev/basics)
- [PeerJS connection and ICE configuration](https://peerjs.com/client/faq)
- [Vitest features](https://main.vitest.dev/guide/features)
- [Playwright browser coverage](https://playwright.dev/docs/browsers)
- [Rapier determinism and its initialization constraints](https://rapier.rs/docs/user_guides/javascript/determinism/)

Research checked 2026-10-25. These are planning choices, not installed dependencies or verified integrations.
