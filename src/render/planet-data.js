/**
 * Gaia's data for the globe and the 3D level select (VIS-M1): its surface colours, heights, biomes, settlements, rivers and plants, and the
 * ship and flight routes that planet-scene.js renders.
 *
 * Built from the reference world imported from the owner's Azgaar map (src/shared/gaia-reference.js), so the globe, the flat map
 * (src/render/reference-map.js) and the level select show one world: the same coast, lakes, heights, biomes and rivers, coloured with the
 * flat map's comic palette, rock and snow on the same height bands. Cities are the reference's capitals and towns and villages its other
 * burgs, kept off ice, peaks, lava, desert and marsh; plants follow the biome map; volcanoes stand in basalt beside the Emberfall sites.
 *
 * Plain data only: no Three.js, no DOM, randomness is injected. Latitude is in degrees unless a name says otherwise, `u` is a fraction
 * of a full turn. `surfaceDir` matches THREE.SphereGeometry's uv layout, so a site found here lands on the same texel in the shader.
 */

import { BIOMES as REFERENCE_BIOMES, BURGS, GRID_COLUMNS, GRID_ROWS, GRID_SPACING, HEIGHTS, MAP_HEIGHT, MAP_WIDTH, RIVERS } from '../shared/gaia-reference.js';
import { BASALT_TEXELS, REFERENCE_COAST, REFERENCE_LAKES, VOLCANO_SITES, basaltShape, toGlobe } from '../shared/gaia-reference-regions.js';
import { GAIA_REGIONS, cultureAt } from '../shared/gaia-map.js';
import { REFERENCE_LOOKS, ROCK, HIGH_ROCK, SNOW as SNOW_LINE } from './reference-map.js';
import { clamp, makeNoise, mix, mulberry32, smooth } from './noise.js';

export { mulberry32 };

export const TEX_W = 1024;
export const TEX_H = 512;
export const SEA = 0.4; // land value at the shoreline
export const MAX_PLANES = 12, MAX_BOATS = 20, MAX_SATELLITES = 8, MAX_PLANTS = 16000;
/** Gaia is one fixed place: the same seed every time, so the globe matches the map (src/shared/gaia-map.js). */
export const GAIA_SEED = 0x9a1a;

const SNOW = [248, 252, 255], SHALLOW = [64, 224, 216], SEA_BLUE = [24, 128, 232], DEEP = [14, 72, 176], BASALT = [64, 54, 66];
const hex = c => c.match(/\w\w/g).map(q => parseInt(q, 16));
/** The flat map's comic colours, by reference biome index, then rock, high rock and snow (kinds 13 to 15). */
const PALETTE = REFERENCE_LOOKS.comic.biome.map(hex);

const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Sea colour at `lat` for a land value below SEA: shallow to deep from the shore, frozen near the poles. */
export function seaColour(lat, land) {
  const depth = SEA - land, cold = smooth(62, 80, Math.abs(lat));
  return lerp3(lerp3(lerp3(SHALLOW, SEA_BLUE, smooth(0, 0.07, depth)), DEEP, smooth(0.06, 0.24, depth)), SNOW, cold);
}

const latOf = y => (0.5 - (y + 0.5) / TEX_H) * 180;
const texelOf = (u, lat) => Math.min(TEX_H - 1, Math.max(0, Math.floor((0.5 - lat / 180) * TEX_H))) * TEX_W + Math.floor((((u % 1) + 1) % 1) * TEX_W) % TEX_W;
const fromMap = (x, y) => toGlobe([x / 10, y / 10]);

/** Fills every texel inside `rings` ([u, lat] closed rings, even-odd, so a ring inside another is a hole) by calling `write(i)`. */
function scanRings(rings, write) {
  for (let y = 0; y < TEX_H; y++) {
    const lat = latOf(y), cuts = [];
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const [au, al] = ring[i], [bu, bl] = ring[(i + 1) % ring.length];
      if ((al > lat) !== (bl > lat)) cuts.push((au + (lat - al) / (bl - al) * (bu - au)) * TEX_W - 0.5);
    }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2) for (let x = Math.max(0, Math.ceil(cuts[k])); x <= Math.min(TEX_W - 1, Math.floor(cuts[k + 1])); x++) write(y * TEX_W + x);
  }
}

/**
 * The land field, filled from the reference coast with its lakes cut out: a signed distance from the shore, in land units, so SEA is
 * exactly the drawn coast. Bilinear sampling of a distance field keeps the coast a clean curve at any zoom, and sea depth follows the
 * shore in even bands.
 */
