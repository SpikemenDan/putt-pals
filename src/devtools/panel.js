/**
 * Development-only panel for the display tuner (src/devtools/display-tuner.js): a slider per DISPLAY field with its units,
 * range, default, how a change takes effect and which files read it; per-field and global reset; validated JSON export and
 * import; a list of how the active overrides differ from the shipped defaults; and a read-only view of the simulation (TUNING)
 * settings with the same traceability. A visible badge shows whenever temporary overrides are active so they cannot be mistaken
 * for shipped defaults, which live in src/shared/display.js and are never changed here. Plain DOM, text only.
 *
 * `sources` (file name -> source text) lets the panel derive "read by" lists; `tuning` ({ fields, values }) enables the read-only
 * TUNING section. Both are optional and supplied by src/app/main.js in development builds.
 */

import { CONFIG_DOMAINS, RESTART, findConsumers, unitsOf } from '../shared/config-meta.js';

const STYLE = `
.pp-tune{position:fixed;right:12px;bottom:12px;z-index:2147483000;font:12px/1.35 system-ui,sans-serif;color:#1b1b1f}
.pp-tune *{box-sizing:border-box}
.pp-tune-toggle{display:flex;gap:8px;align-items:center;padding:6px 10px;border:0;border-radius:8px;background:#1b1b1f;color:#fff;cursor:pointer;font:inherit}
.pp-tune-badge{background:#ff8a1f;color:#1b1b1f;border-radius:4px;padding:1px 5px;font-weight:700}
.pp-tune-badge[hidden]{display:none}
.pp-tune-body{position:absolute;right:0;bottom:36px;width:340px;max-height:72vh;overflow:auto;background:#fff;border:1px solid #c8c8d0;border-radius:10px;padding:10px;box-shadow:0 6px 24px #0004}
.pp-tune-body[hidden]{display:none}
.pp-tune-note{margin:0 0 8px;padding:6px;border-radius:6px;background:#eef3ff}
.pp-tune-note.temp{background:#fff1dd}
.pp-tune-diff{margin:0 0 10px;padding:6px;border:1px solid #e3e3ea;border-radius:6px}
.pp-tune-diff h4{margin:0 0 4px;font-size:12px}
.pp-tune-diff ul{margin:0;padding-left:16px}
.pp-tune-diff .none{color:#555}
.pp-tune-row{margin:0 0 10px}
.pp-tune-row label{display:flex;justify-content:space-between;gap:6px;font-weight:600}
.pp-tune-row input[type=range]{width:100%}
.pp-tune-row small{display:block;color:#555}
.pp-tune-row .readby{color:#2a4a8a}
.pp-tune-row.changed label span:first-child::after{content:' \\2022';color:#ff8a1f}
.pp-tune button.pp-small{font:inherit;padding:2px 8px;border:1px solid #999;border-radius:6px;background:#f4f4f6;cursor:pointer}
.pp-tune textarea{width:100%;height:90px;margin-top:6px;font:11px/1.3 ui-monospace,monospace}
.pp-tune-status{min-height:1.4em;margin:4px 0;color:#a00}
.pp-tune-status.ok{color:#176b2c}
.pp-tune details{margin:10px 0 0;padding-top:6px;border-top:1px solid #e3e3ea}
.pp-tune details summary{cursor:pointer;font-weight:600}
.pp-tune-ro{margin:6px 0;font-size:11px}
.pp-tune-ro .dead{color:#a00;font-weight:600}
`;

