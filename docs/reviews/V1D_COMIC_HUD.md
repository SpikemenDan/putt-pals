# V1d comic HUD, scorecard, banners and lobby styling

Status: REVIEW pending; branch `agent/v1d-comic-hud` from origin/main c331833, issue #61 (`Closes #61`). Worker: Claude Code session, SpikemenDan account. Measured 2026-10-28.

## Scope

Comic styling for the in-game HUD, scorecard, banners, toasts, power meter and the landing, lobby, voting and results screens: flat saturated colour, thick ink outlines and hard offset shadows, to match V1a's toon ink look. Out of scope: main menu, loading screen and menu sounds (M1 #36). Text stays text-only; components, accessible labels, keyboard and mouse flows are unchanged.

## What changed

- `src/ui/global.css`: one fixed comic theme (the legacy light and dark purple themes are gone). Tokens: ink `#14102a`, paper `#fff8e4`, sky blue, yellow, pink, cyan, green, red. Halftone-dot sky page background, heavy system font stack (`Arial Black` / `Segoe UI Black`; no web font, so no dependency or bundle change), inked inputs and buttons with a hard 4 px shadow that presses down on click, a visible ink-and-white focus ring.
- `App.module.css`: cream cards with a 4 px ink border and 8 px hard shadow, comic headings (ink text with a yellow offset shadow), yellow network notice.
- `Hud.module.css`: yellow info pill (red when the clock warns), cream control panels, scoreboard and button bar with ink outlines, inked canvas frame, a three-band power meter (green, yellow, red) whose bands stay fixed while the fill grows (container query units), outlined white toast text. The mobile (static) layout is unchanged.
- `Banner.module.css`: a tilted comic caption panel with a hard shadow; yellow by default, pink for hole-in-one, cyan for power-ups. Reduced-motion behaviour is kept.
- `MapSelect.module.css`/`.jsx`: inked white cards, yellow selected card; thumbnails use the toon palette colours.
- `Row.module.css`, `buttons.module.css`, `Scorecard.module.css`: matching ink outlines; the paper scorecard keeps its paper look with an ink border, hard shadow and an inked close button.
- `Landing.jsx`, `RoomLobby.jsx`: two inline text colours moved to the theme's dark pink so they read on cream.
- `scripts/check-build.cjs` (shared build script, changed with the user's approval on 2026-10-28; integration-owner change): the I1 assertion that the built app CSS contains `backdrop-filter` is replaced by a check that the app page links built CSS. It guarded the glass panels, which no longer exist.

## Design decisions

- Pure CSS: no component logic, DOM structure, labels or class names changed (CSS Module names are the same), so the jsdom UI tests and the real-browser flows are unaffected.
- Cream panels replace the glass: opaque ink-outlined panels stay readable over any course colour, including the new per-map palettes of V1c (PR #78).
- Colour contrast (WCAG ratios): ink on cream 17.4, ink on yellow 12.8, ink on pink 5.5, ink on cyan 9.5, yellow on ink 12.8, white on red 5.0, dark pink on cream 6.3, muted text on cream 8.5, muted text on yellow 6.3, dark pink on yellow 4.6. The page footer "how to play" text moved into a cream panel because white on the sky background was only 4.0.
- `scripts/ui-visual-parity.cjs` compares the UI against the legacy pastel page and will no longer match; it is a manual tool (the committed T1 parity test was already dropped when V1/M1 replaced the pastel look).

## Verification

Run in a dedicated worktree on the Windows machine (AMD Radeon 860M / RTX 5060 Laptop GPU, Windows 11, Chrome channel):

```sh
npm test                      # exit 0 (includes npm run build and its check)
npx vite build && npx vite preview --host 127.0.0.1 --port 4180 --strictPort
PP_TEST_PORT=4180 PP_REUSE_SERVER=1 npx playwright test --project=chromium   # 16 passed (12.3 min)
node <capture script> <worktree> <url> <out> 1280|600      # eight screens, desktop and narrow, before and after
node <timing script> <worktree> <url> before|after low|high # 3 x 380 RAF intervals in a solo game at the tee
```

The Chromium suite ran against a manual build made before the check-build relaxation; the same build path then passed in `npm test`. Firefox and WebKit are covered by hosted browser-ci, not run locally.

Real-browser frame times, mean RAF interval in ms (p95), solo game idle at the tee, vsync 144 Hz, three runs each:

| GPU | Before | After |
| --- | --- | --- |
| Radeon 860M | 6.95 (8.0), 7.09 (8.1), 6.97 (7.9) | 6.95 (7.5), 6.95 (7.4), 6.95 (7.4) |
| RTX 5060 | 6.94 (7.4), 6.95 (7.4), 6.94 (7.3) | 6.94 (7.4), 6.94 (7.3), 6.95 (7.3) |

The HUD is DOM over the canvas and the new styles have no blur, so no cost is expected and none is measured. Intervals only; no GPU timers. No page or console errors in any capture run.

Screenshots (before and after, desktop 1280 px wide and narrow 600 px wide): landing, lobby, voting, countdown, game with HUD and scoreboard, scorecard overlay, hole-in-one banner, results. Strips: `tests/fixtures/ui-comic/{before,after}-{desktop,narrow}.png`.

## Limits and not covered

- Not captured: the low-time warning HUD state (red info pill), inventory slots with items (attack and ghost styles), the practice bar, spectator and reconnect notices, the network-lost notice, the WebGL-unavailable notice. They use the same tokens but were not screenshotted.
- Not run: Firefox and WebKit locally, multiplayer screens by eye, a screen reader pass, forced-colors mode.
- The font stack falls back by platform (macOS has Arial Black; Linux may fall back to Arial bold), so headings can look different there.
- Dark-mode preference is ignored: the theme is fixed.
