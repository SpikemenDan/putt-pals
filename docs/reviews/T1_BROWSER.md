# T1 browser tests review handoff

Task: [T1 #15](https://github.com/SpikemenDan/putt-pals/issues/15), browser integration and Playwright test suite. Worker: Claude Code (Opus) coordinator session, self-claimed. Branch `agent/t1-browser-tests` from main `99b1d72`. Status: ACTIVE, partial delivery (PR uses "Refs #15", not "Closes").

## Delivered

- `playwright.config.cjs`: Chromium, Firefox, and WebKit projects; 1 worker; 300 s test timeout; `webServer` automatically runs `npm run build` then `vite preview` on `127.0.0.1:4173`.
- `tests/browser/support/global-setup.cjs`: Starts a local PeerServer on `127.0.0.1:9310` path `/pp` via the `peer` package.
- `tests/browser/support/app.cjs`: Test helper injecting `window.__PP_PEER_SERVER` (with `iceServers: []` to prevent public network access) and `window.__PP_APP_HOOK` to inspect app state.
- `tests/integration/out-of-bounds.test.cjs` (`npm run test:integration`, in `npm test` and the baseline CI job): ports the legacy smoke assertion tools.js:202 (a splash after 12 strokes does not end the putt) to `outOfBounds()` in src/simulation/physics.js, which had no test. A check of the other legacy smoke assertions found them already covered by test:app, test:session, test:render, test:input, test:ui and test:audio, so they were not duplicated.
- Playwright specs:
  - `tests/browser/solo.spec.cjs`: Full six-putt Switchback Garden map, six holes in one, WebGL canvas validation (>20 distinct colours), banner, results text, leave flow.
  - `tests/browser/input.spec.cjs`: Real mouse drag on canvas moving power meter and recording STROKES 1; C key shortcut ("View: Hole view"); K shortcut (scorecard).
  - `tests/browser/practice.spec.cjs`: Putt practice flow (putt 3, replay after sinking, Next putt, Maps).
  - `tests/browser/multiplayer.spec.cjs`: Four browser contexts on real PeerJS/WebRTC through local PeerServer (loopback), full map, all players 6 holes in one, results validation, remote ball rendering across all pages (skipped when browser lacks `RTCPeerConnection`).
  - `tests/browser/lifecycle.spec.cjs`: five solo putt-practice cycles through the real UI (start, putt, open/close the scorecard, Exit, Leave room), then three online cycles on the local PeerServer (skipped without RTCPeerConnection). A probe installed before the app loads counts window/document/canvas listeners, pending timers, pending animation frames and WebGL canvases, and only observes. Chromium locally: counts identical after every cycle (29 listeners, 1 timer, 1 animation frame, 1 WebGL canvas); every signalling WebSocket closed after leaving.

## Implementation Details

| Area | Detail |
| --- | --- |
| Shots & Aim | Full-map flows use the exact `shot` command emitted by the input adapter on release, using robust solver aim from `tests/fixtures/solver-baseline.json` (bypassing time-based mouse-drag sway inaccuracy). `input.spec.cjs` explicitly covers the real mouse-drag path. |
| App Inspection | `window.__ppApp` is read-only for test assertions; never written. No game state is injected: players act through the real UI, and full-map shots use the input adapter's `shot` command. |
| Dependencies | DevDependencies `@playwright/test` (1.64.0) and `peer` (1.0.2) with exact pins; integration-owner approved, lockfile additive only. |
| Script | `npm run test:browser` = `playwright test`. Excluded from `npm test` due to execution duration (~10 minutes). |
| Diagnostics | failures on the start screen and on joining append the page's full console log; every banner the page shows is recorded so short-lived banners can be asserted; Playwright actions time out after 15 s. |

## CI & Test Results

- **CI**: New `browser-ci` job in `.github/workflows/ci.yml` matrix (`chromium`, `firefox`, `webkit` on `ubuntu-latest`), installs browser dependencies (`npx playwright install --with-deps`), runs tests per project, and uploads reports on failure. Hosted CI status: pending (fill in from PR).
- **Local Results** (Windows 11, Node 24.21.0; CI uses Node 26.10.0):
  - *Chromium*: All specs pass (`solo`: 2.2 min, `input`: 46 s, `practice`: 47 s, `multiplayer`: 4.7 min).
  - *WebKit*: Solo, input, practice pass; multiplayer skipped (Playwright Windows WebKit lacks `RTCPeerConnection`).
  - *Firefox*: Not run locally (Windows refuses Playwright `firefox.exe` with "side-by-side configuration is incorrect" error even after a forced re-download); to be covered by the Linux browser-ci job (result pending).

## Findings & Remaining Scope

- **Finding for N2 (#13)**: When a browser has no WebRTC support, pressing "Join room" leaves the player on the landing screen silently with no message, console error, or network request. N2 owns actionable connection error handling.
- In standard and tournament modes the game screen has no Leave control; players leave from the lobby or map picker only.
- **Not Yet Done (T1 remains ACTIVE)**:
  - Hosted browser-ci: the first run failed (Chromium solo banner timing and multiplayer time limit, both fixed; Linux WebKit multiplayer join and Firefox start screen, causes pending the diagnostics in the next run).
  - Course-practice timeout scenario (requires 2-minute real wait).
  - Real GPU frame times (R2) and manual audio listening tests.

## Scope Change

The legacy UI screenshot-parity test was dropped from T1 with user approval because the comic redesign (#33 V1, #36 M1) replaces the look it compares against; scripts/ui-visual-parity.cjs stays as a manual tool.

## Delegation Note

The input and practice specs were initially drafted by Gemini CLI and subsequently corrected by Claude Code (fixing power-meter pixel assertions against '0%', non-existent `cardOpen` property references, and extending test timeouts for real-time pacing). Gemini wrote tests/integration/out-of-bounds.test.cjs (accepted as written) and the smoke-gap analysis, which overstated gaps (it compared only some test files and cited wrong tools.js lines) and was rechecked by Claude.
