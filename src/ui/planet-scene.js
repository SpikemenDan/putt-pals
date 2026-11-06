/**
 * Planet backdrop for the loading screen (VIS-M1): a curved Gaia horizon with clouds, cities, boats, planes and satellites, and
 * Ares and Luna in the distance.
 *
 * Original art, drawn procedurally. Gaia is built from climate fields, not hand-painted stripes: invented continents give
 * elevation; temperature falls with latitude and altitude; moisture follows Earth's wind belts (wet equator, dry subtropics, wetter
 * mid-latitudes), drops inland and rises near coasts. Colours blend smoothly across that temperature/moisture plane (tundra, taiga,
 * forest, grassland, savanna, desert, jungle), with snow, rock and ice. Coasts are the opposite of soft: a hard, ink-black shoreline,
 * a flat shallow-water band and a stepped, slightly jagged edge give the comic-book look. Cities are 3D skylines standing on the sphere (see sky-models.js). The finished texture is sampled into a small canvas every frame while the planet turns, with cel-shaded light and
 * a separate cloud layer; planes (flying great circles between cities, with contrails), boats on the sea and satellites in orbit are
 * drawn as small outlined sprites on a second canvas.
 *
 * This module is presentation only: it imports no simulation, Three.js or React code, takes its randomness and clock as inputs, and
 * reads the live `display.loading` settings (src/shared/display.js) each frame so the developer panel shows changes at once. With
 * `reducedMotion` it draws one still frame: nothing turns, flies or sails.
 */

import { clamp, makeFbm, makeNoise, mix, mulberry32, smooth } from './noise.js';
import { createWorld } from './worlds.js';
import { BOAT, CITY_STYLES, PLANE, makeCloudSprite, makeSkyline, paintFaces, placeModel, skylineFaces } from './sky-models.js';

export { mulberry32 };

export const TEX_W = 1024;
export const TEX_H = 512;
const SEA = 0.4; // land value at the shoreline
export const MAX_PLANES = 12, MAX_BOATS = 20, MAX_SATELLITES = 8;

/** Palette (r, g, b), storybook-bright. Rows run cold to hot, columns dry to wet. */
const CLIMATE = Object.freeze([
  [0.15, [[168, 182, 168], [112, 150, 124], [64, 118, 92]]],
  [0.40, [[168, 184, 108], [96, 170, 90], [54, 138, 84]]],
  [0.65, [[222, 196, 116], [112, 190, 86], [58, 164, 84]]],
  [0.95, [[240, 204, 104], [196, 190, 78], [22, 146, 68]]],
]);
const SNOW = [248, 252, 255], ROCK = [140, 132, 128], SAND = [244, 224, 162], SHALLOW = [86, 214, 226], SEA_BLUE = [40, 122, 224], DEEP = [24, 84, 182], INK = [20, 16, 42];
const CITY = [236, 228, 214];

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

/**
 * Surface colour of a place. `lat` degrees, `land` 0..1 (below 0.4 is sea), `h` elevation 0..1 above the shore, `moist` 0..1.
 * Returns [r, g, b]: sea in three flat bands of blue (shallow, open, deep) with ice near the poles, a hard-edged beach, blended
 * biomes, rock and snow on high ground.
 */
