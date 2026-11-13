# Gameplay tuning

The existing T2 gameplay configuration is implemented in `src/shared/tuning.js` (`TUNING`, frozen, validated at load). Defaults are the shipped values; T2 changed no behavior. S3 (forgiving physics) lowered turf, sand, ice and slime friction and added the cup fillet. U2 intentionally reduced full-power launch speed and the canvas-relative full-pull distance after owner approval in the local preview; current solver evidence is regenerated for these values. Edit `DEFAULT_TUNING` for deliberate retuning; provide a local browser preview for owner feedback and run affected checks before acceptance. Invalid values (non-finite, out of range, `cup.minRadius > cup.defaultRadius`) throw at load; `createTuning(overrides)` builds a validated variant for tests. Old names (`SHOT_POWER`, `TURF_FRICTION`, `GRAVITY`, `FULL_PULL_PX`, ...) remain exported as aliases.

Units: distances in world units (ball radius 5), time in seconds, friction in 1/s, drag in units/s^2. Sand uses turf constant drag.

Traceability: every setting's units, how a change takes effect and the source files that read it are available with `npm run config:report -- tuning` (consumers are derived from the source, not listed by hand; see docs/DISPLAY.md, "Traceability"). All `TUNING` settings are read when the modules load, so a change needs a reload and a new match, and editing `src/shared/tuning.js` changes the simulation fingerprint (docs/GITHUB_WORKFLOW.md). The development panel shows these values read-only; it cannot edit them.

