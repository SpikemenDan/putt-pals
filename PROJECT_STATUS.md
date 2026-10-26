# Project status

Last updated: 2026-10-25.

## Current objective

B2 is committed as 3bfaebd, B3 as 216cd75, W1 as b333495, and B1 was integrated via PR #1 (1c5d66c). Task C1 (Shared Contracts) is implemented on branch agent/c1-shared-contracts and all contract verification tests pass. Game HTML, simulation tools, and embedded legacy runtime scripts remain unchanged.

Confirmed user decisions: private friend rooms; desktop browsers; no requirement for a single offline HTML; prefer established libraries; support concurrent agent work.

## Repository baseline

- Three original files: putt-pals.html, tools.js, HANDOFF.md.
- No package.json, lockfile, standard build, or CI configuration found in the initial review.
- HTML contains Three.js r128 and PeerJS plus application code.
- Historical roadmap says P1–P32 done; P33–P61 unfinished. This is historical status, not fresh verification.
- 22 maps in the actual code; six starters and 36 starter putts.

## Verification actually run during review

| Command | Result |
| --- | --- |
| node --check tools.js | Passed |
| node tools.js check | Passed: syntax, 22 maps, no empty slots, starter par/penalty/time metadata |
| node tools.js surfaces | Passed: all 19 surface/timer checks |

Not run during this review: cups, mechanics, full/fast solver suites, rank, jsdom smoke, multiplayer smoke, real browser rendering, audio, real-network multiplayer. Historical pass counts in HANDOFF.md are not new results.

## Known issues and evidence

1. Fixed in B2: tools.js solve() previously initialized velocity with pw * 820 while game launch() used POWER=900. It now delegates to the same launch function. Exhaustive difficulty measurements still need recomputing.
2. LADDER contains recorded counts; rank checks those historical counts rather than recomputing current physics difficulty.
3. Tools couple to source markers in the HTML, making function moves risky.
4. Historical architecture notes contain old constants such as R=6 and MAXS=8. Current game has R=5 and unlimited strokes within the timer, with timeout rules. Prefer current code and validated behavior.
5. Multiplayer clients report gameplay state; host coordination does not provide anti-cheat. Host migration is absent, and relay configuration is currently manual.

## Next implementation action

Review and merge C1 shared contracts. Following C1 acceptance, parallel tasks S1 (Headless Simulation), R1 (Renderer extraction), U1 (UI & Controls), and A1 (Audio adapter) can proceed against the approved contracts in src/shared/ with high-fidelity mocks.

## B2 verification — 2026-10-25

- node --check tools.js and node --check tests/solver-baseline.cjs: passed.
- node tools.js check: passed, 22 maps and 36 starter putts.
- node tools.js surfaces: 19/19 checks passed.
- node tools.js cups: 7/7 checks passed.
- node tools.js mechanics: 8/8 checks passed with the corrected solver.
- node tests/solver-baseline.cjs: launch initialization passed at nine angle/power combinations; solver delegation passed for the candidate and nine robustness trials; all 36 starter putts have robust shots at POWER=900.
- Measured solutions: tests/fixtures/solver-baseline.json includes source hashes, robustness offsets and zero-based map/putt indices. Regenerate with node tests/solver-baseline.cjs; it deliberately overwrites the measured fixture. These are first-robust-shot results, not full difficulty counts.
- Gameplay HTML and physics remained unchanged. Browser/jsdom/multiplayer checks were not run for B2. B2 installed no dependencies; it was subsequently committed as 3bfaebd at the user's request.

## B3 verification — 2026-10-25

- Installed exact Vite 8.3.5 and jsdom 30.1.3 development dependencies and recorded the dependency tree in package-lock.json. Node engine requirements match jsdom; verified on Node 26.10.0 and npm 11.19.1.
- npm ci --cache /private/tmp/putt-pals-npm-cache --offline: passed, proving reinstall from the lockfile with the populated cache. Initial downloads required network approval. The temporary cache path is only a local verification detail; normal setup is npm ci.
- npm run build: passed; outputs dist/putt-pals.html. The build check compares embedded library/game script content exactly and verifies key UI elements.
- npm run check: passed, 22 maps and 36 starter putts. node --check scripts/check-build.cjs and node --check vite.config.mjs also passed.
- npm run test:smoke: SMOKE PASSED, with no runtime errors.
- npm run test:multiplayer: MULTI SMOKE PASSED, including four fake-network clients, voting, scoring, timeouts and disconnect handling.
- npm run test:physics: all 19 surface/timer, seven cup and eight mechanic checks passed. The npm test component commands were run individually; the full aggregate was not repeated.
- Vite createServer()/preview() HTTP checks: both returned the game successfully on temporary loopback ports; servers closed afterward. Sandbox loopback restrictions required approval for this verification.
- Game HTML hash still matches the B2 fixture. No runtime dependency upgrade or behavior change. jsdom uses stubbed graphics/audio and a fake network; real browsers and real WebRTC remain B1/later acceptance work.
- TypeScript, lint/format configuration, module extraction and CI are not added by B3. README.md documents the available commands and the temporary /putt-pals.html entry URL.
- B3 is committed as 216cd75. Temporary verification servers have been stopped.

## B1 pause and W1 handoff — 2026-10-25

