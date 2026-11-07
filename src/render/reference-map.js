/**
 * The flat master map of Gaia, painted from the reference world (src/shared/gaia-reference.js, imported from the owner's Azgaar map).
 *
 * The reference's land, lakes, biomes, rivers and heights are kept as they are; this only draws them cleanly: each biome area is smoothed as
 * a coverage field and cut per pixel, so neighbouring biomes share one clean edge with no gaps; the coast and lakes are inked; high ground is
 * painted as grey rock in three cel-shaded bands, rising to snow, lit from the north-west; each biome gets a few hand-feeling marks. `REFERENCE_LOOKS` holds the styles.
 */

import { BIOMES, BIOME_COLOURS, GRID_COLUMNS, GRID_ROWS, GRID_SPACING, HEIGHTS, LAKES, LAND, MAP_HEIGHT, MAP_WIDTH, RIVERS } from '../shared/gaia-reference.js';

export const MAP_ART_W = 4096, MAP_ART_H = 2048;
const FIELD_W = 2048, FIELD_H = 1024;

/** Height bands, on the reference's 0-100 scale (20 is the coast): rock, high rock and snow. Kinds 13 to 15 in the colour lists. */
export const ROCK = 54, HIGH_ROCK = 63, SNOW = 72;

/** Styles. Biome colours are by the reference's biome index (1 hot desert ... 12 wetland), then rock, high rock and snow. */
export const REFERENCE_LOOKS = Object.freeze({
  faithful: { sea: '#c7ecff', shelf: '#a9dcf4', wave: '#b3e1f7', ink: '#2b5f86', inner: 0.16, lakeFill: '#d2ebf7', river: '#3a9ad6', mark: 0.45, biome: [...BIOME_COLOURS, '#aaa49c', '#c9c3bb', '#f6f8fa'] },
  comic: {
    sea: '#2f9be8', shelf: '#68c4f0', wave: '#86d2f5', ink: '#14102a', inner: 0.32, lakeFill: '#5cbcf0', river: '#2f8fe0', mark: 0.85,
    biome: ['#2f9be8', '#ffdf8a', '#cdc78c', '#e6cf55', '#b2d968', '#9fd34a', '#3fb557', '#2ea443', '#2f8a4a', '#3d6b3a', '#a98a5e', '#f3f9fc', '#3fb8a0', '#9e9aa8', '#c2bec9', '#f6f9fc'],
  },
});

const sx = x => x / 10 / MAP_WIDTH, sy = y => y / 10 / MAP_HEIGHT;

/** A Path2D of flat [x, y, ...] rings, scaled to a canvas `w` by `h`. */
function ringsPath(rings, w, h) {
  const path = new Path2D();
  for (const r of rings) {
    for (let k = 0; k < r.length; k += 2) (k ? path.lineTo(sx(r[k]) * w, sy(r[k + 1]) * h) : path.moveTo(sx(r[k]) * w, sy(r[k + 1]) * h));
    path.closePath();
  }
  return path;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let k = -r; k <= r; k++) s += src[y * w + Math.min(w - 1, Math.max(0, k))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}

/** The biome under each pixel of a FIELD_W by FIELD_H grid, from smoothed coverage of every biome area: index into the reference's biomes. */
export function biomeField(doc) {
  const canvas = doc.createElement('canvas'), g = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = FIELD_W; canvas.height = FIELD_H;
  const n = FIELD_W * FIELD_H, best = new Float32Array(n), kinds = new Uint8Array(n);
  for (const { id, rings } of BIOMES) {
    g.clearRect(0, 0, FIELD_W, FIELD_H);
    g.fillStyle = '#fff'; g.fill(ringsPath(rings, FIELD_W, FIELD_H), 'evenodd');
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(ringsPath(rings, FIELD_W, FIELD_H)); // reach a little past the edge, so no seam is left uncovered
    const px = g.getImageData(0, 0, FIELD_W, FIELD_H).data, cover = new Float32Array(n);
    for (let i = 0; i < n; i++) cover[i] = px[i * 4 + 3] / 255;
    const soft = boxBlur(boxBlur(cover, FIELD_W, FIELD_H, 3), FIELD_W, FIELD_H, 3);
    for (let i = 0; i < n; i++) if (soft[i] > best[i]) { best[i] = soft[i]; kinds[i] = id; }
  }
  return kinds;
}

