# Presentation settings

Sizes and looks that change what a player sees live in `src/shared/display.js` (`DISPLAY`, frozen, validated at load). Nothing here is read by the simulation, so a client may override these without desyncing a room or invalidating recorded difficulty. Anything that changes how the ball moves belongs in `TUNING` (docs/TUNING.md) instead. `createDisplay(overrides)` builds a validated variant; invalid values throw and are never partially applied. `aim.arrowMaxLength` is still a TUNING field (moving it would change the simulation fingerprint) and is a follow-up.

Units: world units (ball radius 5) and multipliers. Opacity is 0..1. The shaft half-width must not exceed the head half-width.

| Field | Default | Allowed range | Effect |
| --- | --- | --- | --- |
| `ball.visualScale` | 1 | 0.25 to 4 | Multiplier on the drawn ball size. Visual only: collision and cup fit use TUNING `ball.radius`. |
| `aim.arrowShaftHalfWidth` | 2.6 | 0.1 to 50 | Half the width of the aim arrow shaft. |
| `aim.arrowHeadHalfWidth` | 7 | 0.1 to 100 | Half the width of the aim arrow head. |
| `aim.arrowHeadLength` | 14 | 1 to 200 | Length of the aim arrow head (capped at half the arrow so short arrows stay readable). |
| `aim.arrowOpacity` | 0.92 | 0.05 to 1 | Opacity of the aim arrow. |
