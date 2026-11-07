/**
 * The flat master map, painted in a worker (map-worker.js): the whole world once, shared by the globe and the level select, and sharp
 * close-ups of any window on request. Each result is an ImageBitmap with row 0 at the north. Resolves null where workers or OffscreenCanvas
 * are missing (old browsers, tests), so callers keep what they already show.
 */

import { MAP_ART_H, MAP_ART_W } from './reference-map.js';

let worker = null, failed = false, nextId = 1, world = null;
const waiting = new Map();

function start() {
  if (worker || failed) return worker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') { failed = true; return null; }
  try {
    worker = new Worker(new URL('./map-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { const job = waiting.get(data.id); waiting.delete(data.id); job?.(data.bitmap ?? null); };
    worker.onerror = () => { failed = true; for (const job of waiting.values()) job(null); waiting.clear(); worker?.terminate(); worker = null; };
  } catch { failed = true; worker = null; }
  return worker;
}

/**
 * Paints a window of the map in the worker. `view` is {x, y, w, h} in reference map pixels (the whole world when omitted), painted at
 * `width` by `height`. Resolves an ImageBitmap, or null if it cannot be painted here.
 */
export function paintMapAsync({ name = 'comic', view = null, width = MAP_ART_W, height = MAP_ART_H } = {}) {
  const w = start();
  if (!w) return Promise.resolve(null);
  const id = nextId++;
  return new Promise(resolve => { waiting.set(id, resolve); w.postMessage({ id, name, view, width, height }); });
}

/** The whole world in the comic look, painted once per page and shared. */
export function worldMap() {
  world ??= paintMapAsync();
  return world;
}
