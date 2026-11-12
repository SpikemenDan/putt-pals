/**
 * Gameplay tuning for Putt Pals: the one place where feel-affecting numbers live.
 *
 * Defaults equal the values the game shipped with (T2 is a no-behavior-change move).
 * Simulation, input and renderer read from TUNING; src/shared/constants.js keeps its
 * old export names as aliases. Every field is validated at load: finite numbers
 * inside a sane range. Retuning (S3) edits DEFAULT_TUNING only.
 *
 * Units: distances in world units (the ball radius is 5), time in seconds,
 * friction `k` in 1/s (velocity decays as exp(-k*dt)), drag in units/s^2.
 */

/** Field spec: [dotted path, min, max, description]. Drives validation and docs/TUNING.md. */
export const TUNING_FIELDS = Object.freeze([
  ['ball.radius', 1, 50, 'Ball radius. Collision and cup-fit geometry.'],
  ['gravity', 0, 5000, 'Gaia (default world) vertical gravity, units/s^2; also drives slope acceleration. Ares and Luna use worlds.*.gravity.'],
  ['worlds.ares.gravity', 0, 5000, 'Ares vertical gravity, units/s^2 (VIS-W). Owner-accepted after playtest, 2026-11-12.'],
  ['worlds.luna.gravity', 0, 5000, 'Luna vertical gravity, units/s^2 (VIS-W). Owner-accepted after playtest, 2026-11-12.'],
  ['shotPower', 1, 10000, 'Launch speed at full charge (speed = charge * shotPower).'],
  ['wallHeight', 1, 500, 'Wall height; the ball clears walls above this z.'],

  ['cup.defaultRadius', 1, 100, 'Largest cup radius (also the default).'],
  ['cup.minRadius', 1, 100, 'Smallest cup radius a course may request.'],
  ['cup.depth', 1, 500, 'Depth of the cup below the green.'],
  ['cup.sinkMargin', 0, 20, 'Ball must be this far below the green rim before it counts as sunk.'],
  ['cup.filletWidth', 0, 50, 'Width of the downward slope into the cup, outside the rim (0 = no fillet).'],
  ['cup.filletDepth', 0, 20, 'How far the ball sinks at the rim edge along the fillet (z units).'],
  ['cup.lipRestitutionBase', 0, 5, 'Rim rebound factor for a full-size cup.'],
  ['cup.lipRestitutionGain', 0, 5, 'Extra rim rebound as the cup shrinks to its minimum.'],

  ['surface.turf.friction', 0, 100, 'Rolling friction k on turf.'],
  ['surface.turf.drag', 0, 1000, 'Constant (Coulomb) drag on turf.'],
  ['surface.sand.friction', 0, 100, 'Rolling friction k in sand.'],
  ['surface.ice.friction', 0, 100, 'Rolling friction k on ice.'],
  ['surface.ice.drag', 0, 1000, 'Constant drag on ice.'],
  ['surface.slime.friction', 0, 100, 'Rolling friction k in slime.'],
  ['surface.slime.drag', 0, 1000, 'Constant drag in slime.'],
  ['surface.padFrictionBonus', 0, 10, 'Added to turf friction on raised pads.'],
  ['surface.speedFrictionGain', 0, 2, 'Extra friction fraction at high speed.'],
  ['surface.speedFrictionRef', 1, 5000, 'Speed at which speedFrictionGain is fully applied.'],
  ['surfaceDragMultiplier.turf', 0, 100, 'Legacy relative drag multiplier for turf (SURFACE_DRAG export).'],
  ['surfaceDragMultiplier.sand', 0, 100, 'Legacy relative drag multiplier for sand.'],
  ['surfaceDragMultiplier.ice', 0, 100, 'Legacy relative drag multiplier for ice.'],
  ['surfaceDragMultiplier.slime', 0, 100, 'Legacy relative drag multiplier for slime.'],

  ['bounce.wallRestitution', 1, 3, 'Reflection factor on walls and movers (1 = no loss, 2 = perfect mirror).'],
  ['bounce.ledgeDamping', 0, 2, 'Speed multiplier (reversed) when the ball hits a terrain ledge.'],
  ['bounce.ledgeHeight', 0, 50, 'Terrain step taller than this above the ball acts as a ledge.'],
  ['bounce.landingRestitution', 0, 1, 'Fraction of fall speed returned when landing hard.'],
  ['bounce.landingSpeed', 0, 5000, 'Fall speed above which a landing bounces.'],

  ['rest.maxSlope', 0, 1, 'Surface slope below which a slow ball may stop.'],
  ['rest.maxSpeed', 0, 100, 'Horizontal speed below which a ball on flat ground stops.'],
  ['rest.maxVertical', 0, 100, 'Vertical speed below which a ball on flat ground stops.'],
  ['rest.airTolerance', 0, 10, 'Height above the surface still counted as rolling.'],
  ['rest.groundTolerance', 0, 10, 'Height above the surface still counted as grounded.'],

  ['powerups.magnetRange', 0, 1000, 'Hole Magnet reach (full-size cup).'],
  ['powerups.magnetPull', 0, 10000, 'Hole Magnet pull acceleration (full-size cup).'],
  ['powerups.chipLaunch', 0, 5000, 'Chip In vertical launch speed added to the shot.'],
  ['powerups.auraRange', 0, 1000, 'Love and Hate Ball reach around the owner (world units).'],
  ['powerups.auraPull', 0, 10000, 'Love Ball pull acceleration on a ball at the owner (falls off linearly to the edge of the reach).'],
  ['powerups.auraPush', 0, 10000, 'Hate Ball push acceleration on a ball at the owner (falls off linearly to the edge of the reach).'],
  ['deployables.bumperRadius', 1, 100, 'Bumper and Orbital Bumper solid radius (world units).'],
  ['deployables.bumperRestitution', 0, 3, 'Bumper bounce: reflected normal speed as a multiple of the incoming speed (above 1 adds a pinball kick).'],
  ['deployables.orbitalSpeedRef', 1, 5000, 'Ball speed (units/s) above which the Orbital Bumper pull is scaled up with the square of the speed, so a fast ball still bends by about the same angle as a ref-speed one.'],
  ['deployables.bumperKick', 0, 2000, 'Slowest speed (units/s) a Bumper or Orbital Bumper body throws a ball back out at, so even a slow touch gets the pinball pop.'],
  ['deployables.orbitalRestitution', 0, 3, 'Orbital Bumper body bounce: reflected normal speed as a multiple of the incoming speed (above 1 kicks a ball that was pulled in back out).'],
  ['deployables.minHitSpeed', 0, 1000, 'Slowest approach speed (units/s) that counts as an impact on a Bumper or Orbital Bumper; slower contacts only push the ball out.'],
  ['deployables.maxImpacts', 1, 20, 'Hits a Bumper or Orbital Bumper survives before it disappears.'],
  ['deployables.orbitalRange', 0, 1000, 'Orbital Bumper ring radius (world units).'],
  ['deployables.orbitalPull', 0, 10000, 'Orbital Bumper pull acceleration at the ring centre (falls off linearly to the ring edge).'],
  ['deployables.hitCooldownMs', 0, 5000, 'Minimum milliseconds between impact reports for one deployed object.'],
  ['deployables.hitReportTolerance', 0, 500, 'Allowance (world units) for network lag when a server room checks a Bumper impact report against the reporter\'s last position.'],
  ['deployables.bodyHeight', 1, 200, 'Height of the solid Bumper or Orbital Bumper body above the floor it stands on (world units); a ball whose underside is above it passes over.'],
  ['deployables.orbitalReach', 1, 500, 'Height of the Orbital Bumper pull volume above its floor (world units); a ball above it is not pulled.'],
  ['deployables.placementSlopeTolerance', 0, 50, 'Largest floor-height difference allowed across a Bumper footprint when it is placed (world units); rejects ramps, ledges and pit edges.'],
  ['globalHazards.rainFrictionMultiplier', 0, 2, 'Rain multiplier on grounded rolling friction while Rain is active.'],
  ['globalHazards.rainDragMultiplier', 0, 2, 'Rain multiplier on grounded constant drag while Rain is active.'],
  ['globalHazards.snowFrictionMultiplier', 0, 5, 'Snow multiplier on grounded rolling friction while Snow is active.'],
  ['globalHazards.snowDragMultiplier', 0, 5, 'Snow multiplier on grounded constant drag while Snow is active.'],
  ['globalHazards.windAcceleration', 0, 5000, 'Wind acceleration along the chosen direction at the peak of the gust (world units/s^2).'],
  ['globalHazards.windDurationSeconds', 1, 600, 'Lifetime of a Wind gust (seconds); the push rises and falls over it.'],
  ['globalHazards.windWakeAccel', 0, 1000, 'Wind push below which a gust cannot start a resting ball or keep a slow one from stopping (world units/s^2).'],
  ['globalHazards.lightningImpulse', 0, 10000, 'Horizontal speed impulse delivered by a targeted Lightning strike (world units/s).'],
  ['globalHazards.vortexRange', 0, 1000, 'Horizontal reach of Tornado and Hurricane force (world units).'],
  ['globalHazards.vortexAcceleration', 0, 10000, 'Tornado fling or Hurricane pull acceleration at the vortex centre (world units/s^2).'],
  ['globalHazards.tornadoLift', 0, 10000, 'Upward acceleration at a Tornado centre (world units/s^2).'],
  ['globalHazards.roamRadius', 0, 10000, 'How far a placed Tornado or Hurricane wanders from the spot it was placed at (world units).'],
  ['globalHazards.roamInset', 0, 0.45, 'Fraction of the course width and depth kept clear at the edges; a placed vortex never leaves this box.'],
  ['globalHazards.roamPeriod', 0.1, 600, 'Time for one deterministic vortex roaming cycle (seconds).'],
  ['globalHazards.durationSeconds', 1, 600, 'Lifetime of a timed global hazard activation (seconds).'],
  ['globalHazards.lightningWindowSeconds', 0.1, 5, 'Time window after activation during which a target can receive its one-shot Lightning strike.'],
  ['powerups.smallBallScale', 0.1, 1, 'Small Ball radius multiplier.'],
  ['powerups.tallBallScale', 1, 1.6, 'Tall Ball radius multiplier (at most 1.6 so it still fits the smallest cup).'],

  ['courseMechanics.bodyHeight', 1, 1000, 'Solid mechanic height above its local floor (world units).'],
  ['courseMechanics.wedgeRestitution', 0, 2, 'Wedge face restitution (factor).'],
  ['courseMechanics.bouncerRestitution', 0, 2, 'Bouncer face restitution (factor).'],
  ['courseMechanics.bouncerKick', 0, 3000, 'Added outgoing normal speed at a bouncer (world units/s).'],
  ['courseMechanics.fanAcceleration', 0, 10000, 'Default mechanic fan acceleration (world units/s^2).'],
  ['courseMechanics.fanHeight', 1, 1000, 'Fan force reach above the local floor (world units).'],
  ['courseMechanics.vortexAcceleration', 0, 10000, 'Default tangential vortex acceleration (world units/s^2).'],
  ['courseMechanics.vortexPull', 0, 3, 'Inward pull as a factor of tangential force.'],
  ['courseMechanics.vortexLift', 0, 10000, 'Vortex core lift acceleration (world units/s^2).'],
  ['courseMechanics.vortexHeight', 1, 1000, 'Vortex force reach above its local floor (world units).'],
  ['courseMechanics.portalRadius', 1, 100, 'Portal trigger radius (world units).'],
  ['courseMechanics.portalHeight', 1, 1000, 'Portal entry height above the floor (world units).'],
  ['courseMechanics.portalCooldown', 0.05, 10, 'Shared paired-portal re-entry cooldown (seconds).'],
  ['courseMechanics.portalClearance', 0.1, 100, 'Extra exit clearance beyond ball and trigger radius (world units).'],
  ['hazards.padRadius', 0, 100, 'Jump pad trigger radius.'],
  ['hazards.padLaunch', 0, 5000, 'Jump pad launch speed (vertical).'],
  ['hazards.padCooldown', 0, 10, 'Seconds before a pad can fire again.'],
  ['hazards.teleporterRadius', 0, 100, 'Teleporter trigger radius.'],
  ['hazards.teleporterCooldown', 0, 10, 'Seconds before a teleporter can fire again.'],

  ['water.shallowDragMultiplier', 0.1, 10, 'Constant drag multiplier applied when the ball rolls through shallow water.'],
  ['water.shallowFrictionMultiplier', 0.1, 10, 'Rolling friction multiplier applied when the ball rolls through shallow water.'],
  ['water.splashHeight', 0, 50, 'Vertical distance above water surface where deep water catches and resets the ball.'],

  ['wind.groundMultiplier', 0, 5, 'Fraction of wind acceleration applied when the ball is rolling on ground.'],
  ['wind.airMultiplier', 0, 5, 'Multiplier of wind acceleration applied when the ball is airborne.'],

  ['aim.swayPeriod', 0.1, 60, 'Seconds per aim sway cycle.'],
  ['aim.spinPeriod', 0.5, 60, '360° Aim: seconds for the aim indicator to turn one full circle.'],
  ['aim.sweepPeriod', 0.5, 60, '180° Aim: seconds for the aim indicator to sweep across 180° and back.'],
  ['aim.spreadBase', 0, 1, 'Angular spread (radians) at zero power.'],
  ['aim.spreadGain', 0, 3, 'Added spread (radians) at full power.'],
  ['aim.spreadExponent', 0.1, 10, 'How sharply spread grows with power.'],
  ['aim.fullPullPx', 10, 5000, 'Drag distance (CSS px) for full power.'],
  ['aim.canvasPullFraction', 0.01, 1, 'Full pull is also capped at this fraction of canvas width.'],
  ['aim.arrowMaxLength', 1, 2000, 'World-unit length of the aim arrow at full power (no minimum).'],
  ['aim.dragRadiansPerPx', 0, 1, 'Aim rotation per pixel of orbit-less drag.'],
  ['aim.keyStep', 0, 1, 'Aim rotation per arrow-key press (radians).'],
  ['aim.guideMinCharge', 0, 1, 'Below this charge no aim guide is drawn.'],
  ['aim.shotMinCharge', 0, 1, 'Below this charge a release cancels the shot.'],

  ['scoring.maxHoleScore', 1, 50, 'Configured maximum strokes for a missed hole before penalty.'],
  ['scoring.missedHolePenalty', 0, 50, 'Penalty strokes added to the maximum hole score for a missed hole.'],
]);

