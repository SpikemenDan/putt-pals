/**
 * Development-only panel for the display tuner (src/devtools/display-tuner.js): a slider per DISPLAY field with
 * its unit, range and default, per-field and global reset, and validated JSON export/import. A visible badge shows
 * whenever temporary overrides are active so they cannot be mistaken for shipped defaults. Plain DOM, text only.
 */

const STYLE = `
.pp-tune{position:fixed;right:12px;bottom:12px;z-index:2147483000;font:12px/1.35 system-ui,sans-serif;color:#1b1b1f}
.pp-tune *{box-sizing:border-box}
.pp-tune-toggle{display:flex;gap:8px;align-items:center;padding:6px 10px;border:0;border-radius:8px;background:#1b1b1f;color:#fff;cursor:pointer;font:inherit}
.pp-tune-badge{background:#ff8a1f;color:#1b1b1f;border-radius:4px;padding:1px 5px;font-weight:700}
.pp-tune-badge[hidden]{display:none}
.pp-tune-body{position:absolute;right:0;bottom:36px;width:320px;max-height:70vh;overflow:auto;background:#fff;border:1px solid #c8c8d0;border-radius:10px;padding:10px;box-shadow:0 6px 24px #0004}
.pp-tune-body[hidden]{display:none}
.pp-tune-note{margin:0 0 8px;padding:6px;border-radius:6px;background:#eef3ff}
.pp-tune-note.temp{background:#fff1dd}
.pp-tune-row{margin:0 0 10px}
.pp-tune-row label{display:flex;justify-content:space-between;gap:6px;font-weight:600}
.pp-tune-row input[type=range]{width:100%}
.pp-tune-row small{display:block;color:#555}
.pp-tune-row.changed label span:first-child::after{content:' \\2022';color:#ff8a1f}
.pp-tune button.pp-small{font:inherit;padding:2px 8px;border:1px solid #999;border-radius:6px;background:#f4f4f6;cursor:pointer}
.pp-tune textarea{width:100%;height:90px;margin-top:6px;font:11px/1.3 ui-monospace,monospace}
.pp-tune-status{min-height:1.4em;margin:4px 0;color:#a00}
.pp-tune-status.ok{color:#176b2c}
`;

const stepFor = (min, max) => { const span = max - min; return span <= 5 ? 0.01 : span <= 100 ? 0.1 : 1; };
const unitFor = path => (/opacity$/.test(path) ? 'opacity' : /visualScale$/.test(path) ? '× size' : 'world units');
const fmt = v => String(+v.toFixed(3));

/** @returns {{element: HTMLElement, dispose: () => void}} */
export function mountTuningPanel(doc, tuner) {
  const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); Object.assign(n, props); n.append(...kids); return n; };
  const style = el('style', { textContent: STYLE });
  const root = el('div', { className: 'pp-tune' });
  const badge = el('span', { className: 'pp-tune-badge', textContent: 'TEMP OVERRIDES', hidden: true });
  const toggle = el('button', { className: 'pp-tune-toggle', type: 'button' }, el('span', { textContent: 'Display tuning' }), badge);
  const body = el('div', { className: 'pp-tune-body', hidden: true });
  const note = el('p', { className: 'pp-tune-note' });
  const status = el('div', { className: 'pp-tune-status', role: 'status' });
  const io = el('textarea', { spellcheck: false, placeholder: 'Paste exported overrides here, then Import' });
  const rows = new Map();

  const say = (text, ok = false) => { status.textContent = text; status.className = 'pp-tune-status' + (ok ? ' ok' : ''); };

  for (const [path, min, max, description] of tuner.fields) {
    const input = el('input', { type: 'range', min, max, step: stepFor(min, max) });
    const value = el('span');
    const reset = el('button', { className: 'pp-small', type: 'button', textContent: 'Reset', title: 'Restore the shipped default' });
    const dflt = path.split('.').reduce((o, k) => o[k], tuner.defaults);
    const row = el('div', { className: 'pp-tune-row' },
      el('label', {}, el('span', { textContent: path }), value),
      input,
      el('small', { textContent: `${unitFor(path)} · range ${min}–${max} · default ${dflt}. ${description}` }),
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
  body.prepend(note);
  body.append(el('div', {}, resetAll, ' ', exportBtn, ' ', importBtn), io, status);
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
      ? 'Temporary overrides are active in this browser only. They are not shipped defaults: export them and have them made defaults. These settings are presentation-only and apply live.'
      : 'Showing shipped defaults. These settings are presentation-only and apply live; physics and session rules are not tunable here.';
  }
  const stop = tuner.onChange(refresh);
  refresh();
  doc.head.append(style);
  doc.body.append(root);
  return { element: root, dispose() { stop(); root.remove(); style.remove(); } };
}