Worlds (VIS-W #164): `src/shared/worlds.js` names Gaia, Ares and Luna and resolves each world's gravity from this file (`worldGravity(id)`): Gaia uses `gravity`, Ares and Luna use `worlds.<id>.gravity`. `SimulationEngine` takes a `gravity` option (default Gaia), the par solver solves at any world's gravity (`node tools/cli/main.mjs solve <map> <putt> --world luna`) and records it, and rolling friction does not depend on gravity, so flat putts roll the same on every world. The Ares and Luna values were chosen on 2026-11-11 and accepted by the owner after a playtest on 2026-11-12. For further tuning, on the dev server `?world` shows a world gravity box that stages a world and a gravity slider, validated, and applies it only when the putt restarts and only in solo rooms (parties always use Gaia's shipped gravity). It never changes these defaults; export its JSON to have chosen values made defaults. Matches do not yet carry a world, so normal play stays on Gaia until worlds have their own courses (VIS-G #165).

| Field | Default | Allowed range | Effect |
| --- | --- | --- | --- |
| `ball.radius` | 5 | 1 to 50 | Ball radius. Collision and cup-fit geometry. |
| `gravity` | 700 | 0 to 5000 | Gaia (default world) vertical gravity, units/s^2; also drives slope acceleration. Ares and Luna use worlds.*.gravity. |
| `worlds.ares.gravity` | 490 | 0 to 5000 | Ares vertical gravity, units/s^2 (VIS-W). Owner-accepted after playtest, 2026-11-12. |
| `worlds.luna.gravity` | 315 | 0 to 5000 | Luna vertical gravity, units/s^2 (VIS-W). Owner-accepted after playtest, 2026-11-12. |
| `shotPower` | 600 | 1 to 10000 | Launch speed at full charge (speed = charge * shotPower). |
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
| `powerups.auraRange` | 120 | 0 to 1000 | Love and Hate Ball reach around the owner (world units). |
| `powerups.auraPull` | 260 | 0 to 10000 | Love Ball pull acceleration on a ball at the owner (falls off linearly to the edge of the reach). |
| `powerups.auraPush` | 260 | 0 to 10000 | Hate Ball push acceleration on a ball at the owner (falls off linearly to the edge of the reach). |
| `deployables.bumperRadius` | 14 | 1 to 100 | Bumper and Orbital Bumper solid radius (world units). |
| `deployables.bumperRestitution` | 1.4 | 0 to 3 | Bumper bounce: reflected normal speed as a multiple of the incoming speed (above 1 adds a pinball kick). |
| `deployables.orbitalSpeedRef` | 250 | 1 to 5000 | Ball speed (units/s) above which the Orbital Bumper pull is scaled up with the square of the speed, so a fast ball still bends by about the same angle as a ref-speed one. |
| `deployables.bumperKick` | 300 | 0 to 2000 | Slowest speed (units/s) a Bumper or Orbital Bumper body throws a ball back out at, so even a slow touch gets the pinball pop. |
| `deployables.orbitalRestitution` | 1.4 | 0 to 3 | Orbital Bumper body bounce: reflected normal speed as a multiple of the incoming speed (above 1 kicks a ball that was pulled in back out). |
| `deployables.minHitSpeed` | 15 | 0 to 1000 | Slowest approach speed (units/s) that counts as an impact on a Bumper or Orbital Bumper; slower contacts only push the ball out. |
| `deployables.maxImpacts` | 3 | 1 to 20 | Hits a Bumper or Orbital Bumper survives before it disappears. |
| `deployables.orbitalRange` | 40.625 | 0 to 1000 | Orbital Bumper ring radius (world units). |
| `deployables.orbitalPull` | 1150 | 0 to 10000 | Orbital Bumper pull acceleration at the ring centre (falls off linearly to the ring edge). |
| `deployables.hitCooldownMs` | 250 | 0 to 5000 | Minimum milliseconds between impact reports for one deployed object. |
| `deployables.hitReportTolerance` | 80 | 0 to 500 | Allowance (world units) for network lag when a server room checks a Bumper impact report against the reporter's last position. |
| `deployables.bodyHeight` | 12 | 1 to 200 | Height of the solid Bumper or Orbital Bumper body above the floor it stands on (world units); a ball whose underside is above it passes over. |
| `deployables.orbitalReach` | 40 | 1 to 500 | Height of the Orbital Bumper pull volume above its floor (world units); a ball above it is not pulled. |
| `deployables.placementSlopeTolerance` | 2 | 0 to 50 | Largest floor-height difference allowed across a Bumper footprint when it is placed (world units); rejects ramps, ledges and pit edges. |
| `powerups.smallBallScale` | 0.6 | 0.1 to 1 | Small Ball radius multiplier. |
| `powerups.tallBallScale` | 1.5 | 1 to 1.6 | Tall Ball radius multiplier (at most 1.6 so it still fits the smallest cup). |
| `globalHazards.rainFrictionMultiplier` | 0.4 | 0 to 2 | Rain multiplier on grounded rolling friction while Rain is active. |
| `globalHazards.rainDragMultiplier` | 0.4 | 0 to 2 | Rain multiplier on grounded constant drag while Rain is active. |
| `globalHazards.snowFrictionMultiplier` | 0.08 | 0 to 5 | Snow multiplier on grounded rolling friction while Snow is active. |
| `globalHazards.snowDragMultiplier` | 0 | 0 to 5 | Snow multiplier on grounded constant drag while Snow is active. |
| `globalHazards.windAcceleration` | 110 | 0 to 5000 | Wind acceleration along the chosen direction at the peak of the gust (world units/s^2). |
| `globalHazards.windDurationSeconds` | 24 | 1 to 600 | Lifetime of a Wind gust (seconds); the push rises and falls over it. |
| `globalHazards.windWakeAccel` | 20 | 0 to 1000 | Wind push below which a gust cannot start a resting ball or keep a slow one from stopping (world units/s^2). |
| `globalHazards.lightningImpulse` | 600 | 0 to 10000 | Horizontal speed impulse delivered by a targeted Lightning strike (world units/s). |
| `globalHazards.vortexRange` | 65 | 0 to 1000 | Horizontal reach of Tornado and Hurricane force (world units). |
| `globalHazards.vortexAcceleration` | 220 | 0 to 10000 | Tornado fling or Hurricane pull acceleration at the vortex centre (world units/s^2). |
| `globalHazards.tornadoLift` | 1400 | 0 to 10000 | Upward acceleration at a Tornado centre (world units/s^2). |
| `globalHazards.roamRadius` | 60 | 0 to 10000 | How far a placed Tornado or Hurricane wanders from the spot it was placed at (world units). |
| `globalHazards.roamInset` | 0.06 | 0 to 0.45 | Fraction of the course width and depth kept clear at the edges; a placed vortex never leaves this box. |
| `globalHazards.roamPeriod` | 24 | 0.1 to 600 | Time for one deterministic vortex roaming cycle (seconds). |
| `globalHazards.durationSeconds` | 20 | 1 to 600 | Lifetime of a timed global hazard activation (seconds). |
| `globalHazards.lightningWindowSeconds` | 0.5 | 0.1 to 5 | Time window after activation during which a target can receive its one-shot Lightning strike. |
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
| `aim.canvasPullFraction` | 0.18 | 0.01 to 1 | Full pull is also capped at this fraction of canvas width. |
| `aim.arrowMaxLength` | 300 | 1 to 2000 | Unused. The arrow length is `DISPLAY.aim.arrowMaxLength` (180, docs/DISPLAY.md); this field is slated for removal with a fingerprint regeneration. |
| `aim.dragRadiansPerPx` | 0.006 | 0 to 1 | Aim rotation per pixel of orbit-less drag. |
| `aim.keyStep` | 0.06 | 0 to 1 | Aim rotation per arrow-key press (radians). |
| `aim.guideMinCharge` | 0.015 | 0 to 1 | Below this charge no aim guide is drawn. |
| `aim.shotMinCharge` | 0.025 | 0 to 1 | Below this charge a release cancels the shot. |


## Custom rules (VIS-U)

The player-facing Custom rules editor (main menu, Custom) edits a small validated rule set in
`src/shared/rules.js`, not this tuning table directly. Each rule has one standard value that reproduces the
shipped game exactly (`rulesTuning(DEFAULT_RULES)` is `TUNING` itself), and `rulesTuning(rules)` builds a
validated tuning from a rule set:

| Rule | Range | Standard | Becomes |
| --- | --- | --- | --- |
| Gaia, Ares and Luna gravity | 50 to 200 %, step 5 | 100 % | `gravity`, `worlds.ares.gravity`, `worlds.luna.gravity` scaled from the shipped values |
| Shot power | 50 to 150 %, step 5 | 100 % | `shotPower` scaled from 600 |
| Aim wobble | Off, Low, Normal, High | Normal | `aim.spreadBase` and `aim.spreadGain` times 0, 0.5, 1 or 1.6 |
| Power-ups | On or Off | On | the room's `powerups` flag (No Power-Ups) |
| Hole timer | Course, 2, 3, 5 or 10 min | Course | each putt's time limit (Course keeps the course's own limit) |
| Maps to play | blank (lobby mode) or 1 to 20, typed; the editor warns above 10 | blank | maps in one game for Standard and Tournament modes (`seriesMaps`); a multi-map game carries its inventory like a tournament |
| Missed hole | 0 to 5 strokes | 2 | `scoring.missedHolePenalty` |

