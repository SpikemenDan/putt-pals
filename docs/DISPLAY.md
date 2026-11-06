# Presentation settings

Sizes and looks that change what a player sees live in `src/shared/display.js` (`DISPLAY`, frozen, validated at load). Nothing here is read by the simulation, so a client may override these without desyncing a room or invalidating recorded difficulty. Anything that changes how the ball moves belongs in `TUNING` (docs/TUNING.md) instead. `createDisplay(overrides)` builds a validated variant; invalid values and unknown keys (typos) throw and are never partially applied.

Consumers: `createAimGuide(THREE, display)` (arrow width, head, opacity, length fallback), `createInputAdapter({ display })` (the arrow length reported by `frameAim`) and `createGameRenderer({ display })` (ball scale). The `loading` group is read by the loading screen (`src/ui/Loading.jsx`, `src/render/planet-scene.js`); `mountUi(root, { display })` passes the live object, and the dev panel's "Loading screen preview" button (bottom left) shows that screen without a room. Each defaults to `DISPLAY`; the aim guide reads its display on every frame, so a live display object takes effect immediately.

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
| `loading.spinSpeed` | 4 | 0 to 60 | Loading screen: planet rotation speed in degrees/s (0 holds it still). Ignored under reduced motion. |
| `loading.axisTilt` | 12 | -60 to 60 | Loading screen: tilt of the planet axis in degrees, so the poles lean up or down. |
| `loading.horizonHeight` | 0.48 | 0.3 to 0.9 | Loading screen: top of the planet as a fraction of the screen height from the top (higher = lower planet). |
| `loading.cloudCover` | 0.6 | 0 to 1 | Loading screen: how much of the planet the cloud layer covers (0 = clear, 1 = overcast). |
| `loading.cloudDrift` | 1.4 | 0 to 4 | Loading screen: cloud speed relative to the planet spin (1 = with the ground; higher slides ahead of it). |
| `loading.finishTime` | 0.8 | 0.1 to 3 | Loading screen: once the game is ready, seconds all three balls stay lit before the screen closes. |
| `loading.atmosphere` | 0.7 | 0 to 1 | Loading screen: strength of the blue air glow around the planet. |
| `loading.citySize` | 1.6 | 0.5 to 3 | Loading screen: size of cities, towns, villages and ports (the globe stays the same size). |
| `loading.lunaSize` | 2.6 | 1 to 8 | Loading screen: Luna's size in the sky; 1 is its true apparent size at the real Earth-Moon distance. |
| `loading.outlineWidth` | 1.6 | 0 to 4 | Loading screen: ink outline width on cities, ships, planes and clouds, px at 1280 wide; 0 is off. |
| `loading.planes` | 5 | 0 to 12 | Loading screen: planes flying between cities with contrails (whole planes; 0 hides them). |
| `loading.boats` | 9 | 0 to 20 | Loading screen: boats on the sea (whole boats; 0 hides them). |
| `loading.satellites` | 3 | 0 to 8 | Loading screen: satellites orbiting the planet (whole satellites; 0 hides them). |

## Development tuning panel

`npm run dev` shows a "Display tuning" button (bottom right). It lists every field above as a slider with its unit, range and default, plus per-field Reset, Reset all, Export and Import. Code is in `src/devtools/`; it is only included when vite's `import.meta.env.DEV` is true, so production builds contain none of it.

- Overrides are temporary: they live in this browser tab's `sessionStorage`, a **TEMP OVERRIDES** badge shows while any are active, and they never change `DEFAULT_DISPLAY`. To ship a value, edit the default in `src/shared/display.js` and the table above, then rerun the checks.
- Export gives `{"version": 1, "display": {...}}` containing only non-default values. Import validates the whole document (unknown keys, out-of-range values, shaft wider than head) and applies nothing if any part is invalid.
- Every field here is presentation-only, so every change applies live and nothing needs a restart or reset. The panel does not let you edit `TUNING` (physics, dimensions, shot mapping, session rules): changing those live would desync a match and invalidate difficulty evidence, so they are deliberately out of scope. It lists them read-only instead (see below).
- `window.__ppTuner` is available in dev for browser checks.

### Traceability

Each row in the panel shows the setting's units, range, default, that it applies live, and the source files that read it. A "Differences from shipped defaults" list at the top shows each active override as `default → current`, and the **TEMP OVERRIDES** badge stays on until you reset. Reset (per field or all), validated Export and the existing validated Import are unchanged. A collapsed "Simulation settings (TUNING), read-only" section lists every `TUNING` value with its units, the reload requirement and its readers.

The "read by" lists are derived from the source, never hand-kept: `src/shared/config-meta.js` follows `DISPLAY.a.b`, aliases such as `const a = display.aim`, destructuring and group-wide uses. The same data is available outside the browser:

```sh
npm run config:report                      # DISPLAY and TUNING: defaults, ranges, units, restart rule, readers
npm run config:report -- display --overrides exported-overrides.json   # validate an export and show how it differs
```

Units and the restart rule are the only things written by hand (`config-meta.js`); `tests/config-meta.test.cjs` fails if a setting has none, if a setting is read by nothing (the one known exception is the superseded `TUNING.aim.arrowMaxLength`), or if the derivation stops following a supported pattern. `tests/config-reach.test.cjs` checks that every DISPLAY setting changes its real consumers and that representative TUNING settings reach the simulation, input and effects code.

The traceability view (units, live notes, readers, the differences list and the read-only simulation section) was tried in the local preview and approved by the owner on 2026-11-03.

History: the first defaults (length 180, widths 1.3/3.6, head 8) were the pre-panel look. The owner found that arrow too narrow and far too long, so the defaults became length 100 and widths 2.6/7, head 14 (tried in the tuning panel and approved by the owner on 2026-11-02).