function landFromCoast() {
  const n = TEX_W * TEX_H, inside = new Uint8Array(n);
  scanRings([...REFERENCE_COAST, ...REFERENCE_LAKES], i => { inside[i] = 1; });
  const reach = wanted => { // chamfer distance, in texels, to the nearest texel unlike `wanted`
    const d = new Float32Array(n).fill(1e6);
    for (let i = 0; i < n; i++) if (inside[i] !== wanted) d[i] = 0;
    const pass = (from, to, step, offsets) => { for (let i = from; i !== to; i += step) { const x = i % TEX_W; for (const [dx, dy, w] of offsets) { const xx = x + dx, j = i + dy * TEX_W + dx; if (xx >= 0 && xx < TEX_W && j >= 0 && j < n && d[j] + w < d[i]) d[i] = d[j] + w; } } };
    pass(0, n, 1, [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.41], [1, -1, 1.41]]);
    pass(n - 1, -1, -1, [[1, 0, 1], [0, 1, 1], [1, 1, 1.41], [-1, 1, 1.41]]);
    return d;
  };
  const toSea = reach(1), toLand = reach(0), land = new Float32Array(n);
  for (let i = 0; i < n; i++) land[i] = SEA + (inside[i] ? toSea[i] - 0.5 : 0.5 - toLand[i]) * 0.012;
  return { land, inside };
}

/** The reference heights (0-100, 20 at the coast), bilinear per texel. */
function heightsFromReference() {
  const grid = HEIGHTS.split(',').map(Number), out = new Float32Array(TEX_W * TEX_H);
  const at = (c, r) => grid[Math.min(GRID_ROWS - 1, Math.max(0, r)) * GRID_COLUMNS + Math.min(GRID_COLUMNS - 1, Math.max(0, c))] ?? 0;
  for (let y = 0; y < TEX_H; y++) {
    const gy = (y + 0.5) / TEX_H * MAP_HEIGHT / GRID_SPACING - 0.5, r = Math.floor(gy), ty = gy - r;
    for (let x = 0; x < TEX_W; x++) {
      const gx = (x + 0.5) / TEX_W * MAP_WIDTH / GRID_SPACING - 0.5, c = Math.floor(gx), tx = gx - c;
      out[y * TEX_W + x] = (at(c, r) * (1 - tx) + at(c + 1, r) * tx) * (1 - ty) + (at(c, r + 1) * (1 - tx) + at(c + 1, r + 1) * tx) * ty;
    }
  }
  return out;
}

/** Wrapping box blur of a TEX_W by TEX_H field (two separable passes). */
export function blur(field, radius) {
  const out = new Float32Array(field.length), tmp = new Float32Array(field.length), size = radius * 2 + 1;
  for (let y = 0; y < TEX_H; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += field[y * TEX_W + ((k + TEX_W) % TEX_W)];
    for (let x = 0; x < TEX_W; x++) {
      tmp[y * TEX_W + x] = sum / size;
      sum += field[y * TEX_W + ((x + radius + 1) % TEX_W)] - field[y * TEX_W + ((x - radius + TEX_W) % TEX_W)];
    }
  }
  for (let x = 0; x < TEX_W; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(TEX_H - 1, Math.max(0, k)) * TEX_W + x];
    for (let y = 0; y < TEX_H; y++) {
      out[y * TEX_W + x] = sum / size;
      sum += tmp[Math.min(TEX_H - 1, y + radius + 1) * TEX_W + x] - tmp[Math.max(0, y - radius) * TEX_W + x];
    }
  }
  return out;
}

/** Gaia's biomes (the vision's polar, alpine, desert, tropical, temperate forest, wetlands and volcanic, plus the bands between). */
export const BIOMES = Object.freeze(['polar', 'alpine', 'tundra', 'boreal', 'temperate', 'mediterranean', 'grassland', 'savanna', 'desert', 'tropical', 'wetland', 'volcanic']);

/** The reference's biomes (by Azgaar index, 1 hot desert ... 12 wetland) as Gaia's: the seasonal and rain forests of the tropics are both tropical. */
const FROM_REFERENCE = Object.freeze([null, 'desert', 'tundra', 'savanna', 'grassland', 'tropical', 'temperate', 'tropical', 'temperate', 'boreal', 'tundra', 'polar', 'wetland']);

