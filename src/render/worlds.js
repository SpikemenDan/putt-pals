/**
 * Surface maps of Ares and Luna for the loading-screen sky (VIS-M1), drawn as real spheres by planet-scene.js so a later planet menu can
 * fly to them. Original art: invented terrain, not maps of Mars or the Moon.
 *
 * Ares is rugged and rust-coloured with dark basalt plains, a long canyon, big volcanoes, craters and small polar caps. Luna is Gaia's
 * barren moon: pale highlands, dark maria, many overlapping craters with bright rims. Plain data; randomness is injected.
 */

import { clamp, makeFbm, makeNoise, mix, smooth } from './noise.js';

export const WORLD_TEX_W = 512;
export const WORLD_TEX_H = 256;

const INK = [20, 16, 42];

/** Adds craters to a `tone` multiplier map: dark bowl, bright raised rim, faint ejecta halo. `bright` lightens the whole stamp (volcano look). */
function stampCraters(tone, random, count, minR, maxR, { bright = 0, rim = 0.32 } = {}) {
  for (let n = 0; n < count; n++) {
    const r = minR + (maxR - minR) * random() ** 2.2, cx = random() * WORLD_TEX_W, cy = (0.12 + random() * 0.76) * WORLD_TEX_H;
    const stretch = 1 / Math.max(0.25, Math.cos((cy / WORLD_TEX_H - 0.5) * Math.PI)); // wider near the poles so craters stay round on the sphere
    const rx = Math.ceil(r * 1.4 * stretch);
    for (let dy = -Math.ceil(r * 1.4); dy <= Math.ceil(r * 1.4); dy++) {
      const y = Math.round(cy) + dy;
      if (y < 0 || y >= WORLD_TEX_H) continue;
      for (let dx = -rx; dx <= rx; dx++) {
        const x = (((Math.round(cx) + dx) % WORLD_TEX_W) + WORLD_TEX_W) % WORLD_TEX_W, d = Math.hypot(dx / stretch, dy) / r, i = y * WORLD_TEX_W + x;
        if (d < 0.82) tone[i] *= 1 - 0.34 * (1 - d / 0.82) * (1 - bright) + bright * 0.12;
        else if (d < 1) tone[i] *= 1 + rim * smooth(0.82, 0.94, d) * (1 - smooth(0.94, 1, d));
        else if (d < 1.4) tone[i] *= 1 + 0.07 * (1 - smooth(1, 1.4, d));
      }
    }
  }
}

/** Ares texture: rust deserts, dark basalt plains, a long canyon, volcanoes, craters and polar caps. */
export function buildAresTexture(random) {
  const base = makeFbm(random, 5, 3, 5), plains = makeFbm(random, 3, 2, 4), dust = makeFbm(random, 9, 4, 3), ridge = makeNoise(random, 12, 4), warp = makeNoise(random, 6, 3);
  const tone = new Float32Array(WORLD_TEX_W * WORLD_TEX_H).fill(1);
  stampCraters(tone, random, 26, 4, 22);
  for (let k = 0; k < 3; k++) stampCraters(tone, random, 1, 22, 34, { bright: 0.9, rim: 0.12 }); // three broad shield volcanoes
  const rgb = new Uint8Array(WORLD_TEX_W * WORLD_TEX_H * 3);
  const sand = [226, 140, 82], rust = [182, 86, 48], basalt = [104, 56, 48], pale = [244, 190, 128], cap = [250, 244, 240];
  for (let y = 0; y < WORLD_TEX_H; y++) {
    const v = (y + 0.5) / WORLD_TEX_H, lat = Math.abs(0.5 - v) * 180;
    for (let x = 0; x < WORLD_TEX_W; x++) {
      const u = x / WORLD_TEX_W, i = y * WORLD_TEX_W + x;
      let t = base(u, v), c = [mix(rust[0], sand[0], t), mix(rust[1], sand[1], t), mix(rust[2], sand[2], t)];
      const p = smooth(0.5, 0.64, plains(u, v)); // dark volcanic plains
      c = c.map((q, k) => mix(q, basalt[k], p * 0.85));
      const d = smooth(0.58, 0.8, dust(u, v)); // bright windblown dust
      c = c.map((q, k) => mix(q, pale[k], d * 0.5 * (1 - p)));
      const w = (warp(u, v) - 0.5) * 0.12, canyon = 1 - Math.min(1, Math.abs(v - 0.54 - w) / 0.018) * (0.4 + ridge(u * 0.7, v) * 0.6); // a long, wandering valley
      if (u > 0.2 && u < 0.62 && canyon > 0.35) c = c.map((q, k) => mix(q, INK[k] + 30, (canyon - 0.35) * 0.9));
      const capW = smooth(76, 84, lat) * 0.95;
      c = c.map((q, k) => mix(q, cap[k], capW));
      const g = tone[i] * (0.96 + 0.08 * ((x * 7 + y * 13) % 5) / 4);
      rgb[i * 3] = clamp(c[0] * g, 0, 255); rgb[i * 3 + 1] = clamp(c[1] * g, 0, 255); rgb[i * 3 + 2] = clamp(c[2] * g, 0, 255);
    }
  }
  return rgb;
}

/** Luna texture: pale highlands, dark maria with soft edges, and many overlapping craters. */
export function buildLunaTexture(random) {
  const base = makeFbm(random, 6, 3, 5), maria = makeFbm(random, 3, 2, 4), fine = makeNoise(random, 64, 32);
  const tone = new Float32Array(WORLD_TEX_W * WORLD_TEX_H).fill(1);
  stampCraters(tone, random, 90, 2.5, 12);
  stampCraters(tone, random, 14, 12, 26);
  const rgb = new Uint8Array(WORLD_TEX_W * WORLD_TEX_H * 3);
  for (let y = 0; y < WORLD_TEX_H; y++) {
    const v = (y + 0.5) / WORLD_TEX_H;
    for (let x = 0; x < WORLD_TEX_W; x++) {
      const u = x / WORLD_TEX_W, i = y * WORLD_TEX_W + x, h = base(u, v), m = smooth(0.5, 0.6, maria(u, v));
      const light = 186 + (h - 0.5) * 70 + (fine(u, v) - 0.5) * 14;
      const g = tone[i], dark = mix(1, 0.52, m); // maria: darker, a little warmer
      rgb[i * 3] = clamp(light * dark * g * 1.02, 0, 255); rgb[i * 3 + 1] = clamp(light * dark * g, 0, 255); rgb[i * 3 + 2] = clamp(light * dark * g * (1.06 - m * 0.08), 0, 255);
    }
  }
  return rgb;
}
