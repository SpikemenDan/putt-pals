/**
 * Development-only atlas of Gaia (VIS-M1): a full-page illustrated map from the same comic as the game. It shares its data with the globe:
 * coasts are the closed paths of src/shared/gaia-coast.js, biomes come from planet-data.js, so an edit at the source moves both.
 *
 * Heaviest ink on the coast, thin lines between biomes, a few drawn ridgelines and small details per region, then the map pins on top as real
 * buttons (hover, keyboard focus, selected). Picking a pin is local to this preview: the game still chooses courses in MapSelect.jsx.
 * Open it with `?map` on the dev server. Plain DOM, text only.
 */

import { GAIA_REGIONS, RANGES } from '../shared/gaia-map.js';
import { COAST_RINGS, SOUTH_ICE } from '../shared/gaia-coast.js';
import { BIOMES, TEX_H, TEX_W, gaiaPlanet, mulberry32 } from '../render/planet-data.js';

const W = 2640, H = 1320;
const INK = '#14102a', SEA = '#3b9fe2', SHELF = '#63b8ec', FOAM = '#eaf7ff';
const BIOME_COLOUR = Object.freeze({ polar: '#eef6fb', alpine: '#d3cfd6', tundra: '#bccfa8', boreal: '#3f9370', temperate: '#58b85c', mediterranean: '#a9c964', grassland: '#93cf68', savanna: '#dcc964', desert: '#f4d98e', tropical: '#229f5c', wetland: '#55b5a2', volcanic: '#4e4350' });
const REGION_COLOUR = Object.freeze({ polar: '#2f7fd0', temperate: '#1f8f3f', desert: '#d9731a', tropical: '#0d8a78', wetland: '#5f8f1f', volcanic: '#df3a1a' });
const LEGEND = Object.freeze([['Ice', 'polar'], ['Peaks', 'alpine'], ['Tundra', 'tundra'], ['Boreal', 'boreal'], ['Temperate', 'temperate'], ['Mediterranean', 'mediterranean'], ['Grassland', 'grassland'], ['Savanna', 'savanna'], ['Desert', 'desert'], ['Rainforest', 'tropical'], ['Wetland', 'wetland'], ['Volcanic', 'volcanic']]);

const STYLE = `
.pp-map{position:fixed;inset:0;z-index:2147483100;overflow:auto;background:#fff3d0;color:${INK};padding:14px 18px 26px;box-sizing:border-box;font:600 14px/1.3 Nunito,'Segoe UI',sans-serif}
.pp-map-in{max-width:1400px;margin:0 auto}
.pp-map-top{display:flex;align-items:baseline;gap:14px;margin-bottom:8px}
.pp-map h1{margin:0;font:400 28px/1 'Titan One','Arial Black',sans-serif}
.pp-map-now{flex:1;font-weight:800;color:#3d3556}
.pp-map-close{font:800 13px Nunito,sans-serif;padding:6px 12px;border-radius:8px;border:2px solid ${INK};background:#fff;cursor:pointer}
.pp-map-stage{position:relative;border:2px solid ${INK};border-radius:6px;overflow:hidden;line-height:0}
.pp-map-stage canvas{display:block;width:100%;height:auto}
.pp-pin{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;padding:0;border:3px solid ${INK};border-radius:50%;background:var(--pin);color:#fff;font:900 14px/1 Nunito,sans-serif;cursor:pointer;box-shadow:2px 3px 0 ${INK};transition:transform .12s}
.pp-pin::before{content:"";position:absolute;left:50%;bottom:calc(100% + 1px);width:3px;height:13px;margin-left:-1px;background:${INK}}
.pp-pin::after{content:"";position:absolute;left:calc(50% + 2px);bottom:calc(100% + 6px);border-left:13px solid #ff2e88;border-top:5px solid transparent;border-bottom:5px solid transparent}
.pp-pin:hover{transform:translateY(-3px) scale(1.14);z-index:3}
.pp-pin:focus-visible{outline:4px solid #fff;outline-offset:2px;z-index:4}
.pp-pin[aria-pressed=true]{background:#ffd23f;color:${INK};transform:scale(1.26);z-index:5}
.pp-map-key{display:flex;flex-wrap:wrap;gap:3px 12px;margin:8px 2px;font-size:12px;color:#5a5270}
.pp-map-key span{display:inline-flex;align-items:center;gap:5px}
.pp-map-key i{display:block;width:12px;height:10px;border:1px solid #5a5270}
.pp-map-cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.pp-map-card h2{margin:0 0 1px;font:400 16px/1.15 'Titan One','Arial Black',sans-serif}
.pp-map-card small{display:block;margin-bottom:4px;color:#5a5270;font-weight:700}
.pp-map-card button{display:flex;width:100%;align-items:center;gap:6px;padding:2px 4px;border:0;border-radius:6px;background:none;box-shadow:none;color:inherit;font:700 13px/1.25 Nunito,sans-serif;text-align:left;cursor:pointer}
.pp-map-card button b{display:grid;place-items:center;width:18px;height:18px;flex:none;border-radius:50%;background:var(--pin);color:#fff;font-size:11px}
.pp-map-card button:hover{background:#ffe9a8}
.pp-map-card button:focus-visible{outline:3px solid ${INK}}
.pp-map-card button[aria-pressed=true]{background:#ffd23f}
@media (max-width:900px){.pp-map-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.pp-map{padding:8px}.pp-pin{width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-width:2px;font-size:0;box-shadow:none}.pp-pin[aria-pressed=true]{transform:scale(1.7)}.pp-pin::before,.pp-pin::after{display:none}}
`;

