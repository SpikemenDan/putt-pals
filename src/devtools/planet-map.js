/**
 * Development-only flat map of Gaia (VIS-M1), drawn like a printed comic map: flat biome colours, a crisp ink coast, little drawn mountains
 * and volcanoes, rivers, numbered pins, and the 24 maps listed in caption boxes beside it. It is the same world as the globe (the data is
 * shared), and previews the flattened view a later menu can zoom out to. Open it with `?map` on the dev server. Plain DOM, text only.
 */

import { GAIA_REGIONS } from '../shared/gaia-map.js';
import { BIOMES, SEA, TEX_H, TEX_W, blur, gaiaPlanet } from '../render/planet-data.js';

const W = 2400, H = 1200;
const INK = '#14102a';
/** Flat map colour per biome. */
const BIOME_COLOUR = Object.freeze({ polar: '#eef6fb', alpine: '#c9c3cc', tundra: '#b9cda6', boreal: '#3f9370', temperate: '#58b85c', mediterranean: '#a9c964', grassland: '#93cf68', savanna: '#dcc964', desert: '#f4d98e', tropical: '#229f5c', wetland: '#55b5a2', volcanic: '#4e4350' });
const SEA_BANDS = Object.freeze([[-0.03, [96, 196, 236]], [-0.17, [52, 160, 226]], [-9, [38, 136, 212]]]);
const REGION_COLOUR = Object.freeze({ polar: '#7fb6e6', temperate: '#2fa04a', desert: '#e08a1e', tropical: '#0f8a70', wetland: '#5a8a2a', volcanic: '#e0431e' });
const LEGEND = Object.freeze([['Ice', 'polar'], ['High peaks', 'alpine'], ['Tundra', 'tundra'], ['Boreal forest', 'boreal'], ['Temperate forest', 'temperate'], ['Mediterranean', 'mediterranean'], ['Grassland', 'grassland'], ['Savanna', 'savanna'], ['Desert', 'desert'], ['Rainforest', 'tropical'], ['Wetland', 'wetland'], ['Volcanic', 'volcanic']]);

const STYLE = `
.pp-map{position:fixed;inset:0;z-index:2147483100;overflow:auto;background:#ffe9a8;color:${INK};padding:18px 22px 30px;box-sizing:border-box;font:600 15px/1.3 Nunito,'Segoe UI',sans-serif}
.pp-map-top{display:flex;align-items:center;justify-content:space-between;max-width:1320px;margin:0 auto 12px}
.pp-map h1{margin:0;font:400 40px/1 'Titan One','Arial Black',sans-serif;color:#ffd23f;-webkit-text-stroke:3px ${INK};paint-order:stroke fill;text-shadow:3px 4px 0 ${INK}}
.pp-map button{font:800 14px Nunito,sans-serif;padding:8px 14px;border-radius:8px;border:3px solid ${INK};background:#fff;box-shadow:3px 3px 0 ${INK};cursor:pointer}
.pp-map canvas{display:block;width:100%;max-width:1320px;margin:0 auto;box-sizing:border-box;border:5px solid ${INK};border-radius:10px;box-shadow:7px 7px 0 ${INK}}
.pp-map-key{display:flex;flex-wrap:wrap;gap:6px 14px;max-width:1320px;margin:16px auto 0;font-size:13px}
.pp-map-key span{display:inline-flex;align-items:center;gap:6px}
.pp-map-key i{display:block;width:18px;height:14px;border:2px solid ${INK};border-radius:3px}
.pp-map-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;max-width:1320px;margin:16px auto 0}
.pp-map-card{background:#fff8e4;border:4px solid ${INK};border-radius:10px;box-shadow:5px 5px 0 ${INK};padding:10px 12px}
.pp-map-card h2{margin:0;font:400 20px/1.1 'Titan One','Arial Black',sans-serif}
.pp-map-card small{display:block;margin:2px 0 8px;font-weight:700;color:#5a5270}
.pp-map-card ol{margin:0;padding:0;list-style:none}
.pp-map-card li{display:flex;align-items:center;gap:8px;margin:4px 0}
.pp-map-card b{display:inline-grid;place-items:center;width:22px;height:22px;flex:none;border-radius:50%;border:2px solid ${INK};color:#fff;font-size:12px}
`;