/** What grows in each biome: [kind, chance], the chance of a sampled spot getting that plant. Kinds are drawn by makePlant in sky-models.js. */
const FLORA = Object.freeze({
  tundra: [['shrub', 0.2]],
  boreal: [['pine', 0.72], ['snowpine', 0.2], ['birch', 0.08]],
  temperate: [['broadleaf', 0.5], ['birch', 0.14], ['pine', 0.1], ['autumn', 0.12], ['blossom', 0.05]],
  mediterranean: [['olive', 0.32], ['cypress', 0.2], ['shrub', 0.16]],
  grassland: [['broadleaf', 0.08], ['shrub', 0.16]],
  savanna: [['acacia', 0.18], ['baobab', 0.04], ['shrub', 0.12]],
  desert: [['cactus', 0.04], ['shrub', 0.03]],
  tropical: [['jungle', 0.6], ['palm', 0.2], ['bamboo', 0.14]],
  wetland: [['mangrove', 0.6], ['reeds', 0.3]],
  volcanic: [['deadtree', 0.1]],
});

/** How lush each biome reads (0..1), for plant shading: wetter ground grows deeper colours. */
const LUSH = Object.freeze({ boreal: 0.8, temperate: 0.8, tropical: 0.9, grassland: 0.55, mediterranean: 0.5, savanna: 0.4, tundra: 0.5, wetland: 0.95, desert: 0.1 });

/** Biomes nobody builds a city in. */
const NO_CITY = Object.freeze(['polar', 'alpine', 'desert', 'volcanic', 'wetland', 'tundra']);

/**
 * Builds Gaia once. Returns:
 * - `rgb`: the finished surface colours (3 bytes per texel, row 0 at the north pole).
 * - `landRgb`: RGBA land colours everywhere, even under the sea, so the shader can cut a sharp coast anywhere without a colour fringe,
 *   with rivers painted in; alpha is farmland around settlements.
 * - `field`: RGBA data: r the land value around the shore (0.5 at the coast), g elevation, b city density, a volcanic ground.
 * - `land`: the land value per texel (below SEA is sea). `biome`: index into BIOMES per texel. `cloud`: 0..255 cloud density.
 * - `cities`, `towns`, `villages`: [{u, lat, tint, biome, culture, tier?}], `tint` the local ground colour, `tier` a city's size. `ports`,
 *   `lighthouses`: the same on the shore, plus `sea`, a unit vector toward the water. `mills`: [{u, lat, biome}] on windy open ground.
 *   `volcanoes`, `peaks`: [{u, lat, room}], `room` the distance to the sea in texels (one texel is 180 / TEX_H degrees). `rivers`: lists of [u, lat] from source to mouth. `plants`: [{u, lat, kind, shade}]. `seaSites`: [{u, lat}] on open sea.
 */