export function surfaceColour(lat, land, h, moist) {
  const t = temperatureAt(lat, h);
  if (land < SEA) {
    const depth = SEA - land;
    const water = lerp3(lerp3(SHALLOW, SEA_BLUE, smooth(0.05, 0.058, depth)), DEEP, smooth(0.2, 0.208, depth)); // flat cel bands
    return lerp3(water, SNOW, smooth(0.3, 0.14, t)); // sea ice
  }
  let c = climateColour(t, moist);
  c = lerp3(c, ROCK, smooth(0.5, 0.85, h) * 0.8);
  c = lerp3(c, SNOW, Math.max(smooth(0.2, 0.08, t), smooth(0.8, 0.95, h)));
  return lerp3(c, SAND, smooth(SEA + 0.03, SEA + 0.024, land) * smooth(0.25, 0.4, t) * 0.9); // beaches on warm coasts, with a crisp inner edge
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
 * Builds Gaia once. Returns { rgb, land, cloud, cities, seaSites }: an RGB texture (3 bytes per texel, row 0 at the north pole), the
 * land value per texel (below 0.4 is sea), a 0..255 cloud density texture, city sites [{u, lat}] (u 0..1 of a turn, lat degrees)
 * and open-sea sites for boats in the same form.
 */
export function buildPlanet(random) {
  const n = TEX_W * TEX_H;
  const coast = makeFbm(random, 7, 3, 3), jag = makeNoise(random, 120, 60), warpU = makeNoise(random, 6, 3), warpV = makeNoise(random, 7, 4);
  const range = makeFbm(random, 10, 5, 3), wetNoise = makeFbm(random, 5, 3, 4), grain = makeNoise(random, 200, 100);
  const land = new Float32Array(n), h = new Float32Array(n), mask = new Float32Array(n);
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H, lat = (0.5 - v) * 180;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W, i = y * TEX_W + x;
      const wu = (u + (warpU(u, v) - 0.5) * 0.05 + 1) % 1, wl = lat + (warpV(u, v) - 0.5) * 12; // gentle warp: shapes stay readable
      const stepped = Math.floor(jag(u, v) * 4) / 4; // quantised noise: a hard, slightly jagged, rugged edge
      land[i] = landAt(wu, wl, coast(u, v)) + (stepped - 0.4) * 0.05;
      mask[i] = land[i] >= SEA ? 1 : 0;
      const base = clamp((land[i] - SEA) / 0.35), ridge = 1 - Math.abs(range(u, v) * 2 - 1);
      h[i] = base * (0.25 + 0.75 * smooth(0.72, 0.98, ridge));
    }
  }
  const inland = blur(mask, 20);
  const rgb = new Uint8Array(n * 3);
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H, lat = (0.5 - v) * 180;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W, i = y * TEX_W + x;
      const moist = moistureAt(lat, clamp((inland[i] - 0.2) / 0.8), wetNoise(u, v));
      let c = surfaceColour(lat, land[i], h[i], moist);
      if (land[i] >= SEA) { // hill shading from the north-west, strongest on mountains
        const nw = h[Math.max(0, y - 1) * TEX_W + ((x - 1 + TEX_W) % TEX_W)], se = h[Math.min(TEX_H - 1, y + 1) * TEX_W + ((x + 1) % TEX_W)];
        const k = 1 + clamp((nw - se) * 5, -0.3, 0.3);
        c = c.map(q => q * k);
      }
      const edge = 1 - smooth(0.006, 0.012, Math.abs(land[i] - SEA)); // 1 on the shoreline: a hard ink coast line
      const g = 0.97 + (grain(u, v) - 0.5) * 0.06;
      rgb[i * 3] = clamp(mix(c[0] * g, INK[0], edge * 0.94), 0, 255); rgb[i * 3 + 1] = clamp(mix(c[1] * g, INK[1], edge * 0.94), 0, 255); rgb[i * 3 + 2] = clamp(mix(c[2] * g, INK[2], edge * 0.94), 0, 255);
    }
  }
  // Cities on gentle, warm-enough land, spread out; boats on open sea away from the ice.
  const cities = [], seaSites = [];
  for (let tries = 0; tries < 4000 && cities.length < 44; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.14 + random() * 0.72) * TEX_H), i = y * TEX_W + x, lat = (0.5 - (y + 0.5) / TEX_H) * 180;
    if (land[i] < SEA + 0.06 || h[i] > 0.35 || temperatureAt(lat, h[i]) < 0.28) continue;
    if (cities.some(c => Math.hypot((c.x - x) * Math.cos(lat * Math.PI / 180), c.y - y) < 34)) continue;
    cities.push({ x, y, u: x / TEX_W, lat });
  }
  for (let tries = 0; tries < 4000 && seaSites.length < MAX_BOATS; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.12 + random() * 0.76) * TEX_H), i = y * TEX_W + x, lat = (0.5 - (y + 0.5) / TEX_H) * 180;
    if (land[i] > SEA - 0.1 || temperatureAt(lat, 0) < 0.4) continue;
    seaSites.push({ u: x / TEX_W, lat });
  }
  return { rgb, land, cloud: buildCloudMap(random), cities: cities.map(({ u, lat }) => ({ u, lat })), seaSites };
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

