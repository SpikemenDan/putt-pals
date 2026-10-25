# Project status

Last updated: 2026-10-25.

## Current objective

Prepare the modernization plan and handoff/coordination documentation. No migration code has been changed or dependencies installed.

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

1. tools.js solve() initializes velocity with pw * 820; game launch() uses pw * POWER, with POWER=900. Correct this before trusting solver-based difficulty claims.
2. LADDER contains recorded counts; rank checks those historical counts rather than recomputing current physics difficulty.
3. Tools couple to source markers in the HTML, making function moves risky.
4. Historical architecture notes contain old constants such as R=6 and MAXS=8. Current game has R=5 and unlimited strokes within the timer, with timeout rules. Prefer current code and validated behavior.
5. Multiplayer clients report gameplay state; host coordination does not provide anti-cheat. Host migration is absent, and relay configuration is currently manual.

## Next implementation action, when authorized

Assign M0 tasks in TASKS.md. Establish reproducible baseline checks and shared contracts before parallel extraction. Preserve the original HTML until parity gates pass.

## Update format for future owners

Append the date, task ID, concrete changes, exact verification commands/results, known failures and next dependency. Keep planned work distinct from completed/verified behavior. Do not include credentials or private relay tokens.
