# Engineering rules

Moved from AGENTS.md so the agent guide stays short. These rules apply to every contributor and agent; AGENTS.md links here.

## Engineering rules

- Keep behavior changes, physics tuning, refactors and visual redesigns in separate PRs. Anything that changes shot trajectories invalidates recorded difficulty; say so and plan a fresh sweep.
- Browser, CLI and solver import the same simulation (`src/simulation/`). It must not import DOM, React, Three.js, PeerJS or WebAudio; inject clocks and randomness and return domain events.
- Keep simulation coordinates x/y horizontal and z vertical; convert only in renderer adapters.
- Validate network messages and course files at their boundaries; static types do not validate runtime data. Keep names and peer content text-only and secrets out of bundles and source control.
- Keep React state out of physics ticks and mesh transforms.
- Gameplay numbers (friction, drag, shot power, gravity, cup size, bounce and rest thresholds, sway, power-up values) live in `src/shared/tuning.js`, which is validated at load; docs/TUNING.md lists every field. Do not add new numeric literals for them in simulation, input or render code. A retune is its own deliberate PR.
- New or changed course data must pass the CL1 geometry check (`node tools/cli/main.mjs check` and `npm run test:courses`). A deliberate overlap needs an entry in `GEOMETRY_INTEGRITY_EXCEPTIONS` (`src/courses/integrity.js`) with a reason and owner approval, never a quiet waiver.
- `simulationSha256` in `tests/fixtures/cup-capture/*.json` hashes the raw bytes of every `.js`, `.mjs` and `.json` file under `src/simulation` and `src/shared` (`hashSimulationSources` in `tools/cli/provenance.mjs`). Compute it from LF files (a Linux or macOS checkout or CI), never from a Windows tree with CRLF line endings, or the committed value will not match CI.
- `git stash` is shared by every worktree of a repository, so one agent can pop or drop another's entry. Do not use it; commit work in progress to your own branch instead.
- Use the libraries chosen in MODERNIZATION_PLAN.md; document alternatives before adding a dependency, and do not replace working domain code because a library exists.
- Gameplay features from the vision (power-ups, hazards, modes, cosmetics) follow ARCHITECTURE.md's design: catalogs are data, effects are simulation hooks that leave results bit-identical when inactive, randomness is injected and seeded, roaming hazards derive from synchronized room time, opponent effects travel as validated messages, solo and No Power-Ups pools are filtered by catalog flags, and cosmetics never affect physics. New course elements need a test chamber that proves a robust shot exists and fails without the element. Course geometry must pass the CL1 clearance validator (no interpenetrating solids). Course acceptance is a verified robust route within the putt's par (2 to 6 strokes); a hole-in-one is optional and must not be required.
- Art is original. The comic style is an inspiration only; do not copy characters, logos, lettering or artwork from existing works.
- `putt-pals.html` and `tools.js` are the legacy parity reference. Avoid changing them; if a change is unavoidable, patch with exact-match asserted replacements and run `node tools.js check` afterward. Visual and gameplay work (including the toon comic look) goes in `src/` and is shown by `index.html`; `npm run dev` and `npm run preview` open that page, so do not port new features into the legacy HTML.

## Verification and reporting

Use the commands that exist in package.json and the README command table; do not claim planned scripts or CI checks exist. Missing dependencies mean blocked or not run, not passed. Report real-browser and real-network validation separately from jsdom and fake transports. Run the suites relevant to your paths and the build before submitting.

Record exact commands, results and outstanding failures in the issue or PR. Never mark a gate complete because code was written. Follow docs/GITHUB_WORKFLOW.md for claim, pause, transfer and conflict handling.
