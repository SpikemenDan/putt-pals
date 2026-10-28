# Putt Pals modernization plan

Status: baseline, shared contracts/simulation, D1 data/CLI delivery and L1 lifecycle are on main. N4a's server-room contract is integrated through PR #74 at `b30552f`; N4b's local Worker/SQLite Durable Object and Static Assets/WebSocket routing scaffold is integrated through PR #75 at `be77190`. The scaffold does not implement room protocol, gameplay authority, durable recovery, browser adoption or deployment. N1 transport delivery is tracked through PR #24 (72b7498 plus review fixes), with acceptance effective after green CI and merge; A1 procedural audio is delivered through PR #25 with acceptance after green CI/merge/verification; browser adoption, real listening and real-network validation remain outstanding. See TASKS.md and PROJECT_STATUS.md for verified completion; the milestone gates below remain the migration plan.

## Confirmed scope

- Private rooms for friends.
- Desktop browsers only. Native applications are outside this migration.
- Normal hosted web application; a single downloadable HTML and offline distribution are not required.
- Use established libraries where they remove maintenance work.
- Multiple agents may work concurrently through assigned GitHub issues and isolated branches/PRs; use docs/ISSUES.md to discover and claim work, following AGENTS.md and docs/GITHUB_WORKFLOW.md. TASKS.md remains the roadmap snapshot, not a competing live queue.
- Preserve existing game modes, scoring, starter courses, controls, camera behavior and audio during extraction. The art direction recorded in HANDOFF.md remains a future product requirement; it is not a migration acceptance criterion.

## Recommendation

