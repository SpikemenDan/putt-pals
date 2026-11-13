const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const reference = require('./support/legacy-reference.cjs');

const root = path.resolve(__dirname, '..');
const currentShots = require('./fixtures/cup-capture/solutions.json');
const currentFirstShot = currentShots.results[0].best;
const main = path.join(root, 'tools/cli/main.mjs');
const cli = (...args) => spawnSync(process.execPath, [main, ...args], { encoding: 'utf8' });

(async () => {
  const commands = await import(pathToFileURL(path.join(root, 'tools/cli/commands.mjs')).href);
  const raw = reference.rules();
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
  const { createCourseData, validateCourseGeometry, createCourseDocument, generateArena, buildArenaGeometry, arenaNames } = await import(pathToFileURL(path.join(root, 'src/courses/index.js')).href);
  const data = createCourseData();
  const { MAP_COUNT } = await import(pathToFileURL(path.join(root, 'src/shared/map-count.js')).href);
  const { STARTER_COURSE_INDICES } = await import(pathToFileURL(path.join(root, 'src/shared/constants.js')).href);
  const courseAdapter = await import(pathToFileURL(path.join(root, 'src/courses/index.js')).href);
  const arenaDataModule = await import(pathToFileURL(path.join(root, 'src/courses/arena-specs.js')).href);
  let failed = 0;
  const run = (name, fn) => {
    try { fn(); console.log('PASS:', name); }
    catch (error) { failed++; console.log('FAIL:', name, '\n  ', error.message); }
  };

  const provenanceTools = await import(pathToFileURL(path.join(root, 'tools/cli/provenance.mjs')).href);
  const parSolver = await import(pathToFileURL(path.join(root, 'tools/cli/par-solver.mjs')).href);
  const { parseCliArguments } = await import(pathToFileURL(path.join(root, 'tools/cli/arguments.mjs')).href);
  run('course-file option parsing rejects ambiguous or ignored arguments', () => {
    assert.deepEqual(parseCliArguments(['--courses', 'maps.json', 'solve', '0', '0', '--full']),
      { command: 'solve', args: ['0', '0', '--full'], courseFile: 'maps.json' });
    for (const args of [['list', '--courses'], ['list', '--courses', 'a', '--courses', 'b'],
      ['validate', '--courses', 'a'], ['arena', '--courses', 'a'], ['rank', '--courses', 'a'],
      ['shot', '0', '0', '1'], ['list', 'extra'], ['solve', '0', '0', '--wat']]) assert.throws(() => parseCliArguments(args));
  });
  run('file-backed commands preserve edited content and persisted IDs', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-course-file-'));
    try {
      const document = createCourseDocument();
      document.courses[0].name = 'Edited display name';
      document.courses[0].putts[0].hole = [320, 80];
      const file = path.join(temp, 'courses with spaces.json');
      fs.writeFileSync(file, JSON.stringify(document));
      const invoke = (...args) => cli(...args, '--courses', file);
      assert.equal(invoke('check').status, 0);
      assert.match(invoke('list').stdout, /switchback-garden/);
      assert.deepEqual(JSON.parse(invoke('export').stdout), document);
      const reference = currentFirstShot;
      const shot = invoke('shot', '0', '0', String(reference.deg), String(reference.power));
      assert.equal(shot.status, 0, shot.stdout + shot.stderr);
      assert.match(shot.stdout, /Edited display name/);
      const expected = commands.runShot(courseAdapter.toSimulationCourses(document), 0, 0, reference.deg, reference.power);
      assert.equal(shot.stdout.trim(), expected.lines.join('\n'));
      const original = createCourseDocument();
      original.courses[0].name = 'Renamed solving course';
      fs.writeFileSync(file, JSON.stringify(original));
      const solved = invoke('solve', '0', '0');
      assert.equal(solved.status, 0, solved.stdout + solved.stderr);
      const record = JSON.parse(solved.stdout);
      assert.equal(provenanceTools.assessDifficultyResult(record, provenanceTools.createDifficultyProvenance(original.courses[0], 0)).current, true);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  run('file loading fails cleanly for invalid JSON, future schemas and missing files', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-course-invalid-'));
    try {
      const file = path.join(temp, 'courses.json');
      for (const contents of ['{', JSON.stringify({ schemaVersion: 999, courses: [] }),
        JSON.stringify({ ...createCourseDocument(), courses: [] })]) {
        fs.writeFileSync(file, contents);
        const out = cli('check', '--courses', file);
        assert.equal(out.status, 1);
        assert.match(out.stdout, /^ERROR:/);
        assert.equal(out.stderr, '', 'handled input errors should not dump a stack trace');
      }
      assert.equal(cli('list', '--courses', path.join(temp, 'missing.json')).status, 1);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  run('difficulty fingerprints are deterministic and detect changed course, physics and configuration', () => {
    const { hashJson, createDifficultyProvenance, assessDifficultyResult } = provenanceTools;
    assert.equal(hashJson({ b: [2, 3], a: 1 }), hashJson({ a: 1, b: [2, 3] }));
    assert.throws(() => hashJson({ x: NaN }));
    const course = createCourseDocument().courses[0];
    const current = createDifficultyProvenance(course, 0, { full: true });
    const saved = { schemaVersion: 2, status: 'route', strokes: 1, par: 2, route: [{ deg: 30.5, power: 0.8, to: 'cup' }], provenance: current };
    assert.deepEqual(assessDifficultyResult(saved, current), { current: true, complete: true, differences: [] });
    assert.deepEqual(createDifficultyProvenance(course, 0, { full: true }), current);
    const changedCourse = structuredClone(course); changedCourse.geometry.w[0][0] += 1;
    for (const updated of [createDifficultyProvenance(changedCourse, 0, { full: true }),
      createDifficultyProvenance(course, 0, { full: true, simulationHash: 'a'.repeat(64) }),
      createDifficultyProvenance(course, 0, { full: true, configuration: { ...parSolver.PAR_SOLVER_CONFIG, trialTicks: 2400 } }),
      createDifficultyProvenance(course, 0, { full: true, gravity: 250 }),
      createDifficultyProvenance(course, 1, { full: true })]) {
      assert.equal(assessDifficultyResult(saved, updated).current, false);
      assert.equal(assessDifficultyResult(saved, updated).complete, false);
    }
  });
  run('fast or malformed par-route results cannot establish a complete current measurement', () => {
    const { createDifficultyProvenance, assessDifficultyResult } = provenanceTools;
    const current = createDifficultyProvenance(createCourseDocument().courses[0], 0);
    const fast = { schemaVersion: 2, status: 'route', strokes: 1, par: 2, route: [{ deg: 30.5, power: 0.8, to: 'cup' }], provenance: current };
    assert.equal(assessDifficultyResult(fast, current).current, true);
    assert.equal(assessDifficultyResult(fast, current).complete, false);
    for (const changed of [null, { ...fast, status: 'maybe' }, { ...fast, par: 3 }, { ...fast, strokes: 7, route: Array(7).fill(fast.route[0]) },
      { ...fast, route: [{ deg: 0, power: 2, to: 'cup' }] }, { ...fast, schemaVersion: 999 },
      { ...fast, provenance: { ...current, courseSha256: 'bad' } }]) assert.equal(assessDifficultyResult(changed, current).current, false);
  });
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
  // Report-only gate inputs are synthetic: shipped-map routes are measured by `npm run measure:par`, not stored.
  const { PAR_SOLVER_CONFIG } = parSolver;
  const syntheticRoutes = (overrides = () => ({})) => {
    const document = createCourseDocument();
    const results = document.courses.flatMap((course, map) => course.putts.map((_putt, putt) => ({
      schemaVersion: 2, map, putt, name: course.name, gravity: 700, status: 'route', strokes: 1, par: 2, holeInOne: true, margin: 1, difficulty: 1.667 + map / 100,
      route: [{ deg: 10, power: 0.5, to: 'cup' }], verified: true,
      provenance: provenanceTools.createDifficultyProvenance(course, putt),
      ...overrides(map, putt),
    })));
    return { schemaVersion: 2, results };
  };
  const parRoutes = syntheticRoutes();
  run('rank needs a current measure-par report: missing/stale exit 2, bad input or routeless putts exit 1', () => {
    const document = createCourseDocument();
    assert.equal(commands.runRank(document.courses, undefined).code, 2);
    assert.match(commands.runRank(document.courses, undefined).lines.join('\n'), /PAR ROUTES MISSING/);
    assert.equal(commands.runRank(null, parRoutes).code, 1);
    assert.equal(commands.runRank(document.courses, parRoutes).code, 0);
    const stale = syntheticRoutes();
    stale.results[0].provenance.courseSha256 = '0'.repeat(64);
    const out = commands.runRank(document.courses, stale);
    assert.equal(out.code, 2);
    assert.match(out.lines.join('\n'), /STALE: Switchback Garden putt 1/);
    const missing = syntheticRoutes();
    missing.results = missing.results.filter(r => !(r.map === 0 && r.putt === 0));
    assert.equal(commands.runRank(document.courses, missing).code, 1);
    const routeless = syntheticRoutes((map, putt) => (map === 0 && putt === 0 ? { status: 'none', route: undefined, strokes: undefined, par: undefined } : {}));
    assert.equal(commands.runRank(document.courses, routeless).code, 1);
  });
  run('rank orders every starter by summed route difficulty', () => {
    const out = commands.runRank(createCourseDocument().courses, syntheticRoutes((map) => ({ difficulty: map === 5 ? 1 : 3 })));
    assert.equal(out.code, 0, out.lines.join('\n'));
    const rows = out.lines.filter(line => /^\d\. map/.test(line));
    assert.equal(rows.length, STARTER_COURSE_INDICES.length);
    assert.equal(rows.length, 8, 'six original starters plus Sandstorm Spire and Obsidian Spiral');
    assert.match(rows[0], /map 5 Cyclone Ring/);
  });
  run('process: measure-par writes a report whose provenance matches the current inputs', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-measure-'));
    try {
      const file = path.join(temp, 'report.json');
      const out = spawnSync(process.execPath, [path.join(root, 'tools/cli/measure-par.mjs'), '--only', '0/0', '--jobs', '1', '--out', file], { encoding: 'utf8' });
      assert.equal(out.status, 0, out.stdout + out.stderr);
      const report = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(report.results.length, 1);
      const [entry] = report.results;
      assert.deepEqual([entry.status, entry.strokes, entry.par, entry.gravity], ['route', 1, 2, 700]);
      const expected = provenanceTools.createDifficultyProvenance(createCourseDocument().courses[0], 0);
      assert.deepEqual(provenanceTools.assessDifficultyResult(entry, expected).differences, []);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  run('process: --routes feeds check and rank; check and rank run without it', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-routes-'));
    try {
      const file = path.join(temp, 'routes.json');
      fs.writeFileSync(file, JSON.stringify(parRoutes));
      assert.equal(cli('check').status, 0);
      assert.equal(cli('check', '--routes', file).status, 0);
      const rank = cli('rank', '--routes', file);
      assert.equal(rank.status, 0, rank.stdout + rank.stderr);
      assert.match(rank.stdout, /current for every starter putt/);
      assert.equal(cli('rank').status, 2);
      assert.notEqual(cli('list', '--routes', file).status, 0);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  run('check gate: par must be an integer 2..6 and a robust route must exist within par', () => {
    const range = structuredClone(data.rules);
    range[0].putts[0].par = 7;
    assert.match(commands.runCheck({ definitions: data.definitions, rules: range }).lines.join('\n'), /par 7 must be an integer 2\.\.6/);
    const one = structuredClone(data.rules);
    one[0].putts[0].par = 1;
    assert.equal(commands.runCheck({ definitions: data.definitions, rules: one }).code, 1);
    const tooLow = syntheticRoutes((map, putt) => (map === 0 && putt === 0 ? { strokes: 3 } : {}));
    assert.match(commands.runCheck({ ...data, parRoutes: tooLow }).lines.join('\n'), /below the shortest robust route of 3 strokes/);
    const none = syntheticRoutes((map, putt) => (map === 0 && putt === 0 ? { status: 'none' } : {}));
    assert.match(commands.runCheck({ ...data, parRoutes: none }).lines.join('\n'), /no robust route within 6 strokes/);
    assert.equal(commands.runCheck({ ...data, parRoutes }).code, 0);
  });
  run('par-solver proof chambers: hole-in-one optional, two-stroke route, and a hole with no route', () => {
    const base = { tiles: [[0, 0, 800, 400]], w: [], pit: [], fan: [], tornado: [], movers: [], pl: [], rp: [], pd: [], tp: [], q: [], sand: [], ice: [], slime: [], tee: [100, 100], hole: [700, 100] };
    const open = parSolver.solvePar({ ...base, hole: [400, 100] }, 0);
    assert.equal(open.status, 'route');
    assert.deepEqual([open.strokes, open.par, open.verified], [1, 2, true]);
    const dogleg = parSolver.solvePar({ ...base, w: [[380, 0, 20, 300]] }, 0);
    assert.equal(dogleg.status, 'route', 'a wall across the straight line forces a two-stroke route');
    assert.deepEqual([dogleg.strokes, dogleg.par, dogleg.verified], [2, 2, true]);
    const sealedCup = { ...base, w: [[640, 40, 20, 120], [740, 40, 20, 120], [640, 40, 120, 20], [640, 140, 120, 20]] };
    const none = parSolver.solvePar(sealedCup, 0, { config: { ...PAR_SOLVER_CONFIG, maxStrokes: 2, maxWaypoints: 4 } });
    assert.equal(none.status, 'none', 'a walled-in cup has no robust route');
    assert.equal(none.route, undefined);
  });
  run('solver replay: the dogleg route flies through the shared simulation and sinks', async () => {
    const { SimulationEngine } = await import(pathToFileURL(path.join(root, 'src/simulation/index.js')).href);
    const { SHOT_POWER } = await import(pathToFileURL(path.join(root, 'src/shared/constants.js')).href);
    const course = { tiles: [[0, 0, 800, 400]], w: [[380, 0, 20, 300]], pit: [], fan: [], tornado: [], movers: [], pl: [], rp: [], pd: [], tp: [], q: [], sand: [], ice: [], slime: [], tee: [100, 100], hole: [700, 100] };
    const solved = parSolver.solvePar(course, 0);
    const engine = new SimulationEngine(course, 0, { hazardTime: 0 });
    const player = engine.addPlayer('p', 'P', 0);
    for (const stroke of solved.route) {
      engine.launch('p', stroke.deg * Math.PI / 180, 1, stroke.power * SHOT_POWER);
      for (let i = 0; i < 4800 && player.moving && player.mode !== 'sunk'; i++) engine.step();
    }
    assert.equal(player.mode, 'sunk');
    assert.equal(player.strokes, solved.strokes);
    engine.dispose();
  });
  run('process: export emits a versioned document for every map', () => {
    const out = cli('export');
    assert.equal(out.status, 0, out.stderr);
    const document = JSON.parse(out.stdout);
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.courses.length, MAP_COUNT);
    assert.equal(document.courses.length, 24);
    assert.equal(document.courses.filter(c => c.starter).length, STARTER_COURSE_INDICES.length);
    assert.equal(document.courses.filter(c => c.starter).length, 8);
    assert.equal(document.courses[0].putts[0].id, 'switchback-garden-putt-1');
  });
  run('process: check succeeds', () => {
    const check = cli('check');
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /CHECK OK: 24 courses/);
  });
  run('all six arena transforms and resolved rules match the recorded legacy generation exactly', () => {
    const recorded = reference.arenas();
    assert.equal(arenaNames.length, 6);
    assert.deepEqual([...arenaNames].sort(), Object.keys(recorded).sort());
    for (const name of arenaNames) {
      const { chambers: recordedChambers, geometry, course: expected } = recorded[name];
      const chambers = JSON.parse(JSON.stringify(recordedChambers));
      const before = structuredClone(chambers);
      assert.deepEqual(JSON.parse(JSON.stringify(buildArenaGeometry(chambers))), geometry, name + ' geometry');
      assert.deepEqual(chambers, before, 'transform must not mutate input');
      assert.deepEqual(generateArena(name), expected, name);
      const changed = generateArena(name);
      changed.w[0][0] += 100;
      assert.deepEqual(generateArena(name), expected, 'output must not share mutable data');
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
  run('arena command emits course JSON', () => {
    const out = cli('arena', 'Grand Finale');
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), generateArena('Grand Finale'));
    assert.equal(cli('arena', 'unknown').status, 1);
  });
  run('imported geometry and resolved rules exactly match all legacy courses', () => {
    // The legacy recordings cover the 22 legacy maps only; maps added after them (22+) have no legacy source to match.
    assert.equal(reference.holeCount, 22);
    assert.equal(data.definitions.length, MAP_COUNT);
    assert.ok(data.definitions.length >= reference.holeCount);
    assert.equal(reference.canonicalSha256(data.definitions.slice(0, reference.holeCount)), reference.holesCanonicalSha256, 'geometry matches the recorded legacy HOLES');
    assert.deepEqual(data.rules.slice(0, reference.holeCount), JSON.parse(JSON.stringify(raw)));
    assert.deepEqual(data.sourceHashes, reference.sources());
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
  run('simulation fingerprint covers what physics imports and ignores unrelated shared contracts', () => {
    const files = provenanceTools.simulationSourceFiles();
    for (const needed of ['src/simulation/physics.js', 'src/shared/tuning.js', 'src/gameplay/effects.js']) {
      assert(files.includes(needed), `${needed} must be fingerprinted`);
    }
    for (const unrelated of ['src/shared/session.js', 'src/shared/protocol.js', 'src/shared/transport.js']) {
      assert(!files.includes(unrelated), `${unrelated} must not invalidate recorded difficulty`);
    }
  });
  run('all 36 starters retain nominal hole-in-ones; 33 meet the recorded robustness margin', () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/cup-capture/solutions.json'), 'utf8'));
    assert.equal(baseline.results.length, 36);
    assert.equal(baseline.results.filter(r => r.best).length, 33, 'three course-tuning gaps remain (19/0, 19/2 and 5/5, which lost its robust route to later physics changes)');
    assert.equal(baseline.simulationSha256, provenanceTools.hashSimulationSources(), 'S2 measurements must match simulation source');
    for (const ref of baseline.results) {
      const shot = ref.best || ref.nominal;
      assert(shot, `measured nominal solution required for ${ref.map}/${ref.putt}`);
      const out = commands.runShot(data.definitions, ref.map, ref.putt, shot.deg, shot.power);
      assert.equal(out.result.mode, 'sunk', `${ref.name} putt ${ref.putt}`);
      assert.equal(out.result.strokes, 1);
    }
  });
  run('list rejects invalid course rules rather than reporting success', () => {
    const bad = structuredClone(data.rules);
    bad[0].putts[0].par = 0;
    assert.equal(commands.runList(bad).code, 1);
  });
  run('process: list and shot work from the shared modules alone', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-cli-imports-'));
    try {
      fs.cpSync(path.join(root, 'src'), path.join(temp, 'src'), { recursive: true });
      fs.cpSync(path.join(root, 'tools/cli'), path.join(temp, 'tools/cli'), { recursive: true });
      const entry = path.join(temp, 'tools/cli/main.mjs');
      for (const args of [['list'], ['check'], ['export'], ['arena', 'Grand Finale'], ['shot', '0', '0', String(currentFirstShot.deg), String(currentFirstShot.power)]]) {
        const out = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', cwd: temp });
        assert.equal(out.status, 0, out.stdout + out.stderr);
        if (args[0] === 'shot') assert.match(out.stdout, /SUNK/);
      }
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  run('validate detects stale exported source provenance', () => {
    const out = commands.runValidate({ raw: data.rules, inventory, courseHashes: { ...data.sourceHashes, htmlSha256: 'stale' } });
    assert.equal(out.code, 1);
    assert.ok(out.lines.some(line => line.includes('Imported courses:')));
  });
  run('solve finds a verified shortest robust route and records gravity (hole-in-one optional)', () => {
    const out = commands.runSolve(data.definitions, 0, 0);
    assert.equal(out.code, 0);
    assert.equal(out.result.status, 'route');
    assert.equal(out.result.verified, true);
    assert.equal(out.result.strokes, 1);
    assert.equal(out.result.par, 2, 'a one-stroke route still gives par 2: par is never below 2');
    assert.equal(out.result.gravity, 700);
  });
  run('solver accepts any valid world gravity and refuses nonsense (per-world runs: tests/world-gravity.test.cjs)', () => {
    assert.doesNotThrow(() => parSolver.assertWorldGravity(250));
    assert.doesNotThrow(() => parSolver.assertWorldGravity(700));
    assert.throws(() => parSolver.assertWorldGravity(Number.NaN), /finite number > 0/);
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
      const saved = JSON.parse(out.stdout);
      assert.equal(saved.status, 'route');
      assert.equal(saved.strokes, 1);
      const expected = provenanceTools.createDifficultyProvenance(createCourseDocument().courses[0], 0);
      assert.deepEqual(provenanceTools.assessDifficultyResult(saved, expected), { current: true, complete: false, differences: [] });
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  run('list shows 24 courses and 8 starters', () => {
    const { code, lines } = commands.runList(data.rules);
    assert.equal(code, 0);
    assert.equal(lines.length, MAP_COUNT);
    assert.equal(lines.length, 24);
    assert.equal(lines.filter(l => l.includes('starter')).length, STARTER_COURSE_INDICES.length);
    assert.equal(lines.filter(l => l.includes('starter')).length, 8);
  });
  run('validate passes on the live data', () => {
    const { code, lines } = commands.runValidate({ raw, inventory });
    assert.equal(code, 0, lines.join('\n'));
  });
  run('validate still fails when a legacy map is missing from the live data', () => {
    const { code, lines } = commands.runValidate({ raw: raw.slice(0, 21), inventory });
    assert.equal(code, 1);
    assert.ok(lines.some(l => /course count: live 21, recorded 22/.test(l)), lines.join('\n'));
  });
  run('validate fails on stale data', () => {
    const edited = JSON.parse(JSON.stringify(raw));
    edited[0].putts[0].par += 1;
    const { code, lines } = commands.runValidate({ raw: edited, inventory });
    assert.equal(code, 1);
    assert.ok(lines.some(l => /putt 0: par/.test(l)));
  });
  run('recorded reference shots run to a legal end state and are deterministic under S2 physics', () => {
    const refs = inventory.simulationReferences.shots;
    assert.equal(refs.length, 6);
    for (const ref of refs) {
      const out = commands.runShot(data.definitions, ref.map, ref.putt, ref.shot.deg, ref.shot.power);
      assert.equal(out.code, 0);
      // Historical sink ticks are intentionally obsolete after S2; the result must still be a legal end state.
      assert.ok(['play', 'sunk'].includes(out.result.mode));
      assert.deepEqual(commands.runShot(data.definitions, ref.map, ref.putt, ref.shot.deg, ref.shot.power), out, `map ${ref.map} imported trajectory result`);
    }
  });
  run('shot rejects bad arguments', () => {
    for (const args of [[0, '', 0, 0.5], [0, 0, '', 0.5], [0, 0, 0, ''], [99, 0, 0, 0.5], [0, 9, 0, 0.5], [0, 0, 'x', 0.5], [0, 0, 0, 0], [0, 0, 0, 1.5]]) {
      assert.equal(commands.runShot(data.definitions, ...args).code, 1, JSON.stringify(args));
    }
  });
  run('process: list exits 0 and prints 24 lines', () => {
    const r = cli('list');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim().split('\n').length, 24);
  });
  run('process: validate exits 0', () => {
    const r = cli('validate');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /VALIDATE OK: 24 courses match the schema; the 22 legacy courses match the recorded inventory \(2 added after the legacy export\)/);
  });
  run('process: shot sinks a known reference shot', () => {
    const r = cli('shot', '0', '0', String(currentFirstShot.deg), String(currentFirstShot.power));
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
