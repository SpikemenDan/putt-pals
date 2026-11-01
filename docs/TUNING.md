# Gameplay tuning

All feel-affecting numbers live in `src/shared/tuning.js` (`TUNING`, frozen, validated at load). Defaults are the shipped values; T2 changed no behavior. S3 (forgiving physics) lowered turf, sand, ice and slime friction and added the cup fillet; recorded difficulty from before S3 is stale. Edit `DEFAULT_TUNING` to retune (a separate, reviewed task). Invalid values (non-finite, out of range, `cup.minRadius > cup.defaultRadius`) throw at load; `createTuning(overrides)` builds a validated variant for tests. Old names (`SHOT_POWER`, `TURF_FRICTION`, `GRAVITY`, `FULL_PULL_PX`, ...) remain exported as aliases.

Units: distances in world units (ball radius 5), time in seconds, friction in 1/s, drag in units/s^2. Sand uses turf constant drag.

| Field | Default | Allowed range | Effect |
| --- | --- | --- | --- |
| `ball.radius` | 5 | 1 to 50 | Ball radius. Collision and cup-fit geometry. |
| `gravity` | 700 | 0 to 5000 | Vertical gravity, units/s^2; also drives slope acceleration. |
| `shotPower` | 900 | 1 to 10000 | Launch speed at full charge (speed = charge * shotPower). |
| `wallHeight` | 28 | 1 to 500 | Wall height; the ball clears walls above this z. |
| `cup.defaultRadius` | 15 | 1 to 100 | Largest cup radius (also the default). |
| `cup.minRadius` | 8 | 1 to 100 | Smallest cup radius a course may request. |
| `cup.depth` | 36 | 1 to 500 | Depth of the cup below the green. |
| `cup.sinkMargin` | 1.5 | 0 to 20 | Ball must be this far below the green rim before it counts as sunk. |
| `cup.filletWidth` | 10 | 0 to 50 | Width of the downward slope into the cup, outside the rim (0 = no fillet). |
| `cup.filletDepth` | 2 | 0 to 20 | How far the ball sinks at the rim edge along the fillet (z units). |
| `cup.lipRestitutionBase` | 1.15 | 0 to 5 | Rim rebound factor for a full-size cup. |
| `cup.lipRestitutionGain` | 0.6 | 0 to 5 | Extra rim rebound as the cup shrinks to its minimum. |
| `surface.turf.friction` | 0.5 | 0 to 100 | Rolling friction k on turf. |
| `surface.turf.drag` | 15 | 0 to 1000 | Constant (Coulomb) drag on turf. |
| `surface.sand.friction` | 2.4 | 0 to 100 | Rolling friction k in sand. |
| `surface.ice.friction` | 0.02 | 0 to 100 | Rolling friction k on ice. |
| `surface.ice.drag` | 0 | 0 to 1000 | Constant drag on ice. |
| `surface.slime.friction` | 4 | 0 to 100 | Rolling friction k in slime. |
| `surface.slime.drag` | 30 | 0 to 1000 | Constant drag in slime. |
| `surface.padFrictionBonus` | 0.05 | 0 to 10 | Added to turf friction on raised pads. |
| `surface.speedFrictionGain` | 0.15 | 0 to 2 | Extra friction fraction at high speed. |
| `surface.speedFrictionRef` | 200 | 1 to 5000 | Speed at which speedFrictionGain is fully applied. |
| `surfaceDragMultiplier.turf` | 1 | 0 to 100 | Legacy relative drag multiplier for turf (SURFACE_DRAG export). |
| `surfaceDragMultiplier.sand` | 3.5 | 0 to 100 | Legacy relative drag multiplier for sand. |
| `surfaceDragMultiplier.ice` | 0.15 | 0 to 100 | Legacy relative drag multiplier for ice. |
| `surfaceDragMultiplier.slime` | 6 | 0 to 100 | Legacy relative drag multiplier for slime. |
| `bounce.wallRestitution` | 1.82 | 1 to 3 | Reflection factor on walls and movers (1 = no loss, 2 = perfect mirror). |
| `bounce.ledgeDamping` | 0.8 | 0 to 2 | Speed multiplier (reversed) when the ball hits a terrain ledge. |
| `bounce.ledgeHeight` | 5 | 0 to 50 | Terrain step taller than this above the ball acts as a ledge. |
| `bounce.landingRestitution` | 0.25 | 0 to 1 | Fraction of fall speed returned when landing hard. |
| `bounce.landingSpeed` | 180 | 0 to 5000 | Fall speed above which a landing bounces. |
| `rest.maxSlope` | 0.015 | 0 to 1 | Surface slope below which a slow ball may stop. |
| `rest.maxSpeed` | 6 | 0 to 100 | Horizontal speed below which a ball on flat ground stops. |
| `rest.maxVertical` | 5 | 0 to 100 | Vertical speed below which a ball on flat ground stops. |
| `rest.airTolerance` | 0.8 | 0 to 10 | Height above the surface still counted as rolling. |
| `rest.groundTolerance` | 0.6 | 0 to 10 | Height above the surface still counted as grounded. |
| `powerups.magnetRange` | 90 | 0 to 1000 | Hole Magnet reach (full-size cup). |
| `powerups.magnetPull` | 300 | 0 to 10000 | Hole Magnet pull acceleration (full-size cup). |
| `powerups.chipLaunch` | 300 | 0 to 5000 | Chip In vertical launch speed added to the shot. |
| `powerups.smallBallScale` | 0.6 | 0.1 to 1 | Small Ball radius multiplier. |
| `powerups.tallBallScale` | 1.5 | 1 to 1.6 | Tall Ball radius multiplier (at most 1.6 so it still fits the smallest cup). |
| `hazards.padRadius` | 18 | 0 to 100 | Jump pad trigger radius. |
| `hazards.padLaunch` | 400 | 0 to 5000 | Jump pad launch speed (vertical). |
| `hazards.padCooldown` | 0.6 | 0 to 10 | Seconds before a pad can fire again. |
| `hazards.teleporterRadius` | 16 | 0 to 100 | Teleporter trigger radius. |
| `hazards.teleporterCooldown` | 0.8 | 0 to 10 | Seconds before a teleporter can fire again. |
| `aim.swayPeriod` | 1.4 | 0.1 to 60 | Seconds per aim sway cycle. |
| `aim.spinPeriod` | 3 | 0.5 to 60 | 360° Aim: seconds for the aim indicator to turn one full circle. |
| `aim.sweepPeriod` | 2.4 | 0.5 to 60 | 180° Aim: seconds for the aim indicator to sweep across 180° and back. |
| `aim.spreadBase` | 0.002 | 0 to 1 | Angular spread (radians) at zero power. |
| `aim.spreadGain` | 0.14 | 0 to 3 | Added spread (radians) at full power. |
| `aim.spreadExponent` | 2.6 | 0.1 to 10 | How sharply spread grows with power. |
| `aim.fullPullPx` | 380 | 10 to 5000 | Drag distance (CSS px) for full power. |
| `aim.canvasPullFraction` | 0.6 | 0.01 to 1 | Full pull is also capped at this fraction of canvas width. |
| `aim.arrowMaxLength` | 300 | 1 to 2000 | World-unit length of the aim arrow at full power (no minimum). |
| `aim.dragRadiansPerPx` | 0.006 | 0 to 1 | Aim rotation per pixel of orbit-less drag. |
| `aim.keyStep` | 0.06 | 0 to 1 | Aim rotation per arrow-key press (radians). |
| `aim.guideMinCharge` | 0.015 | 0 to 1 | Below this charge no aim guide is drawn. |
| `aim.shotMinCharge` | 0.025 | 0 to 1 | Below this charge a release cancels the shot. |
