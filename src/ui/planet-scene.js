/**
 * Planet backdrop for the loading screen (VIS-M1): a curved Gaia horizon with clouds, Ares and Luna in the distance, and golf
 * balls that now and then fly across the sky trailing a streak of wind.
 *
 * Original art, drawn procedurally. Gaia is built from climate fields, not hand-painted stripes: invented continents (domain
 * warped, so coasts look organic) give elevation; temperature falls with latitude and altitude; moisture follows Earth's wind
 * belts (wet equator, dry subtropics, wetter mid-latitudes), drops inland and rises near coasts. Colours are blended smoothly
 * across that temperature/moisture plane (tundra, taiga, forest, grassland, savanna, desert, jungle), with beaches, shallow seas,
 * mountains with snow caps, ice at the poles, hill shading and an ink coastline for the comic look. The finished texture is
 * sampled into a small canvas every frame while the planet turns, with cel-shaded light and a separate cloud layer.
 *
 * This module is presentation only: it imports no simulation, Three.js or React code, takes its randomness and clock as
 * inputs, and reads the live `display.loading` settings (src/shared/display.js) each frame so the developer panel shows changes
 * at once. With `reducedMotion` it draws one still frame and launches no balls.
 */

import { clamp, makeFbm, makeNoise, mix, mulberry32, smooth } from './noise.js';
import { createWorld } from './worlds.js';

export { mulberry32 };

export const TEX_W = 768;
export const TEX_H = 384;
const SEA = 0.4; // land value at the shoreline

/** Palette (r, g, b), storybook-bright. Rows run cold to hot, columns dry to wet. */
const CLIMATE = Object.freeze([
  [0.15, [[168, 182, 168], [112, 150, 124], [64, 118, 92]]],
  [0.40, [[168, 184, 108], [96, 170, 90], [54, 138, 84]]],
  [0.65, [[222, 196, 116], [112, 190, 86], [58, 164, 84]]],
  [0.95, [[240, 204, 104], [196, 190, 78], [22, 146, 68]]],
]);
const SNOW = [248, 252, 255], ROCK = [140, 132, 128], SAND = [244, 224, 162], SHALLOW = [74, 208, 224], SEA_BLUE = [40, 122, 224], DEEP = [22, 78, 176], INK = [20, 16, 42];

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
 * Returns [r, g, b]: ocean in three blues with ice near the poles, beaches, blended biomes, rock and snow on high ground.
 */
export function surfaceColour(lat, land, h, moist) {
  const t = temperatureAt(lat, h);
  if (land < SEA) {
    const depth = SEA - land;
    const water = lerp3(lerp3(SHALLOW, SEA_BLUE, smooth(0, 0.1, depth)), DEEP, smooth(0.1, 0.3, depth));
    return lerp3(water, SNOW, smooth(0.3, 0.14, t)); // sea ice
  }
  let c = climateColour(t, moist);
  c = lerp3(c, ROCK, smooth(0.5, 0.85, h) * 0.8);
  c = lerp3(c, SNOW, Math.max(smooth(0.2, 0.08, t), smooth(0.8, 0.95, h)));
  return lerp3(c, SAND, smooth(SEA + 0.03, SEA, land) * smooth(0.25, 0.4, t) * 0.9); // beaches on warm coasts
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
  return 0.45 + best * 0.5 + (coast - 0.5) * 0.4;
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
 * Builds Gaia once. Returns { rgb, land, cloud }: an RGB texture (3 bytes per texel, row 0 at the north pole), the land value per
 * texel (below 0.4 is sea) and a 0..255 cloud density texture.
 */
export function buildPlanet(random) {
  const n = TEX_W * TEX_H;
  const coast = makeFbm(random, 8, 4, 4), warpU = makeNoise(random, 6, 3), warpV = makeNoise(random, 7, 4);
  const range = makeFbm(random, 10, 5, 3), wetNoise = makeFbm(random, 5, 3, 4), grain = makeNoise(random, 160, 80);
  const land = new Float32Array(n), h = new Float32Array(n), mask = new Float32Array(n);
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H, lat = (0.5 - v) * 180;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W, i = y * TEX_W + x;
      const wu = (u + (warpU(u, v) - 0.5) * 0.09 + 1) % 1, wl = lat + (warpV(u, v) - 0.5) * 20; // domain warp: organic coasts
      land[i] = landAt(wu, wl, coast(u, v));
      mask[i] = land[i] >= SEA ? 1 : 0;
      const base = clamp((land[i] - SEA) / 0.35), ridge = 1 - Math.abs(range(u, v) * 2 - 1);
      h[i] = base * (0.25 + 0.75 * smooth(0.72, 0.98, ridge));
    }
  }
  const inland = blur(mask, 16);
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
      const edge = 1 - smooth(0, 0.012, Math.abs(land[i] - SEA)); // 1 on the shoreline: an ink-dark coast line
      const g = 0.97 + (grain(u, v) - 0.5) * 0.08;
      rgb[i * 3] = clamp(mix(c[0] * g, INK[0], edge * 0.55), 0, 255); rgb[i * 3 + 1] = clamp(mix(c[1] * g, INK[1], edge * 0.55), 0, 255); rgb[i * 3 + 2] = clamp(mix(c[2] * g, INK[2], edge * 0.55), 0, 255);
    }
  }
  return { rgb, land, cloud: buildCloudMap(random) };
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
 * Where a ball is along its flight. `flight` is { x0, y0, x1, y1, apex } in px (apex = extra height of the arc, px, positive up),
 * `t` runs 0..1. Returns the centre position, the ball's apparent scale and its spin in degrees.
 */
