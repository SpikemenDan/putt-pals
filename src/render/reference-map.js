/**
 * The flat master map of Gaia, painted from the reference world (src/shared/gaia-reference.js, imported from the owner's Azgaar map).
 *
 * The reference's land, lakes, biomes, rivers and heights are kept as they are; this only draws them cleanly: each biome area is smoothed as
 * a coverage field and cut per pixel, so neighbouring biomes share one clean edge with no gaps; the coast and lakes are inked; high ground is
 * painted as grey rock in three cel-shaded bands, rising to snow, lit from the north-west, with a darker-grey outline all the way round; each
 * biome gets a few hand-feeling marks; the Emberfall volcanoes sit in basalt. `REFERENCE_LOOKS` holds the styles.
 *
 * The whole world paints at MAP_ART_W by MAP_ART_H. A `view` paints any window of it at any size, for sharp close-ups: every line, mark and
 * smoothing radius scales with the zoom and every mark sits where the whole-world painting puts it, so a close-up is the same picture,
 * only crisper. DOM-free apart from the canvases `doc` makes, so it also runs in a worker with OffscreenCanvas (map-paint.js).
 */

import { BASALT_TEXELS, VOLCANO_SITES, basaltShape } from '../shared/gaia-reference-regions.js';
import { BIOMES, BIOME_COLOURS, GRID_COLUMNS, GRID_ROWS, GRID_SPACING, HEIGHTS, LAKES, LAND, MAP_HEIGHT, MAP_WIDTH, RIVERS } from '../shared/gaia-reference.js';

export const MAP_ART_W = 4096, MAP_ART_H = 2048;

/** Height bands, on the reference's 0-100 scale (20 is the coast): rock, high rock and snow. Kinds 13 to 15 in the colour lists. */
export const ROCK = 54, HIGH_ROCK = 63, SNOW = 72;

/** Styles. Biome colours are by the reference's biome index (1 hot desert ... 12 wetland), then rock, high rock and snow. */
export const REFERENCE_LOOKS = Object.freeze({
  faithful: { sea: '#c7ecff', shelf: '#a9dcf4', wave: '#b3e1f7', ink: '#2b5f86', inner: 0.16, lakeFill: '#d2ebf7', river: '#3a9ad6', mark: 0.45, basalt: '#6a6070', basaltEdge: '#4a414f', lava: '#ff8a3d', biome: [...BIOME_COLOURS, '#aaa49c', '#c9c3bb', '#f6f8fa'] },
  comic: {
    sea: '#2f9be8', shelf: '#68c4f0', wave: '#86d2f5', ink: '#14102a', inner: 0.32, lakeFill: '#5cbcf0', river: '#2f8fe0', mark: 0.85, basalt: '#40364a', basaltEdge: '#2a2232', lava: '#ff7a2f',
    biome: ['#2f9be8', '#ffdf8a', '#cdc78c', '#e6cf55', '#b2d968', '#9fd34a', '#3fb557', '#2ea443', '#2f8a4a', '#3d6b3a', '#a98a5e', '#f3f9fc', '#3fb8a0', '#9e9aa8', '#c2bec9', '#f6f9fc'],
  },
});

/** Whole-world painting pixels per reference map pixel. Line widths and mark sizes below are in whole-world painting pixels. */
const WORLD_K = MAP_ART_W / MAP_WIDTH, WORLD_KY = MAP_ART_H / MAP_HEIGHT;

/**
 * A frame: the window `view` ({x, y, w, h} in reference map pixels) painted at `width` by `height`. `z` is its zoom against the whole-world
 * painting; the field (biomes, heights) is half the frame's size.
 */
function frameOf(view, width, height) {
  const v = view ?? { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT }, W = Math.round(width ?? MAP_ART_W), H = Math.round(height ?? MAP_ART_H);
  return { ...v, W, H, FW: Math.round(W / 2), FH: Math.round(H / 2), z: W / (v.w * WORLD_K), ax: x => (x - v.x) / v.w * W, ay: y => (y - v.y) / v.h * H };
}

