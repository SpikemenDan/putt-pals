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
  ['gravity', 0, 5000, 'Vertical gravity, units/s^2; also drives slope acceleration.'],
  ['shotPower', 1, 10000, 'Launch speed at full charge (speed = charge * shotPower).'],
  ['wallHeight', 1, 500, 'Wall height; the ball clears walls above this z.'],

  ['cup.defaultRadius', 1, 100, 'Largest cup radius (also the default).'],
  ['cup.minRadius', 1, 100, 'Smallest cup radius a course may request.'],
  ['cup.depth', 1, 500, 'Depth of the cup below the green.'],
  ['cup.sinkMargin', 0, 20, 'Ball must be this far below the green rim before it counts as sunk.'],
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

  ['hazards.padRadius', 0, 100, 'Jump pad trigger radius.'],
  ['hazards.padLaunch', 0, 5000, 'Jump pad launch speed (vertical).'],
  ['hazards.padCooldown', 0, 10, 'Seconds before a pad can fire again.'],
  ['hazards.teleporterRadius', 0, 100, 'Teleporter trigger radius.'],
  ['hazards.teleporterCooldown', 0, 10, 'Seconds before a teleporter can fire again.'],

  ['aim.swayPeriod', 0.1, 60, 'Seconds per aim sway cycle.'],
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
]);

/** Today's shipped values. */
export const DEFAULT_TUNING = {
  ball: { radius: 5 },
  gravity: 700,
  shotPower: 900,
  wallHeight: 28,
  cup: { defaultRadius: 15, minRadius: 8, depth: 36, sinkMargin: 1.5, lipRestitutionBase: 1.15, lipRestitutionGain: 0.6 },
  surface: {
    turf: { friction: 0.75, drag: 30 },
    sand: { friction: 3.2 },
    ice: { friction: 0.12, drag: 4 },
    slime: { friction: 5.5, drag: 45 },
    padFrictionBonus: 0.05,
    speedFrictionGain: 0.15,
    speedFrictionRef: 200,
  },
  surfaceDragMultiplier: { turf: 1.0, sand: 3.5, ice: 0.15, slime: 6.0 },
  bounce: { wallRestitution: 1.82, ledgeDamping: 0.8, ledgeHeight: 5, landingRestitution: 0.25, landingSpeed: 180 },
  rest: { maxSlope: 0.015, maxSpeed: 6, maxVertical: 5, airTolerance: 0.8, groundTolerance: 0.6 },
  powerups: { magnetRange: 90, magnetPull: 300 },
  hazards: { padRadius: 18, padLaunch: 400, padCooldown: 0.6, teleporterRadius: 16, teleporterCooldown: 0.8 },
  aim: {
    swayPeriod: 1.4, spreadBase: 0.002, spreadGain: 0.14, spreadExponent: 2.6,
    fullPullPx: 380, canvasPullFraction: 0.6, arrowMaxLength: 300, dragRadiansPerPx: 0.006, keyStep: 0.06,
    guideMinCharge: 0.015, shotMinCharge: 0.025,
  },
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
