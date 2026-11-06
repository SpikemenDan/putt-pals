/**
 * Development-only close-ups for the loading-screen sky (VIS-M1): the whole view plus a city, a ship and a plane, each followed live by
 * its own camera, so the owner can judge the models before they are approved. Open it with `?gallery` on the dev server.
 * Every cell is the real scene with the real settings; nothing here is saved. Plain DOM, text only.
 */

import * as THREE from 'three';
import { createDisplay } from '../shared/display.js';
import { buildPlanet, mulberry32 } from '../render/planet-data.js';
import { createPlanetScene } from '../render/planet-scene.js';

const STYLE = `
.pp-gal{position:fixed;inset:0;z-index:2147483100;overflow:auto;background:#0b1240;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:16px}
.pp-gal p{margin:0 0 10px;color:#c8d2ff}
.pp-gal button{font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#ffd23f;cursor:pointer}
.pp-gal-grid{display:flex;flex-wrap:wrap;gap:14px}
.pp-gal-cell{position:relative;overflow:hidden;border:3px solid #14102a;border-radius:12px;background:linear-gradient(#1d3f9e,#4aa3ff 70%,#a7e0ff)}
.pp-gal-cell canvas{position:absolute;inset:0;width:100%;height:100%}
.pp-gal-cell span{position:absolute;left:8px;top:8px;z-index:2;background:#14102a;color:#ffd23f;padding:3px 8px;border-radius:6px;font-weight:700}
`;

const CELLS = [['Whole view', null], ['City close-up', 'city'], ['Ship close-up', 'ship'], ['Plane close-up', 'plane']];

export function mountPlanetGallery(doc) {
  const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); Object.assign(n, props); n.append(...kids); return n; };
  const root = el('div', { className: 'pp-gal' });
  const close = el('button', { type: 'button', textContent: 'Close gallery' });
  const status = el('p', { textContent: 'Building the planet…' });
  const grid = el('div', { className: 'pp-gal-grid' });
  root.append(el('style', { textContent: STYLE }), close, el('h1', { textContent: 'Loading screen: close-ups' }), status, grid);
  doc.body.append(root);
  const scenes = [];
  const stop = () => { for (const s of scenes) s.dispose(); root.remove(); };
  setTimeout(() => {
    const planet = buildPlanet(mulberry32(0x9a1a));
    status.textContent = 'Live, with the shipped settings. Same planet in every view.';
    for (const [label, focus] of CELLS) {
      const canvas = el('canvas'), box = el('div', { className: 'pp-gal-cell' }, canvas, el('span', { textContent: label }));
      box.style.width = '600px'; box.style.height = '330px';
      grid.append(box);
      const scene = createPlanetScene({ THREE, canvas, display: createDisplay({}), random: mulberry32(7), planet, focus });
      scene.start();
      scenes.push(scene);
    }
  }, 30);
  close.addEventListener('click', stop);
  return stop;
}
