/**
 * Gaia's data for the loading screen (VIS-M1): the climate maps, city sites and ship and flight routes that planet-scene.js renders.
 *
 * Original art, built procedurally around the regions of src/shared/gaia-map.js, which set where each special biome lies. Invented continents give elevation; temperature falls with latitude and altitude; moisture follows
 * Earth's wind belts (wet equator, dry subtropics, wetter mid-latitudes), drops inland and rises near coasts. Colours blend across
 * that temperature/moisture plane (tundra, taiga, forest, grassland, savanna, desert, jungle), with snow, rock, ice, marsh and basalt.
 * Rivers run downhill to the sea. People live where it makes sense: cities near coasts in kind climates, each with its harbour, farms round
 * towns, huts built for the local climate. Plants follow the biome map.
 *
 * Plain data only: no Three.js, no DOM, randomness is injected. Latitude is in degrees unless a name says otherwise, `u` is a fraction
 * of a full turn. `surfaceDir` matches THREE.SphereGeometry's uv layout, so a site found here lands on the same texel in the shader.
 */

import { GAIA_REGIONS, regionWeight } from '../shared/gaia-map.js';
import { clamp, makeFbm, makeNoise, mix, mulberry32, smooth } from './noise.js';

export { mulberry32 };

export const TEX_W = 1024;
export const TEX_H = 512;
export const SEA = 0.4; // land value at the shoreline
export const MAX_PLANES = 12, MAX_BOATS = 20, MAX_SATELLITES = 8, MAX_PLANTS = 16000;
/** Gaia is one fixed place: the same seed every time, so the globe matches the map (src/shared/gaia-map.js). */
export const GAIA_SEED = 0x9a1a;

/** Palette (r, g, b), lifelike and saturated. Rows run cold to hot, columns dry to wet. */
const CLIMATE = Object.freeze([
  [0.15, [[176, 170, 150], [116, 158, 118], [62, 128, 96]]],
  [0.40, [[186, 186, 96], [98, 186, 84], [40, 150, 78]]],
  [0.65, [[236, 186, 96], [128, 200, 72], [44, 172, 72]]],
  [0.95, [[246, 186, 88], [206, 196, 66], [16, 156, 62]]],
]);
const SNOW = [248, 252, 255], ROCK = [150, 122, 104], SAND = [250, 226, 158], SHALLOW = [64, 224, 216], SEA_BLUE = [24, 128, 232], DEEP = [14, 72, 176];

const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Land colour for temperature `t` and moisture `m` (both 0..1): bilinear across the CLIMATE table, so biomes blend smoothly. */
export function climateColour(t, m) {
  let lo = CLIMATE[0], hi = CLIMATE[CLIMATE.length - 1];
  for (let i = 0; i < CLIMATE.length - 1; i++) if (t <= CLIMATE[i + 1][0]) { lo = CLIMATE[i]; hi = CLIMATE[i + 1]; break; }
  const f = lo === hi ? 0 : clamp((t - lo[0]) / (hi[0] - lo[0])), x = clamp(m) * 2, j = Math.min(1, Math.floor(x)), g = x - j;
  const row = r => lerp3(r[1][j], r[1][j + 1], g);
  return lerp3(row(lo), row(hi), f);
}

/** Temperature (0..1) from latitude in degrees (either sign) and elevation `h` (0..1): warm equator, cold poles, cooler mountains. */
export const temperatureAt = (lat, h) => clamp(Math.cos(lat * Math.PI / 180) ** 1.15 - 0.45 * h);

/** Moisture (0..1) from latitude (Earth's wind belts), `inland` (0 at a coast, 1 deep in a continent) and a noise term in 0..1. */
export function moistureAt(lat, inland, noise) {
  const a = Math.abs(lat);
  return clamp(0.82 - 0.36 * inland + 0.35 * Math.exp(-((a / 14) ** 2)) - 0.42 * Math.exp(-(((a - 27) / 10) ** 2)) + 0.16 * Math.exp(-(((a - 58) / 14) ** 2)) + (noise - 0.5) * 0.5);
}

/** Colour of land at `lat` with elevation `h` and moisture `moist`, ignoring the shoreline: blended biomes, rock and snow on high ground. */
function landColour(lat, h, moist) {
  const t = temperatureAt(lat, h);
  let c = climateColour(t, moist);
  c = lerp3(c, ROCK, smooth(0.5, 0.85, h) * 0.8);
  return lerp3(c, SNOW, Math.max(smooth(0.2, 0.08, t), smooth(0.8, 0.95, h)));
}

