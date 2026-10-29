/**
 * Pure 2D rectangle helpers for course geometry checks. Rectangles are the
 * legacy [x, y, w, h] tuples (x/y ground plane). No DOM, rendering or physics imports.
 */

/** Area of the intersection of two rectangles (0 when they only touch or are apart). */
export function overlapArea(a, b) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Width and height of the intersection (each 0 when disjoint), for penetration depth. */
export function overlapExtent(a, b) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return [Math.max(0, w), Math.max(0, h)];
}

/** Shortest distance from point p to the (filled) rectangle; 0 when inside. */
export function pointRectDistance(p, r) {
  const dx = Math.max(r[0] - p[0], 0, p[0] - (r[0] + r[2]));
  const dy = Math.max(r[1] - p[1], 0, p[1] - (r[1] + r[3]));
  return Math.hypot(dx, dy);
}

export function pointInRect(p, r) {
  return p[0] >= r[0] && p[0] <= r[0] + r[2] && p[1] >= r[1] && p[1] <= r[1] + r[3];
}

/** True when `rect` is entirely covered by the union of `covers` (coordinate-compression check). */
export function rectCovered(rect, covers) {
  const xs = new Set([rect[0], rect[0] + rect[2]]);
  const ys = new Set([rect[1], rect[1] + rect[3]]);
  for (const c of covers) {
    for (const x of [c[0], c[0] + c[2]]) if (x > rect[0] && x < rect[0] + rect[2]) xs.add(x);
    for (const y of [c[1], c[1] + c[3]]) if (y > rect[1] && y < rect[1] + rect[3]) ys.add(y);
  }
  const sx = [...xs].sort((a, b) => a - b);
  const sy = [...ys].sort((a, b) => a - b);
  for (let i = 0; i < sx.length - 1; i++) {
    for (let j = 0; j < sy.length - 1; j++) {
      const mid = [(sx[i] + sx[i + 1]) / 2, (sy[j] + sy[j + 1]) / 2];
      if (!covers.some(c => pointInRect(mid, c))) return false;
    }
  }
  return true;
}

/** Bounding rectangle swept by an oscillating mover over its full travel (see movingRect). */
export function moverSweep(h) {
  const dx = Math.abs(h[4] * h[6]);
  const dy = Math.abs(h[5] * h[6]);
  return [h[0] - dx, h[1] - dy, h[2] + 2 * dx, h[3] + 2 * dy];
}
