const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const vm = require('node:vm');
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
  const { createCourseData, validateCourseGeometry, generateArena, buildArenaGeometry, arenaNames } = await import(pathToFileURL(path.join(root, 'src/courses/index.js')).href);
  const data = createCourseData();
  const arenaDataModule = await import(pathToFileURL(path.join(root, 'src/courses/arena-specs.js')).href);
  let failed = 0;
  const run = (name, fn) => {
    try { fn(); console.log('PASS:', name); }
    catch (error) { failed++; console.log('FAIL:', name, '\n  ', error.message); }
  };

  run('check accepts all maps and rejects geometry/rule mismatches and unplayable positions', () => {
    assert.equal(commands.runCheck(data).code, 0);
    for (const mutate of [d => { d.definitions[0].putts[0].tee = [-100, -100]; },
      d => { d.definitions[0].pit.push([70, 70, 30, 30]); },
      d => { d.definitions[0].putts[0].par += 1; },
      d => { d.definitions[0].putts[0].cup = 8; },
      d => { d.definitions[0].putts.pop(); },
      d => { delete d.definitions[10]; delete d.rules[10]; },
      d => { d.definitions[0].par += 1; },
      d => { d.rules[0].putts[0].limitSeconds += 1; },
      d => { d.definitions[0].hole = [NaN, 1]; d.definitions[0].putts[0].hole = [NaN, 1]; }]) {
      const changed = structuredClone(data);
      mutate(changed);
      assert.equal(commands.runCheck(changed).code, 1);
    }
    assert.equal(commands.runCheck({ definitions: null, rules: [] }).code, 1);
    assert.equal(commands.runCheck({ definitions: [], rules: [{ putts: 'bad' }] }).code, 1);
  });
  run('rank labels historical counts and never certifies current difficulty', () => {
    const out = commands.runRank(data.rules);
    assert.equal(out.code, 2);
    assert.match(out.lines.join('\n'), /HISTORICAL COUNTS/);
    assert.match(out.lines.join('\n'), /total 5213/);
    assert.equal(out.lines.filter(line => /^\d\./.test(line)).length, 6);
    const { arenaSourceData } = arenaDataModule;
    for (const mutate of [rows => { rows.pop(); }, rows => { rows[0][1] = 'wrong'; },
      rows => { rows[0][2][0] = -1; }, rows => { rows[1][2] = Array(6).fill(9999); }]) {
      const rows = structuredClone(arenaSourceData.ladder);
      mutate(rows);
      assert.equal(commands.runRank(data.rules, rows).code, 1);
    }
  });
  run('process: export emits a versioned document for every map', () => {
    const out = cli('export');
    assert.equal(out.status, 0, out.stderr);
    const document = JSON.parse(out.stdout);
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.courses.length, 22);
    assert.equal(document.courses.filter(c => c.starter).length, 6);
    assert.equal(document.courses[0].putts[0].id, 'switchback-garden-putt-1');
  });
  run('process: check succeeds and historical rank exits 2', () => {
    const check = cli('check');
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /CHECK OK: 22 courses/);
    const rank = cli('rank');
    assert.equal(rank.status, 2, rank.stderr);
    assert.match(rank.stdout, /Current difficulty remains unverified/);
  });
  run('all six arena transforms and resolved rules match legacy generation exactly', () => {
    const source = fs.readFileSync(path.join(root, 'tools.js'), 'utf8');
    const marker = 'const[,,cmd,...args]=process.argv;';
    assert.equal(source.split(marker).length, 2);
    const context = { require, __dirname: root, process, performance, console };
    vm.createContext(context);
    vm.runInContext(source.slice(0, source.indexOf(marker)) + '\nthis.ref={SPECS,arenaData,arenaLine};', context);
    assert.equal(arenaNames.length, 6);
    for (const name of arenaNames) {
      const chambers = JSON.parse(JSON.stringify(context.ref.SPECS[name][1]));
      const before = structuredClone(chambers);
      assert.deepEqual(JSON.parse(JSON.stringify(buildArenaGeometry(chambers))), JSON.parse(JSON.stringify(context.ref.arenaData(chambers))));
      assert.deepEqual(chambers, before, 'transform must not mutate input');
      const course = (name, desc, tee, hole, tiles, extra) => ({ name, desc, tee, hole, tiles,
        q: [], pl: [], rp: [], movers: [], ice: [], slime: [], pd: [], tp: [], fan: [], tornado: [], ...extra });
      const expected = vm.runInNewContext(context.ref.arenaLine(name).trim().replace(/,$/, ''), { course });
      assert.deepEqual(generateArena(name), JSON.parse(JSON.stringify(expected)), name);
      const changed = generateArena(name);
      changed.w[0][0] += 100;
      assert.deepEqual(generateArena(name), JSON.parse(JSON.stringify(expected)), 'output must not share mutable data');
    }
  });
  run('arena input validation rejects malformed or unsupported chamber data', () => {
    for (const chambers of [null, [], Array(7).fill({}), [{ t: [1], c: [2, 3] }],
      [{ t: [1, 2], c: [3, 4], w: [[0, 0, -1, 3]] }],
      [{ t: [1, 2], c: [3, 4], cup: 100 }], [{ t: [1, 2], c: [3, 4], pl: [] }]]) {
      assert.throws(() => buildArenaGeometry(chambers));
    }
    assert.equal(commands.runArena('unknown').code, 1);
    assert.equal(commands.runArena('__proto__').code, 1);
    assert.equal(commands.runArena().code, 1);
  });
  run('arena command emits course JSON without modifying game source', () => {
    const before = fs.readFileSync(path.join(root, 'putt-pals.html'));
    const out = cli('arena', 'Grand Finale');
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), generateArena('Grand Finale'));
    assert.deepEqual(fs.readFileSync(path.join(root, 'putt-pals.html')), before);
    assert.equal(cli('arena', 'unknown').status, 1);
  });
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
      for (const args of [['list'], ['check'], ['export'], ['arena', 'Grand Finale'], ['shot', '0', '0', String(inventory.simulationReferences.shots[0].shot.deg), String(inventory.simulationReferences.shots[0].shot.power)]]) {
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
  run('solve reproduces all 36 recorded first robust starter shots', () => {
    const refs = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/solver-baseline.json'), 'utf8')).results;
    assert.equal(refs.length, 36);
    for (const ref of refs) {
      const out = commands.runSolve(data.definitions, ref.map, ref.putt);
      assert.equal(out.code, 0, `${ref.map}/${ref.putt}`);
      assert.deepEqual(out.result.best, ref.best, `${ref.map}/${ref.putt}`);
      assert.ok(out.result.hits > 0);
    }
  });
  run('full solve preserves the legacy endpoint and complete-grid hit count', () => {
    const out = commands.runSolve(data.definitions, 0, 0, '--full');
    assert.equal(out.code, 0);
    assert.equal(out.result.hits, 811, 'legacy full-grid comparison on current hashed source');
    assert.deepEqual(out.result.best, inventory.simulationReferences.shots[0].shot);
  });
  run('solve rejects missing, invalid and unknown arguments', () => {
    for (const args of [[], ['', 0], [99, 0], [0, 99], [0, 0, '--typo']]) {
      assert.equal(commands.runSolve(data.definitions, ...args).code, 1);
    }
  });
  run('process: solve runs without legacy files', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-solver-imports-'));
    try {
      fs.cpSync(path.join(root, 'src'), path.join(temp, 'src'), { recursive: true });
      fs.cpSync(path.join(root, 'tools/cli'), path.join(temp, 'tools/cli'), { recursive: true });
      const out = spawnSync(process.execPath, [path.join(temp, 'tools/cli/main.mjs'), 'solve', '0', '0'], { encoding: 'utf8', cwd: temp });
      assert.equal(out.status, 0, out.stderr);
      assert.deepEqual(JSON.parse(out.stdout).best, inventory.simulationReferences.shots[0].shot);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
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