/** A Path2D of flat [x, y, ...] rings (map pixels times ten) in a frame scaled to `w` by `h`. */
function ringsPath(rings, f, w = f.W, h = f.H) {
  const path = new Path2D(), px = x => (x / 10 - f.x) / f.w * w, py = y => (y / 10 - f.y) / f.h * h;
  for (const r of rings) {
    for (let k = 0; k < r.length; k += 2) (k ? path.lineTo(px(r[k]), py(r[k + 1])) : path.moveTo(px(r[k]), py(r[k + 1])));
    path.closePath();
  }
  return path;
}

function boxBlur(src, w, h, r) {
  r = Math.max(1, Math.round(r));
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let k = -r; k <= r; k++) s += src[y * w + Math.min(w - 1, Math.max(0, k))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}

/** The biome under each pixel of the frame's field, from smoothed coverage of every biome area: index into the reference's biomes. */
function biomeField(doc, f) {
  const canvas = doc.createElement('canvas'), g = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = f.FW; canvas.height = f.FH;
  const n = f.FW * f.FH, best = new Float32Array(n), kinds = new Uint8Array(n);
  for (const { id, rings } of BIOMES) {
    g.clearRect(0, 0, f.FW, f.FH);
    const path = ringsPath(rings, f, f.FW, f.FH);
    g.fillStyle = '#fff'; g.fill(path, 'evenodd');
    g.strokeStyle = '#fff'; g.lineWidth = 3 * f.z; g.stroke(path); // reach a little past the edge, so no seam is left uncovered
    const px = g.getImageData(0, 0, f.FW, f.FH).data, cover = new Float32Array(n);
    for (let i = 0; i < n; i++) cover[i] = px[i * 4 + 3] / 255;
    const soft = boxBlur(boxBlur(cover, f.FW, f.FH, 3 * f.z), f.FW, f.FH, 3 * f.z);
    for (let i = 0; i < n; i++) if (soft[i] > best[i]) { best[i] = soft[i]; kinds[i] = id; }
  }
  return kinds;
}

/** The reference's height grid, smoothed onto the frame's field, so rock edges are soft curves rather than grid cells. */
function heightField(f) {
  const grid = HEIGHTS.split(',').map(Number), out = new Float32Array(f.FW * f.FH);
  const at = (c, r) => grid[Math.min(GRID_ROWS - 1, Math.max(0, r)) * GRID_COLUMNS + Math.min(GRID_COLUMNS - 1, Math.max(0, c))] ?? 0;
  for (let y = 0; y < f.FH; y++) {
    const my = f.y + (y + 0.5) / f.FH * f.h, gy = my / GRID_SPACING - 0.5, r = Math.floor(gy), ty = gy - r, wy = my * WORLD_KY / 2;
    for (let x = 0; x < f.FW; x++) {
      const mx = f.x + (x + 0.5) / f.FW * f.w, gx = mx / GRID_SPACING - 0.5, c = Math.floor(gx), tx = gx - c, wx = mx * WORLD_K / 2;
      const wobble = Math.sin(wx * 0.11 + Math.sin(wy * 0.07) * 2) * Math.sin(wy * 0.13 + Math.sin(wx * 0.05) * 2) * 2.2; // irregular, hand-drawn edges
      out[y * f.FW + x] = (at(c, r) * (1 - tx) + at(c + 1, r) * tx) * (1 - ty) + (at(c, r + 1) * (1 - tx) + at(c + 1, r + 1) * tx) * ty + wobble;
    }
  }
  return boxBlur(boxBlur(out, f.FW, f.FH, 4 * f.z), f.FW, f.FH, 3 * f.z);
}

/** Light on high ground from the north-west, in three cel bands, so ranges read as shapes and not as flat grey. 1 means unlit change. */
function reliefShade(heights, f) {
  const shade = new Float32Array(f.FW * f.FH).fill(1), d = Math.max(1, Math.round(f.z));
  for (let y = d; y < f.FH - d; y++) for (let x = d; x < f.FW - d; x++) {
    const i = y * f.FW + x, slope = heights[i - (f.FW + 1) * d] - heights[i + (f.FW + 1) * d];
    shade[i] = slope > 0.55 ? 1.1 : slope < -0.55 ? 0.82 : 1;
  }
  return shade;
}

