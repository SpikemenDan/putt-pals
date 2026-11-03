# Presentation settings

Sizes and looks that change what a player sees live in `src/shared/display.js` (`DISPLAY`, frozen, validated at load). Nothing here is read by the simulation, so a client may override these without desyncing a room or invalidating recorded difficulty. Anything that changes how the ball moves belongs in `TUNING` (docs/TUNING.md) instead. `createDisplay(overrides)` builds a validated variant; invalid values and unknown keys (typos) throw and are never partially applied.

Consumers: `createAimGuide(THREE, display)` (arrow width, head, opacity, length fallback), `createInputAdapter({ display })` (the arrow length reported by `frameAim`) and `createGameRenderer({ display })` (ball scale). Each defaults to `DISPLAY`; the aim guide reads its display on every frame, so a live display object takes effect immediately.

`aim.arrowMaxLength` here is the authoritative arrow length. The older TUNING `aim.arrowMaxLength` (300) is read by nothing; removing it changes the simulation fingerprint and is a separate follow-up.

Units: world units (ball radius 5) and multipliers. Opacity is 0..1. The shaft half-width must not exceed the head half-width.

| Field | Default | Allowed range | Effect |
| --- | --- | --- | --- |
| `ball.visualScale` | 1 | 0.25 to 4 | Multiplier on the drawn ball size. Visual only: collision and cup fit use TUNING `ball.radius`. |
| `aim.arrowMaxLength` | 100 | 1 to 2000 | World-unit length of the aim arrow at full power (no minimum). |
| `aim.arrowShaftHalfWidth` | 2.6 | 0.1 to 50 | Half the width of the aim arrow shaft. |
| `aim.arrowHeadHalfWidth` | 7 | 0.1 to 100 | Half the width of the aim arrow head. |
| `aim.arrowHeadLength` | 14 | 1 to 200 | Length of the aim arrow head (capped at half the arrow so short arrows stay readable). |
| `aim.arrowOpacity` | 0.92 | 0.05 to 1 | Opacity of the aim arrow. |

## Development tuning panel

`npm run dev` shows a "Display tuning" button (bottom right). It lists every field above as a slider with its unit, range and default, plus per-field Reset, Reset all, Export and Import. Code is in `src/devtools/`; it is only included when vite's `import.meta.env.DEV` is true, so production builds contain none of it.

- Overrides are temporary: they live in this browser tab's `sessionStorage`, a **TEMP OVERRIDES** badge shows while any are active, and they never change `DEFAULT_DISPLAY`. To ship a value, edit the default in `src/shared/display.js` and the table above, then rerun the checks.
- Export gives `{"version": 1, "display": {...}}` containing only non-default values. Import validates the whole document (unknown keys, out-of-range values, shaft wider than head) and applies nothing if any part is invalid.
- Every field here is presentation-only, so every change applies live and nothing needs a restart or reset. The panel does not expose `TUNING` (physics, dimensions, shot mapping, session rules): changing those live would desync a match and invalidate difficulty evidence, so they are deliberately out of scope.
- `window.__ppTuner` is available in dev for browser checks.

History: the first defaults (length 180, widths 1.3/3.6, head 8) were the pre-panel look. The owner found that arrow too narrow and far too long, so the defaults became length 100 and widths 2.6/7, head 14 (tried in the tuning panel and approved by the owner on 2026-11-02).