export function buildPlanet(random) {
  const n = TEX_W * TEX_H;
  const { land, inside } = landFromCoast(), raw = heightsFromReference(), h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = inside[i] ? clamp((raw[i] - 20) / 80) : 0;
  // Biomes: the reference's areas, filled per texel; land the areas miss takes its neighbour's; high ground is alpine, as on the flat map.
  const kind = new Uint8Array(n);
  for (const b of REFERENCE_BIOMES) scanRings(b.rings.map(r => Array.from({ length: r.length / 2 }, (_, k) => fromMap(r[k * 2], r[k * 2 + 1]))), i => { kind[i] = b.id; });
  for (let pass = 0, open = true; pass < 40 && open; pass++) {
    open = false;
    for (let i = 0; i < n; i++) if (inside[i] && !kind[i]) { const j = [i - 1, i + 1, i - TEX_W, i + TEX_W].find(q => q >= 0 && q < n && kind[q]); if (j !== undefined) kind[i] = kind[j]; else open = true; }
  }
  // How far a land texel is from the sea, in texels: models are kept small enough to stand on their own land.
  const room = i => (inside[i] ? Math.max(0, (land[i] - SEA) / 0.012 + 0.5) : 0);
  // Volcanic ground: an uneven field of basalt round each Emberfall volcano.
  const hot = new Float32Array(n), volcanoes = VOLCANO_SITES.map(([x, y]) => { const [u, lat] = toGlobe([x, y]); return { u, lat, room: room(texelOf(u, lat)) }; });
  for (const [k, v] of volcanoes.entries()) {
    const c = texelOf(v.u, v.lat), cx = c % TEX_W, cy = Math.floor(c / TEX_W), r = BASALT_TEXELS[k] * 1.3, stretch = 1 / Math.max(0.3, Math.cos(v.lat * Math.PI / 180));
    for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r * stretch); dx <= r * stretch; dx++) {
      const yy = cy + dy, xx = (cx + dx + TEX_W) % TEX_W, d = Math.hypot(dx / stretch, dy) / (BASALT_TEXELS[k] * basaltShape(k, Math.atan2(dy, dx / stretch))), i = yy * TEX_W + xx;
      if (d < 1 && yy >= 0 && yy < TEX_H && inside[i]) hot[i] = Math.max(hot[i], smooth(1, 0.55, d));
    }
  }
  const biome = new Uint8Array(n), rgb = new Uint8Array(n * 3), landRgb = new Uint8Array(n * 4), field = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const name = hot[i] > 0.5 ? 'volcanic' : kind[i] !== 11 && raw[i] >= ROCK ? 'alpine' : FROM_REFERENCE[kind[i]] ?? 'grassland';
    biome[i] = BIOMES.indexOf(name);
  }
  for (let pass = 0; pass < 2; pass++) for (let s = 0, visited = new Uint8Array(n); s < n; s++) { // tiny leftover patches join the neighbour around them
    if (visited[s] || !inside[s]) continue;
    const patch = [s], k = biome[s]; let edgeKind = -1;
    visited[s] = 1;
    for (let q = 0; q < patch.length; q++) for (const j of [patch[q] - 1, patch[q] + 1, patch[q] - TEX_W, patch[q] + TEX_W]) {
      if (j < 0 || j >= n || !inside[j]) continue;
      if (biome[j] !== k) edgeKind = biome[j]; else if (!visited[j]) { visited[j] = 1; patch.push(j); }
    }
    if (patch.length < 6 && edgeKind >= 0) for (const i of patch) biome[i] = edgeKind;
  }
  // Colours: the flat map's palette; rock, high rock and snow on the same height bands; basalt on volcanic ground.
  for (let y = 0; y < TEX_H; y++) {
    const lat = latOf(y);
    for (let x = 0; x < TEX_W; x++) {
      const i = y * TEX_W + x, k = kind[i] || 4, rocky = k !== 11 && raw[i] >= ROCK;
      let g = rocky ? PALETTE[raw[i] >= SNOW_LINE ? 15 : raw[i] >= HIGH_ROCK ? 14 : 13] : PALETTE[k];
      g = lerp3(g, BASALT, hot[i] * 0.92);
      const c = land[i] >= SEA ? g : seaColour(lat, land[i]);
      for (let q = 0; q < 3; q++) { rgb[i * 3 + q] = clamp(c[q], 0, 255); landRgb[i * 4 + q] = clamp(g[q], 0, 255); }
      field[i * 4] = clamp(0.5 + (land[i] - SEA) * 2, 0, 1) * 255; field[i * 4 + 1] = clamp(h[i]) * 255; field[i * 4 + 3] = hot[i] * 255;
    }
  }
  const nameAt = i => BIOMES[biome[i]];
  // Rivers: the reference's own, painted into the land colours.
  const river = new Float32Array(n), riverBlue = hex(REFERENCE_LOOKS.comic.river);
  const paint = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = (x + dx + TEX_W) % TEX_W;
      if (yy < 0 || yy >= TEX_H || Math.hypot(dx, dy) > r + 0.2) continue;
      const o = (yy * TEX_W + xx) * 4;
      landRgb[o] = riverBlue[0]; landRgb[o + 1] = riverBlue[1]; landRgb[o + 2] = riverBlue[2]; river[yy * TEX_W + xx] = 1;
    }
  };
  const rivers = RIVERS.map(line => {
    const path = [];
    for (let k = 0; k + 2 < line.length; k += 3) {
      const [u, lat] = fromMap(line[k], line[k + 1]), [u2, lat2] = k + 5 < line.length ? fromMap(line[k + 3], line[k + 4]) : [u, lat], wide = line[k + 2] / 10 > 2.4 ? 1 : 0;
      path.push([u, lat]);
      const steps = Math.max(1, Math.ceil(Math.hypot((u2 - u) * TEX_W, (lat2 - lat) / 180 * TEX_H) * 1.5)); // unbroken lines, texel by texel
      for (let s = 0; s <= steps; s++) { const c = texelOf(mix(u, u2, s / steps), mix(lat, lat2, s / steps)); if (land[c] >= SEA) paint(c % TEX_W, Math.floor(c / TEX_W), wide); }
    }
    return path;
  }).filter(path => path.length > 3);
  // People: the reference's capitals are the cities, its other burgs towns and villages, biggest first, off ground nobody would build on.
  const taken = [], seaSites = [];
  const siteAt = (x, y) => { const i = y * TEX_W + x, u = x / TEX_W, lat = latOf(y), b = nameAt(i); return { x, y, u, lat, tint: [landRgb[i * 4], landRgb[i * 4 + 1], landRgb[i * 4 + 2]], biome: b, culture: cultureAt(u, lat, b) }; };
  const gapTo = (a, x, y) => Math.hypot(Math.min(Math.abs(a.x - x), TEX_W - Math.abs(a.x - x)) * Math.cos(latOf(y) * Math.PI / 180), a.y - y);
  const noCity = i => NO_CITY.includes(nameAt(i));
  const MAP_SITES = GAIA_REGIONS.flatMap(r => r.maps);
  const clearOfMaps = (x, y) => MAP_SITES.every(m => { const c = texelOf(m.u, m.lat); return gapTo({ x: c % TEX_W, y: Math.floor(c / TEX_W) }, x, y) > 6; });
  /** The nearest buildable land texel to a reference burg, within `reach` texels, or null. */
  const settle = (b, reach, ok) => {
    const [u, lat] = fromMap(b[0], b[1]), c = texelOf(u, lat), cx = c % TEX_W, cy = Math.floor(c / TEX_W);
    for (let r = 0; r <= reach; r++) for (let k = 0; k < Math.max(1, r * 6); k++) {
      const x = (cx + Math.round(Math.cos(k / Math.max(1, r * 6) * Math.PI * 2) * r) + TEX_W) % TEX_W, y = cy + Math.round(Math.sin(k / Math.max(1, r * 6) * Math.PI * 2) * r), i = y * TEX_W + x;
      if (y > 0 && y < TEX_H && land[i] >= SEA + 0.012 && !noCity(i) && ok(x, y)) return [x, y];
    }
    return null;
  };
  const byPopulation = [...BURGS].sort((a, b) => b[2] - a[2]);
  const sites = [];
  for (const b of byPopulation.filter(b => b[3])) {
    const spot = settle(b, 12, (x, y) => taken.every(c => gapTo(c, x, y) > 9));
    if (!spot) continue;
    const site = { ...siteAt(...spot), tier: sites.length < 3 ? 1.24 : sites.length < 9 ? 1 : 0.74 }; // three great capitals (still below the tallest peaks), six large, the rest smaller
    taken.push(site); sites.push(site);
  }
  const fill = (limit, gap, ok) => {
    const out = [];
    for (const b of byPopulation) {
      if (out.length >= limit) break;
      if (b[3]) continue;
      const spot = settle(b, 3, (x, y) => ok(x, y) && taken.every(c => gapTo(c, x, y) >= gap));
      if (!spot) continue;
      const site = siteAt(...spot);
      taken.push(site); out.push(site);
    }
    return out;
  };
  const towns = fill(46, 14, (x, y) => h[y * TEX_W + x] < 0.34 && clearOfMaps(x, y));
  const villages = fill(80, 9, (x, y) => h[y * TEX_W + x] < 0.42 && clearOfMaps(x, y));
  /** The nearest texel of sea within a few texels of a shore texel, or null. */
  const seaBeside = (x, y) => {
    for (let r = 2; r <= 7; r++) for (let k = 0; k < 16; k++) {
      const sx = (x + Math.round(Math.cos(k / 8 * Math.PI) * r) + TEX_W) % TEX_W, sy = Math.min(TEX_H - 1, Math.max(0, y + Math.round(Math.sin(k / 8 * Math.PI) * r)));
      if (land[sy * TEX_W + sx] < SEA - 0.02) return [sx, sy];
    }
    return null;
  };
  const shoreNear = (cx, cy, reach) => { // the closest shore texel to a place, walking outward
    for (let r = 2; r <= reach; r += 2) for (let k = 0; k < 24; k++) {
      const x = (cx + Math.round(Math.cos(k / 12 * Math.PI) * r) + TEX_W) % TEX_W, y = cy + Math.round(Math.sin(k / 12 * Math.PI) * r);
      if (y < 1 || y >= TEX_H - 1) continue;
      const i = y * TEX_W + x;
      if (land[i] >= SEA + 0.004 && land[i] < SEA + 0.05 && h[i] < 0.4 && seaBeside(x, y)) return [x, y];
    }
    return null;
  };
  const onShore = ([x, y]) => { const [sx, sy] = seaBeside(x, y); return { ...siteAt(x, y), sea: surfaceDir(sx / TEX_W, latOf(sy)) }; };
  const ports = [];
  for (const city of sites) { // every coastal city has a harbour
    const spot = ports.length < 16 && shoreNear(city.x, city.y, 30);
    if (spot) { const p = onShore(spot); ports.push(p); taken.push(p); }
  }
  const lighthouses = [];
  for (let tries = 0; tries < 8000 && lighthouses.length < 2; tries++) { // two lights, on bare headlands far from each other
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.2 + random() * 0.6) * TEX_H), i = y * TEX_W + x;
    if (land[i] < SEA + 0.004 || land[i] > SEA + 0.04 || !seaBeside(x, y) || taken.some(c => gapTo(c, x, y) < 12) || lighthouses.some(c => gapTo(c, x, y) < 200)) continue;
    lighthouses.push(onShore([x, y]));
  }
  // Windmills on open windy ground, always within reach of a town.
  const mills = towns.filter((_, k) => k % 3 === 0).map(t => ({ u: t.u + 0.006, lat: t.lat + 1.1, biome: t.biome }));
  // Farmland round towns and villages in farming country, and suburbs round the bigger places.
  const patch = (c, r, write) => {
    const stretch = 1 / Math.max(0.3, Math.cos(c.lat * Math.PI / 180));
    for (let dy = -r; dy <= r; dy++) for (let dx = -Math.ceil(r * stretch); dx <= r * stretch; dx++) {
      const y = c.y + dy, x = (c.x + dx + TEX_W) % TEX_W, d = Math.hypot(dx / stretch, dy) / r;
      if (d < 1 && y >= 0 && y < TEX_H && land[y * TEX_W + x] >= SEA) write(y * TEX_W + x, 1 - d * d);
    }
  };
  for (const c of [...towns, ...villages]) if (['temperate', 'grassland', 'savanna', 'mediterranean'].includes(c.biome)) patch(c, towns.includes(c) ? 9 : 6, (i, f) => { landRgb[i * 4 + 3] = Math.max(landRgb[i * 4 + 3], smooth(0, 0.35, f) * 255); });
  for (const c of [...sites, ...ports, ...towns.filter((_, k) => k % 2)]) patch(c, sites.includes(c) ? Math.round(9 * c.tier) : 4, (i, f) => { field[i * 4 + 2] = Math.max(field[i * 4 + 2], f * 255); });
  // Plants and peaks follow the biome map, leaving farmland, suburbs and rivers clear.
  const plants = [];
  for (let tries = 0; tries < 320000 && plants.length < MAX_PLANTS; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.05 + random() * 0.9) * TEX_H), i = y * TEX_W + x;
    if (land[i] < SEA + 0.008 || field[i * 4 + 2] > 40 || landRgb[i * 4 + 3] > 90 || river[i]) continue;
    let roll = random();
    for (const [plant, chance] of FLORA[nameAt(i)] ?? []) {
      if (roll < chance) { plants.push({ u: (x + random()) / TEX_W, lat: latOf(y) + (random() - 0.5) * 0.35, kind: plant, shade: 1.12 - (LUSH[nameAt(i)] ?? 0.5) * 0.3 + (random() - 0.5) * 0.08 }); break; }
      roll -= chance;
    }
  }
  const peaks = []; // along the high ground, not touching, so ranges read as lines of separate summits
  for (let tries = 0; tries < 60000 && peaks.length < 240; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.06 + random() * 0.88) * TEX_H), i = y * TEX_W + x;
    if (land[i] < SEA + 0.03 || h[i] < 0.42 || peaks.some(p => gapTo(p, x, y) < 7)) continue;
    peaks.push({ x, y, u: x / TEX_W, lat: latOf(y), height: clamp((h[i] - 0.42) / 0.5), room: room(i) });
  }
  for (let tries = 0; tries < 6000 && seaSites.length < MAX_BOATS * 2; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.12 + random() * 0.76) * TEX_H), i = y * TEX_W + x, lat = latOf(y);
    if (land[i] > SEA - 0.1 || Math.abs(lat) > 58) continue;
    seaSites.push({ u: x / TEX_W, lat });
  }
  const flags = GAIA_REGIONS.flatMap(r => r.maps.map(m => ({ u: m.u, lat: m.lat, name: m.name, region: r.id })));
  const plain = list => list.map(({ u, lat, tint, sea, biome: b, culture, tier }) => ({ u, lat, tint, biome: b, culture, ...(tier ? { tier } : {}), ...(sea ? { sea } : {}) }));
  return { rgb, landRgb, field, land, biome, cloud: buildCloudMap(random), cities: plain(sites), towns: plain(towns), villages: plain(villages), ports: plain(ports), lighthouses: plain(lighthouses), mills, volcanoes, flags, peaks, plants, rivers, seaSites };
}