export function ballPose(flight, t) {
  const u = Math.min(1, Math.max(0, t));
  return {
    x: flight.x0 + (flight.x1 - flight.x0) * u,
    y: flight.y0 + (flight.y1 - flight.y0) * u - 4 * flight.apex * u * (1 - u),
    scale: 1 - 0.35 * u, // flies away from the viewer
    spin: u * 900 * (flight.x1 >= flight.x0 ? 1 : -1),
  };
}

/** Picks a flight across a `width` by `height` sky: enters from one side, arcs over the middle, lands near the planet. */
export function planFlight(random, width, height, ballSize, horizonY) {
  const leftToRight = random() < 0.5;
  const margin = ballSize * 1.5;
  const y0 = height * (0.3 + random() * 0.2), y1 = Math.max(y0 + 20, horizonY - height * (0.02 + random() * 0.06));
  return {
    x0: leftToRight ? -margin : width + margin, x1: leftToRight ? width + margin : -margin,
    y0, y1, apex: height * (0.06 + random() * 0.12),
  };
}

/**
 * Creates the scene. `canvas` is the full-screen planet layer, `ballLayer` a positioned element that receives the balls.
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {HTMLElement} options.ballLayer
 * @param {{loading: object}} options.display live settings (see display.loading in src/shared/display.js)
 * @param {() => number} options.random seeded generator (same seed, same planet and same flights)
 * @param {{ares?: HTMLCanvasElement, luna?: HTMLCanvasElement}} [options.worlds] canvases for the distant worlds
 * @param {boolean} [options.reducedMotion] draw one still frame, no balls
 * @param {Window} [options.win] provides requestAnimationFrame and the viewport size
 */
