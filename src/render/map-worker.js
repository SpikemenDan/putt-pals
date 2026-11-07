/**
 * Paints the flat master map (reference-map.js) off the main thread, so the globe and the level select never stall while a 4096-wide
 * painting or a region close-up is made. Messages in: { id, name, view, width, height }. Out: { id, bitmap } (an ImageBitmap, row 0 at the
 * north, transferred) or { id, error }. Used only through map-paint.js.
 */

import { paintReferenceMap } from './reference-map.js';

const doc = { createElement: () => new OffscreenCanvas(1, 1) };

self.onmessage = event => {
  const { id, name, view, width, height } = event.data;
  try {
    const { canvas } = paintReferenceMap(doc, name, { view, width, height });
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
