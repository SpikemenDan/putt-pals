// Development display tuner and panel (src/devtools): validation, import/export, live effect on consumers, and the DOM panel.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

async function run() {
  const THREE = await import('three');
  const { createDisplayTuner, OVERRIDES_STORAGE_KEY } = await import('../src/devtools/display-tuner.js');
  const { mountTuningPanel } = await import('../src/devtools/panel.js');
  const { DEFAULT_DISPLAY, DISPLAY, DISPLAY_FIELDS } = await import('../src/shared/display.js');
  const { createAimGuide } = await import('../src/render/actors.js');

  // Defaults: no overrides, the live object equals DEFAULT_DISPLAY, and DEFAULT_DISPLAY is never mutated.
  const tuner = createDisplayTuner();
  assert.deepEqual(tuner.display, DEFAULT_DISPLAY);
  assert.equal(tuner.active, false);

  // A live change reaches an existing consumer without recreating it.
  const guide = createAimGuide(THREE, tuner.display);
  const bp = new THREE.Vector3(0, 0, 0);
  const headWidth = () => { guide.show(bp, { charge: 1, angle: 0 }); return Math.abs(guide.arrow.geometry.attributes.position.getZ(6)); };
  assert.ok(Math.abs(headWidth() - 3.6) < 1e-4);
  tuner.set('aim.arrowHeadHalfWidth', 9);
  assert.ok(Math.abs(headWidth() - 9) < 1e-4, 'the existing guide follows the tuner');
  assert.equal(tuner.active, true);
  assert.deepEqual(tuner.overrides, { 'aim.arrowHeadHalfWidth': 9 });
  assert.equal(DEFAULT_DISPLAY.aim.arrowHeadHalfWidth, 3.6, 'shipped defaults are untouched');
  assert.equal(DISPLAY.aim.arrowHeadHalfWidth, 3.6);

  // Invalid values change nothing: out of range, cross-field, unknown path.
  assert.throws(() => tuner.set('aim.arrowOpacity', 5), /arrowOpacity/);
  assert.throws(() => tuner.set('aim.arrowShaftHalfWidth', 20), /must not exceed/);
  assert.throws(() => tuner.set('aim.arrowOpacty', 0.5), /unknown field/);
  assert.deepEqual(tuner.overrides, { 'aim.arrowHeadHalfWidth': 9 });
  assert.equal(tuner.get('aim.arrowOpacity'), 0.92);

  // Setting a value back to its default clears the override; reset restores defaults.
  tuner.set('aim.arrowHeadHalfWidth', 3.6);
  assert.equal(tuner.active, false);
  tuner.set('ball.visualScale', 1.5);
  tuner.set('aim.arrowMaxLength', 120);
  tuner.reset('ball.visualScale');
  assert.deepEqual(tuner.overrides, { 'aim.arrowMaxLength': 120 });
  const exported = tuner.exportJson();
  assert.deepEqual(JSON.parse(exported), { version: 1, display: { aim: { arrowMaxLength: 120 } } });
  tuner.reset();
  assert.deepEqual(tuner.display, DEFAULT_DISPLAY);

  // Import round-trips, and rejects bad input without partially applying it.
  tuner.importJson(exported);
  assert.equal(tuner.get('aim.arrowMaxLength'), 120);
  const before = tuner.exportJson();
  for (const bad of ['not json', '[]', '{"version":2,"display":{}}', '{"version":1}',
    '{"version":1,"display":{"aim":{"arrowMaxLength":50,"arrowOpacty":1}}}',
    '{"version":1,"display":{"aim":{"arrowMaxLength":50,"arrowOpacity":7}}}',
    '{"version":1,"display":{"aim":5}}',
    '{"version":1,"display":{"ball":{"radius":9}}}']) {
    assert.throws(() => tuner.importJson(bad), Error, bad);
    assert.equal(tuner.exportJson(), before, 'a rejected import changes nothing: ' + bad);
    assert.equal(tuner.get('aim.arrowMaxLength'), 120);
  }

  // Storage: overrides survive a reload; corrupt stored values are discarded.
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const first = createDisplayTuner({ storage });
  first.set('ball.visualScale', 2);
  assert.equal(createDisplayTuner({ storage }).get('ball.visualScale'), 2);
  store.set(OVERRIDES_STORAGE_KEY, '{"version":1,"display":{"ball":{"visualScale":99}}}');
  const recovered = createDisplayTuner({ storage });
  assert.equal(recovered.active, false);
  assert.equal(store.has(OVERRIDES_STORAGE_KEY), false, 'a bad stored value is dropped');

  // Panel: one slider per field with range and unit, input drives the tuner, the badge tracks overrides.
  const dom = new JSDOM('<!doctype html><body></body>');
  const doc = dom.window.document;
  const live = createDisplayTuner();
  const panel = mountTuningPanel(doc, live);
  const sliders = [...doc.querySelectorAll('input[type=range]')];
  assert.equal(sliders.length, DISPLAY_FIELDS.length);
  sliders.forEach((s, i) => { assert.equal(+s.min, DISPLAY_FIELDS[i][1]); assert.equal(+s.max, DISPLAY_FIELDS[i][2]); assert.equal(+s.value, live.get(DISPLAY_FIELDS[i][0])); });
  const badge = doc.querySelector('.pp-tune-badge');
  assert.equal(badge.hidden, true, 'no badge on shipped defaults');
  const slider = path => sliders[DISPLAY_FIELDS.findIndex(f => f[0] === path)];
  const opacity = slider('aim.arrowOpacity');
  opacity.value = '0.5';
  opacity.dispatchEvent(new dom.window.Event('input'));
  assert.equal(live.get('aim.arrowOpacity'), 0.5);
  assert.equal(badge.hidden, false, 'badge shows while overrides are active');
  assert.match(doc.querySelector('.pp-tune-note').textContent, /not shipped defaults/);
  // An invalid slider move (shaft wider than head) is refused and the slider snaps back.
  const shaft = slider('aim.arrowShaftHalfWidth');
  shaft.value = '30';
  shaft.dispatchEvent(new dom.window.Event('input'));
  assert.equal(live.get('aim.arrowShaftHalfWidth'), 1.3);
  assert.equal(+shaft.value, 1.3);
  assert.match(doc.querySelector('.pp-tune-status').textContent, /must not exceed/);
  // Export, import and reset through the buttons.
  const button = text => [...doc.querySelectorAll('button')].find(b => b.textContent === text);
  const area = doc.querySelector('textarea');
  button('Export').click();
  assert.deepEqual(JSON.parse(area.value), { version: 1, display: { aim: { arrowOpacity: 0.5 } } });
  button('Reset all to defaults').click();
  assert.equal(live.active, false);
  assert.equal(+opacity.value, 0.92);
  assert.equal(badge.hidden, true);
  button('Import').click();
  assert.equal(live.get('aim.arrowOpacity'), 0.5, 'import applies the exported overrides');
  area.value = '{"version":1,"display":{"aim":{"arrowOpacty":1}}}';
  button('Import').click();
  assert.match(doc.querySelector('.pp-tune-status').textContent, /unknown field aim\.arrowOpacty/);
  assert.equal(live.get('aim.arrowOpacity'), 0.5, 'a rejected import leaves the panel state alone');
  panel.dispose();
  assert.equal(doc.querySelector('.pp-tune'), null);
  dom.window.close();
  console.log('ALL DEVTOOLS TESTS PASSED');
}
run().catch(e => { console.error('FAILED with error:', e); process.exitCode = 1; });