A room fixes its rules when it is created (Play solo, or the first player into a Party room code); they are
carried in the session and the same for every participant, and never change mid-match. The editor remembers
its draft in local storage (validated on load). Ares and Luna gravity only take effect on maps from those
worlds, so they need world selection (VIS-M4) to be reachable in play.

## Configuration expansion policy

The catalog above describes the supplied documentation snapshot; no code was
changed by this document update. Expansion beyond existing fields remains planned.
Do not describe a proposed field as implemented until consumers and validation
exist. Reuse existing ball.radius and shotPower settings; the aim arrow length is a DISPLAY setting.

Use one documented configuration entry point, organized by domain.
For each setting record:
- Name and authoritative default.
- Units and allowed range.
- Description and consumers.
- Presentation-only or gameplay-affecting classification.
- Reset/restart requirements.
- Dependencies and affected verification.

Prioritize physics/dimensions, shot/input mapping, aim-arrow presentation, camera,
session timers/limits, power-up values, visuals and audio.
Browser, simulation, renderer, CLI, solver and server use the same relevant
defaults. Keep course data and intentional per-ball overrides explicit.

Extraction preserves current defaults. Retuning can invalidate geometry clearance,
cup-fit assumptions, simulation fingerprints and solver evidence. Tests must
check meaningful resulting behavior, not merely compare a setting with itself.