/**
 * Biomes that belong to each region's footprint: all of that ground connected to the region's sites, however far it runs, so the whole
 * mountain range, desert or marsh lights up (more maps will fill it). Null takes every bit of land on the sites' islands.
 */
const REGION_LAND = Object.freeze({ polar: ['alpine', 'polar'], temperate: ['temperate'], desert: ['desert', 'savanna'], tropical: null, wetland: ['wetland'], volcanic: null });

/**
 * Each region's actual terrain: all the land of its biomes connected to its maps (REGION_LAND), with smoothed edges. Returns { byId, at }:
 * `byId[id]` has { u, lat, spanU, spanLat, texture } (`texture` RGBA bytes, 128 at the footprint edge, for a clean outline), and
 * `at(u, lat)` names the region at a place, or null. Highlight and click both use these, so they cannot disagree.
 */
export function regionFootprints(planet) {
  const n = TEX_W * TEX_H, owner = new Uint8Array(n), byId = {}, names = GAIA_REGIONS.map(r => r.id);
  GAIA_REGIONS.forEach((r, k) => {
    const allowed = REGION_LAND[r.id]?.map(b => BIOMES.indexOf(b)), mask = new Float32Array(n), stack = [];
    const open = i => planet.land[i] >= SEA && (!allowed || allowed.includes(planet.biome[i]));
    for (const m of r.maps) {
      const c = Math.floor((0.5 - m.lat / 180) * TEX_H) * TEX_W + Math.floor(((m.u % 1) + 1) % 1 * TEX_W);
      for (let d = -3; d <= 3; d++) for (let e = -3; e <= 3; e++) { const i = c + d * TEX_W + e; if (planet.land[i] >= SEA && !mask[i]) { mask[i] = 1; stack.push(i); } }
    }
    while (stack.length) { const i = stack.pop(); for (const j of [i - 1, i + 1, i - TEX_W, i + TEX_W]) if (j >= 0 && j < n && !mask[j] && open(j)) { mask[j] = 1; stack.push(j); } }
    const soft = blur(blur(mask, 2), 2), texture = new Uint8Array(n * 4);
    let minLat = 90, maxLat = -90, minU = 1, maxU = 0, su = 0, sl = 0, count = 0;
    for (let i = 0; i < n; i++) {
      texture[i * 4] = planet.land[i] >= SEA ? soft[i] * 255 : soft[i] * 110; texture[i * 4 + 3] = 255;
      if (soft[i] < 0.5 || planet.land[i] < SEA || owner[i]) continue;
      owner[i] = k + 1;
      const u = (i % TEX_W) / TEX_W, lat = (0.5 - (Math.floor(i / TEX_W) + 0.5) / TEX_H) * 180;
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minU = Math.min(minU, u); maxU = Math.max(maxU, u); su += u; sl += lat; count++;
    }
    for (const m of r.maps) { minLat = Math.min(minLat, m.lat); maxLat = Math.max(maxLat, m.lat); minU = Math.min(minU, m.u); maxU = Math.max(maxU, m.u); }
    byId[r.id] = { u: (minU + maxU) / 2, lat: (minLat + maxLat) / 2, spanU: maxU - minU, spanLat: maxLat - minLat, texture, area: count };
  });
  return { byId, at(u, lat) { const k = owner[Math.min(TEX_H - 1, Math.max(0, Math.floor((0.5 - lat / 180) * TEX_H))) * TEX_W + Math.floor(((u % 1) + 1) % 1 * TEX_W)]; return k ? names[k - 1] : null; } };
}

