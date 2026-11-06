/**
 * Small hand-built 3D assets for the loading-screen sky (VIS-M1): a jet, a boat, city skylines and fluffy cartoon clouds.
 *
 * Models are flat lists of coloured polygons in a local frame (a = forward or east, b = right or north, c = up). `placeModel` turns
 * them into screen polygons by orienting that frame on the planet (so a plane flying over the limb really foreshortens and tilts
 * away, and a skyline at the horizon really stands up out of it), sorts them far to near and `paintFaces` fills them with comic
 * ink outlines and simple one-light shading. Pure drawing helpers: no React, no simulation, randomness is injected.
 */

import { clamp } from './noise.js';

export const INK = '#14102a';
const LIGHT = (() => { const v = [-0.4, 0.6, 0.7], l = Math.hypot(...v); return v.map(q => q / l); })();

const mirrorY = pts => pts.map(([a, b, c]) => [a, -b, c]);
const quad = (col, ...pts) => ({ pts, col });

/** A low-poly jet, about 2.4 units long (nose at +a). Wings and tail are double-sided flat polygons. */
export const PLANE = Object.freeze((() => {
  const body = [250, 250, 255], under = [196, 204, 226], wing = [176, 206, 244], pink = [255, 61, 139];
  const faces = [
    quad(body, [-1, -0.17, 0.15], [0.7, -0.17, 0.15], [0.7, 0.17, 0.15], [-1, 0.17, 0.15]), // top
    quad(under, [-1, -0.17, -0.15], [0.7, -0.17, -0.15], [0.7, 0.17, -0.15], [-1, 0.17, -0.15]), // belly
    quad(body, [-1, -0.17, -0.15], [0.7, -0.17, -0.15], [0.7, -0.17, 0.15], [-1, -0.17, 0.15]), // sides
    quad(body, [-1, 0.17, -0.15], [0.7, 0.17, -0.15], [0.7, 0.17, 0.15], [-1, 0.17, 0.15]),
    quad(body, [-1, -0.17, -0.15], [-1, 0.17, -0.15], [-1, 0.17, 0.15], [-1, -0.17, 0.15]), // back
    quad(pink, [0.7, -0.17, 0.15], [0.7, 0.17, 0.15], [1.25, 0, 0]), // nose cone
    quad(pink, [0.7, -0.17, -0.15], [0.7, 0.17, -0.15], [1.25, 0, 0]),
    quad([255, 140, 190], [0.7, -0.17, 0.15], [0.7, -0.17, -0.15], [1.25, 0, 0]),
    quad([255, 140, 190], [0.7, 0.17, 0.15], [0.7, 0.17, -0.15], [1.25, 0, 0]),
    quad(wing, [0.25, 0.17, 0], [-0.3, 1.05, 0], [-0.6, 1.05, 0], [-0.4, 0.17, 0]), // wings
    quad(wing, ...mirrorY([[0.25, 0.17, 0], [-0.3, 1.05, 0], [-0.6, 1.05, 0], [-0.4, 0.17, 0]])),
    quad(wing, [-0.82, 0.17, 0.02], [-1.1, 0.55, 0.02], [-1.2, 0.55, 0.02], [-1.0, 0.17, 0.02]), // tailplanes
    quad(wing, ...mirrorY([[-0.82, 0.17, 0.02], [-1.1, 0.55, 0.02], [-1.2, 0.55, 0.02], [-1.0, 0.17, 0.02]])),
    quad(pink, [-0.7, 0, 0.15], [-1.1, 0, 0.7], [-1.22, 0, 0.7], [-1.02, 0, 0.15]), // fin
    quad([120, 170, 255], [0.35, -0.171, 0.06], [0.55, -0.171, 0.06], [0.55, -0.171, 0.12], [0.35, -0.171, 0.12]), // cockpit window
    quad([120, 170, 255], [0.35, 0.171, 0.06], [0.55, 0.171, 0.06], [0.55, 0.171, 0.12], [0.35, 0.171, 0.12]),
  ];
  return { faces, length: 2.4 };
})());

