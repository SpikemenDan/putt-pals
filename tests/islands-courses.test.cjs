const assert = require('node:assert/strict');

(async () => {
  const { validateCourseIslands, validCourseIsland, islandsToTiles, islandsToGuardWalls, normalizeEdge, ISLAND_EDGES } = await import('../src/courses/islands.js');
  const { createIslandChamberCourse } = await import('../src/courses/island-chambers.js');
  const { checkGeometryIntegrity } = await import('../src/courses/integrity.js');
  const { SimulationEngine, resolvePuttCourse } = await import('../src/simulation/index.js');
  const { SimulationEventTypes } = await import('../src/shared/simulation.js');
  const { solvePar } = await import('../tools/cli/par-solver.mjs');
  const THREE = await import('three');
  const { buildCourseScene, createMaterialLibrary } = await import('../src/render/index.js');
  const { JSDOM } = require('jsdom');

  console.log('--- Testing Floating Islands and Walls (K1a) ---');

  // 1. Edge normalization and schema validation
  assert.equal(normalizeEdge('north'), 'north');
  assert.equal(normalizeEdge('n'), 'north');
  assert.equal(normalizeEdge('-y'), 'north');
  assert.equal(normalizeEdge('+x'), 'east');
  assert.equal(normalizeEdge('south'), 'south');
  assert.equal(normalizeEdge('west'), 'west');
  assert.equal(normalizeEdge('invalid'), null);

  const validIsland = {
    id: 'island-1',
    rect: [100, 100, 150, 150],
    elevation: 0,
    surface: 'turf',
    openEdges: ['east'],
    guardWalls: ['north', 'south', 'west']
  };
  assert.equal(validCourseIsland(validIsland), true);
  assert.equal(validCourseIsland({ ...validIsland, id: 'INVALID ID' }), false, 'uppercase/space id rejected');
  assert.equal(validCourseIsland({ ...validIsland, rect: [100, 100, -50, 100] }), false, 'negative width rejected');
  assert.equal(validCourseIsland({ ...validIsland, surface: 'lava' }), false, 'unknown surface rejected');
  assert.equal(validCourseIsland({ ...validIsland, openEdges: ['sky'] }), false, 'invalid edge rejected');

  assert.deepEqual(validateCourseIslands([validIsland]), []);
  assert.ok(validateCourseIslands([validIsland, validIsland]).length > 0, 'duplicate IDs rejected');

  // 2. Geometry Integrity: proof chamber passes
  const course = createIslandChamberCourse();
  const integrity = checkGeometryIntegrity({ geometry: course, putts: course.putts });
  assert.deepEqual(integrity.violations, [], 'island proof chamber passes integrity check with 0 violations');

  // 3. Geometry Integrity: blocked-open-edge
  const blockedCourse = structuredClone(course);
  // Add a wall directly blocking the declared east open edge of tee-island-0 ([40, 100, 200, 200] -> east is at x=240)
  blockedCourse.w.push([240, 100, 10, 200]);
  const blockedResult = checkGeometryIntegrity({ geometry: blockedCourse, putts: blockedCourse.putts });
  assert.ok(
    blockedResult.violations.some(v => v.rule === 'blocked-open-edge'),
    'wall blocking a declared open edge triggers blocked-open-edge violation'
  );

  // 4. Geometry Integrity: undeclared-open-edge
  const undeclaredCourse = structuredClone(course);
  // Remove guardWalls and openEdges on an island with no walls
  undeclaredCourse.islands = [
    { id: 'lone-island', rect: [100, 100, 150, 150], openEdges: [], guardWalls: false }
  ];
  undeclaredCourse.w = [];
  const undeclaredResult = checkGeometryIntegrity({ geometry: undeclaredCourse, putts: [] });
  assert.ok(
    undeclaredResult.violations.some(v => v.rule === 'undeclared-open-edge'),
    'island edge exposed to void without guard wall or open declaration triggers undeclared-open-edge'
  );

  // 5. Geometry Integrity: islands-interpenetrate
  const overlappingCourse = structuredClone(course);
  overlappingCourse.islands = [
    { id: 'isl-a', rect: [100, 100, 150, 150], openEdges: ['east'], guardWalls: ['north', 'south', 'west'] },
    { id: 'isl-b', rect: [150, 100, 150, 150], openEdges: ['west'], guardWalls: ['north', 'south', 'east'] }
  ];
  overlappingCourse.w = [];
  const overlapResult = checkGeometryIntegrity({ geometry: overlappingCourse, putts: [] });
  assert.ok(
    overlapResult.violations.some(v => v.rule === 'islands-interpenetrate'),
    'overlapping islands trigger islands-interpenetrate violation'
  );

  // 6. Simulation: Putt 0 gap jump success
  const enginePutt0 = new SimulationEngine(course, 0);
  const p0 = enginePutt0.addPlayer('p0', 'Player 0', 0);
  enginePutt0.launch('p0', 0, 1, 350); // launch east with speed 350
  for (let t = 0; t < 600 && p0.moving && p0.mode !== 'sunk'; t++) {
    enginePutt0.step();
  }
  assert.equal(p0.mode, 'sunk', 'gap jump clears the void and sinks in the cup');
  assert.equal(p0.strokes, 1, 'hole in 1 on gap jump');
  enginePutt0.dispose();

  // 7. Simulation: Underpowered roll drops into gap and triggers OUT_OF_BOUNDS
  const engineDrop = new SimulationEngine(course, 0);
  const pDrop = engineDrop.addPlayer('pDrop', 'Player Drop', 0);
  const initialTee = [pDrop.x, pDrop.y, pDrop.z];
  // Speed 280 clears the launch ramp into the void but cannot reach cup island (falls into gap)
  engineDrop.launch('pDrop', 0, 1, 280);
  let oobSeen = false;
  for (let t = 0; t < 600 && pDrop.moving; t++) {
    const res = engineDrop.step();
    if (res.events.some(e => e.type === SimulationEventTypes.OUT_OF_BOUNDS)) {
      oobSeen = true;
    }
  }
  assert.ok(oobSeen, 'underpowered gap shot triggers OUT_OF_BOUNDS event');
  assert.equal(pDrop.strokes, 1, 'stroke is counted on out-of-bounds drop');
  assert.equal(pDrop.x, initialTee[0], 'player resets to tee X after out-of-bounds');
  assert.equal(pDrop.y, initialTee[1], 'player resets to tee Y after out-of-bounds');
  engineDrop.dispose();

  // 8. Simulation: Guard wall bounces ball back onto island
  const engineBounce = new SimulationEngine(course, 0);
  const pBounce = engineBounce.addPlayer('pBounce', 'Player Bounce', 0);
  // Shoot west into the tee island guard wall
  engineBounce.launch('pBounce', 180, 1, 200);
  let wallBounceSeen = false;
  for (let t = 0; t < 300 && pBounce.moving; t++) {
    const res = engineBounce.step();
    if (res.events.some(e => e.type === SimulationEventTypes.BOUNCE && e.target === 'wall')) {
      wallBounceSeen = true;
    }
  }
  assert.ok(wallBounceSeen, 'guard wall bounces ball back into play');
  assert.ok(pBounce.x >= 40, 'ball stays contained inside the island perimeter');
  engineBounce.dispose();

  // 9. Par Solver (SV1) verification for both putts
  console.log('Solving Putt 0 with SV1 par solver...');
  const sol0 = solvePar(course, 0, { budgetTrials: 50000 });
  assert.equal(sol0.status, 'route', 'Putt 0 has a robust route');
  assert.ok(sol0.strokes <= course.putts[0].par, `Putt 0 strokes (${sol0.strokes}) <= par (${course.putts[0].par})`);

  console.log('Solving Putt 1 with SV1 par solver...');
  const sol1 = solvePar(course, 1, { budgetTrials: 100000 });
  assert.equal(sol1.status, 'route', 'Putt 1 has a robust route');
  assert.ok(sol1.strokes <= course.putts[1].par, `Putt 1 strokes (${sol1.strokes}) <= par (${course.putts[1].par})`);

  // 10. Per-Putt Island Geometry in resolvePuttCourse and resolveRenderCourse
  const resolved0 = resolvePuttCourse(course, 0);
  const resolved1 = resolvePuttCourse(course, 1);
  assert.equal(resolved0.islands[0].id, 'tee-island-0');
  assert.equal(resolved1.islands[0].id, 'start-island-1');

  // 11. Three.js Scene Rendering
  const dom = new JSDOM('<canvas></canvas>');
  const canvas = dom.window.document.querySelector('canvas');
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
  const library = createMaterialLibrary({ THREE, createCanvas: () => canvas, random: () => 0.5, style: 'toon' });
  const scene0 = buildCourseScene({ library, course, puttIndex: 0 });
  assert.ok(scene0.group, 'Three.js scene group created for Putt 0');
  scene0.dispose();

  const scene1 = buildCourseScene({ library, course, puttIndex: 1 });
  assert.ok(scene1.group, 'Three.js scene group created for Putt 1');
  scene1.dispose();
  library.dispose();

  console.log('--- All Floating Islands and Walls tests passed cleanly! ---');
})();