/**
 * Surface colour of a place. `lat` degrees, `land` 0..1 (below 0.4 is sea), `h` elevation 0..1 above the shore, `moist` 0..1.
 * Returns [r, g, b]: sea shading from shallow to deep with ice near the poles, a beach on warm coasts, then land.
 */
export function surfaceColour(lat, land, h, moist) {
  const t = temperatureAt(lat, h);
  if (land < SEA) {
    const depth = SEA - land;
    const water = lerp3(lerp3(SHALLOW, SEA_BLUE, smooth(0, 0.07, depth)), DEEP, smooth(0.06, 0.24, depth));
    return lerp3(water, SNOW, smooth(0.3, 0.14, t)); // sea ice
  }
  return lerp3(landColour(lat, h, moist), SAND, smooth(SEA + 0.03, SEA + 0.012, land) * smooth(0.25, 0.4, t) * 0.9);
}

/** Invented continents: [centre u (0..1 of a full turn), centre latitude, half-width u, half-height degrees]. */
const CONTINENTS = Object.freeze([
  [0.10, 46, 0.12, 26], [0.16, -20, 0.06, 30], [0.44, 38, 0.15, 24], [0.50, 4, 0.07, 30],
  [0.75, 38, 0.13, 30], [0.83, -26, 0.08, 20], [0.30, -62, 0.18, 10], [0.96, 8, 0.055, 17], [0.62, -34, 0.06, 14],
]);
const MAP_SITES = GAIA_REGIONS.flatMap(r => r.maps), REGION = Object.fromEntries(GAIA_REGIONS.map(r => [r.id, r]));

/** Land value for a place: the strongest continent falloff plus `coast` roughness (0..1). */
function landAt(u, lat, coast) {
  let best = -1;
  for (const [cu, clat, ru, rlat] of CONTINENTS) {
    const du = Math.min(Math.abs(u - cu), 1 - Math.abs(u - cu)) / ru, dl = (lat - clat) / rlat;
    best = Math.max(best, 1 - Math.hypot(du, dl));
  }
  for (const m of MAP_SITES) { // every map stands on firm ground
    if (Math.abs(lat - m.lat) > 6) continue;
    const du = Math.min(Math.abs(u - m.u), 1 - Math.abs(u - m.u)) * 360 * Math.cos(lat * Math.PI / 180);
    best = Math.max(best, 0.64 * (1 - Math.hypot(du, lat - m.lat) / 6));
  }
  return 0.45 + best * 0.5 + (coast - 0.5) * 0.3;
}