/**
 * View-frame coordinates of a point on or above the planet. `lat` and `lon` are in radians, `lon` measured from the view's centre
 * meridian (0 faces the viewer, so it already includes the planet's spin); `alt` is height as a fraction of the radius; `tiltDeg` is the
 * axis tilt. Returns { x, y, z } in planet radii: x right, y up, z toward the viewer. z > 0 on the near side.
 */
export function projectPoint(lat, lon, alt, tiltDeg) {
  const t = tiltDeg * Math.PI / 180, ax = Math.cos(t), ay = Math.sin(t), r = 1 + alt;
  const s = Math.sin(lat), c = Math.cos(lat) * Math.sin(lon);
  return { x: r * (s * ax + c * ay), y: r * (s * ay - c * ax), z: r * Math.cos(lat) * Math.cos(lon) };
}

/** Point a fraction `f` (0..1) along the great circle between two (lat, lon) points in radians. Returns { lat, lon, angle } with the total angle. */
export function greatCircle(a, b, f) {
  const va = [Math.cos(a.lat) * Math.cos(a.lon), Math.cos(a.lat) * Math.sin(a.lon), Math.sin(a.lat)];
  const vb = [Math.cos(b.lat) * Math.cos(b.lon), Math.cos(b.lat) * Math.sin(b.lon), Math.sin(b.lat)];
  const angle = Math.acos(clamp(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2], -1, 1)), s = Math.sin(angle) || 1;
  const wa = Math.sin((1 - f) * angle) / s, wb = Math.sin(f * angle) / s;
  const v = [wa * va[0] + wb * vb[0], wa * va[1] + wb * vb[1], wa * va[2] + wb * vb[2]];
  return { lat: Math.asin(clamp(v[2], -1, 1)), lon: Math.atan2(v[1], v[0]), angle };
}

const TAU = Math.PI * 2;
const pingPong = x => 1 - Math.abs(1 - (((x % 2) + 2) % 2));
const norm3 = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const arr3 = v => [v.x, v.y, v.z];

/** Outlined sprite helper (CSS px). */
function outline(ctx, fill) { ctx.fillStyle = fill; ctx.strokeStyle = '#14102a'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.fill(); ctx.stroke(); }

function drawSatellite(ctx, x, y, angle, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(s, s);
  ctx.beginPath(); ctx.rect(-14, -3, 9, 6); outline(ctx, '#4aa3ff');
  ctx.beginPath(); ctx.rect(5, -3, 9, 6); outline(ctx, '#4aa3ff');
  ctx.beginPath(); ctx.rect(-5, -3.5, 10, 7); outline(ctx, '#ffd23f');
  ctx.beginPath(); ctx.arc(0, -6, 1.6, 0, TAU); outline(ctx, '#ffffff');
  ctx.restore();
}

/**
 * Creates the scene. `canvas` is the full-screen planet layer; `sprites` an optional canvas above it for cities, boats, planes,
 * satellites and clouds.
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {HTMLCanvasElement} [options.sprites]
 * @param {{loading: object}} options.display live settings (see display.loading in src/shared/display.js)
 * @param {() => number} options.random seeded generator (same seed, same planet and the same traffic)
 * @param {ReturnType<typeof buildPlanet>} [options.planet] a planet already built with `buildPlanet`, to share between scenes (the preview gallery)
 * @param {{ares?: HTMLCanvasElement, luna?: HTMLCanvasElement}} [options.worlds] canvases for the distant worlds
 * @param {boolean} [options.reducedMotion] draw one still frame: nothing turns, flies or sails
 * @param {boolean} [options.focusCity] start with a city turned to the planet's near limb, so its skyline stands against the sky
 * @param {Window} [options.win] provides requestAnimationFrame and the viewport size
 */