Incrementally extract and modernize the existing game. Keep its custom physics initially. The user selected server-owned private rooms on Cloudflare Workers + SQLite-backed Durable Objects over WebSockets (N4 #65, 2026-10-28); retain the current PeerJS runtime until the new path passes acceptance. Establish a shared simulation and trustworthy tests before upgrading rendering or changing behavior. Do not implement the unfinished P33–P61 feature backlog as part of this migration.

## Technology decisions

| Responsibility | Choice | Reason and limits |
| --- | --- | --- |
| Development/build | TypeScript, Vite, npm with package-lock.json | Standard module builds and reproducible installs. Run TypeScript checking explicitly; Vite transpilation is not a type check. |
| 3D rendering | Three.js | Preserve existing renderer and shaders; upgrade from r128 as a separate milestone. Use direct Three.js rather than adding a second scene abstraction during extraction. |
| Menus and HUD | React, CSS Modules | Replace imperative screen construction with components. Keep physics and per-frame mesh updates outside React. Preserve existing visuals before any redesign. |
| Room lifecycle | XState | Model lobby, voting, playing, results and disconnect states with explicit events and guards. Separate room lifecycle from individual ball states. |
| Boundary validation | Zod | Validate course files and untrusted network messages with shared schemas and explicit limits. TypeScript alone does not validate incoming data. |
| Networking | WebSockets to a Cloudflare Worker + one SQLite-backed Durable Object per room (N4 target) | Server owns room coordination; browser physics stays local. Current PeerJS remains until migration acceptance. |
| Room hosting | Cloudflare Workers Free plan initially; measured quotas | N4 replaces the planned gameplay TURN path. N3 #14 remains paused. Account changes, deployment and paid upgrades require separate authorization. |
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

**Updated target — N4 #65:** the following original PeerJS/TURN list is preserved as historical migration context, not the selected new implementation. See [server-room contracts](docs/networking/SERVER_ROOMS.md) and #66/#68–#73 for the replacement work. Backend owns membership/voting/scoring/timers/round transitions; clients retain local simulation and interpolation. Secure WebSockets remove gameplay signaling/TURN dependence. The creator is a controller player; their departure does not end the room. Controller succession, reconnect and empty-room durations are validated configuration with user-confirmed defaults of immediate/30 seconds/15 minutes.

Replacement exit gate: four-player actual-browser/separate-network games through an authorized deployed Worker; controller departure, guest recovery, hibernation/restart deadline catch-up, forged/stale/versioned messages, bounded queues/admission and quota failure tested; compatible persistence/deployment/rollback and usage measurements documented. Local contract/mocks cannot establish this gate. N3 stays paused; Q1 waits on accepted N4.

The accepted implementation sequence is tracked by N4 #65 and child issues:

1. N4a #66 — agree server-room protocol, controller/lifecycle policy, versioned durable checkpoint and deadlines. Integrated on main at `b30552f`; see [the accepted contract](docs/networking/SERVER_ROOMS.md).
2. N4b #68 — reproducible local Worker, SQLite-backed Durable Object and static/WebSocket routing setup. Integrated through PR #75 at `be77190`; see [local Cloudflare setup](docs/networking/CLOUDFLARE_SETUP.md). Protocol/game authority and persistence remain N4c/N4d work.
3. N4c #69 — server-owned lifecycle authority, socket admission, bounded queues and message/rate validation.
4. N4d #70 — durable checkpoint restore, alarms, reconnect/controller recovery and hibernation behavior.
5. N4e #71 — browser WebSocket client and UI cutover while retaining local solo play and physics.
6. N4f #72 — cross-browser local-runtime coverage, quota/performance measures and abuse/failure tests.
7. N4g #73 — only after separate authorization, deploy a preview and validate secure WebSockets, separate-network play and rollback.

The browser remains client-trusted for ball physics; the backend owns room lifecycle and scoring coordination. The creator is a player/controller, not a server owner, and leaving does not end the room. Keep four-member capacity, local solo play and existing game modes. The detailed exit gate is in N4 #65: real deployed separate-network browser sessions, controller departure, recovery across hibernation/restart, validation/rate/admission limits, quota evidence and compatible rollback. N3 TURN is paused and is not a prerequisite or fallback.

### M5 — Upgrade Three.js and verify desktop rendering

1. Upgrade the renderer in reviewable steps using the Three.js migration guide. Address outputEncoding/texture encoding changes, lighting, shader compatibility and deprecated APIs.
2. Preserve existing colors and art intent with before/after reference views. A library upgrade must not silently become an art redesign.
3. Profile scene rebuilds, allocation and rendering before optimizing. Reuse/dispose geometry, textures and materials correctly; apply instancing or batching only where measurements justify it.
4. Measure frame times on a named desktop reference device, including integrated graphics. Target 60 FPS on that agreed device and choose practical quality defaults based on measurements.

Exit: reference views are reviewed, supported desktop browsers render without errors, and repeated map changes do not accumulate GPU resources or listeners. Publish the measured performance baseline and any limitations.

### M6 — Release and retire legacy paths

1. Configure CI for npm ci, formatting/lint, tsc --noEmit, Vitest, production build and browser smoke tests. Keep exhaustive solver sweeps scheduled or manually invoked.
2. Deploy the static build and room Worker/Durable Objects to an authorized preview. Verify HTTPS/WSS routing, room admission and asset loading from the deployed origin.
3. Set immutable caching for hashed assets and appropriate HTML caching. Protocol/configuration versions detect incompatible tabs rather than corrupting rooms after an update.
4. Complete manual desktop playtests covering controls, camera, sound, practice, tournaments, four-player rooms and network loss.
5. Keep a tested rollback artifact; archive legacy code after migration acceptance and retire marker-based tools and temporary adapters.
6. Replace stale HANDOFF.md architecture statements with a pointer to maintained docs; preserve historical feature decisions and logs.

Exit: a fresh checkout has documented setup/test/build commands; production-like preview passes; release and rollback instructions are complete. Publishing to production and paid service provisioning remain separate actions requiring the relevant user authorization.

## Optional physics experiment, after M1

Evaluate Rapier in an isolated prototype of a ramp, vertical drop and transport tube. Use its rigid-body collisions and queries while keeping golf-specific cup capture, surface drag, teleporters and scoring as explicit gameplay code. Replacing the engine will change trajectories and invalidate difficulty counts even if both engines are deterministic.

Compare gameplay feel, solver runtime, browser initialization, deployment size and integration complexity. Adopt only if the prototype materially simplifies the planned 3D topology. If selected, schedule a separate physics migration and retune/revalidate all starter courses; it is not a drop-in dependency upgrade.

## Parallel execution

Follow TASKS.md dependencies and docs/GITHUB_WORKFLOW.md. The coordinator assigns one worker per GitHub issue with exclusive owned paths; workers use isolated branches/worktrees and linked PRs. GitHub is the live assignment/progress record, while common roadmap/status docs remain coordinator-owned. Local assignments apply only until issues exist.

Parallelize inventory and baseline collection first. After shared interfaces are merged and accepted, separate simulation, renderer and UI owners can work concurrently with mocks against the recorded contract commit. Course tools and tests can follow approved contracts. A single integration owner controls dependency manifests, lockfiles, shared contracts and milestone merges. Networking starts its behavior changes after room rules are characterized. Require applicable CI/review and user merge approval unless explicitly delegated; task plans do not launch agents or authorize remote writes.

Each task should fit a reviewable change and have an explicit verification command. Do not equate a milestone with a single large PR. Preserve a runnable integration branch after each merge.

## Decisions still needed before dependent work

- N4 Cloudflare account/preview deployment authorization, quota expectations and any later spending limit. N3 TURN provider selection is paused and not a prerequisite for the selected WebSocket architecture.
- Hosting target and CI provider, before deploying previews.
- N4 preserves four members including spectators/reservations. The user confirmed immediate controller succession, 30-second reconnect grace and 15-minute empty retention, with validated settings that can be changed for new rooms. See #66 for contracts and configuration bounds.
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
