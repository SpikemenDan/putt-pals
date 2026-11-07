/**
 * Placement of the flat map's name tags so none of them collide: every pin keeps its disc, each region caption takes the nearest spot
 * to where it was placed that is clear of the pins and other captions, and each course tag takes the first free spot around its pin. Spots are tried ring by ring (right, left, below, above, then the
 * diagonals), moving outward until one is clear of every caption, pin and earlier tag and inside the map. A tag that had to move off its
 * pin's first ring is marked `leader`, so the drawing can join it to its pin with a short line. Pure geometry, no DOM: callers measure
 * text themselves and pass box sizes in the same units as the positions.
 */

/** Axis-aligned boxes as [left, top, width, height]. */
export const boxesOverlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

const centredBox = (x, y, w, h, pad) => [x - w / 2 - pad, y - h / 2 - pad, w + pad * 2, h + pad * 2];

/**
 * `regions`: [{ x, y, w, h }] captions centred on (x, y). `pins`: [{ x, y, r, w, h }], a disc of radius r and its tag's size.
 * `width`, `height`: the map's bounds. `gap`: clear space between a pin and its tag, and kept around every box.
 * Returns { regions: [{ x, y }] and tags: [{ x, y, leader }], centred positions in input order, overlaps: how many pairs of boxes still touch (0 when all fit) }.
 */
export function layoutMapLabels({ regions = [], pins = [], width, height, gap = 10 }) {
  const pad = gap / 2, margin = gap;
  const inside = b => b[0] >= margin && b[1] >= margin && b[0] + b[2] <= width - margin && b[1] + b[3] <= height - margin;
  const discs = pins.map(p => centredBox(p.x, p.y, p.r * 2, p.r * 2, pad)), captions = [];
  const placedRegions = regions.map(r => {
    const ys = [0, ...Array.from({ length: 12 }, (_, i) => (i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2) * (r.h / 3))]; // up first, then down
    const xs = [0, -r.w / 4, r.w / 4, -r.w / 2, r.w / 2];
    const spots = xs.flatMap(dx => ys.map(dy => [r.x + dx, r.y + dy])).sort((a, b) => Math.hypot(a[0] - r.x, (a[1] - r.y) * 2) - Math.hypot(b[0] - r.x, (b[1] - r.y) * 2)); // nearest first
    const [x, y] = spots.find(([x, y]) => { const b = centredBox(x, y, r.w, r.h, pad); return inside(b) && !discs.some(d => boxesOverlap(b, d)) && !captions.some(c => boxesOverlap(b, c)); }) ?? [r.x, r.y];
    captions.push(centredBox(x, y, r.w, r.h, pad));
    return { x, y };
  });
  const fixed = [...captions, ...discs], placed = [], tags = [];
  for (const p of pins) {
    let spot = null;
    for (let ring = 0; ring < 8 && !spot; ring++) {
      const push = ring * (p.h + gap), dx = p.r + gap + p.w / 2 + push, dy = p.r + gap + p.h / 2 + push;
      const options = [[dx, 0], [-dx, 0], [0, dy], [0, -dy], [dx, dy], [dx, -dy], [-dx, dy], [-dx, -dy]];
      for (const [ox, oy] of options) {
        const x = p.x + ox, y = p.y + oy, box = centredBox(x, y, p.w, p.h, pad);
        if (inside(box) && !fixed.some(f => boxesOverlap(box, f)) && !placed.some(f => boxesOverlap(box, f))) { spot = { x, y, leader: ring > 0 || (ox !== 0 && oy !== 0) }; placed.push(box); break; }
      }
    }
    if (!spot) { spot = { x: p.x + p.r + gap + p.w / 2, y: p.y, leader: false }; placed.push(centredBox(spot.x, spot.y, p.w, p.h, pad)); }
    tags.push(spot);
  }
  const all = [...placedRegions.map((r, i) => centredBox(r.x, r.y, regions[i].w, regions[i].h, 0)), ...pins.map(p => centredBox(p.x, p.y, p.r * 2, p.r * 2, 0)), ...tags.map((t, i) => centredBox(t.x, t.y, pins[i].w, pins[i].h, 0))];
  let overlaps = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (boxesOverlap(all[i], all[j])) overlaps++;
  return { regions: placedRegions, tags, overlaps };
}