- B1 is PAUSED, not complete: user held it to define the GitHub workflow. No browser reference screenshots or maintained inventory artifacts were created.
- Source inspection found Three.js r128/MIT and PeerJS 1.5.4/MIT metadata. This does not constitute browser verification.
- Browser inventory had native Firefox available, but selecting it returned “Computer Use permissions are not granted.” No permission changes were made. The local Vite server started for B1 was stopped after the user held the task.
- W1 adds docs/GITHUB_WORKFLOW.md, GitHub Agent task and PR templates, and a baseline-ci workflow. The workflow uses the already-existing npm commands; no application/dependency changes are part of W1.
- GitHub issues become the live owner/status record once created. TASKS.md is a coordinator-maintained roadmap/history snapshot; PROJECT_STATUS.md records accepted integration state. This avoids competing edits by workers.
- User approved committing and pushing W1's files. Hosted CI acceptance remains pending. Branch protection, task issue creation and agent dispatch are separate setup steps and have not been performed. This explicit bootstrap approval covers a direct push; subsequent tasks follow the PR workflow.
- Local W1 verification: YAML syntax parsed for both YAML files; CI job name, unique form field IDs and npm script references checked. npm run check, npm run build and git diff --check passed. These checks do not establish GitHub schema acceptance or a hosted runner result; physics/smoke implementations were unchanged and their suites were not repeated.

## B1 review handoff — 2026-10-25/26

- User resumed B1 and explicitly requested Chrome after Firefox access problems. Seven unedited Chrome screenshots are saved under tests/fixtures/browser-baseline/ with a manifest containing source hashes, dimensions, capture context and limitations.
- Real UI evidence: landing, solo lobby, six starter cards, actual rendered Switchback Garden, Ball/Hole/World cameras, one pointer-driven stroke, live scorecard, Escape close and sound/quality control labels. Sound and quality were restored to On/High. No successful sink or full browser game completion is claimed.
- docs/BASELINE.md inventories implemented behavior with source/jsdom/Chrome evidence separated. docs/THIRD_PARTY.md records Three.js r128 (0.128.0 inferred)/MIT and PeerJS 1.5.4/MIT source metadata and attribution limits.
- scripts/inventory-baseline.cjs generates/checks tests/fixtures/source-inventory.json: source/library hashes, all 22 course definitions' rule/geometry inventory and six representative one-stroke traces using real launch/step functions. Headless trace conditions are explicit and not a real input replay.
- Commands: node scripts/inventory-baseline.cjs --write; node scripts/inventory-baseline.cjs --check; node --check scripts/inventory-baseline.cjs; git diff --check. Passed. No dependency or game/tool changes required.
- Chrome showed blank content after reload; HTTP still served the game, and a later native capture failed with ScreenCaptureKit -3812. Root cause unresolved. Practice/results/tournament completion, console audit, audio quality, actual performance and real WebRTC/TURN are not browser-verified by B1.
- Hosted Baseline CI run 40247672160 succeeded for b333495: https://github.com/SpikemenDan/putt-pals/actions/runs/40247672160. This verifies W1's existing headless/build workflow on GitHub, not the new B1 artifacts.
- Status: REVIEW, not DONE; user approved the B1 commit and branch push. PR creation, integration and merge approval remain pending. No GitHub issues/PRs/settings changes or agent dispatch performed for B1.

## Update format for future owners

Append the date, task ID, concrete changes, exact verification commands/results, known failures and next dependency. Keep planned work distinct from completed/verified behavior. Do not include credentials or private relay tokens.

## C1 verification — 2026-10-25

- Implemented pure shared contracts and mocks in `src/shared/`:
  - `constants.js`: physics constants ($R=5$, $CUP=15/8$, $POWER=900$, $\Delta t=1/240$, drag coefficients), course limits, tournament starters, protocol version ($1$), player colors.
  - `coords.js`: bidirectionally tested transforms between simulation ground plane ($[x,y,z]$) and Three.js 3D world space ($[x, y+R, z]$).
  - `scoring.js`: pure calculation for timeout scoring ($Math.max(strokes, par + penalty)$), scorecard summaries, and tournament rankings with tie-breaking.
  - `courses.js`: schemas and validation for putts and courses, enforcing starter course constraints and time limits ($120..600$s).
  - `protocol.js`: message schemas and boundary validators for player presence, room snapshots, and guest votes.
  - `simulation.js`: pure player simulation state record factory, $applyShot$ launch physics, and typed domain events.
  - `session.js`: session phases, game modes, commands, and deterministic voting resolution with tie-breaking.
  - `transport.js`: connection states and room transport contract interface.
  - `render.js`: camera modes, immutable render snapshot factory, and AABB sightline obstruction raycasting for wall fading.
  - `mocks.js`: high-fidelity `MockSimulation`, `MockTransportHub`, and `MockTransport` for parallel consumer testing.
- `src/package.json`: configured `{"type": "module"}` to ensure seamless ES module imports without Node typeless warnings or impacting root CommonJS tools.
- `tests/contracts.test.cjs`: 9 test suites covering all modules, roundtrip transforms, scoring rules, schemas, and mocks. Passed 9/9.
- `package.json`: added `test:contracts` script and integrated it into `npm test`.
- `ARCHITECTURE.md`: updated with full contract specifications.
- Regression verification: `npm run check`, `npm run build`, `npm run test:physics`, `npm run test:smoke`, `npm run test:multiplayer`, and `npm test` all passed with zero errors.
