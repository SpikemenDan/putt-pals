# T1 browser tests review handoff

Task: [T1 #15](https://github.com/SpikemenDan/putt-pals/issues/15), browser integration and Playwright test suite. Worker: Claude Code (Opus) coordinator session, self-claimed. Branch `agent/t1-browser-tests` from main `99b1d72`. Status: ACTIVE, partial delivery (PR uses "Refs #15", not "Closes").

## Delivered

- `playwright.config.cjs`: Chromium, Firefox, and WebKit projects; 1 worker; 300 s test timeout; `webServer` automatically runs `npm run build` then `vite preview` on `127.0.0.1:4173`.
- `tests/browser/support/global-setup.cjs`: Starts a local PeerServer on `127.0.0.1:9310` path `/pp` via the `peer` package.
- `tests/browser/support/app.cjs`: Test helper injecting `window.__PP_PEER_SERVER` (with `iceServers: []` to prevent public network access) and `window.__PP_APP_HOOK` to inspect app state.
- Playwright specs:
  - `tests/browser/solo.spec.cjs`: Full six-putt Switchback Garden map, six holes in one, WebGL canvas validation (>20 distinct colours), banner, results text, leave flow.
  - `tests/browser/input.spec.cjs`: Real mouse drag on canvas moving power meter and recording STROKES 1; C key shortcut ("View: Hole view"); K shortcut (scorecard).
  - `tests/browser/practice.spec.cjs`: Putt practice flow (putt 3, replay after sinking, Next putt, Maps).
  - `tests/browser/multiplayer.spec.cjs`: Four browser contexts on real PeerJS/WebRTC through local PeerServer (loopback), full map, all players 6 holes in one, results validation, remote ball rendering across all pages (skipped when browser lacks `RTCPeerConnection`).

## Implementation Details

| Area | Detail |
| --- | --- |
| Shots & Aim | Full-map flows use the exact `shot` command emitted by the input adapter on release, using robust solver aim from `tests/fixtures/solver-baseline.json` (bypassing time-based mouse-drag sway inaccuracy). `input.spec.cjs` explicitly covers the real mouse-drag path. |
| App Inspection | `window.__ppApp` is read-only for test assertions; never written. No game state is injected: players act through the real UI, and full-map shots use the input adapter's `shot` command. |
| Dependencies | DevDependencies `@playwright/test` (1.64.0) and `peer` (1.0.2) with exact pins; integration-owner approved, lockfile additive only. |
| Script | `npm run test:browser` = `playwright test`. Excluded from `npm test` due to execution duration (~10 minutes). |

## CI & Test Results

- **CI**: New `browser-ci` job in `.github/workflows/ci.yml` matrix (`chromium`, `firefox`, `webkit` on `ubuntu-latest`), installs browser dependencies (`npx playwright install --with-deps`), runs tests per project, and uploads reports on failure. Hosted CI status: pending (fill in from PR).
- **Local Results** (Windows 11, Node 24.21.0; CI uses Node 26.10.0):
  - *Chromium*: All specs pass (`solo`: 2.2 min, `input`: 46 s, `practice`: 47 s, `multiplayer`: 4.7 min).
  - *WebKit*: Solo, input, practice pass; multiplayer skipped (Playwright Windows WebKit lacks `RTCPeerConnection`).
  - *Firefox*: Not run locally (Windows refuses Playwright `firefox.exe` with "side-by-side configuration is incorrect" error even after a forced re-download); to be covered by the Linux browser-ci job (result pending).

## Findings & Remaining Scope

- **Finding for N2 (#13)**: When a browser has no WebRTC support, pressing "Join room" leaves the player on the landing screen silently with no message, console error, or network request. N2 owns actionable connection error handling.
- **Not Yet Done (T1 remains ACTIVE)**:
  - Port `scripts/ui-visual-parity.cjs` into a Playwright visual test.
  - Port remaining legacy smoke assertions (`tools.js` smoke / smoke-multi) not covered by `test:app` into `tests/integration/`.
  - Real-browser repeated join/leave leak cleanup.
  - Course-practice timeout scenario (requires 2-minute real wait).
  - Real GPU frame times (R2) and manual audio listening tests.

## Delegation Note

The input and practice specs were initially drafted by Gemini CLI and subsequently corrected by Claude Code (fixing power-meter pixel assertions against '0%', non-existent `cardOpen` property references, and extending test timeouts for real-time pacing).