/** Paints the land, sea and coast into `g`. Biome edges are smoothed first, so the map shows clean shapes rather than speckle. */
function paintGround(doc, g, planet) {
  const n = TEX_W * TEX_H, fields = BIOMES.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) if (planet.land[i] >= SEA) fields[planet.biome[i]][i] = 1;
  const smooth = fields.map(f => blur(f, 4)), colours = BIOMES.map(b => BIOME_COLOUR[b].match(/\w\w/g).map(q => parseInt(q, 16)));
  const main = new Uint8Array(n); // the strongest smoothed biome at each texel
  for (let i = 0; i < n; i++) { let value = -1; for (let k = 0; k < smooth.length; k++) if (smooth[k][i] > value) { value = smooth[k][i]; main[i] = k; } }
  const landAt = (fx, fy) => { // bilinear, so the coast is a smooth curve at any size
    const x0 = Math.floor(fx), y0 = Math.min(TEX_H - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0, x1 = (x0 + 1) % TEX_W, l = planet.land;
    return (l[y0 * TEX_W + x0 % TEX_W] * (1 - tx) + l[y0 * TEX_W + x1] * tx) * (1 - ty) + (l[(y0 + 1) * TEX_W + x0 % TEX_W] * (1 - tx) + l[(y0 + 1) * TEX_W + x1] * tx) * ty;
  };
  const image = g.createImageData(W, H), px = image.data, isLand = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / H * TEX_H - 0.5, lat = Math.abs(90 - (y + 0.5) / H * 180);
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / W * TEX_W, a = landAt(Math.max(0, fx - 0.5), Math.max(0, fy)) - SEA, o = (y * W + x) * 4;
      let c;
      if (a >= 0) {
        isLand[y * W + x] = 1;
        const i = Math.min(TEX_H - 1, Math.max(0, Math.round(fy))) * TEX_W + Math.floor(fx) % TEX_W;
        c = colours[main[i]];
      } else if (lat > 80) c = [238, 246, 251];
      else c = SEA_BANDS.find(([edge]) => a > edge)[1];
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
  }
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) { // ink wherever land meets sea
    const i = y * W + x;
    if (!isLand[i]) continue;
    if (!isLand[i - 3] || !isLand[i + 3] || !isLand[i - 3 * W] || !isLand[i + 3 * W]) { const o = i * 4; px[o] = 20; px[o + 1] = 16; px[o + 2] = 42; }
  }
  g.putImageData(image, 0, 0);
}

const mapX = u => ((u % 1) + 1) % 1 * W, mapY = lat => (0.5 - lat / 180) * H;

function paintFeatures(g, planet) {
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = '#2b8fd8'; g.lineWidth = 3.5;
  for (const river of planet.rivers) {
    g.beginPath();
    let last = null;
    for (const [u, lat] of river) { const x = mapX(u), y = mapY(lat); if (last === null || Math.abs(x - last) > W / 2) g.moveTo(x, y); else g.lineTo(x, y); last = x; }
    g.stroke();
  }
  const peaks = planet.peaks.filter((_, k) => k % 2 === 0).sort((a, b) => b.lat - a.lat);
  for (const p of peaks) { // little drawn summits, back rows first
    const x = mapX(p.u), y = mapY(p.lat), s = 11 + p.height * 12;
    g.beginPath(); g.moveTo(x - s, y + s * 0.7); g.lineTo(x, y - s); g.lineTo(x + s, y + s * 0.7); g.closePath();
    g.fillStyle = '#8f8a98'; g.strokeStyle = INK; g.lineWidth = 3; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.42, y - s * 0.24); g.lineTo(x, y - s); g.lineTo(x + s * 0.42, y - s * 0.24); g.closePath();
    g.fillStyle = '#fff'; g.fill();
  }
  for (const v of planet.volcanoes) {
    const x = mapX(v.u), y = mapY(v.lat), s = 20;
    g.beginPath(); g.moveTo(x - s, y + s * 0.8); g.lineTo(x - s * 0.24, y - s * 0.7); g.lineTo(x + s * 0.24, y - s * 0.7); g.lineTo(x + s, y + s * 0.8); g.closePath();
    g.fillStyle = '#3a3340'; g.strokeStyle = INK; g.lineWidth = 3; g.fill(); g.stroke();
    g.beginPath(); g.ellipse(x, y - s * 0.7, s * 0.26, s * 0.12, 0, 0, Math.PI * 2); g.fillStyle = '#ff7a1a'; g.fill();
  }
}

