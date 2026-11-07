/**
 * Development-only view of the flat master map (VIS-M1): just the painting from src/render/atlas-art.js, with no 3D, so it can be reviewed and
 * polished on its own before it goes anywhere else. Open it with `?art` on the dev server; `?art=storybook` or `?art=atlas` picks a look.
 * Plain DOM, text only.
 */

import { MAP_LOOKS, paintWorld } from '../render/atlas-art.js';
import { gaiaPlanet } from '../render/planet-data.js';

export function mountMapArt(doc) {
  const win = doc.defaultView, start = new URLSearchParams(win.location.search).get('art');
  const root = doc.createElement('div'), bar = doc.createElement('div'), holder = doc.createElement('div');
  root.dataset.ui = 'map-art';
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483200;overflow:auto;background:#fff3d0;padding:10px;box-sizing:border-box';
  bar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
  const show = name => {
    holder.replaceChildren();
    const art = paintWorld(doc, gaiaPlanet(), name);
    art.style.cssText = 'display:block;width:100%;height:auto;border:2px solid #14102a';
    holder.append(art);
    for (const b of bar.children) b.setAttribute('aria-pressed', String(b.dataset.look === name));
  };
  for (const name of Object.keys(MAP_LOOKS)) {
    const b = doc.createElement('button');
    b.type = 'button'; b.textContent = name; b.dataset.look = name;
    b.addEventListener('click', () => show(name));
    bar.append(b);
  }
  root.append(bar, holder);
  doc.body.append(root);
  setTimeout(() => show(MAP_LOOKS[start] ? start : 'comic'), 30);
}