const X = u => ((u % 1) + 1) % 1 * W, Y = lat => (0.5 - lat / 180) * H;

/** Where each pin stands on the flat map: its marker, or its site, nudged apart so no two in a region touch. Display only: sites do not move. */
function pinSpots(region) {
  const spots = region.maps.map(m => { const [u, lat] = m.marker ?? [m.u, m.lat]; return { x: u * 2, y: lat / 90 }; }), gap = 0.088;
  for (let pass = 0; pass < 60; pass++) for (const a of spots) for (const b of spots) {
    if (a === b) continue;
    const dx = a.x - b.x || 0.001, dy = a.y - b.y, d = Math.hypot(dx, dy);
    if (d < gap) { const push = (gap - d) / 2 / d; a.x += dx * push; a.y += dy * push; b.x -= dx * push; b.y -= dy * push; }
  }
  return spots.map(s => [s.x / 2, s.y * 90]);
}

function coastPath() {
  const path = new Path2D();
  for (const ring of COAST_RINGS) { ring.forEach(([u, lat], i) => (i ? path.lineTo(X(u), Y(lat)) : path.moveTo(X(u), Y(lat)))); path.closePath(); }
  return path;
}

/** Flat biome colours with shared edges: every pixel belongs to exactly one biome, so there can be no gaps or overlaps. */
function biomeLayer(doc, planet) {
  const layer = doc.createElement('canvas'), g = layer.getContext('2d');
  layer.width = W; layer.height = H;
  const image = g.createImageData(W, H), px = image.data, kinds = new Uint8Array(W * H), colours = BIOMES.map(b => BIOME_COLOUR[b].match(/\w\w/g).map(q => parseInt(q, 16)));
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(TEX_H - 1.001, (y + 0.5) / H * TEX_H - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / W * TEX_W - 0.5, x0 = Math.floor(fx), tx = fx - x0, xa = (x0 + TEX_W) % TEX_W, xb = (x0 + 1) % TEX_W;
      const a = planet.biome[y0 * TEX_W + xa], b = planet.biome[y0 * TEX_W + xb], c = planet.biome[(y0 + 1) * TEX_W + xa], e = planet.biome[(y0 + 1) * TEX_W + xb];
      let k = a;
      if (a !== b || a !== c || a !== e) { // on an edge: the corner biomes vote by nearness, which keeps the line smooth
        const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, we = tx * ty;
        const score = q => (q === a ? wa : 0) + (q === b ? wb : 0) + (q === c ? wc : 0) + (q === e ? we : 0);
        k = [a, b, c, e].reduce((p, q) => (score(q) > score(p) ? q : p));
      }
      kinds[y * W + x] = k;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = kinds[i], c = colours[k], o = i * 4;
    const edge = (x + 2 < W && kinds[i + 2] !== k) || (y + 2 < H && kinds[i + 2 * W] !== k); // thin linework where biomes meet
    const m = edge ? 0.62 : 1;
    px[o] = c[0] * m; px[o + 1] = c[1] * m; px[o + 2] = c[2] * m; px[o + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  return layer;
}

/** A few long drawn ridgelines per range, with snow on the high ground and restrained hatching down the shaded side. */
function paintRidges(g, random) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const range of RANGES) {
    const pts = [];
    for (let i = 0; i + 1 < range.line.length; i++) {
      const [au, al] = range.line[i], [bu, bl] = range.line[i + 1], len = Math.hypot(X(bu) - X(au), Y(bl) - Y(al)), n = Math.max(2, Math.round(len / 44));
      for (let k = 0; k < n; k++) { const t = k / n; pts.push([X(au + (bu - au) * t), Y(al + (bl - al) * t)]); }
    }
    pts.push([X(range.line.at(-1)[0]), Y(range.line.at(-1)[1])]);
    const big = 18 + range.height * 34;
    const crest = pts.map(([x, y], k) => { const swell = Math.sin(k / (pts.length - 1) * Math.PI), s = big * (0.55 + 0.45 * swell) * (0.75 + random() * 0.5); return { x: x + (random() - 0.5) * 12, y, s }; });
    for (const p of crest) {
      const left = p.x - p.s * 0.95, right = p.x + p.s * 0.95, foot = p.y + p.s * 0.62, top = p.y - p.s;
      g.beginPath(); g.moveTo(left, foot); g.lineTo(p.x - p.s * 0.12, top + p.s * 0.1); g.lineTo(p.x, top); g.lineTo(p.x + p.s * 0.2, top + p.s * 0.22); g.lineTo(right, foot); g.closePath();
      g.fillStyle = '#a79f9c'; g.fill();
      g.beginPath(); g.moveTo(p.x, top); g.lineTo(p.x + p.s * 0.2, top + p.s * 0.22); g.lineTo(right, foot); g.lineTo(p.x + p.s * 0.1, foot); g.closePath();
      g.fillStyle = '#7e7782'; g.fill();
      if (p.s > 24) { // snow, with a ragged lower edge
        g.beginPath(); g.moveTo(p.x, top); g.lineTo(p.x + p.s * 0.28, top + p.s * 0.46); g.lineTo(p.x + p.s * 0.08, top + p.s * 0.34); g.lineTo(p.x - p.s * 0.06, top + p.s * 0.52); g.lineTo(p.x - p.s * 0.2, top + p.s * 0.36); g.lineTo(p.x - p.s * 0.34, top + p.s * 0.48); g.closePath();
        g.fillStyle = '#fff'; g.fill();
      }
      g.strokeStyle = INK; g.lineWidth = 1.6;
      for (let h = 1; h <= 3; h++) { const t = 0.45 + h * 0.13; g.beginPath(); g.moveTo(p.x + p.s * 0.95 * t - 3, top + (foot - top) * t); g.lineTo(p.x + p.s * 0.95 * t - p.s * 0.22, foot - 2); g.stroke(); }
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(left, foot); g.lineTo(p.x - p.s * 0.12, top + p.s * 0.1); g.lineTo(p.x, top); g.lineTo(p.x + p.s * 0.2, top + p.s * 0.22); g.lineTo(right, foot); g.stroke();
    }
  }
}

