// D1: course geometry snapshot. Verifies the VM-free data path matches the legacy source
// and that the simulation produces the recorded reference traces from snapshot data alone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const load = rel => import(pathToFileURL(path.join(root, rel)).href);
const snapshotText = fs.readFileSync(path.join(root, 'src/courses/data/courses.snapshot.json'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

(async () => {
  const courses = await load('src/courses/index.js');
  const sim = await load('src/simulation/index.js');
  const commands = await load('tools/cli/commands.mjs');
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
  let failed = 0;
  const run = (name, fn) => {
    try { fn(); console.log('PASS:', name); }
    catch (error) { failed++; console.log('FAIL:', name, '\n  ', error.message); }
  };

  const loaded = courses.parseCourseSnapshot(snapshotText);

  run('snapshot loads 22 courses with matching catalog entries', () => {
    assert.equal(loaded.courses.length, 22);
    assert.equal(loaded.catalog.length, 22);
    loaded.courses.forEach((c, i) => assert.equal(c.name, loaded.catalog[i].name));
  });
  run('geometry arrays are frozen; course objects stay extensible for the engine', () => {
    assert.ok(Object.isFrozen(loaded.courses[0].tiles));
    assert.ok(Object.isFrozen(loaded.courses[0].tiles[0]));
    assert.ok(Object.isFrozen(loaded.catalog[0].putts));
    assert.ok(!Object.isFrozen(loaded.courses[0]));
  });
  run('every course passes geometry validation', () => {
    loaded.courses.forEach(c => assert.deepEqual(courses.validateGeometry(c).errors, [], c.name));
  });
  run('snapshot file is current (export --check exits 0)', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/export-courses.cjs'), '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  run('simulation reproduces all six reference traces from snapshot data (no VM)', () => {
    const refs = inventory.simulationReferences.shots;
    assert.equal(refs.length, 6);
    for (const ref of refs) {
      const engine = new sim.SimulationEngine(loaded.courses[ref.map], ref.putt, { hazardTime: 0 });
      const player = engine.addPlayer('ref', 'Ref', 0);
      engine.launch('ref', (ref.shot.deg * Math.PI) / 180, ref.shot.power);
      let tick = 0;
      let next = 0;
      while (player.moving && player.mode !== 'sunk' && tick < 1000) {
        const sample = ref.samples[next];
        if (sample && sample.tick === tick) {
          for (const key of ['x', 'y', 'z', 'vx', 'vy']) {
            assert.ok(Math.abs(player[key] - sample[key]) < 1e-6, `map ${ref.map} tick ${tick} ${key}`);
          }
          next++;
        }
        engine.step();
        tick++;
      }
      assert.equal(player.mode, 'sunk', `map ${ref.map} sinks`);
      assert.equal(tick, ref.samples[ref.samples.length - 1].tick, `map ${ref.map} sink tick`);
      engine.dispose();
    }
  });

  run('geometry validation reports bad rectangles, ramps and off-tile tees', () => {
    const bad = clone(loaded.courses[9]); // Twin Peaks: ramps, single putt (tee/hole on the course)
    bad.w = [[10, 10, -5, 4]];
    bad.sand = [[1, 2, 3]];
    bad.rp[0][4] = 'up';
    bad.tee = [9999, 9999];
    bad.hole = 'x';
    bad.fan = 'nope';
    const { valid, errors } = courses.validateGeometry(bad);
    assert.equal(valid, false);
    for (const pattern of [/w\[0\] must have a positive/, /sand\[0\] must be \[x, y, width, height\]/, /rp\[0\] must be/, /^tee .* outside every tile/, /hole must be \[x, y\]/, /fan must be an array/]) {
      assert.ok(errors.some(e => pattern.test(e)), `missing ${pattern}\n${errors.join('\n')}`);
    }
  });
  run('multi-putt maps have each putt tee and cup checked against the tiles', () => {
    const bad = clone(loaded.courses[0]);
    bad.putts[2].hole = [-50, 9000];
    const { errors } = courses.validateGeometry(bad);
    assert.ok(errors.some(e => /putts\[2\]\.hole .* outside every tile/.test(e)), errors.join('\n'));
  });
  run('loader rejects wrong version, bad JSON, length mismatch and bad geometry', () => {
    const good = JSON.parse(snapshotText);
    assert.throws(() => courses.loadCourseSnapshot({ ...clone(good), schemaVersion: 99 }), /Unsupported course snapshot version 99/);
    assert.throws(() => courses.parseCourseSnapshot('{nope'), /not valid JSON/);
    const short = clone(good); short.catalog.pop();
    assert.throws(() => courses.loadCourseSnapshot(short), /differ in length/);
    const broken = clone(good); broken.courses[3].tiles = [];
    assert.throws(() => courses.loadCourseSnapshot(broken), /Course 3 .*tiles must contain at least one tile/);
    const renamed = clone(good); renamed.courses[1].name = 'Other';
    assert.throws(() => courses.loadCourseSnapshot(renamed), /name differs from catalog/);
  });
  run('loader reports every problem in one error, not just the first', () => {
    const broken = JSON.parse(snapshotText);
    broken.courses[0].tiles = [];
    broken.courses[1].w = [[0, 0, 0, 0]];
    try { courses.loadCourseSnapshot(broken); assert.fail('should throw'); }
    catch (error) { assert.match(error.message, /Course 0/); assert.match(error.message, /Course 1/); }
  });
  run('validate-snapshot passes, and fails on a stale inventory', () => {
    assert.equal(commands.runValidateSnapshot({ snapshotText, inventory }).code, 0);
    const stale = clone(inventory);
    stale.courses[0].putts[0].par += 1;
    stale.htmlSha256 = 'deadbeef';
    const { code, lines } = commands.runValidateSnapshot({ snapshotText, inventory: stale });
    assert.equal(code, 1);
    assert.ok(lines.some(l => /putt 0: par/.test(l)));
    assert.ok(lines.some(l => /htmlSha256 changed/.test(l)));
  });
  run('parity check detects a snapshot that no longer matches the live data', () => {
    const parsed = JSON.parse(snapshotText);
    const ok = commands.runSnapshotParity({ snapshotText, liveCourses: parsed.courses, liveCatalog: parsed.catalog, liveHashes: parsed.source });
    assert.equal(ok.code, 0);
    const changed = clone(parsed.courses);
    changed[0].w.push([1, 1, 1, 1]);
    const bad = commands.runSnapshotParity({ snapshotText, liveCourses: changed, liveCatalog: parsed.catalog, liveHashes: { ...parsed.source, htmlSha256: 'x' } });
    assert.equal(bad.code, 1);
    assert.ok(bad.lines.some(l => /geometry differs/.test(l)));
    assert.ok(bad.lines.some(l => /hashes differ/.test(l)));
  });

  if (failed) { console.log(`\n${failed} GEOMETRY TEST(S) FAILED`); process.exit(1); }
  console.log('\nALL GEOMETRY TESTS PASSED');
})();
