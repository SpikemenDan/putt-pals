/**
 * The master painting of Gaia (VIS-M1): one large flat image of sea and land, made from the shared world data. The level select lays it on its
 * 3D terrain, and the globe is meant to take it next, so the map is drawn once and well.
 *
 * Biome shapes are smoothed as fields and cut per pixel, so their edges are clean curves with no stair steps, and every pixel belongs to exactly
 * one biome. On top go a narrow shelf, drawn wave marks, rivers, and hand-feeling marks per biome: canopy scallops, dune arcs, grass tufts.
 * `MAP_LOOKS` holds the art directions being compared.
 */

import { COAST_RINGS } from '../shared/gaia-coast.js';
import { RANGES } from '../shared/gaia-map.js';
import { BIOMES, SEA, TEX_H, TEX_W, blur, mulberry32 } from './planet-data.js';

export const ART_W = 4096, ART_H = 2048;

/** Art directions: palettes per biome, sea tones, and how strong the drawn marks and inner lines are. */
export const MAP_LOOKS = Object.freeze({
  comic: {
    sea: '#2f9be8', shelf: '#6cc6f0', wave: '#8fd6f6', river: '#2f8fe0', line: 'rgba(20,16,42,.5)', ink: '#14102a', mark: 0.9, side: 0xd9b36a,
    biome: { polar: '#f4fafe', alpine: '#d9d3d6', tundra: '#c2d6a6', boreal: '#2f8a6a', temperate: '#4cbb55', mediterranean: '#b7d05e', grassland: '#8fd65e', savanna: '#e6cf55', desert: '#ffdf8a', tropical: '#14a050', wetland: '#3fb8a0', volcanic: '#4e4350' },
  },
  storybook: {
    sea: '#5fb4d6', shelf: '#93d2e0', wave: '#b4e2ea', river: '#4f9fcf', line: 'rgba(60,70,60,.22)', ink: '#3f4a48', mark: 0.6, side: 0xcdb48c,
    biome: { polar: '#f2f4f2', alpine: '#d6d0c8', tundra: '#c9d2ae', boreal: '#5e9a7c', temperate: '#7fbf72', mediterranean: '#c2cd86', grassland: '#aed184', savanna: '#e0cd8a', desert: '#f2dca8', tropical: '#4fa86c', wetland: '#7fbfa8', volcanic: '#6a5c64' },
  },
  atlas: {
    sea: '#e9dcb8', shelf: '#f4ecd2', wave: '#d3c49a', river: '#6f9fb8', line: 'rgba(70,50,30,.42)', ink: '#4a3524', mark: 0.8, side: 0xb89a6a,
    biome: { polar: '#fbf8ee', alpine: '#c9bda6', tundra: '#c8c79c', boreal: '#6d9068', temperate: '#92ad6a', mediterranean: '#c4bd78', grassland: '#b5bd76', savanna: '#d9bd6e', desert: '#e8c98a', tropical: '#6d9a5c', wetland: '#8cae94', volcanic: '#6a5450' },
  },
});

const X = u => u * ART_W, Y = lat => (0.5 - lat / 180) * ART_H;
const hex = s => s.match(/\w\w/g).map(q => parseInt(q, 16));

function coastPath() {
  const path = new Path2D();
  for (const ring of COAST_RINGS) { ring.forEach(([u, lat], i) => (i ? path.lineTo(X(u), Y(lat)) : path.moveTo(X(u), Y(lat)))); path.closePath(); }
  return path;
}

