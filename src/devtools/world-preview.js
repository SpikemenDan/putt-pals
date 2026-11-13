/**
 * Development-only world gravity preview (VIS-W #164): play the current course as if it were on Gaia, Ares or Luna,
 * and try other gravity values with a slider (Ares 490 and Luna 315 were accepted this way on 2026-11-12).
 *
 * Gravity is a physics setting, so nothing here applies live. A change is staged and only takes effect when the
 * putt restarts (the "Apply and restart putt" button, or the next putt). The preview applies in solo rooms only:
 * every player in a party must simulate the same gravity, so src/app/app.js ignores it when the roster has more
 * than one player. Shipped values stay in src/shared/tuning.js (`gravity`, `worlds.ares.gravity`,
 * `worlds.luna.gravity`); this module never changes them. Export gives JSON to have chosen values made defaults.
 *
 * The selected world's scenery (VIS-E #166: Ares wind, Luna dust and solar activity, src/render/atmosphere.js) is drawn
 * at once, in any room, because it is visual only; its strength and density are the `environment.*` sliders in the
 * Display tuning panel.
 */

import { TUNING, TUNING_FIELDS } from '../shared/tuning.js';
import { DEFAULT_WORLD, WORLDS, isWorldId, worldGravity, worldOf } from '../shared/worlds.js';

export const WORLD_PREVIEW_STORAGE_KEY = 'putt-pals.world-preview';
export const WORLD_PREVIEW_VERSION = 1;

const rangeOf = path => { const field = TUNING_FIELDS.find(([p]) => p === path); return { min: field[1], max: field[2] }; };
/** Slider bounds: the validated tuning range, capped so the slider stays usable for playtesting. */
export const GRAVITY_SLIDER = Object.freeze({ min: 50, max: Math.min(1500, rangeOf('gravity').max), step: 5 });

function checkGravity(value) {
  const { min, max } = rangeOf('gravity');
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Gravity must be a number within [' + min + ', ' + max + '], got ' + value);
  return value;
}

/**
 * @param {{storage?: Storage|null, tuning?: object}} [options] sessionStorage in the browser so a reload keeps the
 *   preview; a bad stored value is discarded rather than applied.
 */