Online participants must use compatible gameplay configuration. Presentation-only
preferences may vary. No authoritative match-rule changes midway through play.
Credentials/authentication and unrestricted infrastructure limits are excluded.

## Developer preview panel target

Provide development-only sliders, toggles and selectors with values, defaults,
units and valid ranges, plus reset and validated override import/export.
Clearly mark temporary settings. Do not silently persist them as shipped defaults.
Keep the panel disabled in ordinary production builds by default.

Safe presentation changes may apply live. Physics, dimensions and session rules
require preview reset/restart. Reject invalid imports before applying changes.

For proposed appearance or feel changes:
1. Open the local preview in the Claude browser integration.
2. Provide relevant developer controls.
3. Ask the owner to try it and provide feedback before final acceptance.
4. Persist approved settings.
5. Rerun affected verification.

If browser access is unavailable, provide the exact local URL and steps and mark
interactive verification/acceptance pending. The panel remains a target until
implementation and verification are recorded.

## G1g course mechanics

The owner accepted these candidate defaults in the local G1g chamber preview on 2026-11-05. Legacy fan, tornado and teleporter tuples keep their current behavior. These settings apply to optional `mechanics` records. Physics changes reset the preview; temporary overrides never enter ordinary rooms. Per-record `height` and fan/vortex `acceleration` overrides are explicit, validated course data.

| Setting | Default | Range | Units | Effect |
| --- | --- | --- | --- | --- |
| `courseMechanics.bodyHeight` | 40 | 1 to 1000 | world units | Solid mechanic height above its local floor (world units). |
| `courseMechanics.wedgeRestitution` | 0.9 | 0 to 2 | factor | Wedge face restitution (factor). |
| `courseMechanics.bouncerRestitution` | 1.05 | 0 to 2 | factor | Bouncer face restitution (factor). |
| `courseMechanics.bouncerKick` | 180 | 0 to 3000 | units/s | Added outgoing normal speed at a bouncer (world units/s). |
| `courseMechanics.fanAcceleration` | 600 | 0 to 10000 | units/s² | Default mechanic fan acceleration (world units/s^2). |
| `courseMechanics.fanHeight` | 100 | 1 to 1000 | world units | Fan force reach above the local floor (world units). |
| `courseMechanics.vortexAcceleration` | 400 | 0 to 10000 | units/s² | Default tangential vortex acceleration (world units/s^2). |
| `courseMechanics.vortexPull` | 0.5 | 0 to 3 | factor | Inward pull as a factor of tangential force. |
| `courseMechanics.vortexLift` | 1400 | 0 to 10000 | units/s² | Vortex core lift acceleration (world units/s^2). |
| `courseMechanics.vortexHeight` | 130 | 1 to 1000 | world units | Vortex force reach above its local floor (world units). |
| `courseMechanics.portalRadius` | 18 | 1 to 100 | world units | Portal trigger radius (world units). |
| `courseMechanics.portalHeight` | 25 | 1 to 1000 | world units | Portal entry height above the floor (world units). |
| `courseMechanics.portalCooldown` | 0.6 | 0.05 to 10 | seconds | Shared paired-portal re-entry cooldown (seconds). |
| `courseMechanics.portalClearance` | 2 | 0.1 to 100 | world units | Extra exit clearance beyond ball and trigger radius (world units). |