/** Today's shipped values. */
export const DEFAULT_TUNING = {
  ball: { radius: 5 },
  gravity: 700,
  shotPower: 600,
  wallHeight: 28,
  cup: { defaultRadius: 15, minRadius: 8, depth: 36, sinkMargin: 1.5, filletWidth: 10, filletDepth: 2, lipRestitutionBase: 1.15, lipRestitutionGain: 0.6 },
  surface: {
    turf: { friction: 0.5, drag: 15 },
    sand: { friction: 2.4 },
    ice: { friction: 0.02, drag: 0 },
    slime: { friction: 4, drag: 30 },
    padFrictionBonus: 0.05,
    speedFrictionGain: 0.15,
    speedFrictionRef: 200,
  },
  surfaceDragMultiplier: { turf: 1.0, sand: 3.5, ice: 0.15, slime: 6.0 },
  bounce: { wallRestitution: 1.82, ledgeDamping: 0.8, ledgeHeight: 5, landingRestitution: 0.25, landingSpeed: 180 },
  rest: { maxSlope: 0.015, maxSpeed: 6, maxVertical: 5, airTolerance: 0.8, groundTolerance: 0.6 },
  powerups: { magnetRange: 90, magnetPull: 300, chipLaunch: 300, auraRange: 120, auraPull: 260, auraPush: 260, smallBallScale: 0.6, tallBallScale: 1.5 },
  deployables: { bumperRadius: 14, bumperRestitution: 1.4, bumperKick: 300, orbitalSpeedRef: 250, orbitalRestitution: 1.4, minHitSpeed: 15, maxImpacts: 3, orbitalRange: 40.625, orbitalPull: 1150, hitCooldownMs: 250, hitReportTolerance: 80, bodyHeight: 12, orbitalReach: 40, placementSlopeTolerance: 2 },
  globalHazards: { rainFrictionMultiplier: 0.4, rainDragMultiplier: 0.4, snowFrictionMultiplier: 0.08, snowDragMultiplier: 0, windAcceleration: 110, windDurationSeconds: 24, windWakeAccel: 20, lightningImpulse: 600, vortexRange: 65, vortexAcceleration: 220, tornadoLift: 1400, roamRadius: 60, roamInset: 0.06, roamPeriod: 24, durationSeconds: 20, lightningWindowSeconds: 0.5 },
  courseMechanics: { bodyHeight: 40, wedgeRestitution: 0.9, bouncerRestitution: 1.05, bouncerKick: 180, fanAcceleration: 600, fanHeight: 100, vortexAcceleration: 400, vortexPull: 0.5, vortexLift: 1400, vortexHeight: 130, portalRadius: 18, portalHeight: 25, portalCooldown: 0.6, portalClearance: 2 },
  hazards: { padRadius: 18, padLaunch: 400, padCooldown: 0.6, teleporterRadius: 16, teleporterCooldown: 0.8 },
  water: { shallowDragMultiplier: 2.5, shallowFrictionMultiplier: 2.0, splashHeight: 14 },
  wind: { groundMultiplier: 0.25, airMultiplier: 1.0 },
  aim: {
    swayPeriod: 1.4, spinPeriod: 3, sweepPeriod: 2.4, spreadBase: 0.002, spreadGain: 0.14, spreadExponent: 2.6,
    fullPullPx: 380, canvasPullFraction: 0.18, arrowMaxLength: 300, dragRadiansPerPx: 0.006, keyStep: 0.06,
    guideMinCharge: 0.015, shotMinCharge: 0.025,
  },
  scoring: { maxHoleScore: 10, missedHolePenalty: 2 },
  // Owner, 2026-11-11, accepted after playtest 2026-11-12: Gaia 700 (gravity above), Ares 490, Luna 315 (1.0, 0.7, 0.45).
  worlds: { ares: { gravity: 490 }, luna: { gravity: 315 } },
};

