const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { loadLegacy, legacyRawCourses, sourceHashes } = require('../tools/legacy-adapter.cjs');

const root = path.resolve(__dirname, '..');
const main = path.join(root, 'tools/cli/main.mjs');
const cli = (...args) => spawnSync(process.execPath, [main, ...args], { encoding: 'utf8' });

(async () => {
  const commands = await import(pathToFileURL(path.join(root, 'tools/cli/commands.mjs')).href);
  const legacy = loadLegacy();
  const raw = legacyRawCourses(legacy);
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
  let failed = 0;
  const run = (name, fn) => {
    try { fn(); console.log('PASS:', name); }
    catch (error) { failed++; console.log('FAIL:', name, '\n  ', error.message); }
  };

  run('list shows 22 courses and 6 starters', () => {
    const { code, lines } = commands.runList(raw);
    assert.equal(code, 0);
    assert.equal(lines.length, 22);
    assert.equal(lines.filter(l => l.includes('starter')).length, 6);
  });
  run('validate passes on the live data', () => {
    const { code, lines } = commands.runValidate({ raw, inventory, hashes: sourceHashes() });
    assert.equal(code, 0, lines.join('\n'));
  });
  run('validate fails on stale data', () => {
    const edited = JSON.parse(JSON.stringify(raw));
    edited[0].putts[0].par += 1;
    const { code, lines } = commands.runValidate({ raw: edited, inventory, hashes: sourceHashes() });
    assert.equal(code, 1);
    assert.ok(lines.some(l => /putt 0: par/.test(l)));
  });
  run('shot reproduces all six recorded reference traces (sink tick matches)', () => {
    const refs = inventory.simulationReferences.shots;
    assert.equal(refs.length, 6);
    for (const ref of refs) {
      const out = commands.runShot(legacy.HOLES, ref.map, ref.putt, ref.shot.deg, ref.shot.power);
      assert.equal(out.code, 0);
      assert.equal(out.result.mode, 'sunk', `map ${ref.map}`);
      assert.equal(out.result.ticks, ref.samples[ref.samples.length - 1].tick, `map ${ref.map} sink tick`);
    }
  });
  run('shot rejects bad arguments', () => {
    for (const args of [[99, 0, 0, 0.5], [0, 9, 0, 0.5], [0, 0, 'x', 0.5], [0, 0, 0, 0], [0, 0, 0, 1.5]]) {
      assert.equal(commands.runShot(legacy.HOLES, ...args).code, 1, JSON.stringify(args));
    }
  });
  run('process: list exits 0 and prints 22 lines', () => {
    const r = cli('list');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim().split('\n').length, 22);
  });
  run('process: validate exits 0', () => {
    const r = cli('validate');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /VALIDATE OK: 22 courses/);
  });
  run('process: validate --live also proves the snapshot matches the legacy source', () => {
    const r = cli('validate', '--live');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SNAPSHOT PARITY OK/);
  });
  run('shot sinks a known reference shot', () => {
    const ref = inventory.simulationReferences.shots[0];
    const r = cli('shot', String(ref.map), String(ref.putt), String(ref.shot.deg), String(ref.shot.power));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SUNK/);
  });
  run('process: shot sinks a known reference shot', () => {
    const ref = inventory.simulationReferences.shots[0];
    const r = cli('shot', String(ref.map), String(ref.putt), String(ref.shot.deg), String(ref.shot.power));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SUNK/);
  });
  run('process: unknown command and bad shot exit 1', () => {
    assert.equal(cli('nope').status, 1);
    assert.equal(cli('shot', '99', '0', '0', '0.5').status, 1);
  });

  if (failed) { console.log(`\n${failed} CLI TEST(S) FAILED`); process.exit(1); }
  console.log('\nALL CLI TESTS PASSED');
})();
