const assert = require('node:assert/strict');

(async () => {
  const { validCourseCup, validateCourseCups, create10CupRack, resolveActiveCups } = await import('../src/courses/cups.js');
  const { createPongChamberCourse } = await import('../src/courses/pong-chambers.js');
  const { validateCourseGeometry } = await import('../src/courses/catalog.js');
  const { SimulationEngine } = await import('../src/simulation/index.js');
  const { SimulationEventTypes } = await import('../src/shared/simulation.js');
  const { solvePar } = await import('../tools/cli/par-solver.mjs');

  console.log('--- Testing Multi-Cup Course Schema & Elimination Physics (GM2a, #185) ---');

  // 1. Schema Validation for Course Cups
  assert.ok(validCourseCup({ id: 'cup-1', x: 100, y: 150 }));
  assert.ok(validCourseCup({ id: 'cup-2', x: 200, y: 250, z: 10, radius: 14, active: true, team: 'home', rackIndex: 0 }));
  assert.ok(validCourseCup({ id: 'cup-3', x: 300, y: 350, active: false, team: 1, rackIndex: 9 }));

  // Negative validation
  assert.equal(validCourseCup(null), false);
  assert.equal(validCourseCup(undefined), false);
  assert.equal(validCourseCup({ id: '', x: 0, y: 0 }), false);
  assert.equal(validCourseCup({ id: '   ', x: 0, y: 0 }), false);
  assert.equal(validCourseCup({ id: 123, x: 0, y: 0 }), false);
  assert.equal(validCourseCup({ id: 'c', x: NaN, y: 0 }), false);
  assert.equal(validCourseCup({ id: 'c', x: 0, y: Infinity }), false);
  assert.equal(validCourseCup({ id: 'c', x: 0, y: 0, z: NaN }), false);
  assert.equal(validCourseCup({ id: 'c', x: 0, y: 0, radius: -5 }), false);
  assert.equal(validCourseCup({ id: 'c', x: 0, y: 0, radius: 0 }), false);
  assert.equal(validCourseCup({ id: 'c', x: 0, y: 0, active: 'true' }), false);
  assert.equal(validCourseCup({ id: 'c', x: 0, y: 0, rackIndex: -1 }), false);
  assert.equal(validCourseCup({ id: 'c', x: 0, y: 0, rackIndex: 10 }), false);
  assert.equal(validCourseCup({ id: 'c', x: 0, y: 0, rackIndex: 2.5 }), false);

  assert.equal(validateCourseCups(undefined).length, 0);
  assert.equal(validateCourseCups([]).length, 0);
  assert.equal(validateCourseCups('not-array').length, 1);
  assert.ok(validateCourseCups([
    { id: 'dup', x: 0, y: 0 },
    { id: 'dup', x: 50, y: 50 },
  ]).some(e => e.includes('duplicate id')));
  assert.ok(validateCourseCups([
    { id: 'c1', x: 10, y: 10 },
    { id: 'c2', x: 10.5, y: 10.5 },
  ]).some(e => e.includes('overlap')));
  console.log('PASS: Course cup schema validation');

  // 2. 10-Cup Triangular Rack Layout (4-3-2-1 Formation)
  const rack = create10CupRack({
    idPrefix: 'test-rack',
    apex: [100, 200],
    direction: [1, 0],
    spacing: 34,
    radius: 15,
    team: 'home',
  });
  assert.equal(rack.length, 10, 'Rack must contain exactly 10 cups');
  assert.equal(rack[0].id, 'test-rack-0');
  assert.equal(rack[0].rackIndex, 0);
  assert.equal(rack[0].x, 100);
  assert.equal(rack[0].y, 200);
  assert.equal(rack[0].team, 'home');
  assert.equal(rack[0].radius, 15);
  assert.equal(rack[0].active, true);

  // Row counts: Row 0 (1 cup), Row 1 (2 cups), Row 2 (3 cups), Row 3 (4 cups)
  const rowHeight = 34 * (Math.sqrt(3) / 2);
  // Row 1 (indices 1, 2)
  assert.ok(Math.abs(rack[1].x - (100 + rowHeight)) < 1e-2);
  assert.ok(Math.abs(rack[2].x - (100 + rowHeight)) < 1e-2);
  assert.ok(Math.abs(rack[1].y - (200 - 17)) < 1e-2);
  assert.ok(Math.abs(rack[2].y - (200 + 17)) < 1e-2);

  // Row 3 (indices 6, 7, 8, 9)
  assert.ok(Math.abs(rack[6].x - (100 + 3 * rowHeight)) < 1e-2);
  assert.ok(Math.abs(rack[9].x - (100 + 3 * rowHeight)) < 1e-2);
  assert.equal(resolveActiveCups({ cups: rack }).length, 10);
  console.log('PASS: 10-cup triangular rack geometry (4-3-2-1 formation)');

  // 3. Pong Chamber Course Schema & Geometry Integrity
  const pongCourse = createPongChamberCourse();
  const v = validateCourseGeometry(pongCourse);
  assert.ok(v.valid, `Pong chamber course must be valid: ${v.errors.join(', ')}`);
  for (const putt of pongCourse.putts) {
    const pv = validateCourseGeometry(putt);
    assert.ok(pv.valid, `Putt ${putt.id} must be valid: ${pv.errors.join(', ')}`);
  }
  console.log('PASS: Pong chamber course schema and geometry integrity');

  // 4. Ball Capture & Multi-Cup Elimination Physics
  // Putt 0: 10-cup rack target at x=320, y=200. Tee at x=60, y=200.
  const engine0 = new SimulationEngine(pongCourse, 0);
  engine0.addPlayer('p1', 'Player 1', 0);
  // Launch straight down centerline toward apex cup (rack-0-0)
  // Distance = 260. Aim angle = 0 rad.
  engine0.launch('p1', 0, 0.585);

  let captured = false;
  let eliminationEvent = null;
  let sinkEvent = null;

  for (let i = 0; i < 4800; i++) {
    const { events } = engine0.step();
    for (const ev of events) {
      if (ev.type === SimulationEventTypes.SINK) {
        sinkEvent = ev;
      }
      if (ev.type === SimulationEventTypes.CUP_ELIMINATION) {
        eliminationEvent = ev;
      }
    }
    if (engine0.isSettled('p1')) {
      captured = true;
      break;
    }
  }

  assert.ok(captured, 'Shot must settle');
  assert.ok(sinkEvent, 'Ball must emit SINK event');
  assert.ok(eliminationEvent, 'Sinking in a multi-cup course must emit CUP_ELIMINATION event');
  assert.equal(eliminationEvent.cupId, 'rack-0-0', 'Eliminated cup must be apex cup rack-0-0');
  assert.equal(eliminationEvent.team, 'away');
  assert.equal(eliminationEvent.rackIndex, 0);

  const apexCup = engine0.course.cups.find(c => c.id === 'rack-0-0');
  assert.equal(apexCup.active, false, 'Sunk cup must be marked active = false');
  console.log('PASS: Active cup ball capture, SINK and CUP_ELIMINATION events');

  // 5. Inactive Cup Pass-Through (Elimination Physics)
  // Putt 2: Inactive cup at x=180, active cup at x=320.
  // Ball is launched through x=180 to sink at x=320.
  const engine2 = new SimulationEngine(pongCourse, 2);
  engine2.addPlayer('p1', 'Player 1', 0);
  engine2.launch('p1', 0, 0.585);

  let passedThroughInactive = false;
  let settledPutt2 = false;
  let p2Elimination = null;

  for (let i = 0; i < 4800; i++) {
    const { events } = engine2.step();
    const p = engine2.getPlayer('p1');
    if (p.x > 175 && p.x < 185 && p.moving) {
      // Ball is rolling through the eliminated cup position
      passedThroughInactive = true;
      // Ball must not be sinking or resting at x=180
      assert.equal(p.mode, 'play', 'Ball must remain in play mode while rolling over eliminated cup');
    }
    for (const ev of events) {
      if (ev.type === SimulationEventTypes.CUP_ELIMINATION) {
        p2Elimination = ev;
      }
    }
    if (engine2.isSettled('p1')) {
      settledPutt2 = true;
      break;
    }
  }

  assert.ok(passedThroughInactive, 'Ball must pass through x=180');
  assert.ok(settledPutt2, 'Ball must settle in putt 2');
  assert.ok(p2Elimination, 'Active cup must emit elimination event');
  assert.equal(p2Elimination.cupId, 'active-cup-2', 'Only the active cup at x=320 should be eliminated');
  console.log('PASS: Inactive cup ignored (ball rolls across without capture or lip rebound)');

  // 6. SV1 Par Solver Acceptance
  const solution = solvePar(pongCourse, 0);
  assert.equal(solution.status, 'route', 'SV1 Par solver must find route to cup in Putt 0');
  assert.ok(solution.strokes <= 2, `Route must be within par 2 (actual: ${solution.strokes})`);
  assert.ok(solution.verified, 'Route must be independently verified by solver');
  console.log(`PASS: SV1 Par solver verified route in ${solution.strokes} stroke(s) (aim: ${solution.route[0].deg} deg, power: ${solution.route[0].power})`);

  console.log('\nAll Multi-Cup Course Schema & Elimination Physics tests passed!');
})();
