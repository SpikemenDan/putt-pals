/**
 * Presentation settings for Putt Pals: sizes and looks that change what a player sees, never how the ball moves.
 *
 * Unlike TUNING (src/shared/tuning.js), nothing here is read by the simulation, so a client may override these
 * values without desyncing a room or invalidating recorded difficulty. Defaults equal the values the renderer
 * used before they were parameterized. Every field is validated at load: finite numbers inside a sane range.
 *
 * Units: distances in world units (the ball radius is 5). Opacity is 0..1; scale is a multiplier. The `loading` group
 * (loading screen, src/render/planet-scene.js) uses degrees, seconds, CSS px and a screen-height fraction as listed per field;
 * the `menu` group (main menu, src/ui/Landing.jsx) uses a multiplier, seconds, CSS px and degrees. The `environment` group (VIS-E
 * world atmosphere, src/render/atmosphere.js) holds multipliers for the Ares and Luna scenery.
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
  ['loading.cameraAltitude', 0.15, 1.5, 'Loading screen: how high the camera flies above the ground, as a fraction of the planet radius (below the top of the blue air, about 0.6, it flies in the atmosphere; about 1.2 is out in space).'],
  ['loading.cloudCover', 0, 1, 'Loading screen: how much of the planet the cloud layer covers (0 = clear, 1 = overcast).'],
  ['loading.cloudDrift', 0, 4, 'Loading screen: cloud layer speed relative to the planet spin (1 = clouds turn with the ground, above 1 they slide ahead of it).'],
  ['loading.finishTime', 0.1, 3, 'Loading screen: once the game is ready, seconds all three balls stay lit before the screen closes.'],
  ['loading.atmosphere', 0, 1, 'Loading screen: strength of the blue air around the planet, from thin (0) to thick (1).'],
  ['loading.atmosphereHeight', 0.1, 0.8, 'Loading screen: how high the blue air reaches above the ground, as a fraction of the planet radius.'],
  ['loading.citySize', 0.5, 3, 'Loading screen: size of cities, towns, villages, ports and mills as a multiplier of their audited sizes (docs/GAIA_MAP.md).'],
  ['loading.lunaSize', 1, 8, 'Loading screen: size of Luna in the sky: 1 is its true apparent size at the real Earth-Moon distance, higher is magnified.'],
  ['loading.outlineWidth', 0, 4, 'Loading screen: ink outline width on cities, ships, planes and clouds, in pixels at 1280 wide; 0 turns outlines off.'],
  ['loading.planes', 0, 12, 'Loading screen: planes flying between cities, with contrails (rounded to whole planes; 0 hides them).'],
  ['loading.boats', 0, 20, 'Loading screen: boats on the sea (rounded to whole boats; 0 hides them).'],
  ['loading.satellites', 0, 8, 'Loading screen: satellites orbiting the planet (rounded to whole satellites; 0 hides them).'],
  ['menu.buttonScale', 0.7, 1.5, 'Main menu: size of the Solo, Party, Custom and Settings buttons as a multiplier.'],
  ['menu.stagger', 0, 0.3, 'Main menu: delay between each button dropping in, in seconds (0 brings them in together).'],
  ['menu.bob', 0, 8, 'Main menu: how far the big buttons bob up and down while idle, in CSS px (0 holds them still). Off under reduced motion.'],
  ['menu.tilt', 0, 8, 'Main menu: how far the buttons lean, alternating left and right, in degrees (0 keeps them straight).'],
  ['environment.aresWind', 0, 2, 'Ares courses: strength of the wind scenery: speed and opacity of the wind streaks and blown dust, and the rust haze (0 hides it). Visual only.'],
  ['environment.aresWindDensity', 0, 2, 'Ares courses: how many wind streaks and dust grains fill the air, as a multiplier of 1100 streaks and 2400 grains (plus 140 and 360 close around the camera). Visual only.'],
  ['environment.lunaDust', 0, 2, 'Luna courses: brightness of the floating dust motes (0 hides them). Visual only.'],
  ['environment.lunaDustDensity', 0, 2, 'Luna courses: how many dust motes and sun particles fill the air, as a multiplier of 2400 motes and 600 particles (plus 420 and 60 close around the camera). Visual only.'],
  ['environment.lunaSolar', 0, 2, 'Luna courses: strength of solar activity: the sun particles and the gold wash of each solar flare (0 hides them). Visual only.'],
]);

/** Values the renderer used before they were parameterized. */
export const DEFAULT_DISPLAY = {
  ball: { visualScale: 1 },
  aim: { arrowMaxLength: 100, arrowShaftHalfWidth: 2.6, arrowHeadHalfWidth: 7, arrowHeadLength: 14, arrowOpacity: 0.92 },
  loading: { spinSpeed: 4, axisTilt: 12, horizonHeight: 0.48, cameraAltitude: 0.4, cloudCover: 0.6, cloudDrift: 1.4, finishTime: 0.8, atmosphere: 0.75, atmosphereHeight: 0.62, citySize: 1, lunaSize: 2.6, outlineWidth: 1.6, planes: 3, boats: 9, satellites: 2 },
  menu: { buttonScale: 1, stagger: 0.07, bob: 2, tilt: 1.5 },
  environment: { aresWind: 1, aresWindDensity: 1, lunaDust: 1, lunaDustDensity: 1, lunaSolar: 1 },
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
