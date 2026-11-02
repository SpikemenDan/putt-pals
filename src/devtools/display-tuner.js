/**
 * Development-only tuner for the presentation settings in src/shared/display.js.
 *
 * `display` is one live object with the same shape as DISPLAY. The renderer, aim guide and input adapter read it
 * on every frame, so a change shows at once. Overrides are held as a flat path -> value map, are validated as a
 * whole before any of them is applied, and never touch DEFAULT_DISPLAY: shipping a value means editing the
 * default deliberately. Only DISPLAY fields can be tuned here. TUNING (physics, shot mapping, session rules) is
 * never exposed, because changing it live would desync a match and invalidate recorded difficulty.
 */

import { DEFAULT_DISPLAY, DISPLAY_FIELDS, createDisplay } from '../shared/display.js';

export const OVERRIDES_VERSION = 1;
export const OVERRIDES_STORAGE_KEY = 'putt-pals.display-overrides';

const FIELD_PATHS = DISPLAY_FIELDS.map(([path]) => path);
const read = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function write(obj, path, value) {
  const keys = path.split('.');
  let target = obj;
  for (const k of keys.slice(0, -1)) target = target[k] ??= {};
  target[keys.at(-1)] = value;
}
const nest = flat => { const out = {}; for (const [path, value] of Object.entries(flat)) write(out, path, value); return out; };

/**
 * @param {{storage?: Storage|null}} [options] Optional storage (sessionStorage in the browser) so a reload keeps the
 *   temporary overrides; a bad stored value is discarded rather than applied.
 */
export function createDisplayTuner({ storage = null } = {}) {
  const display = structuredClone(DEFAULT_DISPLAY);
  const listeners = new Set();
  let overrides = {};

  function exportJson() { return JSON.stringify({ version: OVERRIDES_VERSION, display: nest(overrides) }, null, 2); }

  /** Validates `flat` as a whole, then applies it. Throws before changing anything when invalid. */
  function commit(flat) {
    const next = createDisplay(nest(flat));
    for (const path of FIELD_PATHS) write(display, path, read(next, path));
    overrides = flat;
    try { storage?.setItem(OVERRIDES_STORAGE_KEY, exportJson()); } catch { /* storage is optional */ }
    for (const l of [...listeners]) l(api);
  }

  const api = {
    /** The live display object. Mutated in place; never reassign or keep a copy. */
    display,
    defaults: DEFAULT_DISPLAY,
    fields: DISPLAY_FIELDS,
    get overrides() { return { ...overrides }; },
    get active() { return Object.keys(overrides).length > 0; },
    isOverridden: path => path in overrides,
    get: path => read(display, path),
    /** Sets one field. A value equal to its default clears the override. Throws and changes nothing when invalid. */
    set(path, value) {
      if (!FIELD_PATHS.includes(path)) throw new Error('Invalid display: unknown field ' + path);
      const flat = { ...overrides };
      if (value === read(DEFAULT_DISPLAY, path)) delete flat[path]; else flat[path] = value;
      commit(flat);
    },
    /** Restores one field, or every field, to the shipped default. */
    reset(path) {
      if (path === undefined) return commit({});
      const flat = { ...overrides };
      delete flat[path];
      return commit(flat);
    },
    exportJson,
    /** Replaces all overrides from exported JSON. Validated before applying; throws and changes nothing when invalid. */
    importJson(text) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error('Import is not valid JSON'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== OVERRIDES_VERSION || !parsed.display || typeof parsed.display !== 'object') {
        throw new Error('Import must be {"version": ' + OVERRIDES_VERSION + ', "display": {...}}');
      }
      createDisplay(parsed.display); // rejects unknown keys and bad values with the offending field named
      const flat = {};
      for (const path of FIELD_PATHS) {
        const v = read(parsed.display, path);
        if (v !== undefined && v !== read(DEFAULT_DISPLAY, path)) flat[path] = v;
      }
      commit(flat);
    },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };

  try {
    const stored = storage?.getItem(OVERRIDES_STORAGE_KEY);
    if (stored) api.importJson(stored);
  } catch { try { storage?.removeItem(OVERRIDES_STORAGE_KEY); } catch { /* ignore */ } }
  return api;
}
