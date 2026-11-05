/** Small seeded noise helpers shared by the loading-screen planet and moons (src/ui/planet-scene.js, src/ui/worlds.js). */

/** Seeded generator so the same load always paints the same worlds. */
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

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const mix = (a, b, t) => a + (b - a) * t;

/** Hermite step: 0 at or beyond `a`, 1 at or beyond `b` (works when a > b too). */
export function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Smooth value noise on a grid that wraps horizontally (u in [0,1)), so a sphere texture has no seam. Returns f(u, v) in [0,1]. */
export function makeNoise(random, cellsX, cellsY) {
  const grid = Array.from({ length: (cellsY + 1) * cellsX }, () => random());
  const at = (ix, iy) => grid[iy * cellsX + ((ix % cellsX) + cellsX) % cellsX];
  const ease = t => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cellsX, y = clamp(v, 0, 0.999999) * cellsY;
    const ix = Math.floor(x), iy = Math.floor(y), fx = ease(x - ix), fy = ease(y - iy);
    const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
    const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

/** Sum of noise octaves (each twice as fine, half as strong), normalised to 0..1. */
export function makeFbm(random, cellsX, cellsY, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, i) => makeNoise(random, cellsX * 2 ** i, cellsY * 2 ** i));
  const total = layers.reduce((s, _, i) => s + 0.5 ** i, 0);
  return (u, v) => layers.reduce((s, f, i) => s + f(u, v) * 0.5 ** i, 0) / total;
}