/** Wrapping box blur of a TEX_W by TEX_H field (two separable passes), used to measure how inland each place is. */
function blur(field, radius) {
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
export const BIOMES = Object.freeze(['polar', 'alpine', 'tundra', 'boreal', 'temperate', 'grassland', 'savanna', 'desert', 'tropical', 'wetland', 'volcanic']);

/** The biome of a place. `wet` and `hot` are 0..1 masks for wetland and volcanic ground; the other inputs are as in `surfaceColour`. */
export function biomeAt(lat, h, moist, wet = 0, hot = 0) {
  const t = temperatureAt(lat, h);
  if (hot > 0.5) return 'volcanic';
  if (t < 0.14) return 'polar';
  if (h > 0.62) return 'alpine';
  if (t < 0.27) return 'tundra';
  if (t < 0.43) return 'boreal';
  if (wet > 0.5) return 'wetland';
  if (t > 0.74) return moist > 0.6 ? 'tropical' : moist > 0.4 ? 'savanna' : 'desert';
  if (moist < 0.3) return t > 0.6 ? 'desert' : 'grassland';
  return moist > 0.48 ? 'temperate' : 'grassland';
}

/** What grows in each biome: [kind, chance], the chance of a sampled spot getting that plant. Kinds are drawn by makePlant in sky-models.js. */
const FLORA = Object.freeze({
  tundra: [['shrub', 0.2]],
  boreal: [['pine', 0.75], ['snowpine', 0.25]],
  temperate: [['broadleaf', 0.5], ['birch', 0.16], ['pine', 0.12], ['autumn', 0.1], ['blossom', 0.06]],
  grassland: [['broadleaf', 0.1], ['shrub', 0.16]],
  savanna: [['acacia', 0.2], ['shrub', 0.12]],
  desert: [['cactus', 0.05], ['shrub', 0.03]],
  tropical: [['jungle', 0.6], ['palm', 0.34]],
  wetland: [['mangrove', 0.6], ['reeds', 0.3]],
  volcanic: [['deadtree', 0.1]],
});

/**
 * Builds Gaia once. Returns:
 * - `rgb`: the finished surface colours (3 bytes per texel, row 0 at the north pole).
 * - `landRgb`: RGBA land colours everywhere, even under the sea, so the shader can cut a sharp coast anywhere without a colour fringe,
 *   with rivers painted in; alpha is farmland around settlements.
 * - `field`: RGBA data: r the land value around the shore (0.5 at the coast), g elevation, b city density, a volcanic ground.
 * - `land`: the land value per texel (below SEA is sea). `biome`: index into BIOMES per texel. `cloud`: 0..255 cloud density.
 * - `cities`, `towns`, `villages`: [{u, lat, tint, biome}], `tint` the local ground colour. `ports`, `lighthouses`: the same on the shore,
 *   plus `sea`, a unit vector toward the water. `mills`: [{u, lat, biome}] on windy open ground. `volcanoes`, `peaks`: [{u, lat}].
 *   `plants`: [{u, lat, kind}]. `seaSites`: [{u, lat}] on open sea.
 */
export function buildPlanet(random) {
  const n = TEX_W * TEX_H;
  const coast = makeFbm(random, 6, 3, 4), warpU = makeNoise(random, 6, 3), warpV = makeNoise(random, 7, 4);
  const range = makeFbm(random, 10, 5, 4), wetNoise = makeFbm(random, 5, 3, 4), marsh = makeFbm(random, 9, 5, 3);
  const land = new Float32Array(n), h = new Float32Array(n), mask = new Float32Array(n);
  const latOf = y => (0.5 - (y + 0.5) / TEX_H) * 180;
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H, lat = latOf(y);
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W, i = y * TEX_W + x;
      const wu = (u + (warpU(u, v) - 0.5) * 0.05 + 1) % 1, wl = lat + (warpV(u, v) - 0.5) * 12; // gentle warp: shapes stay readable
      land[i] = landAt(wu, wl, coast(u, v));
      mask[i] = land[i] >= SEA ? 1 : 0;
      const base = clamp((land[i] - SEA) / 0.35), ridge = 1 - Math.abs(range(u, v) * 2 - 1);
      h[i] = base * (0.25 + 0.75 * smooth(0.72, 0.98, ridge));
      const polar = regionWeight(REGION.polar, u, lat), low = Math.max(regionWeight(REGION.wetland, u, lat), regionWeight(REGION.temperate, u, lat) * 0.85, regionWeight(REGION.desert, u, lat) * 0.8, regionWeight(REGION.tropical, u, lat), regionWeight(REGION.volcanic, u, lat));
      h[i] = mix(mix(h[i], 0.12, low), 0.55 + 0.4 * ridge, polar * 0.9); // the Frostreach is high; the lowlands stay low
    }
  }
  const inland = blur(mask, 20);
  // Volcanic ground: a patch of dark basalt round each map of the Emberfall Isles, with a volcano on it.
  const hot = new Float32Array(n), volcanoes = [];
  for (const m of REGION.volcanic.maps) {
    const x = Math.floor(((m.u % 1) + 1) % 1 * TEX_W), y = Math.floor((0.5 - m.lat / 180) * TEX_H);
    volcanoes.push({ x, y, u: m.u + 0.016, lat: m.lat + 2.4 });
    const r = 15, stretch = 1 / Math.max(0.3, Math.cos(latOf(y) * Math.PI / 180));
    for (let dy = -r; dy <= r; dy++) for (let dx = -Math.ceil(r * stretch); dx <= r * stretch; dx++) {
      const yy = y + dy, xx = (x + dx + TEX_W) % TEX_W, d = Math.hypot(dx / stretch, dy) / r;
      if (d < 1 && yy >= 0 && yy < TEX_H && land[yy * TEX_W + xx] >= SEA) hot[yy * TEX_W + xx] = Math.max(hot[yy * TEX_W + xx], smooth(1, 0.55, d));
    }
  }
  const rgb = new Uint8Array(n * 3), landRgb = new Uint8Array(n * 4), field = new Uint8Array(n * 4), biome = new Uint8Array(n);
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H, lat = latOf(y);
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W, i = y * TEX_W + x;
      const weight = id => regionWeight(REGION[id], u, lat), cold = weight('polar');
      let moist = clamp(moistureAt(lat, clamp((inland[i] - 0.2) / 0.8), wetNoise(u, v)) + 0.2); // a green planet: deserts stay the exception
      moist = mix(mix(mix(moist, 0.62, weight('temperate')), 0.86, weight('tropical')), 0.1, weight('desert'));
      const wetland = weight('wetland'), wet = Math.max(smooth(0.54, 0.62, marsh(u, v)) * smooth(0.62, 0.4, inland[i]) * smooth(0.3, 0.12, h[i]), wetland > 0.35 ? 1 : 0);
      const feel = mix(lat, 80, cold * 0.86); // the climate this place behaves as
      const c = surfaceColour(feel, land[i], h[i], moist);
      let g = landColour(feel, h[i], moist);
      g = lerp3(g, [66, 136, 104], Math.max(wetland, wet * 0.8) * 0.8); // marsh: dark, blue-green
      g = lerp3(g, [58, 48, 56], hot[i] * 0.92); // basalt
      biome[i] = BIOMES.indexOf(biomeAt(feel, h[i], moist, wet, hot[i]));
      for (let k = 0; k < 3; k++) { rgb[i * 3 + k] = clamp(land[i] >= SEA ? mix(c[k], g[k], 0.8) : c[k], 0, 255); landRgb[i * 4 + k] = clamp(g[k], 0, 255); }
      field[i * 4] = clamp(0.5 + (land[i] - SEA) * 2, 0, 1) * 255; field[i * 4 + 1] = clamp(h[i]) * 255; field[i * 4 + 3] = hot[i] * 255;
    }
  }
  const nameAt = i => BIOMES[biome[i]];
  // Rivers: from the high ground, downhill to the sea, painted into the land colours. Ones that find no way out end in a lake.
  const paint = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = (x + dx + TEX_W) % TEX_W;
      if (yy < 0 || yy >= TEX_H || Math.hypot(dx, dy) > r + 0.2) continue;
      const o = (yy * TEX_W + xx) * 4;
      landRgb[o] = 52; landRgb[o + 1] = 150; landRgb[o + 2] = 226;
    }
  };
  for (let k = 0, tries = 0; k < 34 && tries < 4000; tries++) {
    let x = Math.floor(random() * TEX_W), y = Math.floor((0.12 + random() * 0.76) * TEX_H);
    if (h[y * TEX_W + x] < 0.3 || temperatureAt(latOf(y), 0) < 0.3) continue;
    k++;
    const seen = new Set();
    for (let s = 0; s < 260; s++) {
      const i = y * TEX_W + x;
      if (land[i] < SEA) break;
      seen.add(i);
      paint(x, y, s > 90 ? 1 : 0);
      let best = null, bestV = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = Math.min(TEX_H - 1, Math.max(0, y + dy)), xx = (x + dx + TEX_W) % TEX_W, j = yy * TEX_W + xx;
        if (seen.has(j)) continue;
        const value = land[j] + random() * 0.012;
        if (value < bestV) { bestV = value; best = [xx, yy]; }
      }
      if (!best) { paint(x, y, 3); break; }
      [x, y] = best;
    }
  }
  // Settlements. Big places sit near the coast in kind climates; towns round them; villages anywhere people can live.
  const taken = [], seaSites = [];
  const siteAt = (x, y) => { const i = y * TEX_W + x; return { x, y, u: x / TEX_W, lat: latOf(y), tint: [landRgb[i * 4], landRgb[i * 4 + 1], landRgb[i * 4 + 2]], biome: nameAt(i) }; };
  const gapTo = (a, x, y) => Math.hypot(Math.min(Math.abs(a.x - x), TEX_W - Math.abs(a.x - x)) * Math.cos(latOf(y) * Math.PI / 180), a.y - y);
  const place = (limit, gap, ok) => {
    const out = [];
    for (let tries = 0; tries < 12000 && out.length < limit; tries++) {
      const x = Math.floor(random() * TEX_W), y = Math.floor((0.12 + random() * 0.76) * TEX_H), i = y * TEX_W + x;
      if (land[i] < SEA + 0.03 || !ok(i, x, y) || taken.some(c => gapTo(c, x, y) < gap)) continue;
      const site = siteAt(x, y);
      taken.push(site); out.push(site);
    }
    return out;
  };
  const kind = (...names) => i => names.includes(nameAt(i));
  const liveable = kind('temperate', 'grassland', 'tropical', 'savanna', 'boreal');
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
  const clearOfMaps = (x, y) => MAP_SITES.every(m => gapTo({ x: m.u * TEX_W, y: (0.5 - m.lat / 180) * TEX_H }, x, y) > 9);
  const sites = place(22, 42, (i, x, y) => inland[i] < 0.85 && h[i] < 0.3 && liveable(i) && clearOfMaps(x, y));
  const ports = [];
  for (const city of sites) { // every coastal city has a harbour
    const spot = ports.length < 16 && shoreNear(city.x, city.y, 44);
    if (spot) { const p = onShore(spot); ports.push(p); taken.push(p); }
  }
  const towns = place(46, 20, (i, x, y) => h[i] < 0.34 && liveable(i) && clearOfMaps(x, y));
  const villages = place(80, 12, (i, x, y) => h[i] < 0.42 && clearOfMaps(x, y) && (liveable(i) || kind('wetland', 'tundra')(i) || (nameAt(i) === 'desert' && random() < 0.2)));
  const lighthouses = [];
  for (let tries = 0; tries < 8000 && lighthouses.length < 2; tries++) { // two lights, on bare headlands far from each other
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.2 + random() * 0.6) * TEX_H), i = y * TEX_W + x;
    if (land[i] < SEA + 0.004 || land[i] > SEA + 0.04 || !seaBeside(x, y) || taken.some(c => gapTo(c, x, y) < 12) || lighthouses.some(c => gapTo(c, x, y) < 200)) continue;
    lighthouses.push(onShore([x, y]));
  }
  // Windmills on open windy ground: plains and marsh edges, always within reach of a town.
  const mills = towns.filter((_, k) => k % 3 === 0).map(t => ({ u: t.u + 0.006, lat: t.lat + 1.1, biome: t.biome }));
  // Farmland round towns and villages in farming country, and suburbs round the bigger places.
  const patch = (c, r, write) => {
    const stretch = 1 / Math.max(0.3, Math.cos(c.lat * Math.PI / 180));
    for (let dy = -r; dy <= r; dy++) for (let dx = -Math.ceil(r * stretch); dx <= r * stretch; dx++) {
      const y = c.y + dy, x = (c.x + dx + TEX_W) % TEX_W, d = Math.hypot(dx / stretch, dy) / r;
      if (d < 1 && y >= 0 && y < TEX_H && land[y * TEX_W + x] >= SEA) write(y * TEX_W + x, 1 - d * d);
    }
  };
  for (const c of [...towns, ...villages]) if (['temperate', 'grassland', 'savanna'].includes(c.biome)) patch(c, towns.includes(c) ? 11 : 7, (i, f) => { landRgb[i * 4 + 3] = Math.max(landRgb[i * 4 + 3], smooth(0, 0.35, f) * 255); });
  for (const c of [...sites, ...ports, ...towns.filter((_, k) => k % 2)]) patch(c, sites.includes(c) ? 11 : 5, (i, f) => { field[i * 4 + 2] = Math.max(field[i * 4 + 2], f * 255); });
  // Plants and peaks follow the biome map, thinning out near towns and leaving farmland and suburbs clear.
  const plants = [];
  for (let tries = 0; tries < 260000 && plants.length < MAX_PLANTS; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.05 + random() * 0.9) * TEX_H), i = y * TEX_W + x;
    if (land[i] < SEA + 0.008 || field[i * 4 + 2] > 40 || landRgb[i * 4 + 3] > 90 || landRgb[i * 4] === 52) continue;
    let roll = random();
    for (const [plant, chance] of FLORA[nameAt(i)] ?? []) {
      if (roll < chance) { plants.push({ u: (x + random()) / TEX_W, lat: latOf(y) + (random() - 0.5) * 0.35, kind: plant }); break; }
      roll -= chance;
    }
  }
  const peaks = []; // along the high ground, not touching, so ranges read as lines of separate summits
  for (let tries = 0; tries < 60000 && peaks.length < 240; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.06 + random() * 0.88) * TEX_H), i = y * TEX_W + x;
    if (land[i] < SEA + 0.03 || h[i] < 0.56 || peaks.some(p => gapTo(p, x, y) < 8)) continue;
    peaks.push({ x, y, u: x / TEX_W, lat: latOf(y), height: clamp((h[i] - 0.56) / 0.4) });
  }
  for (let tries = 0; tries < 6000 && seaSites.length < MAX_BOATS * 2; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.12 + random() * 0.76) * TEX_H), i = y * TEX_W + x, lat = latOf(y);
    if (land[i] > SEA - 0.1 || temperatureAt(lat, 0) < 0.4) continue;
    seaSites.push({ u: x / TEX_W, lat });
  }
  const flags = GAIA_REGIONS.flatMap(r => r.maps.map(m => ({ u: m.u, lat: m.lat, name: m.name, region: r.id })));
  const plain = list => list.map(({ u, lat, tint, sea, biome: b }) => ({ u, lat, tint, biome: b, ...(sea ? { sea } : {}) }));
  return { rgb, landRgb, field, land, biome, cloud: buildCloudMap(random), cities: plain(sites), towns: plain(towns), villages: plain(villages), ports: plain(ports), lighthouses: plain(lighthouses), mills, volcanoes: volcanoes.map(({ u, lat }) => ({ u, lat })), flags, peaks, plants, seaSites };
}

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