/** Land colours as an image: smooth biome fields, cut wherever one overtakes another. */
function biomeLayer(doc, planet, look) {
  const layer = doc.createElement('canvas'), g = layer.getContext('2d');
  layer.width = ART_W; layer.height = ART_H;
  const n = TEX_W * TEX_H, fields = BIOMES.map(() => new Float32Array(n));
  // Grow land biomes a little past the shore, so the clipped coast never shows a gap.
  for (let i = 0; i < n; i++) fields[planet.biome[i]][i] = planet.land[i] >= SEA - 0.05 ? 1 : 0;
  const soft = fields.map(f => blur(blur(f, 4), 3)), colours = BIOMES.map(b => hex(look.biome[b]));
  const top = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let best = -1; for (let k = 0; k < soft.length; k++) if (soft[k][i] > best) { best = soft[k][i]; top[i] = k; } }
  const image = g.createImageData(ART_W, ART_H), px = image.data, kinds = new Uint8Array(ART_W * ART_H), sx = TEX_W / ART_W, sy = TEX_H / ART_H;
  for (let y = 0; y < ART_H; y++) {
    const fy = Math.max(0, Math.min(TEX_H - 1.001, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), ty = fy - y0, r0 = y0 * TEX_W, r1 = r0 + TEX_W;
    for (let x = 0; x < ART_W; x++) {
      const fx = (x + 0.5) * sx - 0.5, x0 = Math.floor(fx), tx = fx - x0, xa = (x0 + TEX_W) % TEX_W, xb = (x0 + 1) % TEX_W;
      const a = top[r0 + xa], b = top[r0 + xb], c = top[r1 + xa], e = top[r1 + xb];
      if (a === b && a === c && a === e) { kinds[y * ART_W + x] = a; continue; }
      let best = -1, kind = a; // near an edge: compare the blended fields of only the biomes that meet here
      for (const k of [a, b, c, e]) { const f = soft[k], v = (f[r0 + xa] * (1 - tx) + f[r0 + xb] * tx) * (1 - ty) + (f[r1 + xa] * (1 - tx) + f[r1 + xb] * tx) * ty; if (v > best) { best = v; kind = k; } }
      kinds[y * ART_W + x] = kind;
    }
  }
  const lineAlpha = Number(look.line.match(/[\d.]+\)$/)[0].slice(0, -1)), ink = look.line.match(/\d+/g).slice(0, 3).map(Number);
  for (let y = 0; y < ART_H; y++) for (let x = 0; x < ART_W; x++) {
    const i = y * ART_W + x, k = kinds[i], c = colours[k], o = i * 4, edge = (x + 2 < ART_W && kinds[i + 2] !== k) || (y + 2 < ART_H && kinds[i + 2 * ART_W] !== k), m = edge ? lineAlpha : 0;
    px[o] = c[0] * (1 - m) + ink[0] * m; px[o + 1] = c[1] * (1 - m) + ink[1] * m; px[o + 2] = c[2] * (1 - m) + ink[2] * m; px[o + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  return layer;
}

/** Hand-feeling marks that say what each biome is at map scale. */
function paintMarks(g, planet, look, random) {
  const texel = (u, lat) => Math.min(TEX_H - 1, Math.max(0, Math.floor((0.5 - lat / 180) * TEX_H))) * TEX_W + Math.floor(((u % 1) + 1) % 1 * TEX_W);
  const dark = (colour, f) => { const c = hex(colour); return `rgb(${c.map(q => Math.round(q * f)).join(',')})`; };
  g.lineCap = g.lineJoin = 'round';
  g.globalAlpha = look.mark;
  for (let k = 0; k < 9000; k++) {
    const u = random(), lat = 78 - random() * 136, name = BIOMES[planet.biome[texel(u, lat)]];
    if (planet.land[texel(u, lat)] < SEA + 0.02) continue;
    const x = X(u), y = Y(lat);
    if (name === 'tropical' || name === 'temperate' || name === 'boreal') { // canopy scallops
      if (random() > (name === 'boreal' ? 0.7 : 0.8)) continue;
      g.strokeStyle = dark(look.biome[name], 0.74); g.lineWidth = 3.2;
      g.beginPath(); g.arc(x - 9, y, 9, Math.PI, 0); g.arc(x + 9, y, 9, Math.PI, 0); g.stroke();
    } else if (name === 'desert') {
      if (random() > 0.5) continue;
      g.strokeStyle = dark(look.biome.desert, 0.82); g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - 26, y + 4); g.quadraticCurveTo(x, y - 11, x + 26, y + 4); g.stroke();
    } else if (name === 'grassland' || name === 'savanna' || name === 'mediterranean') {
      if (random() > 0.32) continue;
      g.strokeStyle = dark(look.biome[name], 0.78); g.lineWidth = 2.6;
      for (const d of [-5, 0, 5]) { g.beginPath(); g.moveTo(x + d * 0.5, y + 6); g.lineTo(x + d, y - 6); g.stroke(); }
    } else if (name === 'tundra') {
      if (random() > 0.3) continue;
      g.fillStyle = dark(look.biome.tundra, 0.8); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
    } else if (name === 'wetland') {
      g.strokeStyle = dark(look.biome.wetland, 0.72); g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(x - 12, y); g.quadraticCurveTo(x - 4, y - 5, x + 2, y); g.quadraticCurveTo(x + 8, y + 5, x + 14, y); g.stroke();
    }
  }
  g.globalAlpha = 1;
}

