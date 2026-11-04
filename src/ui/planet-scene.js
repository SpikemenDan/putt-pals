/**
 * Planet backdrop for the loading screen (VIS-M1): a curved Gaia horizon and golf balls that now and then fly across the sky.
 *
 * Original art, drawn procedurally: a latitude/longitude texture is built once from seeded noise (snowy poles, tundra,
 * boreal and temperate forest, a desert band, tropics and oceans), then the visible cap of the sphere is sampled into a
 * small canvas every frame while the planet turns. Balls are plain DOM elements moved along parabolic arcs. This module
 * is presentation only: it imports no simulation, Three.js or React code, takes its randomness and clock as inputs, and
 * reads the live `display.loading` settings (src/shared/display.js) each frame so the developer panel shows changes at
 * once. With `reducedMotion` it draws one still frame and launches no balls.
 */

export const TEX_W = 512;
export const TEX_H = 256;

/** Biome ids, ordered so a texture stores one byte per texel. */
export const BIOMES = Object.freeze(['snow', 'tundra', 'boreal', 'temperate', 'desert', 'tropical', 'jungle', 'ocean', 'deepOcean', 'rock']);
const ID = Object.freeze(Object.fromEntries(BIOMES.map((name, i) => [name, i])));

/** Flat, storybook colours (r, g, b) for each biome. */
const COLOURS = Object.freeze({
  snow: [244, 251, 255], tundra: [157, 179, 154], boreal: [63, 125, 85], temperate: [92, 184, 92], desert: [232, 196, 106],
  tropical: [31, 168, 79], jungle: [18, 128, 58], ocean: [42, 125, 225], deepOcean: [28, 95, 196], rock: [141, 138, 134],
});

/** Seeded generator so the same load always paints the same planet. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a grid that wraps horizontally (u in [0,1)), so the planet has no seam. Returns f(u, v) in [0,1]. */
function makeNoise(random, cellsX, cellsY) {
  const grid = Array.from({ length: (cellsY + 1) * cellsX }, () => random());
  const at = (ix, iy) => grid[iy * cellsX + ((ix % cellsX) + cellsX) % cellsX];
  const ease = t => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cellsX, y = Math.min(v, 0.999999) * cellsY;
    const ix = Math.floor(x), iy = Math.floor(y), fx = ease(x - ix), fy = ease(y - iy);
    const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
    const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

/**
 * Biome for a place on Gaia. `lat` is the latitude in degrees (sign ignored), `land` and `detail` are noise values in 0..1
 * (`land` below 0.4 is sea; a high `detail` on land is mountains and, in the desert band, dunes versus rock).
 * Bands: snow caps beyond 72 degrees, tundra, boreal and temperate forest toward the middle, deserts around 18 to 33
 * degrees and tropics on the equator, with seas and mountains breaking the bands up.
 */
export function biomeAt(lat, land, detail) {
  const a = Math.abs(lat);
  if (a >= 72) return 'snow';
  if (land < 0.4) return land < 0.32 ? 'deepOcean' : 'ocean';
  if (detail > 0.84 && a > 12) return a > 50 ? 'snow' : 'rock';
  if (a >= 60) return 'tundra';
  if (a >= 45) return 'boreal';
  if (a >= 33) return 'temperate';
  if (a >= 18) return detail > 0.78 ? 'rock' : 'desert';
  return detail > 0.62 ? 'jungle' : 'tropical';
}

/** Builds the planet texture once: one biome id per texel, `TEX_W` by `TEX_H`, row 0 at the north pole. */
export function buildBiomeMap(random) {
  const coarse = makeNoise(random, 6, 3), medium = makeNoise(random, 14, 7), fine = makeNoise(random, 36, 18);
  const warp = makeNoise(random, 9, 5), detailNoise = makeNoise(random, 24, 12), detailFine = makeNoise(random, 60, 30);
  const map = new Uint8Array(TEX_W * TEX_H);
  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W;
      const lat = (0.5 - v) * 180 + (warp(u, v) - 0.5) * 16; // wobble the band edges so they read as coasts and climates, not stripes
      const land = coarse(u, v) * 0.5 + medium(u, v) * 0.32 + fine(u, v) * 0.18;
      const detail = detailNoise(u, v) * 0.7 + detailFine(u, v) * 0.3;
      map[y * TEX_W + x] = ID[biomeAt(lat, land, detail)];
    }
  }
  return map;
}