/** Small inked tree clumps, picked sparsely from the planet's own plants so they sit in the right biomes. */
function paintTrees(g, planet, random) {
  const glyph = { pine: 'cone', snowpine: 'cone', cypress: 'cone', palm: 'palm', jungle: 'round', broadleaf: 'round', birch: 'round', autumn: 'round', blossom: 'round', olive: 'round', acacia: 'flat', baobab: 'flat', mangrove: 'round', cactus: 'cactus' };
  const fill = { pine: '#1f7a58', snowpine: '#2a7a64', cypress: '#2f6a4a', palm: '#2fb24a', jungle: '#128a44', broadleaf: '#3f9e4a', birch: '#8ccb5a', autumn: '#f09a2a', blossom: '#ffa8cc', olive: '#8ea878', acacia: '#8ea83a', baobab: '#7a9a3a', mangrove: '#2a8a68', cactus: '#3f9e5a' };
  const placed = [];
  for (const p of planet.plants) {
    if (placed.length > 120 || random() > 0.03 || !glyph[p.kind]) continue;
    const x = X(p.u), y = Y(p.lat);
    if (placed.some(q => Math.hypot(q[0] - x, q[1] - y) < 56)) continue;
    placed.push([x, y]);
    for (const [dx, dy] of [[-11, 3], [10, 5], [0, -4]]) {
      const tx = x + dx, ty = y + dy, kind = glyph[p.kind];
      g.fillStyle = fill[p.kind]; g.strokeStyle = INK; g.lineWidth = 2;
      g.beginPath();
      if (kind === 'cone') { g.moveTo(tx - 7, ty + 7); g.lineTo(tx, ty - 11); g.lineTo(tx + 7, ty + 7); g.closePath(); } else if (kind === 'flat') g.ellipse(tx, ty - 6, 10, 4, 0, 0, 7); else if (kind === 'palm') { g.moveTo(tx, ty + 7); g.lineTo(tx + 1, ty - 8); g.moveTo(tx - 8, ty - 5); g.quadraticCurveTo(tx, ty - 13, tx + 9, ty - 5); } else if (kind === 'cactus') { g.moveTo(tx, ty + 7); g.lineTo(tx, ty - 8); g.moveTo(tx - 5, ty - 3); g.lineTo(tx + 5, ty - 3); } else g.arc(tx, ty - 3, 7, 0, 7);
      if (kind !== 'palm' && kind !== 'cactus') g.fill();
      g.stroke();
    }
  }
}

