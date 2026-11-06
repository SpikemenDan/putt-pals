/**
 * Development-only flat map of Gaia (VIS-M1): the same planet as the loading screen, unrolled, with its six regions and 24 map pins.
 * A preview of the flattened world a later menu can zoom out to. Open it with `?map` on the dev server. Plain DOM, text only.
 */

import { GAIA_REGIONS } from '../shared/gaia-map.js';
import { TEX_H, TEX_W, gaiaPlanet } from '../render/planet-data.js';

const W = 1400, H = W / 2;
const COLOURS = { polar: '#8fd3ff', temperate: '#2fbf5b', desert: '#ffa726', tropical: '#00d0a0', wetland: '#a0c040', volcanic: '#ff4a2e' };

export function mountPlanetMap(doc) {
  const root = doc.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483100;overflow:auto;background:#0b1240;padding:14px;color:#fff;font:14px system-ui,sans-serif';
  const close = doc.createElement('button');
  close.type = 'button'; close.textContent = 'Close map';
  close.style.cssText = 'font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#ffd23f;cursor:pointer;display:block;margin-bottom:10px';
  const canvas = doc.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.cssText = 'width:100%;max-width:1400px;border:3px solid #14102a;border-radius:12px;display:block';
  root.append(close, canvas);
  doc.body.append(root);
  close.addEventListener('click', () => root.remove());
  setTimeout(() => {
    const planet = gaiaPlanet(), flat = doc.createElement('canvas'), g = canvas.getContext('2d');
    flat.width = TEX_W; flat.height = TEX_H;
    const f = flat.getContext('2d'), image = f.createImageData(TEX_W, TEX_H);
    for (let i = 0; i < TEX_W * TEX_H; i++) { for (let k = 0; k < 3; k++) image.data[i * 4 + k] = planet.rgb[i * 3 + k]; image.data[i * 4 + 3] = 255; }
    f.putImageData(image, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(flat, 0, 0, W, H);
    const x = u => ((u % 1) + 1) % 1 * W, y = lat => (0.5 - lat / 180) * H;
    for (const r of GAIA_REGIONS) {
      const colour = COLOURS[r.id], rx = r.reach[0] / Math.cos(r.lat * Math.PI / 180) / 360 * W * 0.72, ry = r.reach[1] / 180 * H * 0.72;
      g.strokeStyle = colour; g.lineWidth = 3; g.setLineDash([10, 7]);
      g.beginPath(); g.ellipse(x(r.u), y(r.lat), rx, ry, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.textAlign = 'center'; g.font = '700 20px system-ui,sans-serif'; g.lineWidth = 5; g.strokeStyle = '#14102a'; g.fillStyle = colour;
      const labelX = Math.min(W - 170, Math.max(170, x(r.u)));
      g.strokeText(`${r.name} (${r.biome})`, labelX, y(r.lat) - ry - 8); g.fillText(`${r.name} (${r.biome})`, labelX, y(r.lat) - ry - 8);
      for (const m of r.maps) {
        g.beginPath(); g.arc(x(m.u), y(m.lat), 6, 0, Math.PI * 2); g.fillStyle = '#fff'; g.strokeStyle = '#14102a'; g.lineWidth = 3; g.fill(); g.stroke();
        g.font = '700 13px system-ui,sans-serif'; g.lineWidth = 4; g.strokeText(m.name, x(m.u), y(m.lat) + 20); g.fillStyle = '#fff'; g.fillText(m.name, x(m.u), y(m.lat) + 20);
      }
    }
  }, 30);
  return () => root.remove();
}
