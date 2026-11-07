/**
 * Where Gaia's six regions and their course sites sit on the reference world (src/shared/gaia-reference.js), in that map's pixels: x west to
 * east on a MAP_WIDTH-wide map, y north to south. Keyed by the region ids of GAIA_REGIONS (src/shared/gaia-map.js); each region's `sites`
 * are in the same order as its REGION_COURSES, so site k holds course REGION_COURSES[id][k]. Hand-placed on land in the matching biome:
 *
 * - polar: the snow and rock of the great eastern range;
 * - temperate: the deciduous forest belt across the north of the western continent;
 * - desert: the dry savanna heart of the western continent;
 * - tropical: the island of seasonal forest south of the central sea;
 * - wetland: the long marsh peninsula at the eastern tip;
 * - volcanic: the southern island chain.
 *
 * GAIA_REGIONS (src/shared/gaia-map.js) takes its positions from here, so the flat map, the globe and the 3D level select agree. The
 * reference map spans the whole globe, so `toGlobe` turns its pixels into the `u` (fraction of a turn east) and `lat` (degrees north) that
 * the globe and atlas use. Plain data.
 */

import { LAKES, LAND, MAP_HEIGHT, MAP_WIDTH } from './gaia-reference.js';

/** Reference map pixels to [u, lat]. */
export const toGlobe = ([x, y]) => [x / MAP_WIDTH, 90 - y / MAP_HEIGHT * 180];

const ringsOnGlobe = rings => Object.freeze(rings.map(r => Object.freeze(Array.from({ length: r.length / 2 }, (_, k) => Object.freeze(toGlobe([r[k * 2] / 10, r[k * 2 + 1] / 10]))))));
/** The reference coast and lake shores as closed rings of [u, lat]: a lake is a ring inside a land ring. */
export const REFERENCE_COAST = ringsOnGlobe(LAND), REFERENCE_LAKES = ringsOnGlobe(LAKES);

export const REFERENCE_REGIONS = Object.freeze({
  polar: { label: [1150, 168], sites: [[1100, 305], [1095, 210], [1200, 250], [1190, 296]] },
  temperate: { label: [505, 196], sites: [[430, 240], [500, 220], [570, 238], [470, 268]] },
  desert: { label: [360, 300], sites: [[300, 370], [362, 325], [420, 355]] },
  tropical: { label: [815, 405], sites: [[775, 445], [835, 432], [800, 495], [850, 482]] },
  wetland: { label: [1410, 268], sites: [[1360, 306], [1405, 300], [1440, 336], [1450, 366]] },
  volcanic: { label: [810, 660], sites: [[735, 590], [830, 598], [890, 611]] },
});

/** Volcanoes of the Emberfall Isles, in map pixels: one beside each volcanic site, on solid land. Each stands in a field of basalt. */
export const VOLCANO_SITES = Object.freeze([[749, 580], [816, 606], [904, 601]]);
