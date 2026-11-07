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
 * Flat-map only for now: the globe and the 3D level select still use gaia-map.js until the owner approves the move. Plain data.
 */

export const REFERENCE_REGIONS = Object.freeze({
  polar: { label: [1150, 168], sites: [[1100, 305], [1095, 210], [1200, 250], [1190, 296]] },
  temperate: { label: [505, 196], sites: [[430, 240], [500, 220], [570, 238], [470, 268]] },
  desert: { label: [360, 300], sites: [[300, 370], [362, 325], [420, 355]] },
  tropical: { label: [815, 405], sites: [[775, 445], [835, 432], [800, 495], [850, 482]] },
  wetland: { label: [1410, 268], sites: [[1360, 306], [1405, 300], [1440, 336], [1450, 366]] },
  volcanic: { label: [810, 660], sites: [[735, 590], [830, 598], [890, 611]] },
});