function biomeImage(doc, kinds, look, shade, f) {
  const layer = doc.createElement('canvas'), g = layer.getContext('2d'), { W, H, FW, FH } = f;
  layer.width = W; layer.height = H;
  const image = g.createImageData(W, H), px = image.data, out = new Uint8Array(W * H);
  const colours = look.biome.map(c => c.match(/\w\w/g).map(q => parseInt(q, 16))), fx = FW / W, fy = FH / H;
  for (let y = 0; y < H; y++) {
    const ry = Math.min(FH - 1, Math.floor(y * fy));
    for (let x = 0; x < W; x++) out[y * W + x] = kinds[ry * FW + Math.min(FW - 1, Math.floor(x * fx))];
  }
  const ink = look.ink.match(/\w\w/g).map(q => parseInt(q, 16));
  // Neighbours to test for rock edges: every direction, out to the line's width, so the outline closes all the way round each patch.
  const ring = r => [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [r, -r], [-r, r], [-r, -r]], steps = n => Array.from({ length: Math.max(1, Math.round(n * f.z)) }, (_, k) => k + 1);
  const OUTER = steps(3).flatMap(ring), INNER = steps(2).flatMap(ring), edgeStep = Math.max(1, Math.round(2 * f.z));
  const beyond = (x, y, offsets, test) => offsets.some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < W && yy < H && test(out[yy * W + xx]); });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = out[i], c = colours[k] ?? colours[0], o = i * 4;
    // Rock has its own edges, on the rock side, in darker shades of the rock rather than the ink colour, as each biome's edge reads as a
    // darker shade of that biome: an outline wherever rock meets anything else (land, ice or water), and a lighter line where a higher
    // band meets a lower one. Land next to rock draws no line, so each border has exactly one.
    if (k >= 13) {
      const outer = beyond(x, y, OUTER, q => q < 13), inner = !outer && beyond(x, y, INNER, q => q >= 13 && q < k);
      const tone = outer ? colours[13].map(q => q * 0.6) : inner ? colours[k - 1].map(q => q * 0.84) : null;
      const lit = Math.min(1.12, shade[Math.min(FH - 1, Math.floor(y * fy)) * FW + Math.min(FW - 1, Math.floor(x * fx))] * (k === 15 ? 0.5 : 1) + (k === 15 ? 0.5 : 0));
      const v = tone ?? [Math.min(255, c[0] * lit), Math.min(255, c[1] * lit), Math.min(255, c[2] * lit * (lit < 1 ? 1.04 : 1))];
      px[o] = v[0]; px[o + 1] = v[1]; px[o + 2] = v[2]; px[o + 3] = 255;
      continue;
    }
    const e = [x + edgeStep < W ? out[i + edgeStep] : k, y + edgeStep < H ? out[i + edgeStep * W] : k];
    const m = (e[0] !== k && e[0] < 13) || (e[1] !== k && e[1] < 13) ? look.inner : 0;
    px[o] = c[0] * (1 - m) + ink[0] * m; px[o + 1] = c[1] * (1 - m) + ink[1] * m; px[o + 2] = c[2] * (1 - m) + ink[2] * m; px[o + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  // The field is half the art's size: soften its stair steps with one light blur pass, drawn back over itself.
  const smooth = doc.createElement('canvas');
  smooth.width = W; smooth.height = H;
  const s = smooth.getContext('2d');
  s.filter = 'blur(1.2px)'; s.drawImage(layer, 0, 0); // the field is drawn at this frame's own resolution, so a close-up stays crisp
  return smooth;
}

/**
 * The Emberfall volcanoes: an uneven field of dark basalt round each, the same size, shape and place as on the globe (planet-data.js:
 * BASALT_TEXELS of a 1024-wide map, wider toward the poles as the projection stretches it), edged in a darker basalt, with a glowing crater.
 */