/** A cartoon steamer: pink hull, white cabin, yellow funnel. About 2.3 units long (bow at +a). */
export const BOAT = Object.freeze((() => {
  const hull = [255, 61, 139], deck = [240, 206, 140], white = [250, 250, 255], yellow = [255, 210, 63];
  const faces = [
    quad(deck, [-1, -0.45, 0.12], [0.6, -0.4, 0.12], [1.3, 0, 0.12], [0.6, 0.4, 0.12], [-1, 0.45, 0.12]),
    quad(hull, [-1, 0.45, 0.12], [0.6, 0.4, 0.12], [0.6, 0.3, -0.18], [-1, 0.33, -0.18]),
    quad([255, 110, 170], [0.6, 0.4, 0.12], [1.3, 0, 0.12], [1.0, 0, -0.18], [0.6, 0.3, -0.18]),
    quad(hull, [-1, -0.45, 0.12], [0.6, -0.4, 0.12], [0.6, -0.3, -0.18], [-1, -0.33, -0.18]),
    quad([255, 110, 170], [0.6, -0.4, 0.12], [1.3, 0, 0.12], [1.0, 0, -0.18], [0.6, -0.3, -0.18]),
    quad([220, 40, 110], [-1, -0.45, 0.12], [-1, 0.45, 0.12], [-1, 0.33, -0.18], [-1, -0.33, -0.18]),
    quad(white, [-0.55, -0.28, 0.5], [0.25, -0.28, 0.5], [0.25, 0.28, 0.5], [-0.55, 0.28, 0.5]), // cabin
    quad(white, [-0.55, -0.28, 0.12], [0.25, -0.28, 0.12], [0.25, -0.28, 0.5], [-0.55, -0.28, 0.5]),
    quad(white, [-0.55, 0.28, 0.12], [0.25, 0.28, 0.12], [0.25, 0.28, 0.5], [-0.55, 0.28, 0.5]),
    quad([226, 232, 246], [0.25, -0.28, 0.12], [0.25, 0.28, 0.12], [0.25, 0.28, 0.5], [0.25, -0.28, 0.5]),
    quad([226, 232, 246], [-0.55, -0.28, 0.12], [-0.55, 0.28, 0.12], [-0.55, 0.28, 0.5], [-0.55, -0.28, 0.5]),
    quad([120, 170, 255], [-0.4, -0.281, 0.28], [0.1, -0.281, 0.28], [0.1, -0.281, 0.4], [-0.4, -0.281, 0.4]), // windows
    quad([120, 170, 255], [-0.4, 0.281, 0.28], [0.1, 0.281, 0.28], [0.1, 0.281, 0.4], [-0.4, 0.281, 0.4]),
    quad(yellow, [-0.25, -0.12, 0.85], [-0.05, -0.12, 0.85], [-0.05, 0.12, 0.85], [-0.25, 0.12, 0.85]), // funnel
    quad(yellow, [-0.25, -0.12, 0.5], [-0.05, -0.12, 0.5], [-0.05, -0.12, 0.85], [-0.25, -0.12, 0.85]),
    quad(yellow, [-0.25, 0.12, 0.5], [-0.05, 0.12, 0.5], [-0.05, 0.12, 0.85], [-0.25, 0.12, 0.85]),
    quad([220, 170, 30], [-0.05, -0.12, 0.5], [-0.05, 0.12, 0.5], [-0.05, 0.12, 0.85], [-0.05, -0.12, 0.85]),
  ];
  return { faces, length: 2.3 };
})());

