/**
 * Gaia's data for the loading screen (VIS-M1): the climate maps, city sites and ship and flight routes that planet-scene.js renders.
 *
 * Original art, built procedurally. Invented continents give elevation; temperature falls with latitude and altitude; moisture follows
 * Earth's wind belts (wet equator, dry subtropics, wetter mid-latitudes), drops inland and rises near coasts. Colours blend across
 * that temperature/moisture plane (tundra, taiga, forest, grassland, savanna, desert, jungle), with snow, rock and ice.
 *
 * Plain data only: no Three.js, no DOM, randomness is injected. Latitude is in degrees unless a name says otherwise, `u` is a fraction
 * of a full turn. `surfaceDir` matches THREE.SphereGeometry's uv layout, so a site found here lands on the same texel in the shader.
 */

import { clamp, makeFbm, makeNoise, mix, mulberry32, smooth } from './noise.js';

export { mulberry32 };

export const TEX_W = 1024;
export const TEX_H = 512;
export const SEA = 0.4; // land value at the shoreline
export const MAX_PLANES = 12, MAX_BOATS = 20, MAX_SATELLITES = 8;

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
  [0.75, 34, 0.13, 26], [0.83, -26, 0.08, 20], [0.30, -62, 0.18, 10], [0.96, 8, 0.05, 14], [0.62, -34, 0.06, 14],
]);