/** One or two details per region, large enough to read at map scale. */
function paintRegionDetails(g, planet) {
  g.lineCap = 'round'; g.strokeStyle = INK;
  // Frostreach: glacier tongues running out of the range
  for (const [u, lat] of [[0.695, 34], [0.725, 34.5], [0.755, 32.5]]) {
    const x = X(u), y = Y(lat);
    g.beginPath(); g.moveTo(x - 12, y - 16); g.quadraticCurveTo(x - 4, y + 18, x + 4, y + 34); g.quadraticCurveTo(x + 12, y + 16, x + 12, y - 16); g.closePath();
    g.fillStyle = '#d7f0fb'; g.lineWidth = 2.4; g.fill(); g.stroke();
    g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 3, y + 18); g.stroke();
  }
  // Evergreen Vale: a mill on the hill
  { const x = X(0.59), y = Y(48); g.lineWidth = 2.6; g.fillStyle = '#f4efe0'; g.beginPath(); g.moveTo(x - 9, y + 14); g.lineTo(x - 5, y - 12); g.lineTo(x + 5, y - 12); g.lineTo(x + 9, y + 14); g.closePath(); g.fill(); g.stroke(); for (const t of [0.7, 2.27, 3.84, 5.41]) { g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + Math.cos(t) * 20, y - 12 + Math.sin(t) * 20); g.stroke(); } }
  // Sunspire Sands: dune arcs and an oasis
  g.strokeStyle = '#c99a4a'; g.lineWidth = 3;
  for (const [u, lat] of [[0.43, 29], [0.46, 20], [0.5, 30], [0.54, 27], [0.53, 18], [0.47, 31]]) for (let k = 0; k < 3; k++) { const x = X(u) + k * 7, y = Y(lat) + k * 9; g.beginPath(); g.moveTo(x - 24, y + 4); g.quadraticCurveTo(x, y - 12, x + 24, y + 4); g.stroke(); }
  { const x = X(0.505), y = Y(20.5); g.fillStyle = '#3b9fe2'; g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.ellipse(x, y, 19, 8, 0, 0, 7); g.fill(); g.stroke(); }
  // Palm Reef: a dotted reef hugging the shelf
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.setLineDash([2, 12]);
  g.beginPath(); g.moveTo(X(0.36), Y(10)); g.quadraticCurveTo(X(0.375), Y(1), X(0.357), Y(-8)); g.stroke();
  g.beginPath(); g.moveTo(X(0.33), Y(11)); g.quadraticCurveTo(X(0.35), Y(13), X(0.365), Y(11)); g.stroke();
  g.setLineDash([]);
  // Mirewater: reed tufts in the delta
  g.strokeStyle = INK; g.lineWidth = 2;
  for (const [u, lat] of [[0.166, 26.5], [0.186, 32], [0.2, 26], [0.15, 32]]) { const x = X(u), y = Y(lat); for (const d of [-6, 0, 6]) { g.beginPath(); g.moveTo(x + d * 0.5, y + 7); g.quadraticCurveTo(x + d, y - 2, x + d * 1.5, y - 10); g.stroke(); } }
  // Emberfall Isles: fire mountains with a plume
  for (const v of planet.volcanoes) {
    const x = X(v.u), y = Y(v.lat), s = 24;
    g.beginPath(); g.moveTo(x - s, y + s * 0.7); g.quadraticCurveTo(x - s * 0.4, y + s * 0.2, x - s * 0.26, y - s * 0.7); g.lineTo(x + s * 0.26, y - s * 0.7); g.quadraticCurveTo(x + s * 0.4, y + s * 0.2, x + s, y + s * 0.7); g.closePath();
    g.fillStyle = '#3a3340'; g.strokeStyle = INK; g.lineWidth = 3; g.fill(); g.stroke();
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(x, y - s * 0.7); g.quadraticCurveTo(x + 6, y - 2, x - 3, y + s * 0.55); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - s * 0.9); g.bezierCurveTo(x + 12, y - s * 1.3, x - 12, y - s * 1.5, x + 4, y - s * 2); g.stroke();
  }
}