const stepFor = (min, max) => { const span = max - min; return span <= 5 ? 0.01 : span <= 100 ? 0.1 : 1; };
const fmt = v => String(+Number(v).toFixed(3));
const shortName = file => file.replace(/^\//, '').split('/').slice(-2).join('/');
const read = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

/** @returns {{element: HTMLElement, dispose: () => void}} */
export function mountTuningPanel(doc, tuner, { sources = null, tuning = null } = {}) {
  const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); Object.assign(n, props); n.append(...kids); return n; };
  const style = el('style', { textContent: STYLE });
  const root = el('div', { className: 'pp-tune' });
  const badge = el('span', { className: 'pp-tune-badge', textContent: 'TEMP OVERRIDES', hidden: true });
  const toggle = el('button', { className: 'pp-tune-toggle', type: 'button' }, el('span', { textContent: 'Display tuning' }), badge);
  const body = el('div', { className: 'pp-tune-body', hidden: true });
  const note = el('p', { className: 'pp-tune-note' });
  const diffList = el('ul');
  const diff = el('div', { className: 'pp-tune-diff' }, el('h4', { textContent: 'Differences from shipped defaults' }), diffList);
  const status = el('div', { className: 'pp-tune-status', role: 'status' });
  const io = el('textarea', { spellcheck: false, placeholder: 'Paste exported overrides here, then Import' });
  const rows = new Map();
  const unitsFor = path => unitsOf('display', path) ?? '';
  const consumersLine = (path, domain) => {
    if (!sources) return null;
    const found = findConsumers(path, sources, CONFIG_DOMAINS[domain].roots);
    return found.length ? `read by ${found.map(shortName).join(', ')}` : 'read by NOTHING (no source file reads this setting)';
  };

  const say = (text, ok = false) => { status.textContent = text; status.className = 'pp-tune-status' + (ok ? ' ok' : ''); };

  for (const [path, min, max, description] of tuner.fields) {
    const input = el('input', { type: 'range', min, max, step: stepFor(min, max) });
    const value = el('span');
    const reset = el('button', { className: 'pp-small', type: 'button', textContent: 'Reset', title: 'Restore the shipped default' });
    const dflt = read(tuner.defaults, path);
    const readBy = consumersLine(path, 'display');
    const row = el('div', { className: 'pp-tune-row' },
      el('label', {}, el('span', { textContent: path }), value),
      input,
      el('small', { textContent: `${unitsFor(path)} · range ${min}–${max} · default ${dflt} · applies live. ${description}` }),
      ...(readBy ? [el('small', { className: 'readby', textContent: readBy })] : []),
      reset);
    input.addEventListener('input', () => {
      try { tuner.set(path, Number(input.value)); say(''); } catch (error) { say(error.message); refresh(); }
    });
    reset.addEventListener('click', () => { tuner.reset(path); say(''); });
    rows.set(path, { input, value, row });
    body.append(row);
  }

  const resetAll = el('button', { className: 'pp-small', type: 'button', textContent: 'Reset all to defaults' });
  const exportBtn = el('button', { className: 'pp-small', type: 'button', textContent: 'Export' });
  const importBtn = el('button', { className: 'pp-small', type: 'button', textContent: 'Import' });
  resetAll.addEventListener('click', () => { tuner.reset(); say('Reset to shipped defaults.', true); });
  exportBtn.addEventListener('click', () => { io.value = tuner.exportJson(); say('Exported ' + Object.keys(tuner.overrides).length + ' override(s) below.', true); });
  importBtn.addEventListener('click', () => {
    try { tuner.importJson(io.value); say('Imported.', true); } catch (error) { say(error.message); }
  });
  toggle.addEventListener('click', () => { body.hidden = !body.hidden; });
  body.prepend(note, diff);
  body.append(el('div', {}, resetAll, ' ', exportBtn, ' ', importBtn), io, status);

  // Read-only simulation settings: values, units, how they take effect and what reads them.
  let tuningSection = null;
  if (tuning) {
    const items = tuning.fields.map(([path, min, max]) => {
      const readBy = consumersLine(path, 'tuning');
      const current = read(tuning.values, path), shipped = read(tuning.defaults ?? tuning.values, path);
      return el('div', { className: 'pp-tune-ro' },
        el('strong', { textContent: `${path} = ${fmt(current)}` }), ` ${unitsOf('tuning', path) ?? ''} (${min} to ${max})`,
        ...(current !== shipped ? [' ', el('span', { className: 'dead', textContent: 'differs from the shipped default' })] : []),
        ...(readBy ? [el('br'), el('span', { className: readBy.includes('NOTHING') ? 'dead' : 'readby', textContent: readBy })] : []));
    });
    tuningSection = el('details', {}, el('summary', { textContent: `Simulation settings (TUNING), read-only: ${items.length}` }),
      el('p', { className: 'pp-tune-note', textContent: `Not editable here. ${RESTART.reload}. Change them in src/shared/tuning.js, then re-run the affected checks (docs/TUNING.md).` }), ...items);
    body.append(tuningSection);
  }
  root.append(body, toggle);

  function refresh() {
    for (const [path, { input, value, row }] of rows) {
      const v = tuner.get(path);
      input.value = v;
      value.textContent = fmt(v);
      row.classList.toggle('changed', tuner.isOverridden(path));
    }
    const active = tuner.active;
    badge.hidden = !active;
    note.className = 'pp-tune-note' + (active ? ' temp' : '');
    note.textContent = active
      ? 'Temporary overrides are active in this browser tab only. They are not shipped defaults, and this panel never changes the defaults in src/shared/display.js: export them and have them made defaults. These settings are presentation-only and apply live.'
      : 'Showing shipped defaults (src/shared/display.js). These settings are presentation-only and apply live; physics and session rules are read-only below.';
    diffList.replaceChildren();
    const changed = Object.keys(tuner.overrides);
    if (!changed.length) diffList.append(el('li', { className: 'none', textContent: 'none: every value is the shipped default' }));
    for (const path of changed) diffList.append(el('li', { textContent: `${path}: ${fmt(read(tuner.defaults, path))} → ${fmt(tuner.get(path))} ${unitsFor(path)}` }));
  }
  const stop = tuner.onChange(refresh);
  refresh();
  doc.head.append(style);
  doc.body.append(root);
  return { element: root, dispose() { stop(); root.remove(); style.remove(); } };
}