/** Land value for a place: the strongest continent falloff plus `coast` roughness (0..1). */
function landAt(u, lat, coast) {
  let best = -1;
  for (const [cu, clat, ru, rlat] of CONTINENTS) {
    const du = Math.min(Math.abs(u - cu), 1 - Math.abs(u - cu)) / ru, dl = (lat - clat) / rlat;
    best = Math.max(best, 1 - Math.hypot(du, dl));
  }
  return 0.45 + best * 0.5 + (coast - 0.5) * 0.36;
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

/**
 * Builds Gaia once. Returns:
 * - `rgb`: the finished surface colours (3 bytes per texel, row 0 at the north pole).
 * - `landRgb`: RGBA land colours everywhere, even under the sea, so the shader can cut a sharp coast anywhere without a colour fringe.
 * - `field`: RGBA data: r the land value around the shore (0.5 at the coast, see `decodeLand`), g elevation, b city density.
 * - `land`: the land value per texel (below SEA is sea). `cloud`: 0..255 cloud density.
 * - `cities`, `towns`, `villages`: [{u, lat, tint}], `tint` the local ground colour. `ports`: the same on the shore, plus `sea`, a unit
 *   vector toward the water. `forests`: [{u, lat, tint}] for single trees. `seaSites`: [{u, lat}] on open sea.
 */
export function buildPlanet(random) {
  const n = TEX_W * TEX_H;
  const coast = makeFbm(random, 7, 3, 5), warpU = makeNoise(random, 6, 3), warpV = makeNoise(random, 7, 4);
  const range = makeFbm(random, 10, 5, 4), wetNoise = makeFbm(random, 5, 3, 4);
  const land = new Float32Array(n), h = new Float32Array(n), mask = new Float32Array(n);
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H, lat = (0.5 - v) * 180;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W, i = y * TEX_W + x;
      const wu = (u + (warpU(u, v) - 0.5) * 0.05 + 1) % 1, wl = lat + (warpV(u, v) - 0.5) * 12; // gentle warp: shapes stay readable
      land[i] = landAt(wu, wl, coast(u, v));
      mask[i] = land[i] >= SEA ? 1 : 0;
      const base = clamp((land[i] - SEA) / 0.35), ridge = 1 - Math.abs(range(u, v) * 2 - 1);
      h[i] = base * (0.25 + 0.75 * smooth(0.72, 0.98, ridge));
    }
  }
  const inland = blur(mask, 20);
  const rgb = new Uint8Array(n * 3), landRgb = new Uint8Array(n * 4), field = new Uint8Array(n * 4);
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H, lat = (0.5 - v) * 180;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W, i = y * TEX_W + x;
      const moist = moistureAt(lat, clamp((inland[i] - 0.2) / 0.8), wetNoise(u, v));
      const c = surfaceColour(lat, land[i], h[i], moist), g = landColour(lat, h[i], moist);
      for (let k = 0; k < 3; k++) { rgb[i * 3 + k] = clamp(c[k], 0, 255); landRgb[i * 4 + k] = clamp(g[k], 0, 255); }
      landRgb[i * 4 + 3] = 255;
      field[i * 4] = clamp(0.5 + (land[i] - SEA) * 2, 0, 1) * 255; field[i * 4 + 1] = clamp(h[i]) * 255; field[i * 4 + 3] = 255;
    }
  }
  // Settlements on gentle, warm-enough land, big ones first and spread out; ships on open sea away from the ice.
  const taken = [], seaSites = [];
  const place = (limit, gap, ok = () => true) => {
    const out = [];
    for (let tries = 0; tries < 5000 && out.length < limit; tries++) {
      const x = Math.floor(random() * TEX_W), y = Math.floor((0.14 + random() * 0.72) * TEX_H), i = y * TEX_W + x, lat = (0.5 - (y + 0.5) / TEX_H) * 180;
      if (h[i] > 0.35 || temperatureAt(lat, h[i]) < 0.28 || !ok(i, x, y)) continue;
      if (taken.some(c => Math.hypot(Math.min(Math.abs(c.x - x), TEX_W - Math.abs(c.x - x)) * Math.cos(lat * Math.PI / 180), c.y - y) < gap)) continue;
      const site = { x, y, u: x / TEX_W, lat, tint: [landRgb[i * 4], landRgb[i * 4 + 1], landRgb[i * 4 + 2]] };
      taken.push(site); out.push(site);
    }
    return out;
  };
  const inlandEnough = i => land[i] >= SEA + 0.06;
  /** The nearest texel of sea within a few texels of a shore texel, or null. */
  const seaBeside = (x, y) => {
    for (let r = 2; r <= 7; r++) for (let k = 0; k < 16; k++) {
      const sx = (x + Math.round(Math.cos(k / 8 * Math.PI) * r) + TEX_W) % TEX_W, sy = Math.min(TEX_H - 1, Math.max(0, y + Math.round(Math.sin(k / 8 * Math.PI) * r)));
      if (land[sy * TEX_W + sx] < SEA - 0.02) return [sx, sy];
    }
    return null;
  };
  const sites = place(22, 42, inlandEnough);
  const ports = place(16, 22, (i, x, y) => land[i] >= SEA + 0.005 && land[i] < SEA + 0.05 && !!seaBeside(x, y)).map(p => {
    const [sx, sy] = seaBeside(p.x, p.y);
    return { ...p, sea: surfaceDir(sx / TEX_W, (0.5 - (sy + 0.5) / TEX_H) * 180) };
  });
  const towns = place(46, 20, inlandEnough), villages = place(80, 12, inlandEnough);
  const forests = [];
  for (let tries = 0; tries < 30000 && forests.length < 900; tries++) { // trees where the land is green
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.08 + random() * 0.84) * TEX_H), i = y * TEX_W + x, r = landRgb[i * 4], g = landRgb[i * 4 + 1], b = landRgb[i * 4 + 2];
    if (land[i] < SEA + 0.02 || h[i] > 0.5 || g < r + 22 || g < b + 30) continue;
    forests.push({ u: x / TEX_W, lat: (0.5 - (y + 0.5) / TEX_H) * 180, tint: [r * 0.72, g * 0.82, b * 0.66] });
  }
  for (const c of [...sites, ...ports, ...towns.filter((_, k) => k % 2)]) { // suburbs: a soft patch around each place, tinted by the shader and lit at night
    const r = sites.includes(c) ? 11 : 5, stretch = 1 / Math.max(0.3, Math.cos(c.lat * Math.PI / 180));
    for (let dy = -r; dy <= r; dy++) for (let dx = -Math.ceil(r * stretch); dx <= r * stretch; dx++) {
      const y = c.y + dy, x = (c.x + dx + TEX_W) % TEX_W, d = Math.hypot(dx / stretch, dy) / r;
      if (d >= 1 || y < 0 || y >= TEX_H) continue;
      const o = (y * TEX_W + x) * 4 + 2;
      field[o] = Math.max(field[o], (1 - d * d) * 255 * (land[y * TEX_W + x] >= SEA ? 1 : 0));
    }
  }
  for (let tries = 0; tries < 6000 && seaSites.length < MAX_BOATS * 2; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.12 + random() * 0.76) * TEX_H), i = y * TEX_W + x, lat = (0.5 - (y + 0.5) / TEX_H) * 180;
    if (land[i] > SEA - 0.1 || temperatureAt(lat, 0) < 0.4) continue;
    seaSites.push({ u: x / TEX_W, lat });
  }
  const plain = list => list.map(({ u, lat, tint, sea }) => ({ u, lat, tint, ...(sea ? { sea } : {}) }));
  return { rgb, landRgb, field, land, cloud: buildCloudMap(random), cities: plain(sites), towns: plain(towns), villages: plain(villages), ports: plain(ports), forests, seaSites };
}

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
    if (rho) routes.push({ centre, rho, speed: (0.012 + random() * 0.01) / rho * (random() < 0.5 ? -1 : 1) });
  }
  return routes;
}

/**
 * Flight routes: great circles through a spot near `toward` (a unit vector, the side of the planet the camera sees), so planes keep
 * crossing the view and pass over the horizon. Each is { centre, rho: PI / 2, speed }, `centre` the pole of the circle.
 */
export function flightRoutes(count, random, toward) {
  return Array.from({ length: count }, () => {
    const spot = unit(toward.map(q => q + (random() - 0.5) * 1.4)), heading = unit([random() - 0.5, random() - 0.5, random() - 0.5]);
    return { centre: unit(cross(spot, heading)), rho: Math.PI / 2, speed: (0.09 + random() * 0.06) * (random() < 0.5 ? -1 : 1) };
  });
}
