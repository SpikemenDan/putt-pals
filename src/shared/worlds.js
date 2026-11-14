/**
 * Worlds (VIS-W #164): the destinations a match takes place on, as data.
 *
 * Gravity values live in src/shared/tuning.js (the one source of defaults): Gaia uses the
 * top-level `gravity`, Ares and Luna use `worlds.<id>.gravity`. This module only names the
 * worlds and resolves their gravity from a validated tuning object, so the browser,
 * simulation callers, CLI and solver agree on the same numbers.
 *
 * `precipitation` says whether rain and snow really fall there. Owner, 2026-11-12 (replacing 2026-11-11): every world offers
 * the Precipitation power-up with the same slippery effect; where nothing falls it shows as that world's own weather, a Dust
 * Storm on Ares and the Solar Wind on Luna (src/gameplay/world-weather.js, VIS-E #166). Ambient Ares wind and Luna dust and
 * solar activity are scenery only (src/render/atmosphere.js).
 */

import { TUNING } from './tuning.js';

export const DEFAULT_WORLD = 'gaia';

export const WORLDS = Object.freeze([
  Object.freeze({ id: 'gaia', name: 'Gaia', gravityPath: 'gravity', precipitation: true }),
  Object.freeze({ id: 'ares', name: 'Ares', gravityPath: 'worlds.ares.gravity', precipitation: false }),
  Object.freeze({ id: 'luna', name: 'Luna', gravityPath: 'worlds.luna.gravity', precipitation: false }),
]);

export const WORLD_IDS = Object.freeze(WORLDS.map(world => world.id));

/**
 * The world a course is on (VIS-M4 mix and match): its `world` field when it names one, else Gaia. Gaia courses omit the field; the
 * Ares and Luna maps (VIS-G #165) name their world.
 * A map's world sets its gravity, so choosing the next map in a tournament also chooses the planet, and every player derives the same
 * gravity from the shared course data without any new network message.
 */
export function courseWorld(course) {
  return isWorldId(course?.world) ? course.world : DEFAULT_WORLD;
}

/** True for a known world id. */
export function isWorldId(id) {
  return typeof id === 'string' && WORLD_IDS.includes(id);
}

/** The world record for an id; throws on an unknown id so a typo cannot silently fall back to Gaia. */
export function worldOf(id) {
  const world = WORLDS.find(w => w.id === id);
  if (!world) throw new Error('Unknown world: ' + String(id));
  return world;
}

/** Shipped gravity per world (units/s^2), read once from TUNING. */
export const WORLD_GRAVITY = Object.freeze({
  gaia: TUNING.gravity,
  ares: TUNING.worlds.ares.gravity,
  luna: TUNING.worlds.luna.gravity,
});

/** Vertical gravity (units/s^2) for a world: shipped by default, or read from another validated tuning object. */
export function worldGravity(id = DEFAULT_WORLD, tuning = TUNING) {
  const world = worldOf(id);
  return tuning === TUNING ? WORLD_GRAVITY[world.id] : world.gravityPath.split('.').reduce((o, k) => o[k], tuning);
}
