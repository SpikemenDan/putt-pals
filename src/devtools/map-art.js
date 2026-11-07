/**
 * Development-only view of the flat master map (VIS-M1): the painting of the reference world (src/render/reference-map.js), with no 3D, so
 * it can be reviewed and polished on its own before it goes anywhere else. Open it with `?art` on the dev server; `?art=faithful` picks the
 * reference's own colours. The Pins toggle lays the six regions and their course sites (src/shared/gaia-reference-regions.js) over the
 * art, in the level select's caption-box style, with name tags laid out so none collide (src/render/map-labels.js); they are drawn on a
 * copy, never into the master painting. Plain DOM, text only.
 */

import { REFERENCE_LOOKS, MAP_ART_H, MAP_ART_W, paintReferenceMap } from '../render/reference-map.js';
import { MAP_HEIGHT, MAP_WIDTH } from '../shared/gaia-reference.js';
import { REFERENCE_REGIONS } from '../shared/gaia-reference-regions.js';
import { GAIA_REGIONS, REGION_COURSES } from '../shared/gaia-map.js';
import { createCourseData } from '../courses/index.js';
import { layoutMapLabels } from '../render/map-labels.js';

const INK = '#14102a', PAPER = '#fff8e4', PIN = '#ffd23f', FONT = "'Titan One', 'Arial Black', sans-serif";

const boxSize = (g, text, size) => { g.font = `${size}px ${FONT}`; return [g.measureText(text).width + size * 0.9, size * 1.45]; };

/** A caption box centred on (x, y). */
function caption(g, text, x, y, size) {
  const [w, h] = boxSize(g, text, size), left = x - w / 2, top = y - h / 2, lift = size * 0.16;
  g.fillStyle = INK; g.fillRect(left + lift, top + lift, w, h);
  g.fillStyle = PAPER; g.fillRect(left, top, w, h);
  g.lineWidth = size * 0.14; g.strokeStyle = INK; g.strokeRect(left, top, w, h);
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, left + w / 2, y + size * 0.06);
}

/** Region captions and numbered course pins over a copy of the art, tags laid out so none collide. Returns how many still overlap. */
function drawPins(g, names) {
  const kx = MAP_ART_W / MAP_WIDTH, ky = MAP_ART_H / MAP_HEIGHT, r = 30;
  const regions = GAIA_REGIONS.filter(region => REFERENCE_REGIONS[region.id]).map(region => {
    const [w, h] = boxSize(g, region.name, 54), [x, y] = REFERENCE_REGIONS[region.id].label;
    return { text: region.name, x: x * kx, y: y * ky, w: w + 6, h: h + 6 };
  });
  const pins = GAIA_REGIONS.flatMap(region => (REGION_COURSES[region.id] ?? []).map((index, n) => {
    const site = REFERENCE_REGIONS[region.id]?.sites[n];
    if (!site) return null;
    const text = names[index] ?? '', [w, h] = boxSize(g, text, 26);
    return { index, text, x: site[0] * kx, y: site[1] * ky, r: r + 2, w: w + 2, h: h + 2 };
  })).filter(Boolean);
  const { regions: spots, tags, overlaps } = layoutMapLabels({ regions, pins, width: g.canvas.width, height: g.canvas.height, gap: 7 });
  g.lineWidth = 5; g.strokeStyle = INK;
  tags.forEach((t, i) => { if (t.leader) { g.beginPath(); g.moveTo(pins[i].x, pins[i].y); g.lineTo(t.x, t.y); g.stroke(); } });
  tags.forEach((t, i) => caption(g, pins[i].text, t.x, t.y, 26));
  for (const p of pins) {
    g.beginPath(); g.arc(p.x + 5, p.y + 5, r, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fillStyle = PIN; g.fill();
    g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    g.font = `30px ${FONT}`; g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(p.index + 1), p.x, p.y + 2);
  }
  regions.forEach((region, i) => caption(g, region.text, spots[i].x, spots[i].y, 54));
  return overlaps;
}

export function mountMapArt(doc) {
  const win = doc.defaultView, start = new URLSearchParams(win.location.search).get('art');
  const names = createCourseData().definitions.map(c => c.name);
  const root = doc.createElement('div'), bar = doc.createElement('div'), holder = doc.createElement('div');
  root.dataset.ui = 'map-art';
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483200;overflow:auto;background:#fff3d0;padding:10px;box-sizing:border-box';
  bar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
  const pins = doc.createElement('label'), pinBox = doc.createElement('input');
  pinBox.type = 'checkbox'; pinBox.checked = new URLSearchParams(win.location.search).get('pins') !== '0';
  pins.append(pinBox, ' Pins');
  let current = null;
  const show = async name => {
    current = name;
    const { canvas: art } = paintReferenceMap(doc, name), canvas = doc.createElement('canvas');
    canvas.width = art.width; canvas.height = art.height;
    const g = canvas.getContext('2d');
    g.drawImage(art, 0, 0);
    if (pinBox.checked) { await doc.fonts?.load?.(`30px ${FONT}`).catch(() => {}); root.dataset.labelOverlaps = String(drawPins(g, names)); }
    if (current !== name) return;
    canvas.style.cssText = 'display:block;width:100%;height:auto;border:2px solid #14102a';
    holder.replaceChildren(canvas);
    for (const b of bar.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.look === name));
  };
  for (const name of Object.keys(REFERENCE_LOOKS)) {
    const b = doc.createElement('button');
    b.type = 'button'; b.textContent = name; b.dataset.look = name;
    b.addEventListener('click', () => show(name));
    bar.append(b);
  }
  pinBox.addEventListener('change', () => current && show(current));
  bar.append(pins);
  root.append(bar, holder);
  doc.body.append(root);
  setTimeout(() => show(REFERENCE_LOOKS[start] ? start : 'comic'), 30);
}