/** RGB bytes for a biome map, with a little per-texel grain so large regions are not flat. */
function buildColourTexture(map, random) {
  const rgb = new Uint8Array(map.length * 3);
  for (let i = 0; i < map.length; i++) {
    const c = COLOURS[BIOMES[map[i]]], grain = 0.94 + random() * 0.12;
    rgb[i * 3] = Math.min(255, c[0] * grain); rgb[i * 3 + 1] = Math.min(255, c[1] * grain); rgb[i * 3 + 2] = Math.min(255, c[2] * grain);
  }
  return rgb;
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
  const y0 = height * (0.2 + random() * 0.3), y1 = Math.max(y0 + 20, horizonY - height * (0.02 + random() * 0.06));
  return {
    x0: leftToRight ? -margin : width + margin, x1: leftToRight ? width + margin : -margin,
    y0, y1, apex: height * (0.1 + random() * 0.18),
  };
}

/**
 * Creates the scene. `canvas` is the full-screen planet layer, `ballLayer` a positioned element that receives the balls.
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {HTMLElement} options.ballLayer
 * @param {{loading: {spinSpeed:number, axisTilt:number, horizonHeight:number, ballInterval:number, ballFlightTime:number, ballSize:number}}} options.display live settings
 * @param {() => number} options.random seeded generator (same seed, same planet and same flights)
 * @param {boolean} [options.reducedMotion] draw one still frame, no balls
 * @param {Window} [options.win] provides requestAnimationFrame and the viewport size
 */
export function createPlanetScene({ canvas, ballLayer, display, random, reducedMotion = false, win = canvas.ownerDocument.defaultView }) {
  const doc = canvas.ownerDocument;
  const biomes = buildBiomeMap(random);
  const texture = buildColourTexture(biomes, random);
  const ctx = canvas.getContext?.('2d') ?? null;
  const SCALE = 4; // CSS px per buffer pixel; the canvas is stretched up with smoothing
  let layout = null, image = null, frameId = null, last = null, spin = 0, clock = 0, nextBall = 0, disposed = false, geometryKey = '';
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
        shade[i] = Math.max(0.5, Math.min(1.12, 0.5 + 0.62 * Math.max(0, (dx * sun[0] + dy * sun[1] + dz * sun[2]) / sunLen)));
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

  /** Draws the planet at the current spin. */
  function draw() {
    const { w, h } = viewport();
    const s = settings();
    if (!layout || geometryKey !== `${w}x${h}:${s.axisTilt}:${s.horizonHeight}`) buildGeometry(w, h);
    if (!ctx || !image) return;
    const { bw, bh, rows, lon, shade, rim, glow, kind } = layout, px = image.data, turn = spin / 360;
    for (let i = 0, n = bw * bh; i < n; i++) {
      const o = i * 4;
      if (kind[i]) {
        const col = ((((lon[i] + turn) % 1) + 1) % 1 * TEX_W) | 0, t = (rows[i] * TEX_W + col) * 3, k = shade[i], a = rim[i];
        px[o] = Math.min(255, texture[t] * k + 150 * a); px[o + 1] = Math.min(255, texture[t + 1] * k + 205 * a); px[o + 2] = Math.min(255, texture[t + 2] * k + 255 * a); px[o + 3] = 255;
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
    ballLayer.append(el);
    balls.push({ el, flight: planFlight(random, w, h, size, horizonY), age: 0, duration: s.ballFlightTime });
  }

  function moveBalls() {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i], t = b.age / b.duration;
      if (t >= 1) { b.el.remove(); balls.splice(i, 1); continue; }
      const p = ballPose(b.flight, t);
      b.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${p.spin.toFixed(0)}deg) scale(${p.scale.toFixed(3)})`;
    }
  }

  /** Advances the scene by `dt` seconds and redraws. Exposed so tests and the animation loop share one path. */
  function step(dt) {
    if (disposed) return;
    const s = settings();
    clock += dt;
    if (!reducedMotion) {
      spin = (spin + s.spinSpeed * dt) % 360;
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
    get biomes() { return biomes; },
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
