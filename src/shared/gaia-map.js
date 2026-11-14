/**
 * The map of Gaia: the six regions of the vision (MODERNIZATION_PLAN.md, "Worlds and gravity") and their named course sites, on the
 * reference world imported from the owner's Azgaar map (src/shared/gaia-reference.js). One source for the planet (src/render/planet-data.js),
 * the flat map and the 3D level select, so they always agree. Where each region sits is in gaia-reference-regions.js (map pixels); here
 * those become `u` (a fraction of a full turn east) and `lat` (degrees north), with a `reach` in degrees that covers every site.
 *
 * Each map has a stable `id`. Map names are proposals, not playable courses yet. Plain data.
 */

import { REFERENCE_REGIONS, toGlobe } from './gaia-reference-regions.js';

const REGION_TEXT = [
  { id: 'polar', name: 'Frostreach', biome: 'Polar and alpine', blurb: 'The roof of the world: snow and bare rock on the great eastern range.', maps: ['Frostbite Falls', 'Glacier Glide', 'Aurora Ridge', 'Summit Drift'] },
  { id: 'temperate', name: 'Evergreen Vale', biome: 'Temperate forest', blurb: 'Deciduous woods, mills and farm country across the north of the west.', maps: ['Maple Hollow', 'Mossy Mill', 'Fernwood Bend', 'Bramble Bridge'] },
  { id: 'desert', name: 'Sunspire Sands', biome: 'Desert', blurb: 'Dry grass and dunes in the sunbaked heart of the western continent.', maps: ['Dune Crossing', 'Mirage Mesa', 'Oasis Run', 'Sandstorm Spire'] },
  { id: 'tropical', name: 'Palm Reef', biome: 'Tropical', blurb: 'A forested island of lagoons and coral shallows in the central sea.', maps: ['Coral Cove', 'Lagoon Loop', 'Jungle Vines', 'Mango Falls'] },
  { id: 'wetland', name: 'Mirewater', biome: 'Wetlands', blurb: 'A long marsh peninsula of reeds and channels at the far east.', maps: ['Lily Pad Lane', 'Mangrove Maze', 'Foggy Bayou', 'Reed Rapids'] },
  { id: 'volcanic', name: 'Emberfall Isles', biome: 'Volcanic', blurb: 'A chain of fire-mountain islands in the southern sea.', maps: ['Cinder Steps', 'Magma Run', 'Ashen Caldera', 'Obsidian Spiral'] },
];

/** Regions with their centre (the mean of their sites) as `u`/`lat`, the flat map's caption point as `label` [u, lat], a `reach` [east-west, north-south] in degrees that covers every site, and their maps. */
export const GAIA_REGIONS = Object.freeze(REGION_TEXT.map(({ maps, ...text }) => {
  const place = REFERENCE_REGIONS[text.id], [labelU, labelLat] = toGlobe(place.label);
  const sites = place.sites.map((site, k) => { const [mu, mlat] = toGlobe(site); return Object.freeze({ id: maps[k].toLowerCase().replace(/\W+/g, '-'), name: maps[k], u: mu, lat: mlat }); });
  const u = sites.reduce((t, m) => t + m.u, 0) / sites.length, lat = sites.reduce((t, m) => t + m.lat, 0) / sites.length;
  const reach = [Math.max(10, ...sites.map(m => Math.abs(m.u - u) * 360 * Math.cos(m.lat * Math.PI / 180) + 4)), Math.max(6, ...sites.map(m => Math.abs(m.lat - lat) + 3))];
  return Object.freeze({ ...text, u, lat, label: Object.freeze([labelU, labelLat]), reach: Object.freeze(reach), maps: Object.freeze(sites) });
}));

/**
 * Which real courses sit in which region, by theme: lists of map indices (the course ids used by voting, see src/courses). Each takes the site
 * at the same position in its region's `maps`. All 24 courses appear once: four per region (owner, 2026-11-11), Sandstorm Spire (22) and
 * Obsidian Spiral (23) being the two maps added for that (VIS-G #165).
 */
export const REGION_COURSES = Object.freeze({
  polar: Object.freeze([20, 9, 6, 2]), temperate: Object.freeze([0, 1, 7, 4]), desert: Object.freeze([8, 13, 11, 22]),
  tropical: Object.freeze([12, 16, 3, 15]), wetland: Object.freeze([21, 5, 10, 14]), volcanic: Object.freeze([18, 19, 17, 23]),
});

/** How far inside region `r` a place is: 1 in the heart, falling to 0 at its edge. */
export function regionWeight(r, u, lat) {
  const du = Math.min(Math.abs(u - r.u), 1 - Math.abs(u - r.u)) * 360 * Math.cos(lat * Math.PI / 180);
  const d = Math.hypot(du / r.reach[0], (lat - r.lat) / r.reach[1]);
  if (d >= 1) return 0;
  const t = Math.min(1, (1 - d) / 0.42);
  return t * t * (3 - 2 * t);
}

/**
 * The culture of a place, by where it lies on the reference world, each loosely inspired by real building traditions (see STYLES in
 * src/render/sky-models.js). `biome` is its biome name. The west (u below 0.42) is the old world, the middle islands mix old world and
 * carnival, and the east is palace, silk road and eastern country, with a modern south.
 */
export function cultureAt(u, lat, biome) {
  if (biome === 'wetland') return 'canal';
  if (['boreal', 'tundra', 'polar', 'alpine'].includes(biome)) return 'northern';
  if (biome === 'desert') return 'desert';
  if (biome === 'savanna') return 'savanna';
  if (u < 0.42) return lat > 30 ? 'oldworld' : lat > 2 ? 'mediterranean' : 'prairie';
  if (u < 0.6) return lat > 20 ? 'oldworld' : 'carnival';
  if (lat > 34) return 'eastern';
  if (biome === 'tropical') return 'palace';
  return lat > 2 ? 'silk' : 'metro';
}
