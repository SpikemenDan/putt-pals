const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
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
  const { createCourseData, validateCourseGeometry } = await import(pathToFileURL(path.join(root, 'src/courses/index.js')).href);
  const data = createCourseData();
  let failed = 0;
  const run = (name, fn) => {
    try { fn(); console.log('PASS:', name); }
    catch (error) { failed++; console.log('FAIL:', name, '\n  ', error.message); }
  };

  run('imported geometry and resolved rules exactly match all legacy courses', () => {
    assert.deepEqual(data.definitions, JSON.parse(JSON.stringify(legacy.HOLES)));
    assert.deepEqual(data.rules, JSON.parse(JSON.stringify(raw)));
    assert.deepEqual(data.sourceHashes, sourceHashes());
    const fresh = createCourseData();
    fresh.definitions[0].w[0][0] += 99;
    fresh.rules[0].putts[0].tee[0] += 99;
    assert.deepEqual(createCourseData(), data, 'callers must own independent course data');
  });
  run('geometry boundary rejects malformed tuples, dimensions, ramps and nonfinite values', () => {
    for (const mutate of [c => { c.tiles = []; }, c => { c.w[0] = [0, 0, -1, 2]; },
      c => { c.fan = [[0, 0, 1, 1, NaN, 0, 1]]; }, c => { c.rp = [[0, 0, 1, 1, 'up', 0, 1]]; },
      c => { c.tp = [[1, 2]]; }, c => { c.movers = null; }]) {
      const course = structuredClone(data.definitions[0]);
      mutate(course);
      assert.equal(validateCourseGeometry(course).valid, false);
    }
  });
  run('imported courses reproduce all 36 recorded robust starter shots', () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/solver-baseline.json'), 'utf8'));
    assert.equal(baseline.results.length, 36);
    for (const ref of baseline.results) {
      const out = commands.runShot(data.definitions, ref.map, ref.putt, ref.best.deg, ref.best.power);
      assert.equal(out.result.mode, 'sunk', `${ref.name} putt ${ref.putt}`);
      assert.equal(out.result.strokes, 1);
    }
  });
  run('list rejects invalid course rules rather than reporting success', () => {
    const bad = structuredClone(data.rules);
    bad[0].putts[0].par = 0;
    assert.equal(commands.runList(bad).code, 1);
  });
  run('process: list and shot work without legacy HTML, tools.js or VM adapter', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-cli-imports-'));
    try {
      fs.cpSync(path.join(root, 'src'), path.join(temp, 'src'), { recursive: true });
      fs.cpSync(path.join(root, 'tools/cli'), path.join(temp, 'tools/cli'), { recursive: true });
      const entry = path.join(temp, 'tools/cli/main.mjs');
      for (const args of [['list'], ['shot', '0', '0', String(inventory.simulationReferences.shots[0].shot.deg), String(inventory.simulationReferences.shots[0].shot.power)]]) {
        const out = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', cwd: temp });
        assert.equal(out.status, 0, out.stdout + out.stderr);
        if (args[0] === 'shot') assert.match(out.stdout, /SUNK/);
      }
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  run('validate detects stale exported source provenance', () => {
    const out = commands.runValidate({ raw: data.rules, inventory, hashes: sourceHashes(), courseHashes: { ...data.sourceHashes, htmlSha256: 'stale' } });
    assert.equal(out.code, 1);
    assert.ok(out.lines.some(line => line.includes('Imported courses:')));
  });
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
      assert.deepEqual(commands.runShot(data.definitions, ref.map, ref.putt, ref.shot.deg, ref.shot.power), out, `map ${ref.map} imported trajectory result`);
    }
  });
  run('shot rejects bad arguments', () => {
    for (const args of [[0, '', 0, 0.5], [0, 0, '', 0.5], [0, 0, 0, ''], [99, 0, 0, 0.5], [0, 9, 0, 0.5], [0, 0, 'x', 0.5], [0, 0, 0, 0], [0, 0, 0, 1.5]]) {
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
