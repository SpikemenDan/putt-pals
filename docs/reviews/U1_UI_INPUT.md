# U1 React UI and desktop input review handoff

Task: [U1 #7](https://github.com/SpikemenDan/putt-pals/issues/7), React screens and desktop input adapters. Worker: Claude (claude.ai session 015v2ri1Ws6wj6hzYTNCFWab) on branch `agent/u1-react-ui` from main `f72a374`. The user approved starting U1 and adding React in chat on 2026-10-27; the claim is recorded on the issue. Status: ready for REVIEW, not DONE.

## Delivered

- `src/ui/`: React 19 screens with CSS Modules: landing, room lobby with start countdown, map voting and putt-practice picker, in-game HUD (info line, bar buttons, putt-practice bar, inventory, toast, scoreboard, power meter, help text), paper scorecard overlay, results card, banner and disconnect notice. There is also a cached immutable UI store for `useSyncExternalStore`, pure view models ported from the legacy HUD/scorecard/results code, commands and join validation, and `mountUi()`/`createUiDispatcher()`.
- `src/input/`: desktop pointer and keyboard adapter producing typed commands and driving the R1 camera rig, plus the shared aim rules (spread, sway, shot angle).
- Tests: `tests/ui.test.cjs` (`npm run test:ui`), `tests/input.test.cjs` (`npm run test:input`) and helpers in `tests/support/`. Both suites are in `npm test` and CI.
- Real-browser evidence tooling, not in `npm test`: `scripts/ui-visual-parity.cjs` and `scripts/ui-visual-diff.py`.

The UI is built against the accepted L1 session snapshots (merged), which exceeds the C1 mock requirement. No legacy HTML, simulation, session, network, renderer or course code changed.

## Integration-owner items in this PR

- **Dependencies:** `react` and `react-dom` 19.3.1 pinned exactly (the plan's Menus/HUD choice). The lockfile change is purely additive: react, react-dom and scheduler. This container's npm 10 would also have stripped the existing `libc` fields from the lockfile, so the entries were added to main's lockfile unchanged and `npm ci` was verified.
- **Scripts/CI:** `test:input` and `test:ui` were added to `package.json`, the `npm test` chain and `.github/workflows/ci.yml`.
- **No Vite config change:** Vite 8 compiles JSX (automatic runtime) and CSS Modules natively. The tests build through Vite's API with `configFile: false`. I1 owns adding the app entry.

## Acceptance evidence

| Requirement | Evidence |
| --- | --- |
| Screens with accepted snapshots | `test:ui` drives the real L1 session (fake clock) through landing, lobby, a 2-player 3-map tournament (vote countdown, start countdown, putt/hole-in-one/winner/champion banners, HUD, results, guest and spectator views), course practice and putt practice (picker, practice bar). |
| Preserve user-visible behaviour | Same-state comparison with the legacy game in jsdom: HUD info line, scoreboard rows and colours (spectator, ties), every scorecard cell, class and leader highlight, scorecard title, results text and button label are identical. In Chromium, landing, lobby, voting, countdown, game HUD, scorecard and results are pixel-identical at 1280 px and 600 px; the only difference is the new focus ring (below). |
| Shot drag/release/cancel | `test:input`: seven drags covering power, direction, sway phase, Reversiball and Steady Aim give shots identical to the legacy launch bit for bit. The released angle equals the legacy guide dots' direction. Short pulls, Escape, pointer cancel, lost capture, blur, middle button and five guard states never shoot. |
| Keyboard shortcuts and focus | C/K/Escape/1–3/M dispatch commands; typing in fields is ignored; arrows and right-drag track the legacy camera angles exactly and rotate aim in hole view (legacy quirk preserved); free-roam keys, look and dolly. Scorecard focus moves to Close and returns to the opener. |
| Listener cleanup | The input adapter's ~25 listeners are all removed on dispose (tracked add/remove). Five mount/unmount rounds leave no store subscriptions, DOM or pending timers. Unmount removes the power meter subscription. |
| Physics/per-frame outside React | Aim updates write the power meter through refs: a React Profiler records zero commits and the store publishes nothing. The store publishes on room/local changes and a ~100 ms tick only. |

Sensitivity: 37 planted one-line bugs (12 input, 25 UI) were all caught by the suites. Closing the six gaps the first sweep found added assertions for: results scoreboard totals, unscored leader rows, the results map number, spectator results text, closing the card on selection and toggle-to-close.

## Findings

1. **Pre-existing production build bug (not U1):** `npm run build` minifies CSS with Lightning CSS. Where the legacy page declares `backdrop-filter` together with `-webkit-backdrop-filter`, the build keeps only the prefixed form. The built `dist/putt-pals.html` therefore has no frosted-glass blur on HUD panels, cards, map cards or the banner in Chrome and Firefox; the dev server is unaffected. `scripts/check-build.cjs` checks scripts only, not styles. U1's CSS Modules avoid the problem by declaring only the standard property, and the build adds the prefix. The legacy HTML and build configuration need an integration-owner decision (for example declare only the standard property, or adjust `build.cssMinify`/targets).
2. **Colour palette mismatch:** `PLAYER_COLORS` in `src/shared/constants.js` has four colours unrelated to the game's eight. The UI uses the legacy palette from `src/render/materials.js`. The session protocol carries no player colour, so the UI assigns colours by join order unless the app passes `local.colors` (legacy colours were random).
3. The legacy permanently hidden "Play selected map" button and the unused `#warp` overlay were not ported.

## Intentional differences

- Opening the scorecard moves focus to Close and closing restores it, so Close shows a focus ring. Added a11y attributes render nothing: dialog role, power meter role/value, `aria-pressed` on map cards, live regions and labels.
- Join errors are returned by `parseJoinRequest()` with the legacy wording; the application decides how to show them (legacy used `alert()`).

## Verification at the delivered head

Run on Node 22.23.4 after `npm ci`:

| Command | Result |
| --- | --- |
| `npm test` | RESULT_NPM_TEST |
| `npm run test:ui` | 12 scenarios passed |
| `npm run test:input` | 10 scenarios passed |
| `npm run build` | RESULT_BUILD |
| `node scripts/inventory-baseline.cjs --check` | RESULT_INVENTORY |
| `node scripts/ui-visual-parity.cjs` + `python3 scripts/ui-visual-diff.py` (Chromium via Playwright 1.63) | RESULT_PARITY |
| `git diff --check` | RESULT_DIFFCHECK |

Not verified: Firefox/WebKit rendering, real input devices, screen readers, and the UI wired to a live renderer, simulation and network (I1). The parity run hides the 3D canvas on both pages. Hosted CI runs on the PR.

## Next

- I1: mount `PuttPalsUi`, feed `store.setRoom/setLocal/tick` from the session/transport and simulation, give `createUiDispatcher` and the input adapter one command handler, and pass `input.frameAim()`/`input.keys` to `createGameView().frame()`.
- T1: adopt `scripts/ui-visual-parity.cjs` into `tests/browser` with Playwright as a dependency.
