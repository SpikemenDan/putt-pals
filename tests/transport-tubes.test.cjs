const assert = require('node:assert/strict');

(async () => {
  const {
    validateCourseTubes,
    validCourseTube,
    pathLength,
    samplePath
  } = await import('../src/courses/tubes.js');
  const { createTubeChamberCourse } = await import('../src/courses/tube-chambers.js');
  const { SimulationEngine, resolvePuttCourse } = await import('../src/simulation/index.js');
  const { SimulationEventTypes } = await import('../src/shared/simulation.js');
  const { solvePar } = await import('../tools/cli/par-solver.mjs');
  const THREE = await import('three');
  const { buildCourseScene, createMaterialLibrary } = await import('../src/render/index.js');
  const { JSDOM } = require('jsdom');

  console.log('--- Testing Transport Tubes (K1c) ---');

  // 1. Schema validation
  const validTube = {
    id: 'tube-test-1',
    entry: [100, 100, 0],
    exit: [300, 100, 20],
    exitVelocity: [300, 0, 100],
    path: [
      [100, 100, 0],
      [200, 100, 30],
      [300, 100, 20]
    ],
    radius: 14,
    speed: 360,
    oneWay: true
  };

  assert.equal(validCourseTube(validTube), true, 'valid tube passes schema check');
  assert.equal(validCourseTube({ ...validTube, id: 'INVALID ID' }), false, 'uppercase/space id rejected');
  assert.equal(validCourseTube({ ...validTube, entry: [100, 100] }), false, '2D entry rejected (requires point3)');
  assert.equal(validCourseTube({ ...validTube, exit: [300, 100] }), false, '2D exit rejected');
  assert.equal(validCourseTube({ ...validTube, exitVelocity: [300, 0] }), false, '2D exitVelocity rejected');
  assert.equal(validCourseTube({ ...validTube, path: [[100, 100, 0]] }), false, 'single point path rejected');
  assert.equal(
    validCourseTube({ ...validTube, path: [[500, 100, 0], [200, 100, 30], [300, 100, 20]] }),
    false,
    'path start mismatching entry position rejected'
  );
  assert.equal(validCourseTube({ ...validTube, radius: -5 }), false, 'negative radius rejected');
  assert.equal(validCourseTube({ ...validTube, speed: -100 }), false, 'negative speed rejected');
  assert.equal(validCourseTube({ ...validTube, oneWay: 'yes' }), false, 'non-boolean oneWay rejected');

  assert.deepEqual(validateCourseTubes([validTube]), []);
  assert.ok(validateCourseTubes([validTube, validTube]).length > 0, 'duplicate tube IDs rejected');

  // 2. Path math calculations
  const testPath = [[0, 0, 0], [100, 0, 0], [100, 100, 0]];
  assert.equal(pathLength(testPath), 200, 'path length equals sum of segments');
  assert.deepEqual(samplePath(testPath, 0, 200), [0, 0, 0], 'sample at 0 is start point');
  assert.deepEqual(samplePath(testPath, 100, 200), [100, 0, 0], 'sample at 100 is corner point');
  assert.deepEqual(samplePath(testPath, 200, 200), [100, 100, 0], 'sample at end is end point');

  // 3. Proof chamber course creation & validation
  const course = createTubeChamberCourse();
  assert.equal(course.id, 'tube-chambers');
  assert.equal(course.putts.length, 2);

  // 4. Simulation: Putt 0 tube entry, travel, fling exit and cup sink
  const engine0 = new SimulationEngine(course, 0);
  const p0 = engine0.addPlayer('p0', 'Player 0', 0);
  engine0.launch('p0', 0, 0.4); // shoot east towards tube entrance
  const events0 = [];
  for (let t = 0; t < 600 && p0.moving && p0.mode !== 'sunk'; t++) {
    const res = engine0.step();
    for (const ev of res.events) {
      if (ev.type === SimulationEventTypes.HAZARD && ev.hazardType === 'tube') {
        events0.push(ev);
      }
    }
  }
  assert.equal(p0.mode, 'sunk', 'ball enters tube, flings across void, and sinks in cup');
  assert.ok(events0.some(e => e.action === 'enter'), 'emits tube enter event');
  assert.ok(events0.some(e => e.action === 'exit'), 'emits tube exit event');

  // 5. Par solver (SV1) verification
  const resolved0 = resolvePuttCourse(course, 0);
  const sol0 = solvePar(resolved0, { maxStrokes: 2 });
  assert.ok(sol0?.strokes <= 2, `Putt 0 solved within par 2 (took ${sol0?.strokes})`);

  const resolved1 = resolvePuttCourse(course, 1);
  const sol1 = solvePar(resolved1, { maxStrokes: 2 });
  assert.ok(sol1?.strokes <= 2, `Putt 1 solved within par 2 (took ${sol1?.strokes})`);

  // 6. Three.js scene building
  const dom = new JSDOM('<canvas></canvas>');
  const canvas = dom.window.document.querySelector('canvas');
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
  const library = createMaterialLibrary({ THREE, createCanvas: () => canvas, random: () => 0.5, style: 'toon' });

  const scene0 = buildCourseScene({ library, course, puttIndex: 0 });
  assert.ok(scene0.group, 'Putt 0 Three.js scene built successfully');
  let hasTubeMesh = false;
  scene0.group.traverse(obj => {
    if (obj.isMesh && obj.userData?.tube === true) {
      hasTubeMesh = true;
    }
  });
  assert.ok(hasTubeMesh, 'Putt 0 scene contains transport tube mesh');
  scene0.dispose();

  const scene1 = buildCourseScene({ library, course, puttIndex: 1 });
  assert.ok(scene1.group, 'Putt 1 Three.js scene built successfully');
  scene1.dispose();
  library.dispose();

  console.log('--- All Transport Tubes tests passed! ---');
})();