export function createWorldPreview({ storage = null, tuning = TUNING } = {}) {
  let world = DEFAULT_WORLD;
  let overrides = {}; // world id -> gravity
  const listeners = new Set();

  const state = () => ({ version: WORLD_PREVIEW_VERSION, world, gravity: { ...overrides } });
  function commit(nextWorld, nextOverrides) {
    if (!isWorldId(nextWorld)) throw new Error('Unknown world: ' + nextWorld);
    for (const [id, value] of Object.entries(nextOverrides)) { worldOf(id); checkGravity(value); }
    world = nextWorld; overrides = nextOverrides;
    try { storage?.setItem(WORLD_PREVIEW_STORAGE_KEY, JSON.stringify(state())); } catch { /* storage is optional */ }
    for (const listener of [...listeners]) listener(api);
  }

  const api = {
    worlds: WORLDS,
    get world() { return world; },
    /** Shipped gravity of a world (from tuning). */
    shipped: id => worldGravity(id, tuning),
    /** Gravity the preview simulates for a world: the staged override, else the shipped value. */
    gravityOf: id => overrides[id] ?? worldGravity(id, tuning),
    /** Gravity for the selected world. */
    get gravity() { return api.gravityOf(world); },
    /** True when the preview differs from shipped Gaia play (another world or any override). */
    get active() { return world !== DEFAULT_WORLD || Object.keys(overrides).length > 0; },
    get overrides() { return { ...overrides }; },
    setWorld(id) { commit(id, overrides); },
    /** Sets a world's preview gravity; a value equal to the shipped one clears the override. */
    setGravity(id, value) {
      const next = { ...overrides };
      if (checkGravity(value) === worldGravity(id, tuning)) delete next[id]; else next[id] = value;
      commit(id, next);
    },
    reset() { commit(DEFAULT_WORLD, {}); },
    exportJson() { return JSON.stringify(state(), null, 2); },
    /** Validates the whole document before applying any of it. */
    importJson(text) {
      let doc;
      try { doc = JSON.parse(text); } catch { throw new Error('Import is not valid JSON'); }
      if (!doc || doc.version !== WORLD_PREVIEW_VERSION || typeof doc.gravity !== 'object' || doc.gravity === null || Array.isArray(doc.gravity)) throw new Error('Import must be a version ' + WORLD_PREVIEW_VERSION + ' world preview export');
      commit(doc.world ?? DEFAULT_WORLD, { ...doc.gravity });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };

  try {
    const stored = storage?.getItem(WORLD_PREVIEW_STORAGE_KEY);
    if (stored) api.importJson(stored);
  } catch {
    try { storage?.removeItem(WORLD_PREVIEW_STORAGE_KEY); } catch { /* ignore */ }
    world = DEFAULT_WORLD; overrides = {};
  }
  return api;
}

const STYLE = `
.pp-world{position:fixed;left:12px;top:12px;z-index:2147483000;width:250px;font:12px/1.35 system-ui,sans-serif;color:#1b1b1f;background:#fff;border:1px solid #c8c8d0;border-radius:10px;padding:10px;box-shadow:0 6px 24px #0004}
.pp-world *{box-sizing:border-box}
.pp-world h4{margin:0 0 6px;font-size:12px;display:flex;justify-content:space-between;gap:6px;align-items:center}
.pp-world .badge{background:#ff8a1f;border-radius:4px;padding:1px 5px;font-weight:700}
.pp-world .badge[hidden]{display:none}
.pp-world .worlds{display:flex;gap:4px;margin:0 0 8px}
.pp-world .worlds button{flex:1;font:inherit;padding:3px 0;border:1px solid #999;border-radius:6px;background:#f4f4f6;cursor:pointer}
.pp-world .worlds button[aria-pressed=true]{background:#1b1b1f;color:#fff;border-color:#1b1b1f}
.pp-world label{display:flex;justify-content:space-between;font-weight:600}
.pp-world input[type=range]{width:100%}
.pp-world small{display:block;color:#555;margin:2px 0 6px}
.pp-world .row{display:flex;gap:4px;flex-wrap:wrap}
.pp-world .row button{font:inherit;padding:2px 8px;border:1px solid #999;border-radius:6px;background:#f4f4f6;cursor:pointer}
.pp-world .row button.primary{background:#2d5bd8;color:#fff;border-color:#2d5bd8}
.pp-world textarea{width:100%;height:70px;margin-top:6px;font:11px/1.3 ui-monospace,monospace}
.pp-world .status{min-height:1.4em;margin-top:4px;color:#a00}
.pp-world .status.ok{color:#176b2c}
.pp-world button:focus-visible,.pp-world input:focus-visible{outline:2px solid #2d5bd8;outline-offset:1px}
`;

/** Chip In launch speed reference for the airtime readout (units/s), from tuning. */
const airtime = (gravity, tuning) => (2 * tuning.powerups.chipLaunch) / gravity;

/**
 * Mounts the preview box. `app` (src/app/app.js) supplies `restartPutt()`; without it the change applies from the next putt.
 * Returns a dispose function.
 */
export function mountWorldPreview(doc, preview, app = null, { tuning = TUNING } = {}) {
  const el = (tag, props = {}, ...children) => { const node = Object.assign(doc.createElement(tag), props); node.append(...children); return node; };
  const style = el('style', { textContent: STYLE });
  const box = el('section', { className: 'pp-world', ariaLabel: 'World gravity preview (development only)' });
  box.dataset.ui = 'world-preview';
  const badge = el('span', { className: 'badge', textContent: 'Preview' });
  const buttons = new Map(preview.worlds.map(w => [w.id, el('button', { type: 'button', textContent: w.name })]));
  const value = el('span');
  const slider = el('input', { type: 'range', id: 'pp-world-gravity', min: GRAVITY_SLIDER.min, max: GRAVITY_SLIDER.max, step: GRAVITY_SLIDER.step });
  const info = el('small');
  const apply = el('button', { type: 'button', className: 'primary', textContent: 'Apply and restart putt' });
  const resetWorld = el('button', { type: 'button', textContent: 'Reset world' });
  const resetAll = el('button', { type: 'button', textContent: 'Reset all' });
  const exportBtn = el('button', { type: 'button', textContent: 'Export' });
  const importBtn = el('button', { type: 'button', textContent: 'Import' });
  const io = el('textarea', { id: 'pp-world-io', spellcheck: false, placeholder: 'Paste an exported world preview here, then Import' });
  const status = el('div', { className: 'status', role: 'status' });
  const say = (text, ok = false) => { status.textContent = text; status.className = ok ? 'status ok' : 'status'; };
  const sliderLabel = el('label', { htmlFor: 'pp-world-gravity' }, el('span', { textContent: 'Gravity (units/s²)' }), value);

  box.append(
    el('h4', {}, el('span', { textContent: 'World gravity · dev only' }), badge),
    el('div', { className: 'worlds' }, ...buttons.values()),
    sliderLabel, slider, info,
    el('div', { className: 'row' }, apply, resetWorld, resetAll, exportBtn, importBtn), io, status,
  );

  const render = () => {
    const id = preview.world, g = preview.gravity, shipped = preview.shipped(id);
    for (const [wid, button] of buttons) button.setAttribute('aria-pressed', String(wid === id));
    slider.value = String(g);
    value.textContent = String(g) + (g === shipped ? '' : ' (shipped ' + shipped + ')');
    info.textContent = worldOf(id).name + ': shipped ' + shipped + ' units/s² · Chip In airtime ' + airtime(g, tuning).toFixed(2) + ' s (Gaia ' + airtime(preview.shipped('gaia'), tuning).toFixed(2) + ' s). Gravity: solo rooms only, applies when the putt restarts. Scenery switches now; tune it under Display tuning → environment.';
    badge.hidden = !preview.active;
  };
  const guard = fn => () => { try { fn(); } catch (error) { say(error.message); } };
  for (const [id, button] of buttons) button.addEventListener('click', guard(() => { preview.setWorld(id); say('Staged ' + worldOf(id).name + '. Apply to restart the putt.', true); }));
  slider.addEventListener('input', guard(() => { preview.setGravity(preview.world, Number(slider.value)); say('Staged. Apply to restart the putt.', true); }));
  apply.addEventListener('click', guard(() => { say(app?.restartPutt?.() ? 'Putt restarted at ' + preview.gravity + ' units/s².' : 'Applies from the next putt (start a solo round).', true); }));
  resetWorld.addEventListener('click', guard(() => { preview.setGravity(preview.world, preview.shipped(preview.world)); say('Reset ' + worldOf(preview.world).name + ' to shipped.', true); }));
  resetAll.addEventListener('click', guard(() => { preview.reset(); say('Back to shipped Gaia. Apply to restart the putt.', true); }));
  exportBtn.addEventListener('click', () => { io.value = preview.exportJson(); say('Exported below.', true); });
  importBtn.addEventListener('click', guard(() => { preview.importJson(io.value); say('Imported. Apply to restart the putt.', true); }));
  const unsubscribe = preview.subscribe(render);
  render();
  doc.head.append(style);
  doc.body.append(box);
  return () => { unsubscribe(); box.remove(); style.remove(); };
}
