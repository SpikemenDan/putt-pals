const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
  console.log('--- Running Headless Simulation Test Suite (Task S1) ---');
  const sim = await import('../src/simulation/index.js');
  const shared = await import('../src/shared/index.js');

  // Load legacy course definitions and arena tooling via tools.js
  const root = path.resolve(__dirname, '..');
  const toolsSource = fs.readFileSync(path.join(root, 'tools.js'), 'utf8');
  const marker = 'const[,,cmd,...args]=process.argv;';
  const context = { require, __dirname: root, process, performance, console };
  vm.createContext(context);
  vm.runInContext(
    toolsSource.slice(0, toolsSource.indexOf(marker)) + '\nthis.testAPI={load,MECH,arenaData};',
    context
  );
  const { load, MECH, arenaData } = context.testAPI;
  const legacy = load();
  const HOLES = legacy.HOLES;

  // 1. Launch Initialization at 9 Combinations
  for (const angle of [0, Math.PI / 2, -Math.PI / 3]) {
    for (const power of [0.3, 0.65, 1]) {
      const engine = new sim.SimulationEngine(HOLES[0], 0);
      const player = engine.addPlayer('test-p', 'Tester', 0, { x: 11, y: 22, z: 3 });
      const event = engine.launch('test-p', angle, power, shared.SHOT_POWER);

      assert.equal(event.type, shared.SimulationEventTypes.SHOT);
      assert.ok(Math.abs(player.vx - Math.cos(angle) * power * shared.SHOT_POWER) < 1e-10);
      assert.ok(Math.abs(player.vy - Math.sin(angle) * power * shared.SHOT_POWER) < 1e-10);
      assert.equal(player.strokes, 1);
      assert.equal(player.moving, true);
      assert.deepEqual(Array.from(player.prevPosition), [11, 22, 3]);
    }
  }
  console.log('PASS: launch initialization matches legacy at 9 angle/power combinations');

  // 2. Preserve historical traces BEFORE cup interaction. S2 intentionally changes cup motion.
  const inv = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
  const references = inv.simulationReferences.shots;

  for (const ref of references) {
    const course = HOLES[ref.map];
    const engine = new sim.SimulationEngine(course, ref.putt, { hazardTime: 0 });
    const player = engine.addPlayer('ref-player', 'RefPlayer', 0);

    const angleRad = (ref.shot.deg * Math.PI) / 180;
    engine.launch('ref-player', angleRad, ref.shot.power);

    let sampleIdx = 0;
    let tick = 0;

    let reachedCup = false;
    while (player.moving && player.mode !== 'sunk' && tick < 1000) {
      const cupDistance = Math.hypot(player.x - engine.course.hole[0], player.y - engine.course.hole[1]);
      reachedCup ||= cupDistance < sim.cupOf(engine.course) + shared.BALL_RADIUS + Math.hypot(player.vx, player.vy) / 240 + 1;
      if (!reachedCup && sampleIdx < ref.samples.length && ref.samples[sampleIdx].tick === tick) {
        const expected = ref.samples[sampleIdx];
        assert.ok(
          Math.abs(player.x - expected.x) < 1e-6,
          `Map ${ref.map} tick ${tick} x mismatch: got ${player.x}, expected ${expected.x}`
        );
        assert.ok(
          Math.abs(player.y - expected.y) < 1e-6,
          `Map ${ref.map} tick ${tick} y mismatch: got ${player.y}, expected ${expected.y}`
        );
        assert.ok(
          Math.abs(player.z - expected.z) < 1e-6,
          `Map ${ref.map} tick ${tick} z mismatch: got ${player.z}, expected ${expected.z}`
        );
        assert.ok(
          Math.abs(player.vx - expected.vx) < 1e-6,
          `Map ${ref.map} tick ${tick} vx mismatch: got ${player.vx}, expected ${expected.vx}`
        );
        assert.ok(
          Math.abs(player.vy - expected.vy) < 1e-6,
          `Map ${ref.map} tick ${tick} vy mismatch: got ${player.vy}, expected ${expected.vy}`
        );
        sampleIdx++;
      }
      engine.step();
      tick++;
    }

    assert(reachedCup, `Map ${ref.map}: historical trajectory reaches cup interaction`);
    assert(sampleIdx >= 1, `Map ${ref.map}: pre-cup reference samples checked`);
    assert.equal(player.strokes, 1);
    engine.dispose();
    console.log(`PASS: Course index ${ref.map} pre-cup reference samples preserved; S2 cup outcomes tested separately`);
  }

  // 3. Mechanic Chambers Parity (MECH arena data)
  const D = arenaData(MECH);
  const mechArena = Object.assign({}, HOLES[0], {
    tiles: [[40, 40, 720, 420]],
    w: D.w,
    sand: D.sand,
    ice: D.ice,
    slime: D.slime,
    pit: D.pit,
    pd: D.pd,
    tp: D.tp,
    fan: D.fan,
    tornado: D.tornado,
    q: [],
    pl: [],
    rp: [],
    movers: [],
    par: 8,
    putts: D.putts.map(p => ({ tee: p.tee, hole: p.hole, par: 2, cup: p.cup })),
  });

  const testMechanic = (name, puttIdx, angleDeg, power, stripKey) => {
    const angleRad = (angleDeg * Math.PI) / 180;

    // Normal run with mechanic active
    const engineActive = new sim.SimulationEngine(mechArena, puttIdx);
    const p1 = engineActive.addPlayer('p', 'Tester');
    engineActive.launch('p', angleRad, power);
    for (let i = 0; i < 4800 && p1.moving && p1.mode !== 'sunk'; i++) engineActive.step();
    assert.equal(p1.mode, 'sunk', `${name} shot must sink with mechanic active`);

    // Run without the mechanic (must fail)
    const strippedMap = { ...mechArena, [stripKey]: [] };
    const engineStripped = new sim.SimulationEngine(strippedMap, puttIdx);
    const p2 = engineStripped.addPlayer('p', 'Tester');
    engineStripped.launch('p', angleRad, power);
    for (let i = 0; i < 4800 && p2.moving && p2.mode !== 'sunk'; i++) engineStripped.step();
    assert.notEqual(p2.mode, 'sunk', `${name} shot must fail when mechanic is removed`);
    console.log(`PASS: ${name} chamber parity verified (active sinks, stripped fails)`);
  };

  testMechanic('fan', 0, 25.5, 0.7, 'fan');
  testMechanic('teleporter', 1, 5.5, 0.9, 'tp');
  testMechanic('jump pad', 2, 178.5, 0.65, 'pd');
  testMechanic('tornado', 3, 37.0, 0.65, 'tornado');

  // 4. Surface Roll Distances (surfaces suite parity)
  {
    const makeSurfaceCourse = (type, surfaceRect) => ({
      name: `Surface ${type}`,
      tee: [10, 50],
      hole: [2500, 50],
      tiles: [[0, 0, 3000, 200]],
      [type]: [surfaceRect],
      w: [],
      pit: [],
      pl: [],
      rp: [],
      pd: [],
      tp: [],
      fan: [],
      tornado: [],
      movers: [],
      sand: type === 'sand' ? [surfaceRect] : [],
      ice: type === 'ice' ? [surfaceRect] : [],
      slime: type === 'slime' ? [surfaceRect] : [],
    });

    const rollOn = (type, rect) => {
      const course = makeSurfaceCourse(type, rect);
      const engine = new sim.SimulationEngine(course, 0);
      const player = engine.addPlayer('p', 'RollTester', 0, { x: 10, y: 50, z: 0 });
      player.vx = 300;
      player.vy = 0;
      player.moving = true;
      for (let i = 0; i < 4800 && player.moving; i++) engine.step();
      return +(player.x - 10).toFixed(1);
    };

    const turfDist = rollOn('turf', [0, 0, 0, 0]);
    const sandDist = rollOn('sand', [0, 0, 3000, 200]);
    const iceDist = rollOn('ice', [0, 0, 3000, 200]);
    const slimeDist = rollOn('slime', [0, 0, 3000, 200]);

    assert.equal(turfDist, 261.1);
    assert.equal(sandDist, 75.0);
    assert.equal(iceDist, 1699.7);
    assert.equal(slimeDist, 43.8);

    assert.ok(iceDist > turfDist, 'ice rolls farther than turf');
    assert.ok(turfDist > sandDist, 'turf rolls farther than sand');
    assert.ok(slimeDist < sandDist, 'slime stops shorter than sand');
    console.log(
      'PASS: Surface drag roll distances match exact legacy values: turf=261.1, sand=75.0, ice=1699.7, slime=43.8'
    );
  }

  // 5. Lifecycle, Snapshots, and Settlement
  {
    const engine = new sim.SimulationEngine(HOLES[0], 0);
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');

    assert.equal(engine.isSettled(), true);
    engine.launch('p1', 0, 0.5);
    assert.equal(engine.isSettled(), false);

    const snapshot = engine.getSnapshot();
    assert.equal(snapshot.puttIndex, 0);
    assert.equal(snapshot.settled, false);
    assert.equal(snapshot.players.p1.moving, true);
    assert.equal(snapshot.players.p2.moving, false);

    engine.dispose();
    assert.equal(engine.disposed, true);
    assert.throws(() => engine.step(), /disposed/);
    assert.throws(() => engine.launch('p1', 0, 0.5), /disposed/);
    console.log('PASS: SimulationEngine lifecycle, snapshots, settlement, and disposal guards');
  }

  console.log('\nALL SIMULATION TESTS PASSED (historical pre-cup parity; intentional S2 cup correction)');
}

run().catch(err => {
  console.error('FAILED with error:', err);
  process.exit(1);
});