/** Each range as a line of drawn summits: lit and shaded faces, a ragged snow cap, tallest in the middle, tapering at the ends. */
function paintRanges(g, look, random) {
  const peaks = [];
  for (const range of RANGES) {
    const pts = [];
    for (let i = 0; i + 1 < range.line.length; i++) { const [au, al] = range.line[i], [bu, bl] = range.line[i + 1], n = Math.max(2, Math.round(Math.hypot(X(bu) - X(au), Y(bl) - Y(al)) / 38)); for (let k = 0; k < n; k++) pts.push([X(au + (bu - au) * k / n), Y(al + (bl - al) * k / n)]); }
    pts.forEach(([x, y], k) => peaks.push({ x: x + (random() - 0.5) * 26, y: y + (random() - 0.5) * 16, s: (20 + 46 * range.height) * (0.5 + 0.5 * Math.sin((k + 0.5) / pts.length * Math.PI)) * (0.8 + random() * 0.4) }));
  }
  g.lineJoin = 'round';
  for (const { x, y, s } of peaks.sort((a, b) => a.y - b.y)) {
    const foot = y + s * 0.55, top = y - s, left = x - s * 0.9, right = x + s * 0.9, mid = x + s * 0.06;
    g.beginPath(); g.moveTo(left, foot); g.lineTo(x, top); g.lineTo(right, foot); g.closePath(); g.fillStyle = '#b3a79c'; g.fill();
    g.beginPath(); g.moveTo(x, top); g.lineTo(right, foot); g.lineTo(mid, foot); g.closePath(); g.fillStyle = '#857a7c'; g.fill();
    if (s > 24) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + s * 0.34, top + s * 0.54); g.lineTo(x + s * 0.1, top + s * 0.4); g.lineTo(x - s * 0.06, top + s * 0.6); g.lineTo(x - s * 0.2, top + s * 0.42); g.lineTo(x - s * 0.36, top + s * 0.56); g.closePath(); g.fillStyle = '#fff'; g.fill(); }
    g.strokeStyle = look.ink; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(left, foot); g.lineTo(x, top); g.lineTo(right, foot); g.stroke();
  }
}

/**
 * Paints Gaia into a new canvas in the look named `name`.
 * @param {Document} doc
 * @param {object} planet from gaiaPlanet()
 * @param {keyof typeof MAP_LOOKS} [name]
 */
export function paintWorld(doc, planet, name = 'comic') {
  const look = MAP_LOOKS[name] ?? MAP_LOOKS.comic, canvas = doc.createElement('canvas');
  canvas.width = ART_W; canvas.height = ART_H;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const random = mulberry32(21), coast = coastPath();
  g.fillStyle = look.sea; g.fillRect(0, 0, ART_W, ART_H);
  g.lineJoin = 'round';
  g.strokeStyle = look.shelf; g.lineWidth = 15; g.stroke(coast); // a thin waterline, not a halo
  g.strokeStyle = look.wave; g.lineWidth = 3; g.lineCap = 'round'; // drawn wave marks, well away from shore
  for (let k = 0; k < 3400; k++) {
    const u = random(), lat = 88 - random() * 170, i = Math.min(TEX_H - 1, Math.floor((0.5 - lat / 180) * TEX_H)) * TEX_W + Math.floor(u * TEX_W);
    if (planet.land[i] > SEA - 0.12 || random() > 0.34) continue;
    const x = X(u), y = Y(lat);
    g.beginPath(); g.moveTo(x - 15, y); g.quadraticCurveTo(x - 8, y - 6, x, y); g.quadraticCurveTo(x + 8, y + 6, x + 15, y); g.stroke();
  }
  g.save();
  g.clip(coast);
  g.drawImage(biomeLayer(doc, planet, look), 0, 0);
  paintMarks(g, planet, look, random);
  g.strokeStyle = look.river; g.lineWidth = 5; g.lineCap = g.lineJoin = 'round';
  for (const river of planet.rivers) { // every few points, joined by curves: a river, not a scribble
    const pts = river.filter((_, i) => i % 4 === 0 || i === river.length - 1).map(([u, lat]) => [X(u), Y(lat)]);
    g.beginPath(); g.moveTo(...pts[0]);
    for (let i = 1; i + 1 < pts.length; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    g.lineTo(...pts.at(-1)); g.stroke();
  }
  g.restore();
  paintRanges(g, look, random);
  g.strokeStyle = look.ink; g.lineWidth = 7; g.lineJoin = 'round'; g.stroke(coast);
  return canvas;
}