/** The biggest cities as tiny inked skylines, where they stand on the globe. */
function paintCities(g, planet) {
  g.strokeStyle = INK; g.lineWidth = 2;
  for (const c of planet.cities) {
    if ((c.tier ?? 0) < 1) continue;
    const x = X(c.u), y = Y(c.lat), k = c.tier;
    for (const [dx, h, w] of [[-9, 11, 7], [0, 20, 8], [9, 14, 7]]) { g.fillStyle = '#fff8e4'; g.beginPath(); g.rect(x + dx * k - w / 2, y + 6 - h * k, w, h * k); g.fill(); g.stroke(); }
  }
}

function paintLabels(g) {
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = "400 30px 'Titan One','Arial Black',sans-serif";
  for (const r of GAIA_REGIONS) {
    const low = Math.min(...pinSpots(r).map(p => p[1])), x = Math.min(W - 170, Math.max(170, X(r.label?.[0] ?? r.u))), y = Y(r.label?.[1] ?? low - 6.5);
    g.strokeStyle = 'rgba(255,248,228,.92)'; g.lineWidth = 8; g.strokeText(r.name, x, y);
    g.fillStyle = INK; g.fillText(r.name, x, y);
  }
}

function paintMap(doc, canvas, planet) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const random = mulberry32(11), coast = coastPath();
  g.fillStyle = SEA; g.fillRect(0, 0, W, H);
  g.lineJoin = 'round';
  g.strokeStyle = SHELF; g.lineWidth = 20; g.stroke(coast); // one narrow shelf, then a crisp surf line
  g.strokeStyle = FOAM; g.lineWidth = 11; g.stroke(coast);
  g.strokeStyle = SHELF; g.lineWidth = 7; g.stroke(coast);
  // Polar ice, flat and inked.
  g.beginPath(); g.moveTo(0, H); g.lineTo(0, Y(SOUTH_ICE));
  for (let x = 0; x <= W; x += 40) g.lineTo(x, Y(SOUTH_ICE) + Math.sin(x * 0.012) * 7 + Math.sin(x * 0.031) * 4);
  g.lineTo(W, H); g.closePath(); g.fillStyle = BIOME_COLOUR.polar; g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  g.save(); g.clip(coast);
  g.drawImage(biomeLayer(doc, planet), 0, 0);
  g.lineCap = 'round'; g.strokeStyle = '#2b8fd8'; g.lineWidth = 3.4;
  for (const river of planet.rivers) { g.beginPath(); river.forEach(([u, lat], i) => (i ? g.lineTo(X(u), Y(lat)) : g.moveTo(X(u), Y(lat)))); g.stroke(); }
  g.restore();
  paintRidges(g, random);
  paintTrees(g, planet, random);
  paintRegionDetails(g, planet);
  paintCities(g, planet);
  g.strokeStyle = INK; g.lineWidth = 5.5; g.lineJoin = 'round'; g.stroke(coast); // the heaviest line on the page
  paintLabels(g);
}

