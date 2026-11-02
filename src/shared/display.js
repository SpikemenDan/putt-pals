/**
 * Presentation settings for Putt Pals: sizes and looks that change what a player sees, never how the ball moves.
 *
 * Unlike TUNING (src/shared/tuning.js), nothing here is read by the simulation, so a client may override these
 * values without desyncing a room or invalidating recorded difficulty. Defaults equal the values the renderer
 * used before they were parameterized. Every field is validated at load: finite numbers inside a sane range.
 *
 * Units: distances in world units (the ball radius is 5). Opacity is 0..1; scale is a multiplier.
 */

/** Field spec: [dotted path, min, max, description]. Drives validation and docs/DISPLAY.md. */
export const DISPLAY_FIELDS = Object.freeze([
  ['ball.visualScale', 0.25, 4, 'Multiplier on the drawn ball size. Visual only: collision and cup fit use TUNING ball.radius.'],
  ['aim.arrowMaxLength', 1, 2000, 'World-unit length of the aim arrow at full power (no minimum).'],
  ['aim.arrowShaftHalfWidth', 0.1, 50, 'Half the width of the aim arrow shaft.'],
  ['aim.arrowHeadHalfWidth', 0.1, 100, 'Half the width of the aim arrow head.'],
  ['aim.arrowHeadLength', 1, 200, 'Length of the aim arrow head (capped at half the arrow so short arrows stay readable).'],
  ['aim.arrowOpacity', 0.05, 1, 'Opacity of the aim arrow.'],
]);

/** Values the renderer used before they were parameterized. */
export const DEFAULT_DISPLAY = {
  ball: { visualScale: 1 },
  aim: { arrowMaxLength: 180, arrowShaftHalfWidth: 1.3, arrowHeadHalfWidth: 3.6, arrowHeadLength: 8, arrowOpacity: 0.92 },
};

const read = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Dotted paths of every object and leaf in the shape, so unknown keys can be named. */
const KNOWN_PATHS = new Set(DISPLAY_FIELDS.flatMap(([path]) => path.split('.').map((_, i, parts) => parts.slice(0, i + 1).join('.'))));

function unknownKeys(value, prefix = '') {
  if (!isObj(value)) return [];
  return Object.keys(value).flatMap(k => {
    const path = prefix + k;
    return KNOWN_PATHS.has(path) ? unknownKeys(value[k], path + '.') : [path];
  });
}

/** Returns a list of problems (empty when valid). Missing and unknown fields are errors. */
export function displayProblems(display) {
  const problems = unknownKeys(display).map(path => 'unknown field ' + path);
  for (const [path, min, max] of DISPLAY_FIELDS) {
    const v = read(display, path);
    if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(path + ' must be a finite number');
    else if (v < min || v > max) problems.push(path + ' must be within [' + min + ', ' + max + '], got ' + v);
  }
  if (!problems.length && display.aim.arrowShaftHalfWidth > display.aim.arrowHeadHalfWidth) problems.push('aim.arrowShaftHalfWidth must not exceed aim.arrowHeadHalfWidth');
  return problems;
}

/** Throws with every problem listed. */
export function validateDisplay(display) {
  const problems = displayProblems(display);
  if (problems.length) throw new Error('Invalid display: ' + problems.join('; '));
  return display;
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = isObj(base[k]) ? merge(base[k], isObj(over?.[k]) ? over[k] : {}) : (over && k in over ? over[k] : base[k]);
  return out;
}
function deepFreeze(o) { for (const v of Object.values(o)) if (isObj(v)) deepFreeze(v); return Object.freeze(o); }

/** Builds a validated, frozen display from defaults plus partial overrides. Unknown override keys throw instead of being ignored. */
export function createDisplay(overrides = {}) {
  const unknown = unknownKeys(overrides);
  if (unknown.length) throw new Error('Invalid display: ' + unknown.map(path => 'unknown field ' + path).join('; '));
  return deepFreeze(validateDisplay(merge(DEFAULT_DISPLAY, overrides)));
}

export const DISPLAY = createDisplay();