export function createPlanetScene({ canvas, sprites = null, display, random, planet: prebuilt = null, worlds = {}, reducedMotion = false, focusCity = false, win = canvas.ownerDocument.defaultView }) {
  const doc = canvas.ownerDocument;
  const planet = prebuilt ?? buildPlanet(random);
  const texture = planet.rgb, clouds = planet.cloud;
  const moons = Object.entries(worlds).filter(([, el]) => el).map(([kind, el]) => ({ kind, world: createWorld({ canvas: el, kind, random }) }));
  const ctx = canvas.getContext?.('2d') ?? null, sctx = sprites?.getContext?.('2d') ?? null;
  let layout = null, image = null, frameId = null, last = null, spin = 0, cloudSpin = 0, clock = 0, disposed = false, geometryKey = '', pixelSize = 4, levels = 64;
  const stats = { citiesDrawn: 0, tallestCity: 0, citySignature: '' };

  const cities = planet.cities.map(c => ({ lat: c.lat * Math.PI / 180, lon: c.u * TAU, u: c.u, buildings: makeSkyline(random, 7 + Math.floor(random() * 5)) }));
  if (focusCity && cities.length) { // turn the city nearest 18 degrees latitude to the near limb (longitude -75 degrees from the view centre)
    const best = cities.reduce((a, b) => (Math.abs(b.lat - 0.31) < Math.abs(a.lat - 0.31) ? b : a));
    spin = (best.u * 360 + 75) % 360;
  }
  const oceanAt = (lat, lon) => planet.land[Math.min(TEX_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * TEX_H))) * TEX_W + (((Math.floor(lon / TAU * TEX_W) % TEX_W) + TEX_W) % TEX_W)] < SEA - 0.04;
  const planes = [];
  for (let k = 0; k < MAX_PLANES && cities.length > 1; k++) {
    let a, b, path;
    for (let tries = 0; tries < 30; tries++) {
      a = cities[Math.floor(random() * cities.length)]; b = cities[Math.floor(random() * cities.length)];
      path = greatCircle(a, b, 0.5);
      if (path.angle > 0.35 && path.angle < 1.6) break;
    }
    planes.push({ a, b, angle: path.angle || 1, phase: random() * 2, speed: 0.05 + random() * 0.04 });
  }
  const boats = planet.seaSites.slice(0, MAX_BOATS).map(s => { // boats sail east and west along their latitude, only over open sea
    const lat = s.lat * Math.PI / 180, lon = s.u * TAU;
    let span = 0.16;
    while (span > 0 && ![-1, -0.5, 0, 0.5, 1].every(q => oceanAt(lat, lon + q * span))) span -= 0.04;
    return { lat, lon, span: Math.max(0, span), phase: random() * 2, speed: 0.02 + random() * 0.02 };
  });
  const satellites = Array.from({ length: MAX_SATELLITES }, () => {
    const n = [random() - 0.5, 0.6 + random() * 0.4, (random() - 0.5) * 0.8], len = Math.hypot(...n), nn = n.map(q => q / len);
    const e1r = [nn[1], -nn[0], 0], l1 = Math.hypot(...e1r) || 1, e1 = e1r.map(q => q / l1);
    const e2 = [nn[1] * e1[2] - nn[2] * e1[1], nn[2] * e1[0] - nn[0] * e1[2], nn[0] * e1[1] - nn[1] * e1[0]];
    return { e1, e2, alt: 0.2 + random() * 0.25, phase: random() * TAU, speed: (0.12 + random() * 0.12) * (random() < 0.5 ? -1 : 1) };
  });
  // Fluffy foreground clouds (drawn on the sprite canvas): banks that frame the bottom and sides, and some that drift past.
  let cloudsBuilt = false;
  const cloudActors = [];

  const settings = () => display.loading;
  const count = (value, max) => Math.max(0, Math.min(max, Math.round(value)));

  /** Precomputes, per buffer pixel, the latitude row, base longitude and lighting. Rebuilt when the size, tilt, height or pixel size changes. */
  function buildGeometry(cssW, cssH) {
    const { axisTilt, horizonHeight, landSmoothness } = settings();
    pixelSize = Math.round(mix(8, 2, clamp(landSmoothness)));
    levels = Math.round(mix(6, 64, clamp(landSmoothness)));
    const bw = Math.max(16, Math.ceil(cssW / pixelSize)), bh = Math.max(16, Math.ceil(cssH / pixelSize));
    const radius = Math.max(0.5 * bw, 0.6 * bh), cx = bw / 2, cy = horizonHeight * bh + radius;
    const t = axisTilt * Math.PI / 180, ax = Math.cos(t), ay = Math.sin(t);
    const sun = [-0.45, 0.62, 0.64], sunLen = Math.hypot(...sun);
    const rows = new Uint16Array(bw * bh), lon = new Float32Array(bw * bh), shade = new Float32Array(bw * bh), rim = new Float32Array(bw * bh);
    const glow = new Float32Array(bw * bh); // atmosphere just outside the disc
    const kind = new Uint8Array(bw * bh); // 0 sky, 1 planet
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x, dx = (x + 0.5 - cx) / radius, dy = (cy - (y + 0.5)) / radius, r2 = dx * dx + dy * dy;
        if (r2 > 1) {
          const edge = Math.sqrt(r2) - 1;
          if (edge < 0.16) glow[i] = Math.exp(-edge * 26) * 0.85;
          continue;
        }
        const dz = Math.sqrt(1 - r2), lat = Math.asin(Math.max(-1, Math.min(1, dx * ax + dy * ay)));
        kind[i] = 1;
        rows[i] = Math.min(TEX_H - 1, Math.floor((0.5 - lat / Math.PI) * TEX_H));
        lon[i] = (Math.atan2(dx * ay - dy * ax, dz) / TAU + 1) % 1; // fraction of a full turn
        const lit = Math.max(0, (dx * sun[0] + dy * sun[1] + dz * sun[2]) / sunLen);
        shade[i] = Math.max(0.55, Math.min(1.1, 0.5 + 0.62 * (0.55 * (Math.floor(lit * 4 + 0.4) / 4) + 0.45 * lit))); // cel-shaded bands over smooth light
        rim[i] = Math.pow(1 - dz, 3) * 0.75;
      }
    }
    layout = { bw, bh, rows, lon, shade, rim, glow, kind, cx: cx * cssW / bw, cy: cy * cssH / bh, rx: radius * cssW / bw, ry: radius * cssH / bh };
    geometryKey = `${cssW}x${cssH}:${axisTilt}:${horizonHeight}:${landSmoothness}`;
    canvas.width = bw; canvas.height = bh;
    canvas.style.imageRendering = landSmoothness < 0.4 ? 'pixelated' : 'auto';
    image = ctx?.createImageData?.(bw, bh) ?? null;
  }

  function viewport() {
    const rect = canvas.getBoundingClientRect?.();
    return { w: rect?.width || win?.innerWidth || 1280, h: rect?.height || win?.innerHeight || 720 };
  }

  /** Runs `paint` clipped to everything outside the planet's disc, so objects behind the limb are hidden but their parts above it show. */
  function outsideDisc(w, h, paint) {
    sctx.save();
    sctx.beginPath(); sctx.rect(0, 0, w, h); sctx.ellipse(layout.cx, layout.cy, layout.rx, layout.ry, 0, 0, TAU, true);
    sctx.clip('evenodd');
    paint();
    sctx.restore();
  }

  /** The foreground cloud sprites and where each starts; built once when the sprite canvas first has a size. */
  function ensureClouds(w, h) {
    if (cloudsBuilt) return;
    cloudsBuilt = true;
    const k = clamp(w / 1280, 0.3, 1.2); // clouds scale with the screen
    const make = (cw, ch) => makeCloudSprite(doc, Math.round(cw * k), Math.round(ch * k), random);
    const bank = [make(640, 230), make(560, 210), make(700, 240)], side = [make(420, 190), make(380, 170)], drift = Array.from({ length: 3 }, (_, k) => make(240 + k * 40, 110 + k * 12));
    if (bank.some(b => !b)) return; // no 2D canvas (tests)
    bank.forEach((s, k) => cloudActors.push({ s, x: -120 + k * (w / 2.2), y: h - s.height * 0.4 + (k % 2) * 12, speed: 3 + k, front: true, wrap: false }));
    side.forEach((s, k) => cloudActors.push({ s, x: k ? w - s.width * 0.4 : -s.width * 0.6, y: h * (k ? 0.8 : 0.66), speed: 2, front: true, wrap: false }));
    drift.forEach((s, k) => cloudActors.push({ s, x: random() * w, y: h * (0.62 + random() * 0.22), speed: 7 + random() * 16, front: k % 2 === 0, wrap: true, alpha: 0.88, drift: true }));
  }

  function drawClouds(w, h, front, time, cover) {
    const dc = count(cover * 3, 3);
    let drifted = 0;
    for (const c of cloudActors) {
      if (c.front !== front) continue;
      if (c.drift) { drifted++; if (drifted > dc) continue; } else if (cover <= 0) continue;
      const span = w + c.s.width * 1.4;
      const x = c.wrap ? ((((c.x + time * c.speed) % span) + span) % span) - c.s.width * 0.7 : c.x + Math.sin(time * 0.2 + c.s.width) * c.speed * 2;
      sctx.globalAlpha = c.alpha ?? 1;
      sctx.drawImage(c.s, x, c.y + Math.sin(time * 0.3 + c.s.width) * 3);
    }
    sctx.globalAlpha = 1;
  }

  /** Draws cities, boats, planes, satellites and clouds on the sprite canvas. */
  function drawSprites(w, h, s) {
    if (!sctx || !sprites) return;
    if (sprites.width !== Math.round(w) || sprites.height !== Math.round(h)) { sprites.width = Math.round(w); sprites.height = Math.round(h); }
    sctx.clearRect(0, 0, sprites.width, sprites.height);
    ensureClouds(w, h);
    const turn = spin / 360 * TAU, tilt = s.axisTilt, time = reducedMotion ? 0 : clock, { cx, cy, rx, ry } = layout;
    const P = (lat, lon, alt = 0) => projectPoint(lat, lon - turn, alt, tilt); // a point on the ground in view space
    const screen = p => ({ x: cx + p.x * rx, y: cy - p.y * ry });
    drawClouds(w, h, false, time, s.cloudCover);
    const sats = satellites.slice(0, count(s.satellites, MAX_SATELLITES)).map(sat => {
      const r = 1 + sat.alt, at = th => ({ x: r * (Math.cos(th) * sat.e1[0] + Math.sin(th) * sat.e2[0]), y: r * (Math.cos(th) * sat.e1[1] + Math.sin(th) * sat.e2[1]), z: r * (Math.cos(th) * sat.e1[2] + Math.sin(th) * sat.e2[2]) });
      const th = sat.phase + time * sat.speed;
      return { p: at(th), ahead: at(th + 0.05 * Math.sign(sat.speed)), r };
    });
    const paintSat = ({ p, ahead, r }) => {
      if (p.z < 0 && p.x * p.x + p.y * p.y < 1) return;
      const a = screen(p), b = screen(ahead);
      drawSatellite(sctx, a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), 0.8 + 0.25 * clamp(p.z / r, 0, 1));
    };
    sats.filter(q => q.p.z < 0).forEach(paintSat);

    // Cities: a flat plaza and a skyline of 3D buildings standing on the sphere, so skylines rise out of the horizon.
    const style = CITY_STYLES[count(s.cityStyle, CITY_STYLES.length - 1)], unit = rx * 0.03 * s.citySize;
    stats.citiesDrawn = 0; stats.tallestCity = 0; stats.citySignature = style.name;
    const visible = [];
    for (const c of cities) {
      const base = P(c.lat, c.lon);
      if (base.z < -0.16) continue;
      visible.push({ c, base });
    }
    visible.sort((q, r) => q.base.z - r.base.z);
    for (const { c, base } of visible) {
      const d = 0.002, e = norm3(sub3(P(c.lat, c.lon + d), base)), no = norm3(sub3(P(c.lat + d, c.lon), base)), up = norm3(base);
      const frame = { f: arr3(e), b: arr3(no), n: arr3(up) }, at = screen(base);
      const paint = () => {
        if (base.z > 0) { // plaza: a flat disc on the ground, foreshortened by the viewing angle
          sctx.save(); sctx.translate(at.x, at.y); sctx.rotate(Math.atan2(-up.y, up.x) + Math.PI / 2); sctx.scale(1, Math.max(0.18, Math.abs(up.z)));
          sctx.beginPath(); sctx.arc(0, 0, unit * 1.5, 0, TAU); sctx.fillStyle = 'rgba(60,70,100,.55)'; sctx.fill(); sctx.restore();
        }
        paintFaces(sctx, placeModel(skylineFaces(c.buildings, style), at, frame, unit), { windows: style.windows });
      };
      if (base.z < 0.1) outsideDisc(w, h, paint); else paint();
      stats.citiesDrawn++;
      stats.tallestCity = Math.max(stats.tallestCity, Math.max(...c.buildings.map(b => b.h)) * style.tall * unit * Math.hypot(up.x, up.y));
    }

    // Boats sail over the sea, planes fly great circles between cities: both are oriented on the sphere and follow it over the horizon.
    const mover = (posAt, aheadAt, model, px, trail) => {
      const p = posAt(), a = aheadAt();
      if (p.z < -0.4) return;
      const up = norm3(p), t0 = sub3(a, p), fwd = norm3({ x: t0.x - up.x * dot3(t0, up), y: t0.y - up.y * dot3(t0, up), z: t0.z - up.z * dot3(t0, up) });
      const side = cross3(up, fwd), at = screen(p), frame = { f: arr3(fwd), b: arr3(side), n: arr3(up) };
      const paint = () => {
        if (trail) trail(sctx);
        paintFaces(sctx, placeModel(model.faces, at, frame, px), { outline: 1.3 });
      };
      if (p.z < 0.1) outsideDisc(w, h, paint); else paint();
    };
    for (const boat of boats.slice(0, count(s.boats, MAX_BOATS))) {
      const x = boat.phase + time * boat.speed / Math.max(boat.span, 0.01), lonAt = f => boat.lon + (pingPong(f) * 2 - 1) * boat.span, forward = (((x % 2) + 2) % 2) < 1;
      const bob = Math.sin(time * 1.6 + boat.phase * 5) * 0.004, dir = forward ? 1 : -1;
      mover(() => P(boat.lat, lonAt(x), 0.006 + bob), () => P(boat.lat, lonAt(x + dir * 0.02), 0.006 + bob), BOAT, rx * 0.026, c => {
        c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); let started = false; // foamy wake
        for (let k = 0; k <= 6; k++) { const q = P(boat.lat, lonAt(x - dir * k * 0.012), 0.004); if (q.z < -0.05) break; const sp = screen(q); if (!started) { c.moveTo(sp.x, sp.y); started = true; } else c.lineTo(sp.x, sp.y); }
        c.stroke();
      });
    }
    for (const plane of planes.slice(0, count(s.planes, MAX_PLANES))) {
      const x = plane.phase + time * plane.speed / plane.angle, forward = (((x % 2) + 2) % 2) < 1, dir = forward ? 1 : -1;
      const at = f => { const g = greatCircle(plane.a, plane.b, pingPong(f)); return P(g.lat, g.lon, 0.035 + 0.025 * Math.sin(Math.PI * pingPong(f))); };
      mover(() => at(x), () => at(x + dir * 0.01), PLANE, rx * 0.034, c => {
        c.lineCap = 'round'; // contrail along the route behind the plane
        for (let k = 0; k < 9; k++) {
          const a = screen(at(x - dir * k * 0.012)), b = screen(at(x - dir * (k + 1) * 0.012));
          c.strokeStyle = `rgba(255,255,255,${0.8 - k * 0.08})`; c.lineWidth = 3.2 - k * 0.25;
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        }
      });
    }
    sats.filter(q => q.p.z >= 0).forEach(paintSat);
    drawClouds(w, h, true, time, s.cloudCover);
  }

  /** Draws the planet, the distant worlds and the sprites at the current spin. */
  function draw() {
    const { w, h } = viewport();
    const s = settings();
    for (const m of moons) m.world.draw(spin / 360 * (m.kind === 'ares' ? 2.4 : 1.5));
    if (!layout || geometryKey !== `${w}x${h}:${s.axisTilt}:${s.horizonHeight}:${s.landSmoothness}`) buildGeometry(w, h);
    if (!ctx || !image) { drawSprites(w, h, s); return; }
    const { bw, bh, rows, lon, shade, rim, glow, kind } = layout, px = image.data, turn = spin / 360, cloudTurn = cloudSpin / 360;
    const thr = 0.85 - s.cloudCover * 0.5, cover = s.cloudCover > 0, step255 = 255 / (levels - 1), posterize = levels < 60;
    for (let i = 0, n = bw * bh; i < n; i++) {
      const o = i * 4;
      if (kind[i]) {
        const col = ((((lon[i] + turn) % 1) + 1) % 1 * TEX_W) | 0, t = (rows[i] * TEX_W + col) * 3, k = shade[i], a = rim[i];
        let r = texture[t] * k, g = texture[t + 1] * k, bl = texture[t + 2] * k;
        if (posterize) { r = Math.round(r / step255) * step255; g = Math.round(g / step255) * step255; bl = Math.round(bl / step255) * step255; } // chunkier palette toward the pixelated end
        if (cover) {
          const cc = ((((lon[i] + cloudTurn) % 1) + 1) % 1 * TEX_W) | 0, d = clouds[rows[i] * TEX_W + cc] / 255, m = Math.max(0, Math.min(1, (d - thr) / 0.14));
          if (m > 0) { const w = 0.92 * m * (0.6 + 0.4 * Math.min(1, k)), lit = 236 * Math.min(1.08, 0.45 + k * 0.62); r = r * (1 - w) + lit * w; g = g * (1 - w) + (lit + 6) * w; bl = bl * (1 - w) + (lit + 14) * w; }
        }
        px[o] = Math.min(255, r + 150 * a); px[o + 1] = Math.min(255, g + 205 * a); px[o + 2] = Math.min(255, bl + 255 * a); px[o + 3] = 255;
      } else if (glow[i] > 0.004) {
        px[o] = 140; px[o + 1] = 205; px[o + 2] = 255; px[o + 3] = Math.min(255, glow[i] * 255);
      } else px[o + 3] = 0;
    }
    ctx.putImageData(image, 0, 0);
    drawSprites(w, h, s);
  }

  /** Advances the scene by `dt` seconds and redraws. Exposed so tests and the animation loop share one path. */
  function step(dt) {
    if (disposed) return;
    const s = settings();
    clock += dt;
    if (!reducedMotion) {
      spin = (spin + s.spinSpeed * dt) % 360;
      cloudSpin = (cloudSpin + s.spinSpeed * s.cloudDrift * dt) % 360;
    }
    draw();
  }

  function frame(now) {
    frameId = null;
    if (disposed) return;
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    frameId = win.requestAnimationFrame(frame);
  }

  return {
    /** Draws the first frame and, unless motion is reduced, starts the animation loop. */
    start() {
      if (disposed || frameId !== null) return;
      if (reducedMotion || !win?.requestAnimationFrame) { draw(); win?.addEventListener?.('resize', draw); return; }
      frameId = win.requestAnimationFrame(frame);
    },
    step,
    /** How many planes, boats and satellites the current settings show. */
    get traffic() { const s = settings(); return { planes: Math.min(count(s.planes, MAX_PLANES), planes.length), boats: Math.min(count(s.boats, MAX_BOATS), boats.length), satellites: count(s.satellites, MAX_SATELLITES) }; },
    /** What the last frame drew: pixel size and palette levels of the land, and the cities (count, tallest skyline in px, style name). */
    get stats() { return { pixelSize, levels, ...stats }; },
    get cities() { return planet.cities; },
    get spin() { return spin; },
    get land() { return planet.land; },
    get texture() { return texture; },
    dispose() {
      disposed = true;
      win?.removeEventListener?.('resize', draw);
      if (frameId !== null) win?.cancelAnimationFrame?.(frameId);
      frameId = null;
    },
  };
}
