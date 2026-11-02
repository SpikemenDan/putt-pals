# Presentation settings

Sizes and looks that change what a player sees live in `src/shared/display.js` (`DISPLAY`, frozen, validated at load). Nothing here is read by the simulation, so a client may override these without desyncing a room or invalidating recorded difficulty. Anything that changes how the ball moves belongs in `TUNING` (docs/TUNING.md) instead. `createDisplay(overrides)` builds a validated variant; invalid values and unknown keys (typos) throw and are never partially applied.

Consumers: `createAimGuide(THREE, display)` (arrow width, head, opacity, length fallback), `createInputAdapter({ display })` (the arrow length reported by `frameAim`) and `createGameRenderer({ display })` (ball scale). Each defaults to `DISPLAY`; the aim guide reads its display on every frame, so a live display object takes effect immediately.

`aim.arrowMaxLength` here is the authoritative arrow length. The older TUNING `aim.arrowMaxLength` (300) is read by nothing; removing it changes the simulation fingerprint and is a separate follow-up.

Units: world units (ball radius 5) and multipliers. Opacity is 0..1. The shaft half-width must not exceed the head half-width.

| Field | Default | Allowed range | Effect |
| --- | --- | --- | --- |
| `ball.visualScale` | 1 | 0.25 to 4 | Multiplier on the drawn ball size. Visual only: collision and cup fit use TUNING `ball.radius`. |
| `aim.arrowMaxLength` | 180 | 1 to 2000 | World-unit length of the aim arrow at full power (no minimum). |
| `aim.arrowShaftHalfWidth` | 1.3 | 0.1 to 50 | Half the width of the aim arrow shaft. |
| `aim.arrowHeadHalfWidth` | 3.6 | 0.1 to 100 | Half the width of the aim arrow head. |
| `aim.arrowHeadLength` | 8 | 1 to 200 | Length of the aim arrow head (capped at half the arrow so short arrows stay readable). |
| `aim.arrowOpacity` | 0.92 | 0.05 to 1 | Opacity of the aim arrow. |