function paintVolcanoes(g, look, f) {
  for (const [v, [mx, my]] of VOLCANO_SITES.entries()) {
    const random = mulberry(77 + v), r = BASALT_TEXELS[v] / 1024 * MAP_ART_W * f.z, x = f.ax(mx), y = f.ay(my), lat = 90 - my / MAP_HEIGHT * 180, stretch = 1 / Math.max(0.3, Math.cos(lat * Math.PI / 180));
    g.beginPath();
    for (let a = 0; a < 72; a++) { const t = a / 72 * Math.PI * 2, reach = r * basaltShape(v, t) * (0.97 + random() * 0.06); g.lineTo(x + Math.cos(t) * reach * stretch, y + Math.sin(t) * reach); }
    g.closePath();
    g.fillStyle = look.basalt; g.fill();
    g.strokeStyle = look.basaltEdge; g.lineWidth = 5 * f.z; g.stroke();
    g.beginPath(); g.ellipse(x, y, r * 0.42, r * 0.3, 0, 0, Math.PI * 2);
    g.fillStyle = look.lava; g.fill();
    g.strokeStyle = look.ink; g.lineWidth = 3 * f.z; g.stroke();
  }
}

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * A few marks per biome that say what it is at map scale. Each mark has its own seed and a place on the whole world, so a close-up draws
 * exactly the marks the world painting has there, only sharper.
 */
function paintMarks(g, kindAt, look, f) {
  const dark = (k, s) => { const c = look.biome[k].match(/\w\w/g).map(q => parseInt(q, 16)); return `rgb(${c.map(q => Math.round(q * s)).join(',')})`; };
  const z = f.z, margin = 30 * z;
  g.globalAlpha = look.mark; g.lineCap = 'round';
  for (let n = 0; n < 12000; n++) {
    const random = mulberry(5000 + n), mx = random() * MAP_WIDTH, my = random() * MAP_HEIGHT, x = f.ax(mx), y = f.ay(my), roll = random();
    if (x < -margin || y < -margin || x > f.W + margin || y > f.H + margin) continue;
    const k = kindAt(x, y);
    if (!k) continue;
    if (k >= 5 && k <= 9) { if (roll > (k === 9 ? 0.55 : 0.5)) continue; g.strokeStyle = dark(k, 0.74); g.lineWidth = 3 * z; g.beginPath(); g.arc(x - 8 * z, y, 8 * z, Math.PI, 0); g.arc(x + 8 * z, y, 8 * z, Math.PI, 0); g.stroke(); }
    else if (k === 1) { if (roll > 0.35) continue; g.strokeStyle = dark(k, 0.84); g.lineWidth = 3 * z; g.beginPath(); g.moveTo(x - 24 * z, y + 4 * z); g.quadraticCurveTo(x, y - 10 * z, x + 24 * z, y + 4 * z); g.stroke(); }
    else if (k === 3 || k === 4) { if (roll > 0.25) continue; g.strokeStyle = dark(k, 0.78); g.lineWidth = 2.4 * z; for (const d of [-5, 0, 5]) { g.beginPath(); g.moveTo(x + d * 0.5 * z, y + 6 * z); g.lineTo(x + d * z, y - 6 * z); g.stroke(); } }
    else if (k === 2 || k === 10) { if (roll > 0.25) continue; g.fillStyle = dark(k, 0.8); g.beginPath(); g.arc(x, y, 3 * z, 0, 7); g.fill(); }
    else if (k === 12) { if (roll > 0.6) continue; g.strokeStyle = dark(k, 0.7); g.lineWidth = 2.4 * z; g.beginPath(); g.moveTo(x - 12 * z, y); g.quadraticCurveTo(x - 4 * z, y - 5 * z, x + 2 * z, y); g.quadraticCurveTo(x + 8 * z, y + 5 * z, x + 14 * z, y); g.stroke(); }
  }
  g.globalAlpha = 1;
}

