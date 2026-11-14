/**
 * Weather power-ups per world and biome (VIS-E #166). Plain data and pure functions, like catalog.js.
 *
 * Owner, 2026-11-12 (replacing the 2026-11-11 rule that left Rain and Snow out of the Ares and Luna pools): every world
 * offers one Precipitation power-up and the Lightning strike. The effect is the same everywhere; only its name and look
 * follow the place, chosen to be true to that world:
 *
 * | Place | Precipitation | Effect (hazard kind) | Lightning |
 * | --- | --- | --- | --- |
 * | Gaia, warm biome | Rain: the floor turns wet | rain: slides further | Lightning |
 * | Gaia, cold biome | Snow: the floor ices over | snow: ice-like, slides much further | Lightning |
 * | Ares | Dust Storm: fine Martian dust coats the floor (Mars has planet-wide dust storms) | rain | Lightning: Martian dust storms really do spark small discharges, so it stays |
 * | Luna | Solar Wind: with no air or magnetic field, the solar wind reaches the ground and its charge lifts the dust, so balls glide on it | rain | Solar Bolt: a discharge from a solar flare |
 *
 * The catalog keeps its `rain` and `snow` entries and the room keeps the `rain` and `snow` hazard kinds, so physics and
 * the simulation fingerprint are unchanged (catalog.js is in the simulation's import closure, tools/cli/provenance.mjs).
 * Either item in an inventory is "Precipitation": it resolves to the place's variant only when it is used, so an item
 * carried to another map in a tournament becomes that map's weather. Only `rain` spawns from boxes, so Precipitation is
 * one item in the pool.
 */

import { POWERUP_CATALOG } from './catalog.js';
import { paletteForCourse } from '../courses/palettes.js';
import { DEFAULT_WORLD, courseWorld, worldOf } from '../shared/worlds.js';

/** Catalog ids that are the one Precipitation power-up. `rain` is the one that spawns. */
export const PRECIPITATION_ITEMS = Object.freeze(['rain', 'snow']);
export const PRECIPITATION_NAME = 'Precipitation';
export const CLIMATES = Object.freeze(['warm', 'cold']);

const variant = (kind, name, look, toast) => Object.freeze({ kind, name, banner: name.toUpperCase(), look, toast });
const RAIN = variant('rain', 'Rain', 'rain', 'Rain wets the course for everyone, so every ball slides further.');
const SNOW = variant('snow', 'Snow', 'snow', 'Snow ices the course for everyone, so every ball slides much further.');
const DUST_STORM = variant('rain', 'Dust Storm', 'dust', 'A dust storm coats the course in fine red dust, so every ball slides further.');
const SOLAR_WIND = variant('rain', 'Solar Wind', 'solar', 'The solar wind charges the dust until it lifts, so every ball glides further.');
const LIGHTNING = variant('lightning', 'Lightning', 'lightning', 'Strikes the selected opponent once.');
const SOLAR_BOLT = variant('lightning', 'Solar Bolt', 'solar-bolt', 'A solar flare bolt strikes the selected opponent once.');

/** Climate of a course: its `climate` field when set, else cold for the snowy palette (Frost Hollow), else warm. */
export function courseClimate(course) {
  if (CLIMATES.includes(course?.climate)) return course.climate;
  return paletteForCourse(course).weather === 'snow' ? 'cold' : 'warm';
}

/** Where a course is: { world, climate }. */
export const coursePlace = course => ({ world: courseWorld(course), climate: courseClimate(course) });

/** Normalises a place; throws on an unknown world or climate. */
function placeOf(place = {}) {
  const world = worldOf(place.world ?? DEFAULT_WORLD).id, climate = place.climate ?? 'warm';
  if (!CLIMATES.includes(climate)) throw new Error('Unknown climate: ' + String(climate));
  return { world, climate };
}

/** The Precipitation variant for a place. */
export function precipitationVariant(place) {
  const { world, climate } = placeOf(place);
  if (world === 'ares') return DUST_STORM;
  if (world === 'luna') return SOLAR_WIND;
  return climate === 'cold' ? SNOW : RAIN;
}

/** The Lightning variant for a place. */
export function lightningVariant(place) {
  return placeOf(place).world === 'luna' ? SOLAR_BOLT : LIGHTNING;
}

export const isPrecipitationItem = id => PRECIPITATION_ITEMS.includes(id);

/**
 * How a hazard kind (or the item that makes it) shows at a place: { kind, name, banner, look, toast }. Precipitation and
 * Lightning follow the place; every other kind is its catalog entry, with look = kind.
 */
export function hazardVariant(kind, place, catalog = POWERUP_CATALOG) {
  if (isPrecipitationItem(kind)) {
    // A record already made keeps its kind (a cold Gaia map's snow stays snow); only the look and name follow the world.
    const v = precipitationVariant(place);
    return kind === 'snow' && v === RAIN ? SNOW : kind === 'rain' && v === SNOW ? RAIN : v;
  }
  if (kind === 'lightning') return lightningVariant(place);
  const entry = catalog.find(e => e.id === kind);
  return { kind, name: entry?.name || String(kind), banner: entry?.banner || String(kind).toUpperCase(), look: kind, toast: entry?.toast || '' };
}

/** Inventory label for an item: "Precipitation" for either weather item, else the catalog name. */
export function itemName(id, catalog = POWERUP_CATALOG) {
  if (isPrecipitationItem(id)) return PRECIPITATION_NAME;
  return catalog.find(e => e.id === id)?.name || String(id);
}

/** A spawn pool (catalog.js `spawnPool`) with one Precipitation entry: `snow` never spawns, `rain` stands for both. */
export const weatherPool = pool => pool.filter(entry => entry.id !== 'snow');
