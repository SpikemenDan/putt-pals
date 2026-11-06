const assert = require('node:assert/strict');

// JSDOM setup for Three.js context
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;

const ctx = new Proxy({}, {
  get: (_, key) =>
    key === 'measureText'
      ? () => ({ width: 10 })
      : key === 'createRadialGradient' || key === 'createLinearGradient'
      ? () => ({ addColorStop() {} })
      : key === 'canvas'
      ? dom.window.document.getElementById('c')
      : () => {},
  set: () => true,
});
dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;

(async () => {
  const { validCourseWindZone, validateCourseWind } = await import('../src/courses/wind.js');
  const { windChamberCourse } = await import('../src/courses/wind-chambers.js');
  const { SimulationEngine } = await import('../src/simulation/index.js');
  const { SimulationEventTypes } = await import('../src/shared/simulation.js');
  const { solvePar } = await import('../tools/cli/par-solver.mjs');
  const THREE = await import('three');
  const { createMaterialLibrary } = await import('../src/render/materials.js');
  const { buildCourseScene } = await import('../src/render/course-scene.js');

  console.log('--- Testing Wind Zones in Levels (W3, #106) ---');

  // 1. Schema Validation
  assert.ok(validCourseWindZone({ id: 'w1', bounds: [0, 0, 100, 100], force: [100, 0] }));
  assert.ok(validCourseWindZone({
    id: 'w2',
    bounds: [0, 0, 100, 100],
    force: [0, 50, 800],
    minZ: -20,
    maxZ: 120,
    gust: { period: 5, amplitude: 0.8, phase: 1.2 },
    groundMultiplier: 0.2,
    airMultiplier: 1.2,
  }));

  // Negative validation
  assert.equal(validCourseWindZone(null), false);
  assert.equal(validCourseWindZone({ id: '', bounds: [0, 0, 10, 10], force: [10, 0] }), false);
  assert.equal(validCourseWindZone({ id: 'w', bounds: [0, 0, -10, 10], force: [10, 0] }), false);
  assert.equal(validCourseWindZone({ id: 'w', bounds: [0, 0, 10, 0], force: [10, 0] }), false);
  assert.equal(validCourseWindZone({ id: 'w', bounds: [0, 0, 10], force: [10, 0] }), false);
  assert.equal(validCourseWindZone({ id: 'w', bounds: [0, 0, 10, 10], force: [] }), false);
  assert.equal(validCourseWindZone({ id: 'w', bounds: [0, 0, 10, 10], force: [NaN, 0] }), false);
  assert.equal(validCourseWindZone({ id: 'w', bounds: [0, 0, 10, 10], force: [0, 0], minZ: 50, maxZ: 10 }), false);
  assert.equal(validCourseWindZone({ id: 'w', bounds: [0, 0, 10, 10], force: [0, 0], gust: { period: -1, amplitude: 1 } }), false);
  assert.equal(validCourseWindZone({ id: 'w', bounds: [0, 0, 10, 10], force: [0, 0], groundMultiplier: -0.5 }), false);

  assert.equal(validateCourseWind(undefined).length, 0);
  assert.equal(validateCourseWind([]).length, 0);
  assert.equal(validateCourseWind('not-array').length, 1);
  assert.ok(validateCourseWind([
    { id: 'dup', bounds: [0, 0, 10, 10], force: [10, 0] },
    { id: 'dup', bounds: [20, 0, 10, 10], force: [10, 0] },
  ]).some(e => e.includes('duplicate')));
  console.log('PASS: Wind zone schema and validation');

  // 2. Steady Crosswind Drift & Airborne Differential
  // In Putt 0, crosswind pushes northward (+y, force: [0, 120])
  const putt0 = windChamberCourse.putts[0];
  const engineCalm = new SimulationEngine({ ...windChamberCourse, wind: [], putts: [{ ...putt0, wind: [] }] }, 0, { hazardTime: 0 });
  engineCalm.addPlayer('p1', 'Tester', 0);
  engineCalm.launch('p1', 0, 0.4);
  for (let i = 0; i < 4800; i++) {
    engineCalm.step();
    if (engineCalm.isSettled('p1')) break;
  }
  const calmY = engineCalm.getPlayer('p1').y;
  engineCalm.dispose();
  assert.equal(calmY, 150, 'Straight shot in calm air stays on centerline y=150');

  const engineWind = new SimulationEngine(windChamberCourse, 0, { hazardTime: 0 });
  engineWind.addPlayer('p1', 'Tester', 0);
  engineWind.launch('p1', 0, 0.4);
  for (let i = 0; i < 4800; i++) {
    engineWind.step();
    if (engineWind.isSettled('p1')) break;
  }
  const windY = engineWind.getPlayer('p1').y;
  engineWind.dispose();
  assert.ok(windY > 155, `Crosswind (+y) must deflect ball northward (actual y: ${windY.toFixed(1)})`);
  console.log(`PASS: Steady crosswind deflects ground roll (calm y: ${calmY.toFixed(1)}, wind y: ${windY.toFixed(1)})`);

  // 3. Vertical Updraft Lifting & Void Gap Crossing
  // In Putt 1, void gap between Island 1 (x: 20..120) and Island 2 (x: 280..380, z: 20)
  // Updraft zone at x: 120..280 lifts ball with fz=1500 > gravity=700
  const engineUpdraft = new SimulationEngine(windChamberCourse, 1, { hazardTime: 0 });
  engineUpdraft.addPlayer('p1', 'Tester', 0);
  engineUpdraft.launch('p1', 0, 0.5); // shoot east across void gap
  let maxZ = 0;
  for (let i = 0; i < 4800; i++) {
    engineUpdraft.step();
    const p = engineUpdraft.getPlayer('p1');
    if (p.z > maxZ) maxZ = p.z;
    if (engineUpdraft.isSettled('p1')) break;
  }
  const updraftEnd = engineUpdraft.getPlayer('p1');
  console.log('Updraft landing pos:', updraftEnd.x, updraftEnd.y, updraftEnd.z, 'mode:', updraftEnd.mode);
  engineUpdraft.dispose();
  assert.ok(maxZ >= 20, `Updraft must lift ball to elevated height (maxZ: ${maxZ.toFixed(1)})`);
  assert.ok(updraftEnd.x >= 280, `Updraft must carry ball safely onto Island 2 (actual x: ${updraftEnd.x.toFixed(1)})`);
  assert.ok(updraftEnd.mode === 'sunk' || updraftEnd.z === 20, 'Ball must land on elevated green or sink in cup');
  console.log(`PASS: Vertical updraft lifts ball (max z: ${maxZ.toFixed(1)}) and lands on elevated island (mode: ${updraftEnd.mode})`);

  // 4. Counterfactual: Without Updraft, Crossing Fails Into Void
  const strippedCourse = {
    ...windChamberCourse,
    wind: [],
    putts: [{ ...windChamberCourse.putts[1], wind: [] }],
  };
  const engineNoUpdraft = new SimulationEngine(strippedCourse, 0, { hazardTime: 0 });
  engineNoUpdraft.addPlayer('p1', 'Tester', 0);
  engineNoUpdraft.launch('p1', 0, 0.5);
  let fellInVoid = false;
  for (let i = 0; i < 4800; i++) {
    const { events } = engineNoUpdraft.step();
    if (events.some(e => e.type === SimulationEventTypes.OUT_OF_BOUNDS)) {
      fellInVoid = true;
    }
    if (engineNoUpdraft.isSettled('p1')) break;
  }
  const noUpdraftEnd = engineNoUpdraft.getPlayer('p1');
  engineNoUpdraft.dispose();
  assert.ok(fellInVoid, 'Without updraft, ball must drop into void and trigger OUT_OF_BOUNDS');
  assert.equal(noUpdraftEnd.x, windChamberCourse.putts[1].tee[0], 'Must reset to tee after falling into void');
  console.log('PASS: Counterfactual fails into void gap without updraft');

  // 5. Deterministic Room-Time Gusting
  // Putt 2 has gust: { period: 4.0, amplitude: 1.0, phase: 0 }, force: [0, 150]
  // At hazardTime = 1.0 (quarter period, sin = 1.0), peak gust factor = 2.0
  const engineGustPeak = new SimulationEngine(windChamberCourse, 2, { hazardTime: 1.0 });
  engineGustPeak.addPlayer('p1', 'Tester', 0);
  engineGustPeak.launch('p1', 0, 0.35);
  for (let i = 0; i < 4800; i++) {
    engineGustPeak.step();
    if (engineGustPeak.isSettled('p1')) break;
  }
  const peakY = engineGustPeak.getPlayer('p1').y;
  engineGustPeak.dispose();

  // At hazardTime = 3.0 (three-quarter period, sin = -1.0), lull factor = 0.0
  const engineGustLull = new SimulationEngine(windChamberCourse, 2, { hazardTime: 3.0 });
  engineGustLull.addPlayer('p1', 'Tester', 0);
  engineGustLull.launch('p1', 0, 0.35);
  for (let i = 0; i < 4800; i++) {
    engineGustLull.step();
    if (engineGustLull.isSettled('p1')) break;
  }
  const lullY = engineGustLull.getPlayer('p1').y;
  engineGustLull.dispose();

  assert.ok(peakY > lullY + 10, `Peak gust must deflect ball further than lull (peak y: ${peakY.toFixed(1)}, lull y: ${lullY.toFixed(1)})`);
  console.log(`PASS: Deterministic gusting varies with room time (peak y: ${peakY.toFixed(1)}, lull y: ${lullY.toFixed(1)})`);

  // 6. SV1 Par Solver Verification
  console.log('Solving Wind Chamber Putt 0 with SV1 par solver...');
  const res0 = solvePar(windChamberCourse, 0);
  assert.equal(res0.status, 'route', 'Putt 0 must have a robust par route');
  assert.ok(res0.strokes <= 2, `Putt 0 must solve within par 2 (strokes: ${res0.strokes})`);
  assert.ok(res0.verified, 'Putt 0 route must be verified by simulation replay');

  console.log('Solving Wind Chamber Putt 1 with SV1 par solver...');
  const res1 = solvePar(windChamberCourse, 1);
  assert.equal(res1.status, 'route', 'Putt 1 must have a robust par route');
  assert.ok(res1.strokes <= 2, `Putt 1 must solve within par 2 (strokes: ${res1.strokes})`);
  assert.ok(res1.verified, 'Putt 1 route must be verified by simulation replay');

  console.log('Solving Wind Chamber Putt 2 with SV1 par solver...');
  const res2 = solvePar(windChamberCourse, 2);
  assert.equal(res2.status, 'route', 'Putt 2 must have a robust par route');
  assert.ok(res2.strokes <= 2, `Putt 2 must solve within par 2 (strokes: ${res2.strokes})`);
  assert.ok(res2.verified, 'Putt 2 route must be verified by simulation replay');
  console.log('PASS: SV1 par solver verifies routes within par on all wind chamber putts');

  // 7. Three.js Scene Generation
  const canvas = dom.window.document.getElementById('c');
  const library = createMaterialLibrary({ THREE, createCanvas: () => canvas, random: () => 0.5, style: 'toon' });
  const scenePutt0 = buildCourseScene({ library, course: windChamberCourse, puttIndex: 0 });
  const windZoneMeshes = [];
  const windStreakMeshes = [];
  scenePutt0.group.traverse(node => {
    if (node.userData?.windZone) windZoneMeshes.push(node);
    if (node.userData?.windStreaks) windStreakMeshes.push(node);
  });
  assert.equal(windZoneMeshes.length, 1, 'Scene must build 1 wind zone box mesh for Putt 0');
  assert.equal(windStreakMeshes.length, 1, 'Scene must build 1 wind streamline mesh for Putt 0');
  assert.equal(windZoneMeshes[0].userData.zoneId, 'crosswind-0');
  scenePutt0.dispose();
  console.log('PASS: Three.js renderer generates wind zone boundary and streamline meshes');

  console.log('ALL WIND IN LEVELS (W3) TESTS PASSED!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
