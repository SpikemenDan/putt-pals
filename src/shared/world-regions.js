/**
 * Regions and named maps of Ares and Luna (VIS-G #165). Owner, 2026-11-11: each starts with two regions of four maps, designed and
 * solved for its own gravity (src/shared/worlds.js). Gaia's six regions keep their globe positions in gaia-map.js; this module is plain
 * data with no map imports, so the level select, tests and tools can read it cheaply.
 *
 * `maps` lists course indices (the ids used by voting, see src/courses); each course's `world` field must name the same world.
 * Region and map names are original.
 */

export const OFFWORLD_REGIONS = Object.freeze({
  ares: Object.freeze([
    Object.freeze({ id: 'rustfall', name: 'Rustfall Canyons', biome: 'Canyons', blurb: 'Deep red canyons, dust devils and long ramp leaps across the gorges.', maps: Object.freeze([24, 25, 26, 27]) }),
    Object.freeze({ id: 'ironcrown', name: 'Ironcrown Highlands', biome: 'Volcanic highlands', blurb: 'Dark basalt, caldera rims and frosted ridges on the high volcanic plateau.', maps: Object.freeze([28, 29, 30, 31]) }),
  ]),
  luna: Object.freeze([
    Object.freeze({ id: 'hushed-mare', name: 'Hushed Mare', biome: 'Dark plains', blurb: 'Smooth grey plains of soft moondust where a pad hop floats for ages.', maps: Object.freeze([32, 33, 34, 35]) }),
    Object.freeze({ id: 'craterpeak', name: 'Craterpeak Highlands', biome: 'Cratered highlands', blurb: 'Bright crater rims, polar ice and old portals in the battered highlands.', maps: Object.freeze([36, 37, 38, 39]) }),
  ]),
});

/** The region of an off-Gaia course index, as `{ world, region }`, or null for a Gaia course. */
export function offworldRegionOf(index) {
  for (const [world, regions] of Object.entries(OFFWORLD_REGIONS)) {
    const region = regions.find(r => r.maps.includes(index));
    if (region) return { world, region };
  }
  return null;
}
