// Configuration traceability: units and restart rules for every setting, consumers derived from the source, the `config` report,
// and the development panel's traceability view (overrides against defaults, read-by lists, read-only TUNING section).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
const load = rel => import(pathToFileURL(path.join(root, rel)).href);

(async () => {
  const meta = await load('src/shared/config-meta.js');
  const { TUNING_FIELDS, DEFAULT_TUNING, TUNING } = await load('src/shared/tuning.js');
  const { DISPLAY_FIELDS, DEFAULT_DISPLAY } = await load('src/shared/display.js');
  const { createDisplayTuner } = await load('src/devtools/display-tuner.js');
  const { mountTuningPanel } = await load('src/devtools/panel.js');
  const report = await load('tools/cli/config-report.mjs');
  const sources = report.readSources(root);

  await scenario('units: every DISPLAY and TUNING setting has units, and no unit rule is dead', async () => {
    for (const [p] of DISPLAY_FIELDS) assert.ok(meta.unitsOf('display', p), `display ${p}`);
    for (const [p] of TUNING_FIELDS) assert.ok(meta.unitsOf('tuning', p), `tuning ${p}`);
    for (const [pattern] of meta.TUNING_UNITS) assert.ok(TUNING_FIELDS.some(([p]) => pattern.test(p)), `unit rule ${pattern} matches no setting`);
    assert.deepEqual(Object.keys(meta.DISPLAY_UNITS).sort(), DISPLAY_FIELDS.map(f => f[0]).sort(), 'no stale display units');
    assert.equal(meta.unitsOf('tuning', 'aim.fullPullPx'), 'CSS px');
    assert.equal(meta.unitsOf('tuning', 'surface.turf.friction'), '1/s');
    assert.equal(meta.unitsOf('display', 'aim.arrowOpacity'), 'opacity, 0 to 1');
    assert.match(meta.RESTART.live, /read every frame/);
    assert.match(meta.RESTART.reload, /simulation fingerprint/);
    assert.equal(meta.CONFIG_DOMAINS.display.restart, 'live');
    assert.equal(meta.CONFIG_DOMAINS.tuning.restart, 'reload');
  });

  await scenario('consumers: direct uses, aliases, destructuring, alias chains, group-wide uses and leaf aliases are found; definitions and the panel are not consumers', async () => {
    const synthetic = {
      'src/a.js': 'const x = TUNING.surface.turf.friction * 2;',
      'src/b.js': 'const AIM = TUNING.aim;\nconst k = AIM.fullPullPx + AIM.swayPeriod;',
      'src/c.js': 'const { surface: SURF, bounce: BOUNCE } = TUNING;\nconst f = SURF.sand.friction; const r = BOUNCE.wallRestitution;',
      'src/d.js': 'const S = TUNING.surface;\nconst T = S.turf;\nconst d = T.drag;',
      'src/e.js': 'export const M = Object.freeze({ ...TUNING.surfaceDragMultiplier });',
      'src/f.js': 'const { gravity } = TUNING;\nconst g = gravity * 2;',
      'src/g.js': 'const { gravity } = TUNING;',
      'src/h.js': 'const unrelated = OTHER.aim.fullPullPx; const aim = { fullPullPx: 1 };',
      'src/shared/tuning.js': 'TUNING.aim.fullPullPx',
      'src/devtools/panel.js': 'TUNING.aim.fullPullPx',
      'src/i.js': 'export const L = DISPLAY.aim.arrowMaxLength;\nconst a = display.aim;\nconst o = a.arrowOpacity;',
    };
    const t = p => meta.findConsumers(p, synthetic, ['TUNING']);
    assert.deepEqual(t('surface.turf.friction'), ['src/a.js'], 'direct use; an alias that reads a different leaf does not count');
    assert.deepEqual(t('aim.fullPullPx'), ['src/b.js'], 'alias use; a different object, the definitions and the panel do not count');
    assert.deepEqual(t('surface.sand.friction'), ['src/c.js']);
    assert.deepEqual(t('bounce.wallRestitution'), ['src/c.js']);
    assert.deepEqual(t('surface.turf.drag'), ['src/d.js'], 'alias of an alias');
    assert.deepEqual(t('surfaceDragMultiplier.ice'), ['src/e.js'], 'whole group used at once');
    assert.deepEqual(t('gravity'), ['src/f.js'], 'a destructured leaf counts only when it is used after the declaration');
    assert.deepEqual(meta.findConsumers('aim.arrowMaxLength', synthetic, ['DISPLAY', 'display']), ['src/i.js'], 'a leaf assigned from the root is a use');
    assert.deepEqual(meta.findConsumers('aim.arrowOpacity', synthetic, ['DISPLAY', 'display']), ['src/i.js'], 'alias of the root group');
    assert.deepEqual(t('aim.keyStep'), [], 'nothing reads it');
  });

  await scenario('consumers: every DISPLAY setting is read, and exactly one TUNING setting (documented) is not', async () => {
    const display = meta.buildReport({ domain: 'display', fields: DISPLAY_FIELDS, defaults: DEFAULT_DISPLAY, sources });
    assert.deepEqual(display.filter(r => !r.consumers.length).map(r => r.path), []);
    const byPath = Object.fromEntries(display.map(r => [r.path, r.consumers]));
    assert.ok(byPath['ball.visualScale'].includes('src/render/renderer.js'));
    assert.ok(byPath['aim.arrowOpacity'].includes('src/render/actors.js'));
    assert.ok(byPath['aim.arrowMaxLength'].includes('src/input/adapter.js') && byPath['aim.arrowMaxLength'].includes('src/render/actors.js'));
    const tuning = meta.buildReport({ domain: 'tuning', fields: TUNING_FIELDS, defaults: DEFAULT_TUNING, sources });
    // TUNING.aim.arrowMaxLength is superseded by DISPLAY.aim.arrowMaxLength and read by nothing; removing it changes the simulation
    // fingerprint (docs/DISPLAY.md). Any other setting nothing reads fails here: wire it up or remove it deliberately.
    assert.deepEqual(tuning.filter(r => !r.consumers.length).map(r => r.path), ['aim.arrowMaxLength']);
    const friction = tuning.find(r => r.path === 'surface.sand.friction');
    assert.deepEqual(friction.consumers, ['src/simulation/physics.js']);
    assert.equal(friction.units, '1/s');
    assert.equal(friction.restart, 'reload');
    assert.deepEqual(meta.differences(meta.buildReport({ domain: 'display', fields: DISPLAY_FIELDS, defaults: DEFAULT_DISPLAY, current: { ...DEFAULT_DISPLAY, aim: { ...DEFAULT_DISPLAY.aim, arrowOpacity: 0.5 } }, sources })).map(r => r.path), ['aim.arrowOpacity']);
  });

  await scenario('config report: prints defaults, ranges, units, restart rule and readers, flags unread settings, and validates an exported overrides file', async () => {
    const all = report.runConfig([], root);
    assert.equal(all.code, 0);
    const text = all.lines.join('\n');
    assert.match(text, /DISPLAY \(presentation\): 14 settings\. Defined in src\/shared\/display\.js, documented in docs\/DISPLAY\.md/);
    assert.match(text, /live: read every frame/);
    assert.match(text, /TUNING \(simulation, input, physics\): 76 settings/);
    assert.match(text, /aim\.arrowShaftHalfWidth = 2\.6 \(0\.1 to 50\) world units\n\s+read by: src\/render\/actors\.js/);
    assert.match(text, /Not read by anything: aim\.arrowMaxLength/);
    assert.match(text, /Every setting is read by at least one source file\./);
    const json = JSON.parse(report.runConfig(['display', '--json'], root).lines[0]);
    assert.equal(json.display.length, 14);
    assert.ok(json.display[0].consumers.length && json.display[0].units);
    assert.equal(report.runConfig(['bogus'], root).code, 1);
    assert.equal(report.runConfig(['--overrides'], root).code, 1);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-pals-config-'));
    try {
      const good = path.join(dir, 'good.json'), bad = path.join(dir, 'bad.json'), typo = path.join(dir, 'typo.json');
      fs.writeFileSync(good, JSON.stringify({ version: 1, display: { aim: { arrowOpacity: 0.5 }, ball: { visualScale: 1.5 } } }));
      fs.writeFileSync(bad, JSON.stringify({ version: 1, display: { aim: { arrowOpacity: 9 } } }));
      fs.writeFileSync(typo, JSON.stringify({ version: 1, display: { aim: { arrowOpacty: 0.5 } } }));
      const ok = report.runConfig(['display', '--overrides', good], root).lines.join('\n');
      assert.match(ok, /temporary: they do not change the shipped defaults/);
      assert.match(ok, /aim\.arrowOpacity: 0\.92 -> 0\.5 opacity, 0 to 1/);
      assert.match(ok, /ball\.visualScale: 1 -> 1\.5 multiplier/);
      assert.doesNotMatch(ok, /arrowMaxLength: /, 'unchanged settings are not listed as differences');
      assert.match(report.runConfig(['display', '--overrides', bad], root).lines[0], /arrowOpacity must be within/);
      assert.match(report.runConfig(['display', '--overrides', typo], root).lines[0], /unknown field aim\.arrowOpacty/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await scenario('panel: shows units, how changes take effect and who reads each setting; lists overrides against shipped defaults; keeps TUNING read-only', async () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const doc = dom.window.document;
    const tuner = createDisplayTuner();
    const panel = mountTuningPanel(doc, tuner, { sources: { '/src/input/adapter.js': 'const L = display.aim.arrowMaxLength;', '/src/render/actors.js': 'const a = display.aim; a.arrowOpacity; DISPLAY.aim.arrowMaxLength;' }, tuning: { fields: TUNING_FIELDS, values: TUNING, defaults: DEFAULT_TUNING } });
    const text = () => doc.querySelector('.pp-tune').textContent;
    assert.match(text(), /world units · range 1–2000 · default 100 · applies live/);
    assert.match(text(), /read by input\/adapter\.js, render\/actors\.js/);
    assert.match(text(), /read by NOTHING \(no source file reads this setting\)/, 'a setting with no reader is called out');
    assert.match(doc.querySelector('.pp-tune-diff').textContent, /none: every value is the shipped default/);
    tuner.set('aim.arrowOpacity', 0.5);
    tuner.set('ball.visualScale', 2);
    const diff = [...doc.querySelectorAll('.pp-tune-diff li')].map(li => li.textContent);
    assert.deepEqual(diff, ['aim.arrowOpacity: 0.92 → 0.5 opacity, 0 to 1', 'ball.visualScale: 1 → 2 multiplier'], 'in the order the overrides were made');
    assert.match(doc.querySelector('.pp-tune-note').textContent, /never changes the defaults in src\/shared\/display\.js/);
    assert.equal(doc.querySelector('.pp-tune-badge').hidden, false);
    // Reset removes a line; the shipped defaults are untouched throughout.
    [...doc.querySelectorAll('button')].find(b => b.textContent === 'Reset all to defaults').click();
    assert.match(doc.querySelector('.pp-tune-diff').textContent, /none: every value is the shipped default/);
    assert.equal(DEFAULT_DISPLAY.aim.arrowOpacity, 0.92);
    // Validated export of what is active, and the same file validated by the existing import.
    tuner.set('aim.arrowHeadLength', 20);
    const area = doc.querySelector('textarea');
    [...doc.querySelectorAll('button')].find(b => b.textContent === 'Export').click();
    assert.deepEqual(JSON.parse(area.value), { version: 1, display: { aim: { arrowHeadLength: 20 } } });
    area.value = '{"version":1,"display":{"aim":{"arrowHeadLength":9999}}}';
    [...doc.querySelectorAll('button')].find(b => b.textContent === 'Import').click();
    assert.match(doc.querySelector('.pp-tune-status').textContent, /arrowHeadLength must be within/);
    assert.equal(tuner.get('aim.arrowHeadLength'), 20, 'a rejected import changes nothing');
    // The TUNING section lists every simulation setting, read-only: no controls and nothing editable.
    const details = doc.querySelector('.pp-tune details');
    assert.match(details.querySelector('summary').textContent, /Simulation settings \(TUNING\), read-only: 76/);
    assert.match(details.textContent, /Not editable here\. reload: read when the modules load/);
    assert.equal(details.querySelectorAll('.pp-tune-ro').length, 76);
    assert.equal(details.querySelectorAll('input, button, textarea').length, 0, 'TUNING cannot be edited from the panel');
    assert.equal(doc.querySelectorAll('.pp-tune input[type=range]').length, DISPLAY_FIELDS.length, 'only DISPLAY has sliders');
    assert.match(details.textContent, /aim\.fullPullPx = 380 CSS px/);
    panel.dispose();
    // Without sources the panel still works and simply omits the read-by lines.
    const plain = mountTuningPanel(doc, createDisplayTuner());
    assert.ok(!doc.querySelector('.readby'));
    assert.equal(doc.querySelectorAll('details').length, 0);
    plain.dispose();
    dom.window.close();
  });

  console.log(`ALL CONFIG TRACEABILITY TESTS PASSED (${passed} scenarios)`);
})().catch(error => { console.error('FAILED with error:', error); process.exitCode = 1; });
