const assert = require('node:assert/strict');

(async () => {
  const { validateCourseStructures, validCourseStructure } = await import('../src/courses/structures.js');
  const { createOverpassChamberCourse } = await import('../src/courses/volumetric-chambers.js');
  const { checkGeometryIntegrity } = await import('../src/courses/integrity.js');
  const { SimulationEngine } = await import('../src/simulation/index.js');
  const { surfaceHeight, contactHeight, stepBall } = await import('../src/simulation/physics.js');
  const { createPlayerState, applyShot, SimulationEventTypes } = await import('../src/shared/simulation.js');
  const { solvePar } = await import('../tools/cli/par-solver.mjs');
  const THREE = await import('three');
  const { buildCourseScene, createMaterialLibrary } = await import('../src/render/index.js');
  const { JSDOM } = require('jsdom');

  console.log('--- Testing Volumetric 3D Course Model (K0) ---');

  // 1. Structure Schema Validation
  const validSurface = { id: 's1', kind: 'surface', rect: [100, 100, 80, 80], z: 35, thickness: 4, surface: 'turf', ceiling: true };
  assert.equal(validCourseStructure(validSurface), true);
  assert.equal(validCourseStructure({ ...validSurface, rect: [100, 100, -10, 80] }), false, 'negative width is invalid');
  assert.equal(validCourseStructure({ ...validSurface, z: NaN }), false, 'NaN z is invalid');
  assert.equal(validCourseStructure({ ...validSurface, surface: 'lava' }), false, 'unknown surface type is invalid');

  const validWall = { id: 'w1', kind: 'wall', rect: [100, 100, 10, 80], base: 35, height: 20 };
  assert.equal(validCourseStructure(validWall), true);
  assert.equal(validCourseStructure({ ...validWall, height: -5 }), false, 'negative height is invalid');

  const validCeiling = { id: 'c1', kind: 'ceiling', rect: [100, 100, 80, 80], z: 50, restitution: 0.7 };
  assert.equal(validCourseStructure(validCeiling), true);
  assert.equal(validCourseStructure({ ...validCeiling, restitution: 2 }), false, 'restitution > 1 is invalid');

  assert.deepEqual(validateCourseStructures([validSurface, validWall, validCeiling]), []);
  assert.ok(validateCourseStructures([validSurface, validSurface]).length, 'duplicate IDs are rejected');

  // 2. Geometry Integrity
  const course = createOverpassChamberCourse();
  const integrity = checkGeometryIntegrity({ geometry: course });
  assert.deepEqual(integrity.violations, [], 'overpass chamber has no integrity violations');

  // Insufficient vertical clearance test
  const tightClearanceCourse = structuredClone(course);
  tightClearanceCourse.structures[0].z = 6; // Underside at 6 - 4 = 2, lower floor at 0 => clearance 2 < 8
  const tightResult = checkGeometryIntegrity({ geometry: tightClearanceCourse });
  assert.ok(
    tightResult.violations.some(v => v.rule === 'insufficient-vertical-clearance'),
    'insufficient vertical clearance (< 8 units) is rejected'
  );

  // 3. Simulation: Under the Overpass
  // Putt 0 starts at [50, 150, 0] and shoots east towards [350, 150, 0], passing under the overpass at [150..250]
  const engineUnder = new SimulationEngine(course, 0);
  const pUnder = engineUnder.addPlayer('p1', 'Player 1', 0);
  assert.equal(pUnder.z, 0, 'player spawns on lower floor at z=0');

  // Shot east straight into the cup
  engineUnder.launch('p1', 0, 1, 260);
  let underOverpassSeen = false;
  for (let t = 0; t < 1200 && pUnder.moving && pUnder.mode !== 'sunk'; t++) {
    engineUnder.step();
    if (pUnder.x >= 160 && pUnder.x <= 240) {
      underOverpassSeen = true;
      assert.equal(pUnder.z, 0, 'ball remains on floor at z=0 while beneath overpass');
    }
  }
  assert.ok(underOverpassSeen, 'ball passed beneath the overpass footprint');
  assert.equal(pUnder.mode, 'sunk', 'ball sinks cleanly under overpass');
  engineUnder.dispose();

  // 4. Simulation: Travel on Overpass and Drop to Ground
  // Putt 1 starts on the overpass deck at [195, 80] at z=40
  const engineOver = new SimulationEngine(course, 1);
  const pOver = engineOver.addPlayer('p2', 'Player 2', 0);
  assert.equal(pOver.z, 40, 'player spawns on overpass deck at z=40');

  // Shoot south towards hole at [195, 275]
  // Angle for +y in simulation is Math.PI / 2
  engineOver.launch('p2', Math.PI / 2, 1, 180);
  let airborneDropSeen = false;
  let landedGroundSeen = false;
  for (let t = 0; t < 2400 && pOver.moving && pOver.mode !== 'sunk'; t++) {
    engineOver.step();
    if (pOver.y > 260 && pOver.z > 5 && pOver.z < 38) {
      airborneDropSeen = true;
    }
    if (pOver.y > 262 && (pOver.z <= 2 || pOver.mode === 'sunk')) {
      landedGroundSeen = true;
    }
  }
  assert.ok(airborneDropSeen, 'ball dropped through air after rolling off overpass edge');
  assert.ok(landedGroundSeen, 'ball safely landed on the lower ground floor');
  assert.equal(pOver.mode, 'sunk', 'ball sinks after dropping from upper level');
  engineOver.dispose();

  // 5. Ceiling Rebound
  // Under the ceiling [30, 120, 60, 60] at z=30
  const pCeil = createPlayerState('ceil-test', 0, { x: 50, y: 140, z: 1 });
  pCeil.vz = 250;
  pCeil.moving = true;
  let ceilingBounceSeen = false;
  for (let t = 0; t < 200; t++) {
    const events = stepBall(pCeil, course, 1 / 240, 0);
    for (const ev of events) {
      if (ev.type === SimulationEventTypes.BOUNCE && (ev.target === 'test-ceiling' || ev.target === 'ceiling')) {
        ceilingBounceSeen = true;
      }
    }
  }
  assert.ok(ceilingBounceSeen, 'ceiling bounce event emitted when upward ball hits ceiling');
  assert.ok(pCeil.vz < 0 || pCeil.z <= 0.1, 'ball rebounded downward from ceiling');

  // 6. Volumetric 3D Walls
  // Ball on ground (z=0) rolling near x=150 should NOT collide with overpass wall (base=40)
  const pGroundWall = createPlayerState('wall-under', 0, { x: 140, y: 150, z: 0 });
  pGroundWall.vx = 100;
  pGroundWall.moving = true;
  for (let t = 0; t < 100; t++) {
    const events = stepBall(pGroundWall, course, 1 / 240, 0);
    for (const ev of events) {
      if (ev.target === 'overpass-wall-w') {
        assert.fail('ground ball should not hit elevated wall');
      }
    }
  }
  assert.ok(pGroundWall.x > 155, 'ground ball passed under elevated wall without collision');

  // Ball on overpass (z=40) rolling into overpass wall (base=40) DOES bounce
  const pBridgeWall = createPlayerState('wall-hit', 0, { x: 160, y: 150, z: 40 });
  pBridgeWall.vx = -100;
  pBridgeWall.moving = true;
  let wallHitSeen = false;
  for (let t = 0; t < 100; t++) {
    const events = stepBall(pBridgeWall, course, 1 / 240, 0);
    for (const ev of events) {
      if (ev.target === 'overpass-wall-w') wallHitSeen = true;
    }
  }
  assert.ok(wallHitSeen, 'ball on bridge bounced off bridge guard wall');

  // 7. Solver: Par-Route Solutions for Overpass Chamber
  const routeUnder = solvePar(course, 0);
  assert.equal(routeUnder.status, 'route', 'solver found a robust route for Putt 0 (under overpass)');
  assert.ok(routeUnder.strokes <= 2, `route is within par 2 (got ${routeUnder.strokes})`);
  assert.equal(routeUnder.verified, true, 'route is verified');

  const routeDrop = solvePar(course, 1);
  assert.equal(routeDrop.status, 'route', 'solver found a robust route for Putt 1 (drop from overpass)');
  assert.ok(routeDrop.strokes <= 2, `route is within par 2 (got ${routeDrop.strokes})`);
  assert.equal(routeDrop.verified, true, 'route is verified');

  // 8. Renderer Integration
  const dom = new JSDOM('<canvas></canvas>');
  const canvas = dom.window.document.querySelector('canvas');
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({width: 10}) : key === 'createRadialGradient' ? () => ({addColorStop() {}}) : () => {}, set: () => true });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
  const library = createMaterialLibrary({ THREE, createCanvas: () => canvas, random: () => 0.5, style: 'toon' });
  const build = buildCourseScene({ library, course });
  assert.ok(build.group, 'scene created for volumetric course');
  assert.ok(build.group.children.length > 5, 'scene contains floor, structures, and walls');
  build.dispose();
  library.dispose();

  console.log('PASS: All Volumetric 3D Course (K0) tests passed successfully!');
})();
