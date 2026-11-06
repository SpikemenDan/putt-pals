/**
 * The map of Gaia: invented continents laid out on real-Earth logic, and the six regions of the vision (MODERNIZATION_PLAN.md, "Worlds and
 * gravity"), four named maps in each. One source for both the planet (src/render/planet-data.js builds its land, climate and people from
 * this) and any later menu or flat map, so the globe and the map always agree.
 *
 * Why things sit where they do (docs/GAIA_MAP.md): most land lies north of the equator; long mountain chains run down western coasts and
 * where landmasses meet; hot deserts sit near 25 degrees on the dry western side of continents; rainforest sits on the equator; wet
 * forests face the westerlies; volcanoes follow island arcs in the open sea; wetlands lie where great rivers meet the coast.
 *
 * The coastlines themselves are the closed paths in gaia-coast.js. `u` is a fraction of a full turn east, `lat` degrees north. Each map has a
 * stable `id`; `marker` optionally moves its pin on the flat map only, where four sites sit too close to read. Map names are proposals,
 * not playable courses yet. Plain data.
 */

/** Mountain chains: { line: [[u, lat], ...], width (degrees), height (0..1) }. */
export const RANGES = Object.freeze([
  { line: [[0.065, 64], [0.075, 50], [0.1, 36], [0.14, 24]], width: 5, height: 0.78 }, // down the western coast of Norvane
  { line: [[0.205, 8], [0.203, -8], [0.215, -26], [0.226, -44]], width: 3.6, height: 0.86 }, // down the western coast of Sudara
  { line: [[0.655, 37], [0.7, 36], [0.74, 37], [0.79, 33]], width: 6, height: 1 }, // where Aurelia's southern block meets the rest
  { line: [[0.535, 45], [0.585, 44]], width: 3.2, height: 0.72 },
  { line: [[0.64, 50], [0.645, 66]], width: 2.6, height: 0.42 },
  { line: [[0.565, 6], [0.57, -16]], width: 3, height: 0.5 }, // the rift of eastern Kesh
]);

export const GAIA_REGIONS = Object.freeze([
  {
    id: 'polar', name: 'Frostreach', biome: 'Polar and alpine', u: 0.72, lat: 38, reach: [26, 9], blurb: 'The roof of the world, high ice and snow above the great range.',
    label: [0.72, 29], maps: [['Frostbite Falls', 0.685, 36.5, [0.664, 39]], ['Glacier Glide', 0.71, 37, [0.7, 44]], ['Aurora Ridge', 0.735, 37.5, [0.742, 44]], ['Summit Drift', 0.76, 35.5, [0.782, 39]]],
  },
  {
    id: 'temperate', name: 'Evergreen Vale', biome: 'Temperate forest', u: 0.55, lat: 51, reach: [22, 11], blurb: 'Rainy western woods, mills and farm country.',
    maps: [['Maple Hollow', 0.525, 52], ['Mossy Mill', 0.55, 56], ['Fernwood Bend', 0.575, 52], ['Bramble Bridge', 0.55, 47.5]],
  },
  {
    id: 'desert', name: 'Sunspire Sands', biome: 'Desert', u: 0.49, lat: 23, reach: [28, 10], blurb: 'Dunes and mesas under the dry high-pressure belt.',
    maps: [['Dune Crossing', 0.45, 23], ['Mirage Mesa', 0.485, 27], ['Oasis Run', 0.52, 23], ['Canyon Echo', 0.485, 19]],
  },
  {
    id: 'tropical', name: 'Palm Reef', biome: 'Tropical', u: 0.265, lat: 0, reach: [20, 10], blurb: 'Equatorial jungle, lagoons and coral shallows.',
    maps: [['Coral Cove', 0.295, -3], ['Lagoon Loop', 0.27, 5], ['Jungle Vines', 0.245, 0], ['Mango Falls', 0.27, -6]],
  },
  {
    id: 'wetland', name: 'Mirewater', biome: 'Wetlands', u: 0.178, lat: 29, reach: [15, 8], blurb: 'Where the great river of Norvane spreads out into the gulf.',
    maps: [['Lily Pad Lane', 0.158, 29], ['Mangrove Maze', 0.178, 25], ['Foggy Bayou', 0.195, 29], ['Reed Rapids', 0.176, 33]],
  },
  {
    id: 'volcanic', name: 'Emberfall Isles', biome: 'Volcanic', u: 0.94, lat: 14, reach: [18, 18], blurb: 'An island arc of fire mountains in the open eastern sea.',
    maps: [['Cinder Steps', 0.925, 26], ['Magma Run', 0.945, 17], ['Ashen Caldera', 0.955, 7], ['Obsidian Edge', 0.935, 0]],
  },
].map(({ maps, ...region }) => Object.freeze({ ...region, maps: Object.freeze(maps.map(([name, u, lat, marker]) => Object.freeze({ id: name.toLowerCase().replace(/\W+/g, '-'), name, u, lat, ...(marker ? { marker } : {}) }))) })));

/** How far inside region `r` a place is: 1 in the heart, falling to 0 at its edge. */
export function regionWeight(r, u, lat) {
  const du = Math.min(Math.abs(u - r.u), 1 - Math.abs(u - r.u)) * 360 * Math.cos(lat * Math.PI / 180);
  const d = Math.hypot(du / r.reach[0], (lat - r.lat) / r.reach[1]);
  if (d >= 1) return 0;
  const t = Math.min(1, (1 - d) / 0.42);
  return t * t * (3 - 2 * t);
}

/**
 * The culture of a place, by where it lies, each loosely inspired by real building traditions (see STYLES in src/render/sky-models.js).
 * `biome` is its biome name.
 */
export function cultureAt(u, lat, biome) {
  if (biome === 'wetland') return 'canal';
  if (biome === 'boreal' || biome === 'tundra') return 'northern';
  if (u < 0.21) return lat > 42 ? 'prairie' : 'metro';
  if (u < 0.36) return 'carnival';
  if (u > 0.8 && lat < 0) return 'metro';
  if (u < 0.6 && lat < 36) return lat > 10 ? 'desert' : 'savanna';
  if (u < 0.63) return lat < 44 ? 'mediterranean' : 'oldworld';
  if (u < 0.72) return lat < 34 ? 'palace' : 'silk';
  return 'eastern';
}