/** City styles to compare in the preview gallery. */
export const CITY_STYLES = Object.freeze([
  { name: 'Candy blocks', palette: [[255, 150, 190], [255, 222, 110], [120, 224, 236], [170, 236, 170], [255, 255, 255]], roofs: false, windows: [255, 255, 255], tall: 1, antenna: false },
  { name: 'Skyscrapers', palette: [[196, 214, 244], [226, 234, 250], [150, 180, 226], [255, 255, 255]], roofs: false, windows: [255, 226, 120], tall: 1.7, antenna: true },
  { name: 'Cosy town', palette: [[255, 226, 190], [255, 250, 232], [250, 200, 170], [226, 240, 200]], roofs: true, windows: [120, 90, 70], tall: 0.7, antenna: false },
  { name: 'Neon night', palette: [[52, 60, 122], [72, 52, 128], [40, 84, 140], [92, 60, 150]], roofs: false, windows: [90, 240, 255], tall: 1.4, antenna: true },
]);

/**
 * Lays out the buildings of one city from `random`: positions in a loose cluster (taller toward the middle), each with a footprint, a
 * height, and a palette index. Units are city units; the drawing code scales them. Deterministic for a given generator.
 */
export function makeSkyline(random, buildings = 9) {
  const out = [];
  for (let k = 0; k < buildings; k++) {
    const angle = random() * Math.PI * 2, dist = Math.sqrt(random()) * 1.15, x = Math.cos(angle) * dist, y = Math.sin(angle) * dist;
    const middle = 1 - clamp(dist / 1.3);
    out.push({ x, y, w: 0.32 + random() * 0.3, d: 0.32 + random() * 0.3, h: 0.35 + random() * 0.6 + middle * (0.5 + random() * 0.9), tone: Math.floor(random() * 5), roof: random() < 0.6 });
  }
  return out;
}

/** Faces of the buildings of one city in local city units, using `style` (see CITY_STYLES). */
export function skylineFaces(buildings, style) {
  const faces = [];
  const shade = (c, k) => c.map(q => Math.min(255, q * k));
  for (const b of buildings) {
    const base = style.palette[b.tone % style.palette.length], h = b.h * style.tall, x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.d / 2, y1 = b.y + b.d / 2;
    faces.push({ pts: [[x0, y0, 0], [x1, y0, 0], [x1, y0, h], [x0, y0, h]], col: base, win: [0, -1] }); // south
    faces.push({ pts: [[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]], col: shade(base, 0.92), win: [0, 1] }); // north
    faces.push({ pts: [[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]], col: shade(base, 0.82), win: [1, 0] }); // east
    faces.push({ pts: [[x0, y0, 0], [x0, y1, 0], [x0, y1, h], [x0, y0, h]], col: shade(base, 0.86), win: [-1, 0] }); // west
    if (style.roofs && b.roof) { // pitched roof
      const apex = [b.x, b.y, h + 0.3 + b.w * 0.5], roof = shade([226, 90, 80], 1);
      faces.push({ pts: [[x0, y0, h], [x1, y0, h], apex], col: roof }, { pts: [[x1, y0, h], [x1, y1, h], apex], col: shade(roof, 0.85) });
      faces.push({ pts: [[x1, y1, h], [x0, y1, h], apex], col: shade(roof, 0.92) }, { pts: [[x0, y1, h], [x0, y0, h], apex], col: shade(roof, 0.8) });
    } else faces.push({ pts: [[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]], col: shade(base, 1.1) }); // flat roof
    if (style.antenna && h > 0.9) faces.push({ pts: [[b.x - 0.02, b.y, h], [b.x + 0.02, b.y, h], [b.x + 0.02, b.y, h + 0.45], [b.x - 0.02, b.y, h + 0.45]], col: [20, 16, 42] });
  }
  return faces;
}

/**
 * Orients `faces` (local coordinates) on the planet and returns screen polygons sorted far to near.
 * @param {{pts: number[][], col: number[], win?: number[]}[]} faces
 * @param {{x: number, y: number}} at screen position of the local origin (CSS px)
 * @param {{f: number[], b: number[], n: number[]}} frame view-space unit vectors for local a, b and c
 * @param {number} px size of one local unit in CSS px
 * @param {number[]} [offset] local-space origin shift [a, b, c] (used to place a building inside a city)
 */