/** The reference's height grid, smoothed onto the FIELD_W by FIELD_H grid, so rock edges are soft curves rather than grid cells. */
export function heightField() {
  const grid = HEIGHTS.split(',').map(Number), out = new Float32Array(FIELD_W * FIELD_H);
  const at = (c, r) => grid[Math.min(GRID_ROWS - 1, Math.max(0, r)) * GRID_COLUMNS + Math.min(GRID_COLUMNS - 1, Math.max(0, c))] ?? 0;
  for (let y = 0; y < FIELD_H; y++) {
    const gy = (y + 0.5) / FIELD_H * MAP_HEIGHT / GRID_SPACING - 0.5, r = Math.floor(gy), ty = gy - r;
    for (let x = 0; x < FIELD_W; x++) {
      const gx = (x + 0.5) / FIELD_W * MAP_WIDTH / GRID_SPACING - 0.5, c = Math.floor(gx), tx = gx - c;
      const wobble = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) * Math.sin(y * 0.13 + Math.sin(x * 0.05) * 2) * 2.2; // irregular, hand-drawn edges
      out[y * FIELD_W + x] = (at(c, r) * (1 - tx) + at(c + 1, r) * tx) * (1 - ty) + (at(c, r + 1) * (1 - tx) + at(c + 1, r + 1) * tx) * ty + wobble;
    }
  }
  return boxBlur(boxBlur(out, FIELD_W, FIELD_H, 4), FIELD_W, FIELD_H, 3);
}

/** Light on high ground from the north-west, in three cel bands, so ranges read as shapes and not as flat grey. 1 means unlit change. */
function reliefShade(heights) {
  const shade = new Float32Array(FIELD_W * FIELD_H).fill(1);
  for (let y = 1; y < FIELD_H - 1; y++) for (let x = 1; x < FIELD_W - 1; x++) {
    const i = y * FIELD_W + x, slope = heights[i - FIELD_W - 1] - heights[i + FIELD_W + 1];
    shade[i] = slope > 0.55 ? 1.1 : slope < -0.55 ? 0.82 : 1;
  }
  return shade;
}