let footprints = null;
/** The footprints of the one Gaia. */
export function gaiaRegions() { footprints ??= regionFootprints(gaiaPlanet()); return footprints; }

let gaia = null;
/** The one Gaia, built on first use and kept, so every load shows the same world and only the first pays for it. */
export function gaiaPlanet() { gaia ??= buildPlanet(mulberry32(GAIA_SEED)); return gaia; }

/** Cloud density (0..255 per texel): stretched along the equator, thicker near the equator and mid-latitude storm belts. */
function buildCloudMap(random) {
  const a = makeNoise(random, 9, 4), b = makeNoise(random, 22, 9), c = makeNoise(random, 48, 20);
  const out = new Uint8Array(TEX_W * TEX_H);
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H, lat = Math.abs(0.5 - v) * 180;
    const belt = 0.12 * Math.cos(lat / 90 * Math.PI * 2) + 0.06 * Math.cos((lat - 55) / 20 * Math.PI) * (lat > 35 && lat < 75 ? 1 : 0);
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W, raw = a(u, v) * 0.5 + b(u, v) * 0.32 + c(u, v) * 0.18, d = (raw - 0.5) * 1.8 + 0.5 + belt; // stretch the contrast so clouds form distinct banks
      out[y * TEX_W + x] = clamp(d * 255, 0, 255);
    }
  }
  return out;
}