/**
 * Paints the flat master map in a look. Returns { canvas, kinds }, `kinds` the biome field it used.
 * @param {{createElement: (tag: 'canvas') => HTMLCanvasElement | OffscreenCanvas}} doc a document, or anything that makes canvases
 * @param {keyof typeof REFERENCE_LOOKS} [name]
 * @param {{view?: {x: number, y: number, w: number, h: number}, width?: number, height?: number}} [frame] a window of the map, in reference
 *   map pixels, and the size to paint it at; the whole world at MAP_ART_W by MAP_ART_H by default
 */
export function paintReferenceMap(doc, name = 'comic', { view = null, width, height } = {}) {
  const f = frameOf(view, width, height), look = REFERENCE_LOOKS[name] ?? REFERENCE_LOOKS.comic, canvas = doc.createElement('canvas');
  canvas.width = f.W; canvas.height = f.H;
  const g = canvas.getContext('2d');
  if (!g) return { canvas, kinds: null };
  const z = f.z, coast = ringsPath(LAND, f), lakes = ringsPath(LAKES, f), kinds = biomeField(doc, f), heights = heightField(f);
  for (let i = 0; i < kinds.length; i++) if (kinds[i] && kinds[i] !== 11) kinds[i] = heights[i] >= SNOW ? 15 : heights[i] >= HIGH_ROCK ? 14 : heights[i] >= ROCK ? 13 : kinds[i]; // high ground is rock, not forest
  g.fillStyle = look.sea; g.fillRect(0, 0, f.W, f.H);
  g.lineJoin = 'round';
  g.strokeStyle = look.shelf; g.lineWidth = 14 * z; g.stroke(coast);
  g.strokeStyle = look.wave; g.lineWidth = 3 * z; g.lineCap = 'round';
  const waves = mulberry(31);
  for (let n = 0; n < 420; n++) {
    const x = f.ax(waves() * MAP_WIDTH), y = f.ay(waves() * MAP_HEIGHT);
    if (x < -20 * z || y < -20 * z || x > f.W + 20 * z || y > f.H + 20 * z || g.isPointInPath(coast, x, y) || g.isPointInStroke?.(coast, x, y)) continue;
    g.beginPath(); g.moveTo(x - 15 * z, y); g.quadraticCurveTo(x - 8 * z, y - 6 * z, x, y); g.quadraticCurveTo(x + 8 * z, y + 6 * z, x + 15 * z, y); g.stroke();
  }
  g.save(); g.clip(coast);
  g.drawImage(biomeImage(doc, kinds, look, reliefShade(heights, f), f), 0, 0);
  const nearRock = boxBlur(Float32Array.from(kinds, k => (k >= 13 ? 1 : 0)), f.FW, f.FH, 5 * z); // grass and trees stay clear of rock outlines
  const kindAt = (x, y) => { const fx = Math.floor(x / f.W * f.FW), fy = Math.floor(y / f.H * f.FH); if (fx < 0 || fy < 0 || fx >= f.FW || fy >= f.FH) return 0; const i = fy * f.FW + fx, k = kinds[i]; return k && k < 13 && nearRock[i] > 0 ? 13 : k; };
  paintMarks(g, kindAt, look, f);
  g.strokeStyle = look.river; g.lineCap = g.lineJoin = 'round';
  for (const r of RIVERS) for (let k = 3; k < r.length; k += 3) { // each river widens toward its mouth, as in the reference
    g.lineWidth = Math.max(1.6, r[k + 2] / 10 * WORLD_K * 0.85) * z;
    g.beginPath(); g.moveTo(f.ax(r[k - 3] / 10), f.ay(r[k - 2] / 10)); g.lineTo(f.ax(r[k] / 10), f.ay(r[k + 1] / 10)); g.stroke();
  }
  g.fillStyle = look.lakeFill; g.fill(lakes);
  g.strokeStyle = look.ink; g.lineWidth = 3 * z; g.stroke(lakes);
  paintVolcanoes(g, look, f);
  g.restore();
  g.strokeStyle = look.ink; g.lineWidth = 6 * z; g.lineJoin = 'round'; g.stroke(coast);
  return { canvas, kinds };
}
