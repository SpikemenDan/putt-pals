/**
 * Presentation settings for Putt Pals: sizes and looks that change what a player sees, never how the ball moves.
 *
 * Unlike TUNING (src/shared/tuning.js), nothing here is read by the simulation, so a client may override these
 * values without desyncing a room or invalidating recorded difficulty. Defaults equal the values the renderer
 * used before they were parameterized. Every field is validated at load: finite numbers inside a sane range.
 *
 * Units: distances in world units (the ball radius is 5). Opacity is 0..1; scale is a multiplier. The `loading` group
 * (loading screen, src/ui/planet-scene.js) uses degrees, seconds, CSS px and a screen-height fraction as listed per field.
 */

/** Field spec: [dotted path, min, max, description]. Drives validation and docs/DISPLAY.md. */
export const DISPLAY_FIELDS = Object.freeze([
  ['ball.visualScale', 0.25, 4, 'Multiplier on the drawn ball size. Visual only: collision and cup fit use TUNING ball.radius.'],
  ['aim.arrowMaxLength', 1, 2000, 'World-unit length of the aim arrow at full power (no minimum).'],
  ['aim.arrowShaftHalfWidth', 0.1, 50, 'Half the width of the aim arrow shaft.'],
  ['aim.arrowHeadHalfWidth', 0.1, 100, 'Half the width of the aim arrow head.'],
  ['aim.arrowHeadLength', 1, 200, 'Length of the aim arrow head (capped at half the arrow so short arrows stay readable).'],
  ['aim.arrowOpacity', 0.05, 1, 'Opacity of the aim arrow.'],
  ['loading.spinSpeed', 0, 60, 'Loading screen: planet rotation speed (0 holds it still). Ignored when the player prefers reduced motion.'],
  ['loading.axisTilt', -60, 60, 'Loading screen: tilt of the planet axis away from the horizon line, so the poles lean up or down.'],
  ['loading.horizonHeight', 0.3, 0.9, 'Loading screen: where the top of the planet sits, as a fraction of the screen height measured from the top (higher number = lower planet).'],
  ['loading.cloudCover', 0, 1, 'Loading screen: how much of the planet the cloud layer covers (0 = clear, 1 = overcast).'],
  ['loading.cloudDrift', 0, 4, 'Loading screen: cloud layer speed relative to the planet spin (1 = clouds turn with the ground, above 1 they slide ahead of it).'],
  ['loading.finishTime', 0.1, 3, 'Loading screen: once the game is ready, seconds the ball takes to finish rolling to the cup before the screen closes.'],
  ['loading.landSmoothness', 0, 1, 'Loading screen: look of the planet surface, from chunky big pixels with a flat palette (0) to smooth detail (1).'],
  ['loading.citySize', 0.5, 3, 'Loading screen: size of the 3D city skylines as a multiplier (the globe stays the same size).'],
  ['loading.cityStyle', 0, 3, 'Loading screen: skyline style, rounded to a whole number: 0 candy blocks, 1 skyscrapers, 2 cosy town, 3 neon night.'],
  ['loading.planes', 0, 12, 'Loading screen: planes flying between cities, with contrails (rounded to whole planes; 0 hides them).'],
  ['loading.boats', 0, 20, 'Loading screen: boats on the sea (rounded to whole boats; 0 hides them).'],
  ['loading.satellites', 0, 8, 'Loading screen: satellites orbiting the planet (rounded to whole satellites; 0 hides them).'],
]);

/** Values the renderer used before they were parameterized. */
export const DEFAULT_DISPLAY = {
  ball: { visualScale: 1 },
  aim: { arrowMaxLength: 100, arrowShaftHalfWidth: 2.6, arrowHeadHalfWidth: 7, arrowHeadLength: 14, arrowOpacity: 0.92 },
  loading: { spinSpeed: 4, axisTilt: 12, horizonHeight: 0.48, cloudCover: 0.6, cloudDrift: 1.4, finishTime: 0.8, landSmoothness: 0.5, citySize: 1.6, cityStyle: 0, planes: 5, boats: 9, satellites: 3 },
};

const read = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Dotted paths of every object and leaf in the shape, so unknown keys can be named. */
const KNOWN_PATHS = new Set(DISPLAY_FIELDS.flatMap(([path]) => path.split('.').map((_, i, parts) => parts.slice(0, i + 1).join('.'))));

const GROUP_PATHS = new Set(DISPLAY_FIELDS.flatMap(([path]) => path.split('.').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('.'))));

/** Shape problems in a (partial) display: unknown keys, and a group such as `aim` that is not an object. */
function shapeProblems(value, prefix = '') {
  if (!isObj(value)) return [];
  return Object.keys(value).flatMap(k => {
    const path = prefix + k;
    if (!KNOWN_PATHS.has(path)) return ['unknown field ' + path];
    if (GROUP_PATHS.has(path)) return isObj(value[k]) ? shapeProblems(value[k], path + '.') : [path + ' must be an object'];
    return [];
  });
}

/** Returns a list of problems (empty when valid). Missing and unknown fields are errors. */
export function displayProblems(display) {
  const problems = shapeProblems(display);
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
  const shape = shapeProblems(overrides);
  if (shape.length) throw new Error('Invalid display: ' + shape.join('; '));
  return deepFreeze(validateDisplay(merge(DEFAULT_DISPLAY, overrides)));
}

export const DISPLAY = createDisplay();
