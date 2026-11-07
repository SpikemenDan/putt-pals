/**
 * Development-only view of the flat master map (VIS-M1): the painting of the reference world (src/render/reference-map.js), with no 3D, so
 * it can be reviewed and polished on its own before it goes anywhere else. Open it with `?art` on the dev server; `?art=faithful` picks the
 * reference's own colours. Plain DOM, text only.
 */

import { REFERENCE_LOOKS, paintReferenceMap } from '../render/reference-map.js';

export function mountMapArt(doc) {
  const win = doc.defaultView, start = new URLSearchParams(win.location.search).get('art');
  const root = doc.createElement('div'), bar = doc.createElement('div'), holder = doc.createElement('div');
  root.dataset.ui = 'map-art';
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483200;overflow:auto;background:#fff3d0;padding:10px;box-sizing:border-box';
  bar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
  const show = name => {
    holder.replaceChildren();
    const { canvas } = paintReferenceMap(doc, name);
    canvas.style.cssText = 'display:block;width:100%;height:auto;border:2px solid #14102a';
    holder.append(canvas);
    for (const b of bar.children) b.setAttribute('aria-pressed', String(b.dataset.look === name));
  };
  for (const name of Object.keys(REFERENCE_LOOKS)) {
    const b = doc.createElement('button');
    b.type = 'button'; b.textContent = name; b.dataset.look = name;
    b.addEventListener('click', () => show(name));
    bar.append(b);
  }
  root.append(bar, holder);
  doc.body.append(root);
  setTimeout(() => show(REFERENCE_LOOKS[start] ? start : 'comic'), 30);
}