function biomeImage(doc, kinds, look, shade) {
  const layer = doc.createElement('canvas'), g = layer.getContext('2d');
  layer.width = MAP_ART_W; layer.height = MAP_ART_H;
  const image = g.createImageData(MAP_ART_W, MAP_ART_H), px = image.data, out = new Uint8Array(MAP_ART_W * MAP_ART_H);
  const colours = look.biome.map(c => c.match(/\w\w/g).map(q => parseInt(q, 16))), fx = FIELD_W / MAP_ART_W, fy = FIELD_H / MAP_ART_H;
  for (let y = 0; y < MAP_ART_H; y++) {
    const ry = Math.min(FIELD_H - 1, Math.floor(y * fy));
    for (let x = 0; x < MAP_ART_W; x++) out[y * MAP_ART_W + x] = kinds[ry * FIELD_W + Math.min(FIELD_W - 1, Math.floor(x * fx))];
  }
  const ink = look.ink.match(/\w\w/g).map(q => parseInt(q, 16));
  for (let y = 0; y < MAP_ART_H; y++) for (let x = 0; x < MAP_ART_W; x++) {
    const i = y * MAP_ART_W + x, k = out[i], c = colours[k] ?? colours[0], o = i * 4;
    const edge = (x + 2 < MAP_ART_W && out[i + 2] !== k) || (y + 2 < MAP_ART_H && out[i + 2 * MAP_ART_W] !== k), m = edge ? look.inner : 0;
    const lit = k >= 13 ? Math.min(1.12, shade[Math.min(FIELD_H - 1, Math.floor(y * fy)) * FIELD_W + Math.min(FIELD_W - 1, Math.floor(x * fx))] * (k === 15 ? 0.5 : 1) + (k === 15 ? 0.5 : 0)) : 1;
    px[o] = Math.min(255, c[0] * lit) * (1 - m) + ink[0] * m; px[o + 1] = Math.min(255, c[1] * lit) * (1 - m) + ink[1] * m; px[o + 2] = Math.min(255, c[2] * lit * (lit < 1 ? 1.04 : 1)) * (1 - m) + ink[2] * m; px[o + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  // The field is half the art's size: soften its stair steps with one light blur pass, drawn back over itself.
  const smooth = doc.createElement('canvas');
  smooth.width = MAP_ART_W; smooth.height = MAP_ART_H;
  const s = smooth.getContext('2d');
  s.filter = 'blur(1.2px)'; s.drawImage(layer, 0, 0);
  return smooth;
}

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A few marks per biome that say what it is at map scale. */
function paintMarks(g, kinds, look, random) {
  const dark = (k, f) => { const c = look.biome[k].match(/\w\w/g).map(q => parseInt(q, 16)); return `rgb(${c.map(q => Math.round(q * f)).join(',')})`; };
  g.globalAlpha = look.mark; g.lineCap = 'round';
  for (let n = 0; n < 12000; n++) {
    const fx = Math.floor(random() * FIELD_W), fy = Math.floor(random() * FIELD_H), k = kinds[fy * FIELD_W + fx];
    if (!k) continue;
    const x = (fx + random()) * MAP_ART_W / FIELD_W, y = (fy + random()) * MAP_ART_H / FIELD_H;
    if (k >= 5 && k <= 9) { if (random() > (k === 9 ? 0.55 : 0.5)) continue; g.strokeStyle = dark(k, 0.74); g.lineWidth = 3; g.beginPath(); g.arc(x - 8, y, 8, Math.PI, 0); g.arc(x + 8, y, 8, Math.PI, 0); g.stroke(); }
    else if (k === 1) { if (random() > 0.35) continue; g.strokeStyle = dark(k, 0.84); g.lineWidth = 3; g.beginPath(); g.moveTo(x - 24, y + 4); g.quadraticCurveTo(x, y - 10, x + 24, y + 4); g.stroke(); }
    else if (k === 3 || k === 4) { if (random() > 0.25) continue; g.strokeStyle = dark(k, 0.78); g.lineWidth = 2.4; for (const d of [-5, 0, 5]) { g.beginPath(); g.moveTo(x + d * 0.5, y + 6); g.lineTo(x + d, y - 6); g.stroke(); } }
    else if (k === 2 || k === 10) { if (random() > 0.25) continue; g.fillStyle = dark(k, 0.8); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    else if (k === 12) { if (random() > 0.6) continue; g.strokeStyle = dark(k, 0.7); g.lineWidth = 2.4; g.beginPath(); g.moveTo(x - 12, y); g.quadraticCurveTo(x - 4, y - 5, x + 2, y); g.quadraticCurveTo(x + 8, y + 5, x + 14, y); g.stroke(); }
  }
  g.globalAlpha = 1;
}

/**
 * Paints the flat master map in a look. Returns { canvas, kinds }, `kinds` the biome field it used.
 * @param {Document} doc
 * @param {keyof typeof REFERENCE_LOOKS} [name]
 */
export function paintReferenceMap(doc, name = 'comic') {
  const look = REFERENCE_LOOKS[name] ?? REFERENCE_LOOKS.comic, canvas = doc.createElement('canvas');
  canvas.width = MAP_ART_W; canvas.height = MAP_ART_H;
  const g = canvas.getContext('2d');
  if (!g) return { canvas, kinds: null };
  const random = mulberry(31), coast = ringsPath(LAND, MAP_ART_W, MAP_ART_H), lakes = ringsPath(LAKES, MAP_ART_W, MAP_ART_H), kinds = biomeField(doc), heights = heightField();
  for (let i = 0; i < kinds.length; i++) if (kinds[i] && kinds[i] !== 11) kinds[i] = heights[i] >= SNOW ? 15 : heights[i] >= HIGH_ROCK ? 14 : heights[i] >= ROCK ? 13 : kinds[i]; // high ground is rock, not forest
  g.fillStyle = look.sea; g.fillRect(0, 0, MAP_ART_W, MAP_ART_H);
  g.lineJoin = 'round';
  g.strokeStyle = look.shelf; g.lineWidth = 14; g.stroke(coast);
  g.strokeStyle = look.wave; g.lineWidth = 3; g.lineCap = 'round';
  for (let n = 0; n < 420; n++) {
    const x = random() * MAP_ART_W, y = random() * MAP_ART_H;
    if (g.isPointInPath(coast, x, y) || g.isPointInStroke?.(coast, x, y)) continue;
    g.beginPath(); g.moveTo(x - 15, y); g.quadraticCurveTo(x - 8, y - 6, x, y); g.quadraticCurveTo(x + 8, y + 6, x + 15, y); g.stroke();
  }
  g.save(); g.clip(coast);
  g.drawImage(biomeImage(doc, kinds, look, reliefShade(heights)), 0, 0);
  paintMarks(g, kinds, look, random);
  g.strokeStyle = look.river; g.lineCap = g.lineJoin = 'round';
  for (const r of RIVERS) for (let k = 3; k < r.length; k += 3) { // each river widens toward its mouth, as in the reference
    g.lineWidth = Math.max(1.6, r[k + 2] / 10 / MAP_WIDTH * MAP_ART_W * 0.85);
    g.beginPath(); g.moveTo(sx(r[k - 3]) * MAP_ART_W, sy(r[k - 2]) * MAP_ART_H); g.lineTo(sx(r[k]) * MAP_ART_W, sy(r[k + 1]) * MAP_ART_H); g.stroke();
  }
  g.fillStyle = look.lakeFill; g.fill(lakes);
  g.strokeStyle = look.ink; g.lineWidth = 3; g.stroke(lakes);
  g.restore();
  g.strokeStyle = look.ink; g.lineWidth = 6; g.lineJoin = 'round'; g.stroke(coast);
  return { canvas, kinds };
}
