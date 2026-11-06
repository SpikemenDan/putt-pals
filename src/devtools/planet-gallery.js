/**
 * Development-only preview gallery for the loading-screen planet (VIS-M1): one planet drawn several times side by side, so the
 * owner can compare looks before one becomes the shipped default. Open it with `?gallery` on the dev server.
 *
 * Section 1 steps `loading.landSmoothness` from chunky pixels (0) to smooth (1). Section 2 shows the four skyline styles
 * (`loading.cityStyle`) standing on the near limb at the default size, then the first style small and large (`loading.citySize`).
 * Each cell is a real scene built with the real display settings, drawn once (no motion), so what you see is what the setting does.
 * Nothing here is saved; to ship a choice, edit the defaults in src/shared/display.js. Plain DOM, text only.
 */

import { createDisplay } from '../shared/display.js';
import { buildPlanet, createPlanetScene, mulberry32 } from '../ui/planet-scene.js';
import { CITY_STYLES } from '../ui/sky-models.js';

const STYLE = `
.pp-gal{position:fixed;inset:0;z-index:2147483100;overflow:auto;background:#0b1240;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:16px}
.pp-gal h2{margin:18px 0 4px;font-size:20px}.pp-gal p{margin:0 0 10px;color:#c8d2ff}
.pp-gal button{font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#ffd23f;cursor:pointer}
.pp-gal-grid{display:flex;flex-wrap:wrap;gap:14px}
.pp-gal-cell{position:relative;overflow:hidden;border:3px solid #14102a;border-radius:12px;background:linear-gradient(#0b1240,#1d3f9e 45%,#4aa3ff 85%)}
.pp-gal-cell canvas{position:absolute;inset:0;width:100%;height:100%}
.pp-gal-cell span{position:absolute;left:8px;top:8px;z-index:2;background:#14102a;color:#ffd23f;padding:3px 8px;border-radius:6px;font-weight:700}
`;

/** Base settings for every cell: still, uncluttered and bright, so the thing being compared is the thing that differs. */
const CELL = { spinSpeed: 0, planes: 0, boats: 0, satellites: 0, cloudCover: 0.45, axisTilt: 0, horizonHeight: 0.4 };

export function mountPlanetGallery(doc) {
  const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); Object.assign(n, props); n.append(...kids); return n; };
  const root = el('div', { className: 'pp-gal' });
  const close = el('button', { type: 'button', textContent: 'Close gallery' });
  const status = el('p', { textContent: 'Building the planet…' });
  root.append(el('style', { textContent: STYLE }), close, el('h1', { textContent: 'Planet loading screen: land and city previews' }), status);
  doc.body.append(root);
  const scenes = [];
  const cell = (grid, label, loading, w, h, focusCity, planet) => {
    const box = el('div', { className: 'pp-gal-cell' }, el('span', { textContent: label }));
    box.style.width = w + 'px'; box.style.height = h + 'px';
    const canvas = el('canvas'), sprites = el('canvas');
    box.append(canvas, sprites); grid.append(box);
    const scene = createPlanetScene({ canvas, sprites, display: createDisplay({ loading: { ...CELL, ...loading } }), random: mulberry32(7), planet, reducedMotion: true, focusCity });
    scene.start();
    scenes.push(scene);
  };
  setTimeout(() => {
    const planet = buildPlanet(mulberry32(0x9a1a));
    status.textContent = 'Same planet each time. Only the named setting changes.';
    root.append(el('h2', { textContent: '1. Land: pixelated to smooth (loading.landSmoothness)' }), el('p', { textContent: 'Left is chunky pixels with a flat palette; right is smooth. The default is 0.5. Tell me which one you want.' }));
    const lands = el('div', { className: 'pp-gal-grid' });
    root.append(lands);
    for (const s of [0, 0.2, 0.35, 0.5, 0.7, 1]) cell(lands, 'landSmoothness ' + s, { landSmoothness: s }, 380, 280, false, planet);
    root.append(el('h2', { textContent: '2. Cities (loading.cityStyle and loading.citySize)' }), el('p', { textContent: 'A city on the near limb, so the skyline stands against the sky. First row: the four styles at the default size 1.6. Second row: style 0 at three sizes.' }));
    const styles = el('div', { className: 'pp-gal-grid' }), sizes = el('div', { className: 'pp-gal-grid' });
    root.append(styles, sizes);
    CITY_STYLES.forEach((st, i) => cell(styles, `cityStyle ${i}: ${st.name}`, { cityStyle: i, citySize: 1.6, landSmoothness: 0.6, cloudCover: 0, horizonHeight: 0.5 }, 720, 400, true, planet));
    for (const size of [1, 2.2, 3]) cell(sizes, `citySize ${size}`, { cityStyle: 0, citySize: size, landSmoothness: 0.6, cloudCover: 0, horizonHeight: 0.5 }, 720, 400, true, planet);
  }, 30);
  close.addEventListener('click', () => { for (const s of scenes) s.dispose(); root.remove(); });
  return () => { for (const s of scenes) s.dispose(); root.remove(); };
}