const read = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Returns a list of problems (empty when valid). Unknown fields and missing fields are errors. */
export function tuningProblems(tuning) {
  const problems = [];
  for (const [path, min, max] of TUNING_FIELDS) {
    const v = read(tuning, path);
    if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(path + ' must be a finite number');
    else if (v < min || v > max) problems.push(path + ' must be within [' + min + ', ' + max + '], got ' + v);
  }
  if (!problems.length && tuning.cup.minRadius > tuning.cup.defaultRadius) problems.push('cup.minRadius must not exceed cup.defaultRadius');
  return problems;
}

/** Throws with every problem listed. */
export function validateTuning(tuning) {
  const problems = tuningProblems(tuning);
  if (problems.length) throw new Error('Invalid tuning: ' + problems.join('; '));
  return tuning;
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = isObj(base[k]) ? merge(base[k], isObj(over?.[k]) ? over[k] : {}) : (over && k in over ? over[k] : base[k]);
  return out;
}
function deepFreeze(o) { for (const v of Object.values(o)) if (isObj(v)) deepFreeze(v); return Object.freeze(o); }

/** Builds a validated, frozen tuning from defaults plus partial overrides. */
export function createTuning(overrides = {}) {
  return deepFreeze(validateTuning(merge(DEFAULT_TUNING, overrides)));
}

export const TUNING = createTuning();
