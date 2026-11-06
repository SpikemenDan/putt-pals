/**
 * The map of Gaia: the six regions in the vision (MODERNIZATION_PLAN.md, "Worlds and gravity"), four named maps in each. One source for
 * both the planet (src/render/planet-data.js shapes its land and climate around these regions, and plants a flag on each map) and any
 * later menu or flat map, so the globe and the map always agree.
 *
 * `u` is a fraction of a full turn east, `lat` degrees north. `reach` is the region's half width and half height in degrees. Map names are
 * proposals: these are places on the globe, not playable courses yet. Plain data, no dependencies.
 */

export const GAIA_REGIONS = Object.freeze([
  {
    id: 'polar', name: 'Frostreach', biome: 'Polar and alpine', u: 0.75, lat: 58, reach: [40, 17], blurb: 'Ice fields and high snowy ranges in the far north.',
    maps: [['Frostbite Falls', 0.69, 54], ['Glacier Glide', 0.74, 66], ['Aurora Ridge', 0.8, 60], ['Summit Drift', 0.76, 50]],
  },
  {
    id: 'temperate', name: 'Evergreen Vale', biome: 'Temperate forest', u: 0.1, lat: 44, reach: [38, 19], blurb: 'Rolling woods, mills and farm country.',
    maps: [['Maple Hollow', 0.05, 48], ['Mossy Mill', 0.11, 54], ['Fernwood Bend', 0.15, 42], ['Bramble Bridge', 0.09, 36]],
  },
  {
    id: 'desert', name: 'Sunspire Sands', biome: 'Desert', u: 0.44, lat: 26, reach: [36, 15], blurb: 'Dunes, mesas and hidden oases.',
    maps: [['Dune Crossing', 0.39, 28], ['Mirage Mesa', 0.44, 34], ['Oasis Run', 0.49, 25], ['Canyon Echo', 0.44, 19]],
  },
  {
    id: 'tropical', name: 'Palm Reef', biome: 'Tropical', u: 0.16, lat: -4, reach: [24, 22], blurb: 'Jungle coasts, lagoons and coral shallows.',
    maps: [['Coral Cove', 0.13, -14], ['Lagoon Loop', 0.19, -8], ['Jungle Vines', 0.15, 3], ['Mango Falls', 0.18, -20]],
  },
  {
    id: 'wetland', name: 'Mirewater', biome: 'Wetlands', u: 0.56, lat: 48, reach: [24, 13], blurb: 'Slow rivers, reeds and misty mangroves.',
    maps: [['Lily Pad Lane', 0.52, 46], ['Mangrove Maze', 0.56, 52], ['Foggy Bayou', 0.59, 45], ['Reed Rapids', 0.55, 41]],
  },
  {
    id: 'volcanic', name: 'Emberfall Isles', biome: 'Volcanic', u: 0.96, lat: 8, reach: [20, 17], blurb: 'Black beaches and fire mountains in the open sea.',
    maps: [['Cinder Steps', 0.93, 12], ['Magma Run', 0.97, 17], ['Ashen Caldera', 0.99, 5], ['Obsidian Edge', 0.95, -1]],
  },
].map(({ maps, ...region }) => Object.freeze({ ...region, maps: Object.freeze(maps.map(([name, u, lat]) => Object.freeze({ name, u, lat }))) })));

/** How far inside region `r` a place is: 1 in the heart, falling to 0 at its edge. */
export function regionWeight(r, u, lat) {
  const du = Math.min(Math.abs(u - r.u), 1 - Math.abs(u - r.u)) * 360 * Math.cos(lat * Math.PI / 180);
  const d = Math.hypot(du / r.reach[0], (lat - r.lat) / r.reach[1]);
  if (d >= 1) return 0;
  const t = Math.min(1, (1 - d) / 0.42);
  return t * t * (3 - 2 * t);
}
