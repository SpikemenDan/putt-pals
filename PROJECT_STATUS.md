# Project status

Last updated: 2026-10-25.

## Current objective

B2 completed and committed as 3bfaebd. B3 authorized as the next task on 2026-10-25: pinned npm dependencies, Vite development/build/preview, reproducible jsdom smoke tests and setup documentation. The game HTML remains unchanged.

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

B2 and B3 are complete. B1 (browser baseline) remains unassigned and is required before C1 shared contracts and extraction. Preserve the original HTML until parity gates pass.

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
- B3 changes are complete and approved by the user for commit. Temporary verification servers have been stopped.

## Update format for future owners

Append the date, task ID, concrete changes, exact verification commands/results, known failures and next dependency. Keep planned work distinct from completed/verified behavior. Do not include credentials or private relay tokens.