/**
 * Mounts the atlas. `onSelect` hears each pick as { region, map }. Returns an unmount function.
 * @param {Document} doc
 * @param {{onSelect?: Function}} [options]
 */
export function mountPlanetMap(doc, { onSelect = () => {} } = {}) {
  const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); Object.assign(n, props); n.append(...kids); return n; };
  const canvas = el('canvas', { width: W, height: H }), close = el('button', { type: 'button', className: 'pp-map-close', textContent: 'Close map' });
  const now = el('span', { className: 'pp-map-now', textContent: 'Pick a map' }), stage = el('div', { className: 'pp-map-stage' }, canvas);
  canvas.setAttribute('aria-hidden', 'true');
  const controls = [];
  const select = id => {
    for (const c of controls) c.el.setAttribute('aria-pressed', String(c.id === id));
    const hit = controls.find(c => c.id === id);
    now.textContent = `${hit.map.name}, ${hit.region.name}`;
    onSelect({ region: hit.region, map: hit.map });
  };
  const control = (node, region, map) => { node.type = 'button'; node.setAttribute('aria-pressed', 'false'); node.style.setProperty('--pin', REGION_COLOUR[region.id]); node.dataset.map = map.id; node.addEventListener('click', () => select(map.id)); controls.push({ el: node, id: map.id, region, map }); return node; };
  for (const r of GAIA_REGIONS) r.maps.forEach((m, k) => {
    const pin = control(el('button', { className: 'pp-pin', textContent: String(k + 1) }), r, m), [u, lat] = pinSpots(r)[k];
    pin.setAttribute('aria-label', `${m.name}, ${r.name}`);
    pin.title = m.name;
    pin.style.left = (((u % 1) + 1) % 1 * 100) + '%'; pin.style.top = ((0.5 - lat / 180) * 100) + '%';
    stage.append(pin);
  });
  const key = el('div', { className: 'pp-map-key' }, ...LEGEND.map(([label, biome]) => { const swatch = el('i'); swatch.style.background = BIOME_COLOUR[biome]; return el('span', {}, swatch, label); }));
  const cards = el('div', { className: 'pp-map-cards' }, ...GAIA_REGIONS.map(r => el('div', { className: 'pp-map-card' },
    el('h2', { textContent: r.name }), el('small', { textContent: r.biome }),
    ...r.maps.map((m, k) => control(el('button', {}, el('b', { textContent: String(k + 1) }), m.name), r, m)))));
  const root = el('div', { className: 'pp-map' }, el('style', { textContent: STYLE }), el('div', { className: 'pp-map-in' }, el('div', { className: 'pp-map-top' }, el('h1', { textContent: 'Gaia' }), now, close), stage, key, cards));
  doc.body.append(root);
  close.addEventListener('click', () => root.remove());
  setTimeout(async () => {
    await doc.fonts?.load?.("30px 'Titan One'");
    paintMap(doc, canvas, gaiaPlanet());
  }, 30);
  return () => root.remove();
}
