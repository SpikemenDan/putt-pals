// Physics regression checks on the shared simulation: surface friction, cup radius and difficulty, and one test
// chamber per mechanic. Replaces the legacy `tools.js surfaces | cups | mechanics` commands (P4, P5, P6, P26 limits),
// which ran the same assertions against the single-file game's own step().
const assert = require('node:assert/strict');

(async () => {
  const { SimulationEngine } = await import('../src/simulation/index.js');
  const { cupOf } = await import('../src/simulation/physics.js');
  const { buildArenaGeometry } = await import('../src/courses/index.js');
  const { solveCourse } = await import('../tools/cli/solver.mjs');
  const { createCourseData } = await import('../src/courses/index.js');
  const { DEFAULT_CUP_RADIUS, MIN_CUP_RADIUS, SHOT_POWER } = await import('../src/shared/constants.js');

  let passed = 0;
  const ok = (name, condition) => { assert.ok(condition, name); passed++; console.log('PASS ' + name); };

  const base = { tiles: [[0, 0, 4000, 400]], w: [], pit: [], fan: [], tornado: [], movers: [], pl: [], rp: [], pd: [], tp: [], q: [], sand: [], ice: [], slime: [], tee: [100, 200], hole: [3900, 390] };

  // ---- P4: surface friction. Roll from 300 u/s on one long tile of each surface.
  const roll = surface => {
    // Long enough that even ice stops on the tile instead of rolling off its end.
    const course = { ...base, tiles: [[0, 0, 40000, 400]], hole: [39900, 390], ...(surface ? { [surface]: [[0, 0, 40000, 400]] } : {}) };
    const engine = new SimulationEngine(course, 0, { hazardTime: 0 });
    const player = engine.addPlayer('p', 'P', 0);
    Object.assign(player, { vx: 300, vy: 0, moving: true });
    for (let i = 0; i < 24000 && player.moving; i++) engine.step();
    const distance = player.x - 100;
    engine.dispose();
    return distance;
  };
  const d = { turf: roll(null), sand: roll('sand'), ice: roll('ice'), slime: roll('slime') };
  console.log('roll distance from 300 u/s:', JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v.toFixed(1)]))));
  ok('ice rolls farther than turf', d.ice > d.turf * 2);
  ok('turf rolls farther than sand', d.turf > d.sand);
  ok('slime stops shorter than sand', d.slime < d.sand);
  ok('every roll stops (finite)', Object.values(d).every(v => v > 0 && v < 39000));

  // ---- P26: shipped per-map time limits (the limit rules themselves are in contracts.test.cjs).
  const { rules } = createCourseData();
  const starterLimits = { 'Switchback Garden': 120, 'Dune Serpent': 150, 'Frost Hollow': 150, 'Slime Springs': 180, 'Cyclone Ring': 210, 'Grand Finale': 240 };
  for (const [name, seconds] of Object.entries(starterLimits)) {
    const course = rules.find(r => r.name === name);
    ok(`P26: ${name} uses its declared ${seconds} s limit for all six putts`, course && course.putts.length === 6 && course.putts.every(p => p.limitSeconds === seconds));
  }
  ok('P26: no putt of any map has a limit under 120 s or over 300 s', rules.every(r => r.putts.every(p => p.limitSeconds >= 120 && p.limitSeconds <= 300)));

  // ---- P5: cup radius, clamp and difficulty on a flat 300-unit putt.
  const flat = cup => ({ ...base, hole: [400, 200], ...(cup === undefined ? {} : { cup }) });
  const shoot = (cup, deg, power) => {
    const engine = new SimulationEngine(flat(cup), 0, { hazardTime: 0 });
    const player = engine.addPlayer('p', 'P', 0);
    engine.launch('p', deg * Math.PI / 180, power, SHOT_POWER);
    for (let i = 0; i < 4800 && player.moving && player.mode !== 'sunk'; i++) engine.step();
    const sunk = player.mode === 'sunk' && !player.over;
    engine.dispose();
    return sunk;
  };
  ok(`default radius is ${DEFAULT_CUP_RADIUS}`, cupOf({}) === DEFAULT_CUP_RADIUS && cupOf(flat()) === DEFAULT_CUP_RADIUS);
  ok('radius 12 is kept', cupOf({ cup: 12 }) === 12);
  ok(`radius clamps to ${MIN_CUP_RADIUS}..${DEFAULT_CUP_RADIUS}`, cupOf({ cup: 3 }) === MIN_CUP_RADIUS && cupOf({ cup: 99 }) === DEFAULT_CUP_RADIUS && cupOf({ cup: 'x' }) === DEFAULT_CUP_RADIUS);
  const radii = [DEFAULT_CUP_RADIUS, 13, 10.5, MIN_CUP_RADIUS], hits = {};
  for (const radius of radii) {
    let n = 0;
    // Capture favours slow arrivals (S2), so the grid starts at 0.2 power and is finer than the legacy 0.35 / 0.05 grid, which found no sink at radius 8.
    for (let angle = -4; angle <= 4.001; angle += 0.25) for (let power = 0.2; power <= 1.001; power += 0.01) if (shoot(radius, angle, power)) n++;
    hits[radius] = n;
  }
  console.log('hole-in-one shots by cup radius on a flat 300-unit putt:', JSON.stringify(hits));
  ok('smaller cups are never easier', hits[DEFAULT_CUP_RADIUS] >= hits[13] && hits[13] >= hits[10.5] && hits[10.5] >= hits[MIN_CUP_RADIUS]);
  ok('the smallest radius is strictly harder than the default', hits[MIN_CUP_RADIUS] < hits[DEFAULT_CUP_RADIUS]);
  ok('the smallest radius is still possible', hits[MIN_CUP_RADIUS] > 0);
  ok('omitting cup equals the default radius', [0, 0.5, 1.5].every(a => shoot(undefined, a, 0.5) === shoot(DEFAULT_CUP_RADIUS, a, 0.5)));

  // ---- P6: one test chamber per mechanic. A robust hole-in-one exists with the mechanic, and the same shot fails without it.
  const MECH = [
    { t: [30, 170], c: [198, 170], w: [[100, 98, 14, 100]], fan: [[114, 0, 114, 98, 0, 1, 260]] },
    { t: [30, 60], c: [200, 140], w: [[107, 0, 14, 198]], tp: [[70, 90, 160, 90, 0]] },
    { t: [30, 100], c: [200, 100], w: [[150, 0, 14, 198]], slime: [[40, 60, 50, 80]], pd: [[110, 100]] },
    { t: [30, 170], c: [198, 170], w: [[100, 60, 14, 138]], tornado: [[160, 60, 60, -250]] },
  ];
  const geometry = buildArenaGeometry(MECH);
  const chamber = overrides => ({
    ...base, tiles: [[40, 40, 720, 420]], ...Object.fromEntries(['w', 'sand', 'ice', 'slime', 'pit', 'pd', 'tp', 'fan', 'tornado'].map(k => [k, geometry[k]])),
    par: 8, putts: geometry.putts.map(p => ({ tee: p.tee, hole: p.hole, par: 2, cup: p.cup })), ...overrides,
  });
  const attempt = (course, putt, degrees, power) => {
    const engine = new SimulationEngine(course, putt, { hazardTime: 0 });
    const player = engine.addPlayer('p', 'P', 0);
    engine.launch('p', degrees * Math.PI / 180, 1, power * SHOT_POWER);
    for (let i = 0; i < 4800 && player.moving && player.mode !== 'sunk'; i++) engine.step();
    const sunk = player.mode === 'sunk' && !player.over && player.strokes === 1;
    engine.dispose();
    return sunk;
  };
  const mechanics = [['fan', 'fan'], ['teleporter', 'tp'], ['jump pad', 'pd'], ['tornado', 'tornado']];
  mechanics.forEach(([name, key], putt) => {
    const result = solveCourse(chamber(), putt);
    ok(`${name} chamber: a robust hole-in-one exists`, !!result.best);
    const bare = chamber({ [key]: [] });
    ok(`${name} chamber: the same shot fails with the ${name} removed`, !attempt(bare, putt, result.best.deg, result.best.power));
  });

  console.log(`ALL PHYSICS TESTS PASSED (${passed} checks)`);
})().catch(error => { console.error('FAILED with error:', error); process.exitCode = 1; });