export function placeModel(faces, at, frame, px, offset = [0, 0, 0]) {
  const out = [];
  for (const face of faces) {
    const pts = face.pts.map(([a, b, c]) => {
      const A = a + offset[0], B = b + offset[1], C = c + offset[2];
      return { x: A * frame.f[0] + B * frame.b[0] + C * frame.n[0], y: A * frame.f[1] + B * frame.b[1] + C * frame.n[1], z: A * frame.f[2] + B * frame.b[2] + C * frame.n[2] };
    });
    let nx = 0, ny = 0, nz = 0;
    if (pts.length >= 3) {
      const u = [pts[1].x - pts[0].x, pts[1].y - pts[0].y, pts[1].z - pts[0].z], v = [pts[2].x - pts[0].x, pts[2].y - pts[0].y, pts[2].z - pts[0].z];
      nx = u[1] * v[2] - u[2] * v[1]; ny = u[2] * v[0] - u[0] * v[2]; nz = u[0] * v[1] - u[1] * v[0];
      const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // two-sided: light the side that faces the viewer
    }
    const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    out.push({ xy: pts.map(p => [at.x + p.x * px, at.y - p.y * px]), depth, lit: Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]), col: face.col, win: face.win, nz });
  }
  return out.sort((p, q) => p.depth - q.depth);
}

/** Fills and outlines placed faces. `windows` is an optional [r, g, b] colour for small lit windows on the tall side faces. */
export function paintFaces(ctx, placed, { windows = null, outline = 1.4 } = {}) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = outline;
  for (const f of placed) {
    const k = 0.55 + 0.6 * f.lit;
    ctx.fillStyle = `rgb(${Math.min(255, f.col[0] * k) | 0},${Math.min(255, f.col[1] * k) | 0},${Math.min(255, f.col[2] * k) | 0})`;
    ctx.beginPath();
    f.xy.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (windows && f.win && f.nz > 0.2 && f.xy.length === 4) { // a grid of lit windows across the visible side
      const [p0, p1, p2, p3] = f.xy, height = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
      if (height < 12) continue;
      ctx.fillStyle = `rgb(${windows[0]},${windows[1]},${windows[2]})`;
      const rows = Math.min(8, Math.floor(height / 8)), cols = 2;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const u = (c + 0.5) / cols, v = (r + 0.7) / (rows + 0.4);
        const x = p0[0] + (p1[0] - p0[0]) * u + (p3[0] - p0[0]) * v, y = p0[1] + (p1[1] - p0[1]) * u + (p3[1] - p0[1]) * v;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }
}

/**
 * Draws one fluffy cartoon cloud into a new canvas and returns it (or null without a 2D context): overlapping puffs with an ink
 * outline, a flat base, a pale-blue underside and a few highlights. `random` picks the puff sizes.
 */
export function makeCloudSprite(doc, width, height, random) {
  const canvas = doc.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const base = height * 0.8, puffs = [];
  const n = Math.max(4, Math.round(width / 46));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, bump = Math.sin(Math.PI * t), r = height * (0.2 + 0.2 * bump + random() * 0.12);
    puffs.push({ x: width * (0.08 + 0.84 * t), y: base - r * 0.8 - bump * height * 0.12 * random(), r });
  }
  const flat = () => { ctx.beginPath(); ctx.roundRect?.(width * 0.06, base - height * 0.2, width * 0.88, height * 0.2, height * 0.1); if (!ctx.roundRect) ctx.rect(width * 0.06, base - height * 0.2, width * 0.88, height * 0.2); };
  ctx.fillStyle = INK;
  for (const p of puffs) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3.2, 0, Math.PI * 2); ctx.fill(); }
  flat(); ctx.save(); ctx.lineWidth = 6.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#ffffff';
  for (const p of puffs) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  flat(); ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, base - height * 0.45, 0, base);
  g.addColorStop(0, 'rgba(160,196,240,0)'); g.addColorStop(1, 'rgba(140,178,232,.85)');
  ctx.fillStyle = g; ctx.fillRect(0, base - height * 0.45, width, height);
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  for (const p of puffs.slice(0, Math.min(5, puffs.length))) { ctx.beginPath(); ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.3, p.r * 0.38, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