/** Unit vector of a place on the sphere, laid out as THREE.SphereGeometry lays out its uv (north is +y). `lat` in degrees. */
export function surfaceDir(u, lat) {
  const l = lat * Math.PI / 180, a = u * Math.PI * 2;
  return [-Math.cos(a) * Math.cos(l), Math.sin(l), Math.sin(a) * Math.cos(l)];
}

/** Land value under a unit vector: the inverse of `surfaceDir`, nearest texel. */
export function landUnder(planet, [x, y, z]) {
  const u = ((Math.atan2(z, -x) / (Math.PI * 2)) + 1) % 1, lat = Math.asin(clamp(y, -1, 1)) * 180 / Math.PI;
  const row = Math.min(TEX_H - 1, Math.max(0, Math.floor((0.5 - lat / 180) * TEX_H))), col = Math.floor(u * TEX_W) % TEX_W;
  return planet.land[row * TEX_W + col];
}

const unit = v => { const l = Math.hypot(...v) || 1; return v.map(q => q / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Point at angle `theta` on the circle `rho` radians around unit vector `centre`. */
export function circlePoint(centre, rho, theta) {
  const e1 = unit(cross(centre, Math.abs(centre[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(centre, e1);
  return centre.map((q, k) => Math.cos(rho) * q + Math.sin(rho) * (Math.cos(theta) * e1[k] + Math.sin(theta) * e2[k]));
}

/**
 * Sea routes: closed circles that stay on open water all the way round, so a ship sails on for ever without reversing or touching land.
 * Each route is { centre, rho, speed } with `speed` in radians of the circle per second, either way round.
 */
export function shipRoutes(planet, random) {
  const routes = [];
  for (const site of planet.seaSites) {
    if (routes.length >= MAX_BOATS) break;
    const centre = surfaceDir(site.u, site.lat);
    const clear = rho => Array.from({ length: 32 }, (_, k) => circlePoint(centre, rho, k / 32 * Math.PI * 2)).every(p => landUnder(planet, p) < SEA - 0.05);
    let rho = 0;
    for (let r = 0.05; r <= 0.3 && clear(r); r += 0.025) rho = r;
    const dot = r => clamp(r.centre.reduce((q, v, k) => q + v * centre[k], 0), -1, 1);
    if (rho && routes.every(r => Math.acos(dot(r)) > r.rho + rho + 0.05)) routes.push({ centre, rho, speed: (0.012 + random() * 0.01) / rho * (random() < 0.5 ? -1 : 1) }); // no two routes touch
  }
  return routes;
}

/** Flight lanes, in degrees of latitude round one shared axis, spread out so the first few already sit far apart. */
const LANES = Object.freeze([-20, 16, 44, -38, 30, 2, 54, -28, 8, 24, 38, -10]);

/**
 * Flight routes: parallel circles round one shared `axis` (a unit vector), all flown the same way at the same speed. Parallel lanes never
 * cross, so nothing in the air can ever look as if it will hit anything else. Each is { centre, rho, speed }.
 */
export function laneRoutes(count, axis, speed) {
  return Array.from({ length: count }, (_, k) => ({ centre: unit(axis), rho: (90 - LANES[k % LANES.length]) * Math.PI / 180, speed }));
}
