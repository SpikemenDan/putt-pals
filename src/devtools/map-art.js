/**
 * Development-only view of the flat master map (VIS-M1): the painting of the reference world (src/render/reference-map.js), with no 3D, so
 * it can be reviewed and polished on its own before it goes anywhere else. Open it with `?art` on the dev server; `?art=faithful` picks the
 * reference's own colours. The Pins toggle lays the six regions and their course sites (src/shared/gaia-reference-regions.js) over the
 * art, in the level select's caption-box style; they are drawn on a copy, never into the master painting. Plain DOM, text only.
 */

import { REFERENCE_LOOKS, MAP_ART_W, paintReferenceMap } from '../render/reference-map.js';
import { MAP_WIDTH } from '../shared/gaia-reference.js';
import { REFERENCE_REGIONS } from '../shared/gaia-reference-regions.js';
import { GAIA_REGIONS, REGION_COURSES } from '../shared/gaia-map.js';
import { createCourseData } from '../courses/index.js';

const INK = '#14102a', PAPER = '#fff8e4', PIN = '#ffd23f', FONT = "'Titan One', 'Arial Black', sans-serif";

const boxSize = (g, text, size) => { g.font = `${size}px ${FONT}`; return [g.measureText(text).width + size * 0.9, size * 1.45]; };
const hits = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** A caption box centred on (x, y). */
function caption(g, text, x, y, size) {
  const [w, h] = boxSize(g, text, size), left = x - w / 2, top = y - h / 2, lift = size * 0.16;
  g.fillStyle = INK; g.fillRect(left + lift, top + lift, w, h);
  g.fillStyle = PAPER; g.fillRect(left, top, w, h);
  g.lineWidth = size * 0.14; g.strokeStyle = INK; g.strokeRect(left, top, w, h);
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, left + w / 2, y + size * 0.06);
}

/** Region captions and numbered course pins over a copy of the art. */
function drawPins(g, names) {
  const k = MAP_ART_W / MAP_WIDTH, pin = 30, gap = 12, taken = [], tags = [];
  const pins = GAIA_REGIONS.flatMap(region => (REGION_COURSES[region.id] ?? []).map((index, n) => [index, ...(REFERENCE_REGIONS[region.id]?.sites[n] ?? []).map(v => v * k)])).filter(p => Number.isFinite(p[1]));
  for (const region of GAIA_REGIONS) { // region captions and pins claim their space first
    const place = REFERENCE_REGIONS[region.id];
    if (!place) continue;
    const [w, h] = boxSize(g, region.name, 54);
    taken.push([place.label[0] * k - w / 2, place.label[1] * k - h / 2, w + 9, h + 9]);
  }
  for (const [, x, y] of pins) taken.push([x - pin - 4, y - pin - 4, pin * 2 + 13, pin * 2 + 13]);
  for (const [index, x, y] of pins) { // each name tag takes the first free side of its pin: right, left, below, above
    const [w, h] = boxSize(g, names[index] ?? '', 26), d = pin + gap;
    const sides = [[x + d + w / 2, y], [x - d - w / 2, y], [x, y + d + h / 2], [x, y - d - h / 2], [x + d + w / 2, y + h], [x - d - w / 2, y - h]];
    const box = ([cx, cy]) => [cx - w / 2, cy - h / 2, w + 5, h + 5];
    const fits = c => { const b = box(c); return b[0] > 8 && b[0] + b[2] < g.canvas.width - 8 && !taken.some(t => hits(b, t)); };
    const spot = sides.find(fits) ?? sides.find(c => box(c)[0] > 8 && box(c)[0] + box(c)[2] < g.canvas.width - 8) ?? sides[0];
    taken.push(box(spot)); tags.push([names[index] ?? '', ...spot]);
  }
  for (const [text, cx, cy] of tags) caption(g, text, cx, cy, 26);
  for (const region of GAIA_REGIONS) {
    const place = REFERENCE_REGIONS[region.id];
    if (!place) continue;
    (REGION_COURSES[region.id] ?? []).forEach((index, n) => {
      const [sx, sy] = place.sites[n] ?? [], x = sx * k, y = sy * k;
      if (!Number.isFinite(x)) return;
      g.beginPath(); g.arc(x + 5, y + 5, pin, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
      g.beginPath(); g.arc(x, y, pin, 0, Math.PI * 2); g.fillStyle = PIN; g.fill();
      g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
      g.font = `30px ${FONT}`; g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(index + 1), x, y + 2);
    });
    caption(g, region.name, place.label[0] * k, place.label[1] * k, 54);
  }
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
    if (pinBox.checked) { await doc.fonts?.load?.(`30px ${FONT}`).catch(() => {}); drawPins(g, names); }
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
