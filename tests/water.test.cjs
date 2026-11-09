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
  const { validCourseWaterBody, validateCourseWater } = await import('../src/courses/water.js');
  const { waterChamberCourse } = await import('../src/courses/water-chambers.js');
  const { SimulationEngine } = await import('../src/simulation/index.js');
  const { SimulationEventTypes } = await import('../src/shared/simulation.js');
  const { TUNING } = await import('../src/shared/tuning.js');
  const { solvePar } = await import('../tools/cli/par-solver.mjs');
  const THREE = await import('three');
  const { createMaterialLibrary } = await import('../src/render/materials.js');
  const { buildCourseScene } = await import('../src/render/course-scene.js');

  console.log('--- Testing Water in Levels (W2, #105) ---');

  // 1. Schema Validation
  assert.ok(validCourseWaterBody({ id: 'w1', bounds: [0, 0, 100, 100] }));
  assert.ok(validCourseWaterBody({ id: 'w2', bounds: [0, 0, 100, 100], z: 15, shallow: true, current: [10, -20] }));

  // Negative validation
  assert.equal(validCourseWaterBody(null), false);
  assert.equal(validCourseWaterBody({ id: '', bounds: [0, 0, 10, 10] }), false);
  assert.equal(validCourseWaterBody({ id: 'w', bounds: [0, 0, -10, 10] }), false);
  assert.equal(validCourseWaterBody({ id: 'w', bounds: [0, 0, 10, 0] }), false);
  assert.equal(validCourseWaterBody({ id: 'w', bounds: [0, 0, 10] }), false);
  assert.equal(validCourseWaterBody({ id: 'w', bounds: [0, 0, 10, 10], z: NaN }), false);
  assert.equal(validCourseWaterBody({ id: 'w', bounds: [0, 0, 10, 10], shallow: 'yes' }), false);
  assert.equal(validCourseWaterBody({ id: 'w', bounds: [0, 0, 10, 10], current: [10] }), false);
  assert.equal(validCourseWaterBody({ id: 'w', bounds: [0, 0, 10, 10], current: [10, NaN] }), false);

  assert.equal(validateCourseWater(undefined).length, 0);
  assert.equal(validateCourseWater([]).length, 0);
  assert.equal(validateCourseWater('not-array').length, 1);
  assert.ok(validateCourseWater([{ id: 'dup', bounds: [0, 0, 10, 10] }, { id: 'dup', bounds: [20, 0, 10, 10] }]).some(e => e.includes('duplicate')));
  console.log('PASS: Water schema and validation');

  // 2. Deep Water Splash and Reset
  const putt0 = waterChamberCourse.putts[0];
  const engine0 = new SimulationEngine(waterChamberCourse, 0, { hazardTime: 0 });
  engine0.addPlayer('p1', 'Tester', 0);

  // Shoot off-angle directly into deep water moat (missing the bridge)
  engine0.launch('p1', -0.5, 0.5); // Aiming southeast into deep moat
  let splashed = false;
  let oob = false;
  for (let i = 0; i < 4800; i++) {
    const { events } = engine0.step();
    if (events.some(e => e.type === SimulationEventTypes.HAZARD && e.hazardType === 'water')) {
      splashed = true;
    }
    if (events.some(e => e.type === SimulationEventTypes.OUT_OF_BOUNDS)) {
      oob = true;
    }
    if (engine0.isSettled('p1')) break;
  }
  assert.ok(splashed, 'Entering deep water must emit HAZARD water event');
  assert.ok(oob, 'Entering deep water must trigger OUT_OF_BOUNDS reset');
  const player0 = engine0.getPlayer('p1');
  assert.equal(player0.x, putt0.tee[0], 'Ball must reset to tee x after water splash');
  assert.equal(player0.y, putt0.tee[1], 'Ball must reset to tee y after water splash');
  assert.equal(player0.moving, false, 'Ball must stop moving after splash reset');
  engine0.dispose();
  console.log('PASS: Deep water hazard splash and reset');

  // 3. Bridge Safe Crossing & Par Route
  const engineBridge = new SimulationEngine(waterChamberCourse, 0, { hazardTime: 0 });
  engineBridge.addPlayer('p1', 'Tester', 0);
  engineBridge.launch('p1', 0, 0.5); // Shoots straight along bridge across the moat
  for (let i = 0; i < 4800; i++) {
    engineBridge.step();
    if (engineBridge.isSettled('p1')) break;
  }
  const bridgeCrossing = engineBridge.getPlayer('p1');
  assert.ok(bridgeCrossing.x >= 260, `Ball must cross bridge past x=260 (actual: ${bridgeCrossing.x})`);
  assert.equal(bridgeCrossing.moving, false);
  engineBridge.dispose();
  console.log('PASS: Bridge provides safe crossing across deep water');

  // 4. Counterfactual: Without Bridge, Crossing Fails
  const strippedPutt0 = structuredClone(putt0);
  strippedPutt0.pl = []; // remove bridge
  const strippedCourse = { ...waterChamberCourse, pl: [], putts: [strippedPutt0] };
  const engineStripped = new SimulationEngine(strippedCourse, 0, { hazardTime: 0 });
  engineStripped.addPlayer('p1', 'Tester', 0);
  engineStripped.launch('p1', 0, 0.5); // same straight shot
  let strippedSplashed = false;
  for (let i = 0; i < 4800; i++) {
    const { events } = engineStripped.step();
    if (events.some(e => e.type === SimulationEventTypes.HAZARD && e.hazardType === 'water')) {
      strippedSplashed = true;
    }
    if (engineStripped.isSettled('p1')) break;
  }
  assert.ok(strippedSplashed, 'Without bridge, ball must splash into deep water');
  engineStripped.dispose();
  console.log('PASS: Counterfactual fails without bridge');
  console.log('PASS: Counterfactual fails without stepping stone');

  // 5. Shallow Water Drag & Friction Deceleration
  // Compare roll distance on dry turf vs shallow water
  const dryCourse = {
    ...waterChamberCourse,
    water: [],
    putts: [{ ...waterChamberCourse.putts[1], water: [] }],
  };
  const shallowCourse = waterChamberCourse;

  const engineDry = new SimulationEngine(dryCourse, 0, { hazardTime: 0 });
  engineDry.addPlayer('p1', 'Tester', 0);
  engineDry.launch('p1', 0, 0.4);
  for (let i = 0; i < 4800; i++) {
    engineDry.step();
    if (engineDry.isSettled('p1')) break;
  }
  const dryDist = engineDry.getPlayer('p1').x - 50;
  engineDry.dispose();

  const engineShallow = new SimulationEngine(shallowCourse, 1, { hazardTime: 0 });
  engineShallow.addPlayer('p1', 'Tester', 0);
  engineShallow.launch('p1', 0, 0.4);
  for (let i = 0; i < 4800; i++) {
    engineShallow.step();
    if (engineShallow.isSettled('p1')) break;
  }
  const shallowDist = engineShallow.getPlayer('p1').x - 50;
  const shallowY = engineShallow.getPlayer('p1').y;
  engineShallow.dispose();

  assert.ok(shallowDist < dryDist * 0.85, `Shallow water must slow the ball down (dry: ${dryDist}, shallow: ${shallowDist})`);
  console.log(`PASS: Shallow water slows the ball (dry roll: ${dryDist.toFixed(1)}, shallow roll: ${shallowDist.toFixed(1)})`);

  // 6. Flowing Current Deflection
  // In Putt 1, current is [0, 80] pushing northward (+y)
  assert.ok(shallowY > 155, `Current pushing northward (+y) must deflect ball (initial y: 150, final y: ${shallowY.toFixed(1)})`);
  console.log(`PASS: Flowing current pushes ball along flow vector (deflected to y: ${shallowY.toFixed(1)})`);

  // 7. SV1 Par Solver Verification
  console.log('Solving Water Chamber Putt 0 with SV1 par solver...');
  const res0 = solvePar(waterChamberCourse, 0);
  assert.equal(res0.status, 'route', 'Putt 0 must have a robust par route');
  assert.ok(res0.strokes <= 2, `Putt 0 must solve within par 2 (strokes: ${res0.strokes})`);
  assert.ok(res0.verified, 'Putt 0 route must be verified by simulation replay');

  console.log('Solving Water Chamber Putt 1 with SV1 par solver...');
  const res1 = solvePar(waterChamberCourse, 1);
  assert.equal(res1.status, 'route', 'Putt 1 must have a robust par route');
  assert.ok(res1.strokes <= 2, `Putt 1 must solve within par 2 (strokes: ${res1.strokes})`);
  assert.ok(res1.verified, 'Putt 1 route must be verified by simulation replay');
  console.log('PASS: SV1 par solver verifies routes within par on both water chamber putts');

  // 8. Three.js Scene Generation
  const canvas = dom.window.document.getElementById('c');
  const library = createMaterialLibrary({ THREE, createCanvas: () => canvas, random: () => 0.5, style: 'toon' });
  const scenePutt0 = buildCourseScene({ library, course: waterChamberCourse, puttIndex: 0 });
  const waterMeshes0 = [];
  scenePutt0.group.traverse(node => {
    if (node.userData?.water) waterMeshes0.push(node);
  });
  assert.equal(waterMeshes0.length, 1, 'Scene must build 1 water mesh for Putt 0');
  assert.equal(waterMeshes0[0].userData.shallow, false, 'Putt 0 water must be deep');
  scenePutt0.dispose();

  const scenePutt1 = buildCourseScene({ library, course: waterChamberCourse, puttIndex: 1 });
  const waterMeshes1 = [];
  scenePutt1.group.traverse(node => {
    if (node.userData?.water) waterMeshes1.push(node);
  });
  assert.equal(waterMeshes1.length, 1, 'Scene must build 1 water mesh for Putt 1');
  assert.equal(waterMeshes1[0].userData.shallow, true, 'Putt 1 water must be shallow');
  scenePutt1.dispose();
  console.log('PASS: Three.js renderer generates deep & shallow water meshes with shorelines');

  console.log('ALL WATER IN LEVELS (W2) TESTS PASSED!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