export function createPlanetScene({ canvas, ballLayer, display, random, worlds = {}, reducedMotion = false, win = canvas.ownerDocument.defaultView }) {
  const doc = canvas.ownerDocument;
  const planet = buildPlanet(random);
  const texture = planet.rgb, clouds = planet.cloud;
  const moons = Object.entries(worlds).filter(([, el]) => el).map(([kind, el]) => ({ kind, world: createWorld({ canvas: el, kind, random }) }));
  const ctx = canvas.getContext?.('2d') ?? null;
  const SCALE = 3; // CSS px per buffer pixel; the canvas is stretched up with smoothing
  let layout = null, image = null, frameId = null, last = null, spin = 0, cloudSpin = 0, clock = 0, nextBall = 0, disposed = false, geometryKey = '';
  const balls = [];

  const settings = () => display.loading;

  /** Precomputes, per buffer pixel, the latitude row, base longitude and lighting. Rebuilt when the size, tilt or height changes. */
  function buildGeometry(cssW, cssH) {
    const { axisTilt, horizonHeight } = settings();
    const bw = Math.max(16, Math.ceil(cssW / SCALE)), bh = Math.max(16, Math.ceil(cssH / SCALE));
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
        lon[i] = (Math.atan2(dx * ay - dy * ax, dz) / (2 * Math.PI) + 1) % 1; // fraction of a full turn
        const lit = Math.max(0, (dx * sun[0] + dy * sun[1] + dz * sun[2]) / sunLen);
        shade[i] = Math.max(0.55, Math.min(1.1, 0.5 + 0.62 * (0.55 * (Math.floor(lit * 4 + 0.4) / 4) + 0.45 * lit))); // cel-shaded bands over smooth light
        rim[i] = Math.pow(1 - dz, 3) * 0.75;
      }
    }
    layout = { bw, bh, rows, lon, shade, rim, glow, kind };
    geometryKey = `${cssW}x${cssH}:${axisTilt}:${horizonHeight}`;
    canvas.width = bw; canvas.height = bh;
    image = ctx?.createImageData?.(bw, bh) ?? null;
  }

  function viewport() {
    const rect = canvas.getBoundingClientRect?.();
    return { w: rect?.width || win?.innerWidth || 1280, h: rect?.height || win?.innerHeight || 720 };
  }

  /** Draws the planet and the distant worlds at the current spin. */
  function draw() {
    const { w, h } = viewport();
    const s = settings();
    for (const m of moons) m.world.draw(spin / 360 * (m.kind === 'ares' ? 2.4 : 1.5));
    if (!layout || geometryKey !== `${w}x${h}:${s.axisTilt}:${s.horizonHeight}`) buildGeometry(w, h);
    if (!ctx || !image) return;
    const { bw, bh, rows, lon, shade, rim, glow, kind } = layout, px = image.data, turn = spin / 360, cloudTurn = cloudSpin / 360;
    const thr = 0.85 - s.cloudCover * 0.5, cover = s.cloudCover > 0;
    for (let i = 0, n = bw * bh; i < n; i++) {
      const o = i * 4;
      if (kind[i]) {
        const col = ((((lon[i] + turn) % 1) + 1) % 1 * TEX_W) | 0, t = (rows[i] * TEX_W + col) * 3, k = shade[i], a = rim[i];
        let r = texture[t] * k, g = texture[t + 1] * k, bl = texture[t + 2] * k;
        if (cover) {
          const cc = ((((lon[i] + cloudTurn) % 1) + 1) % 1 * TEX_W) | 0, d = clouds[rows[i] * TEX_W + cc] / 255, m = Math.max(0, Math.min(1, (d - thr) / 0.2));
          if (m > 0) { const w = 0.9 * m * (0.6 + 0.4 * Math.min(1, k)), lit = 232 * Math.min(1.08, 0.45 + k * 0.62); r = r * (1 - w) + lit * w; g = g * (1 - w) + (lit + 6) * w; bl = bl * (1 - w) + (lit + 14) * w; }
        }
        px[o] = Math.min(255, r + 150 * a); px[o + 1] = Math.min(255, g + 205 * a); px[o + 2] = Math.min(255, bl + 255 * a); px[o + 3] = 255;
      } else if (glow[i] > 0.004) {
        px[o] = 140; px[o + 1] = 205; px[o + 2] = 255; px[o + 3] = Math.min(255, glow[i] * 255);
      } else px[o + 3] = 0;
    }
    ctx.putImageData(image, 0, 0);
  }

  function launchBall() {
    const { w, h } = viewport(), s = settings();
    const horizonY = s.horizonHeight * h, size = s.ballSize;
    const el = doc.createElement('i');
    el.className = 'ball';
    el.dataset.ui = 'loading-ball';
    el.style.width = el.style.height = size + 'px';
    el.style.marginLeft = el.style.marginTop = -size / 2 + 'px';
    const trail = doc.createElement('b'), core = doc.createElement('u');
    trail.className = 'trail'; core.className = 'core';
    el.append(trail, core);
    ballLayer.append(el);
    balls.push({ el, flight: planFlight(random, w, h, size, horizonY), age: 0, duration: s.ballFlightTime });
  }

  function moveBalls() {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i], t = b.age / b.duration;
      if (t >= 1) { b.el.remove(); balls.splice(i, 1); continue; }
      const p = ballPose(b.flight, t), q = ballPose(b.flight, Math.min(1, t + 0.02));
      const heading = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 180; // the trail points back along the path
      b.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) scale(${p.scale.toFixed(3)})`;
      b.el.firstChild.style.setProperty('--heading', heading.toFixed(1) + 'deg');
      b.el.lastChild.style.transform = `rotate(${p.spin.toFixed(0)}deg)`;
    }
  }

  /** Advances the scene by `dt` seconds and redraws. Exposed so tests and the animation loop share one path. */
  function step(dt) {
    if (disposed) return;
    const s = settings();
    clock += dt;
    if (!reducedMotion) {
      spin = (spin + s.spinSpeed * dt) % 360;
      cloudSpin = (cloudSpin + s.spinSpeed * s.cloudDrift * dt) % 360;
      for (const b of balls) b.age += dt;
      if (clock >= nextBall) {
        if (balls.length < 3) launchBall();
        nextBall = clock + s.ballInterval * (0.5 + random());
      }
      moveBalls();
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
      nextBall = settings().ballInterval * 0.3; // the first ball shows up soon, so the effect is discoverable
      if (reducedMotion || !win?.requestAnimationFrame) { draw(); win?.addEventListener?.('resize', draw); return; }
      frameId = win.requestAnimationFrame(frame);
    },
    step,
    get balls() { return balls.length; },
    get spin() { return spin; },
    get land() { return planet.land; },
    get texture() { return texture; },
    dispose() {
      disposed = true;
      win?.removeEventListener?.('resize', draw);
      if (frameId !== null) win?.cancelAnimationFrame?.(frameId);
      frameId = null;
      for (const b of balls) b.el.remove();
      balls.length = 0;
    },
  };
}