function paintRegions(g) {
  g.textBaseline = 'middle'; g.textAlign = 'center';
  for (const r of GAIA_REGIONS) {
    r.maps.forEach((m, k) => {
      const x = mapX(m.u), y = mapY(m.lat);
      g.beginPath(); g.arc(x + 3, y + 3, 17, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
      g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fillStyle = REGION_COLOUR[r.id]; g.strokeStyle = INK; g.lineWidth = 4; g.fill(); g.stroke();
      g.font = "800 21px Nunito,'Segoe UI',sans-serif"; g.fillStyle = '#fff'; g.fillText(String(k + 1), x, y + 1);
    });
    const top = Math.max(...r.maps.map(m => m.lat)), label = r.name;
    g.font = "400 30px 'Titan One','Arial Black',sans-serif";
    const w = g.measureText(label).width + 30, h = 46, cx = Math.min(W - w / 2 - 14, Math.max(w / 2 + 14, mapX(r.u))), cy = Math.max(34, mapY(top) - 52);
    g.save(); g.translate(cx, cy); g.rotate(-0.02);
    g.fillStyle = INK; g.fillRect(-w / 2 + 5, -h / 2 + 5, w, h);
    g.fillStyle = '#ffd23f'; g.strokeStyle = INK; g.lineWidth = 4; g.fillRect(-w / 2, -h / 2, w, h); g.strokeRect(-w / 2, -h / 2, w, h);
    g.fillStyle = INK; g.fillText(label, 0, 2);
    g.restore();
  }
}

export function mountPlanetMap(doc) {
  const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); Object.assign(n, props); n.append(...kids); return n; };
  const canvas = el('canvas', { width: W, height: H }), close = el('button', { type: 'button', textContent: 'Close map' });
  const key = el('div', { className: 'pp-map-key' }, ...LEGEND.map(([label, biome]) => { const swatch = el('i'); swatch.style.background = BIOME_COLOUR[biome]; return el('span', {}, swatch, label); }));
  const cards = el('div', { className: 'pp-map-cards' }, ...GAIA_REGIONS.map(r => el('div', { className: 'pp-map-card' },
    el('h2', { textContent: r.name }), el('small', { textContent: r.biome }),
    el('ol', {}, ...r.maps.map((m, k) => { const number = el('b', { textContent: String(k + 1) }); number.style.background = REGION_COLOUR[r.id]; return el('li', {}, number, m.name); })))));
  const root = el('div', { className: 'pp-map' }, el('style', { textContent: STYLE }), el('div', { className: 'pp-map-top' }, el('h1', { textContent: 'Gaia' }), close), canvas, key, cards);
  doc.body.append(root);
  close.addEventListener('click', () => root.remove());
  setTimeout(async () => {
    await doc.fonts?.load?.("30px 'Titan One'");
    const planet = gaiaPlanet(), g = canvas.getContext('2d');
    paintGround(doc, g, planet);
    paintFeatures(g, planet);
    paintRegions(g);
  }, 30);
  return () => root.remove();
}
