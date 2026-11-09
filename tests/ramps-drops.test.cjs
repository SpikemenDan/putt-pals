const assert = require('node:assert/strict');

(async () => {
  const {
    validateCurvedRamps,
    validCurvedRamp,
    validateTierDrops,
    validTierDrop,
    pointInCurvedRamp,
    curvedRampHeight,
    curvedRampBoundingRect,
    arcFraction,
    pointInDropLanding
  } = await import('../src/courses/ramps-drops.js');
  const { createRampDropChambersCourse } = await import('../src/courses/ramp-drop-chambers.js');
  const { SimulationEngine, resolvePuttCourse } = await import('../src/simulation/index.js');
  const { SimulationEventTypes } = await import('../src/shared/simulation.js');
  const { solvePar } = await import('../tools/cli/par-solver.mjs');
  const THREE = await import('three');
  const { buildCourseScene, createMaterialLibrary } = await import('../src/render/index.js');
  const { JSDOM } = require('jsdom');

  console.log('--- Testing Curved Ramps and Multi-Tier Drops (K1b) ---');

  // 1. Curved ramp schema validation
  const validRamp = {
    id: 'ramp-test-1',
    center: [100, 100],
    innerRadius: 40,
    outerRadius: 100,
    startAngleDeg: 0,
    endAngleDeg: 90,
    zStart: 30,
    zEnd: 0,
    curve: 'smooth',
    bankAngleDeg: 5,
    surface: 'turf',
    thickness: 10
  };

  assert.equal(validCurvedRamp(validRamp), true, 'valid curved ramp passes schema check');
  assert.equal(validCurvedRamp({ ...validRamp, id: 'INVALID ID' }), false, 'uppercase/space id rejected');
  assert.equal(validCurvedRamp({ ...validRamp, innerRadius: 120 }), false, 'innerRadius >= outerRadius rejected');
  assert.equal(validCurvedRamp({ ...validRamp, innerRadius: -10 }), false, 'negative innerRadius rejected');
  assert.equal(validCurvedRamp({ ...validRamp, bankAngleDeg: 89 }), false, 'bank angle > 85 rejected');
  assert.equal(validCurvedRamp({ ...validRamp, curve: 'hyperbolic' }), false, 'unknown curve profile rejected');
  assert.equal(validCurvedRamp({ ...validRamp, surface: 'lava' }), false, 'unknown surface rejected');
  assert.equal(validCurvedRamp({ ...validRamp, thickness: -5 }), false, 'negative thickness rejected');

  assert.deepEqual(validateCurvedRamps([validRamp]), []);
  assert.ok(validateCurvedRamps([validRamp, validRamp]).length > 0, 'duplicate IDs rejected');

  // 2. Multi-tier drop schema validation
  const validDrop = {
    id: 'drop-test-1',
    dropEdge: [160, 160, 160, 240],
    landingFloor: [160, 160, 120, 80, 20],
    zFrom: 40,
    zTo: 20,
    restitution: 0.3
  };

  assert.equal(validTierDrop(validDrop), true, 'valid tier drop passes schema check');
  assert.equal(validTierDrop({ ...validDrop, id: 'INVALID ID' }), false, 'uppercase/space id rejected');
  assert.equal(validTierDrop({ ...validDrop, zTo: 45 }), false, 'zTo >= zFrom inverted drop rejected');
  assert.equal(validTierDrop({ ...validDrop, restitution: 1.5 }), false, 'restitution > 1 rejected');
  assert.equal(validTierDrop({ ...validDrop, restitution: -0.2 }), false, 'negative restitution rejected');
  assert.equal(validTierDrop({ ...validDrop, landingFloor: [160, 160, -10, 80, 20] }), false, 'negative width rejected');

  assert.deepEqual(validateTierDrops([validDrop]), []);
  assert.ok(validateTierDrops([validDrop, validDrop]).length > 0, 'duplicate drop IDs rejected');

  // 3. Analytical geometry calculations
  // arcFraction tests
  assert.equal(arcFraction(0, 0, 90), 0);
  assert.equal(arcFraction(45, 0, 90), 0.5);
  assert.equal(arcFraction(90, 0, 90), 1);
  assert.equal(arcFraction(135, 0, 90), null);
  // CW arc
  assert.equal(arcFraction(90, 90, 0), 0);
  assert.equal(arcFraction(45, 90, 0), 0.5);
  assert.equal(arcFraction(0, 90, 0), 1);
  assert.equal(arcFraction(135, 90, 0), null);

  // curvedRampHeight tests
  const unbanked = { ...validRamp, bankAngleDeg: 0, curve: 'smooth' };
  assert.equal(curvedRampHeight(unbanked, 170, 100), 30, 'z at start angle is zStart');
  assert.equal(curvedRampHeight(unbanked, 100, 170), 0, 'z at end angle is zEnd');
  const midX = 100 + 70 * Math.cos(Math.PI / 4);
  const midY = 100 + 70 * Math.sin(Math.PI / 4);
  assert.equal(Math.round(curvedRampHeight(unbanked, midX, midY)), 15, 'smooth Hermite midpoint is 15');

  // Bounding rect
  const bounds = curvedRampBoundingRect(validRamp);
  assert.equal(bounds[0], 100, 'minX is center x');
  assert.equal(bounds[1], 100, 'minY is center y');
  assert.equal(bounds[2], 100, 'width matches outer radius');
  assert.equal(bounds[3], 100, 'height matches outer radius');

  // 4. Proof chamber course creation & validation
  const course = createRampDropChambersCourse();
  assert.equal(course.id, 'ramp-drop-chambers');
  assert.equal(course.putts.length, 2);

  // 5. Simulation: Putt 0 curved ramp descent
  const engine0 = new SimulationEngine(course, 0);
  const p0 = engine0.addPlayer('p0', 'Player 0', 0);
  assert.equal(p0.z, 30, 'player spawns on upper deck at z=30');
  engine0.launch('p0', Math.PI / 2, 0.55); // shoot south into curved ramp
  for (let t = 0; t < 600 && p0.moving && p0.mode !== 'sunk'; t++) {
    engine0.step();
  }
  assert.equal(p0.mode, 'sunk', 'ball navigates curved ramp down to z=0 and sinks in cup');

  // 6. Simulation: Putt 1 multi-tier drop descent & landing impacts
  const engine1 = new SimulationEngine(course, 1);
  const p1 = engine1.addPlayer('p1', 'Player 1', 0);
  assert.equal(p1.z, 40, 'player spawns on Tier 1 at z=40');
  engine1.launch('p1', 0, 0.35); // shoot east towards descending tiers
  const bounceEvents = [];
  for (let t = 0; t < 800 && p1.moving && p1.mode !== 'sunk'; t++) {
    const res = engine1.step();
    for (const ev of res.events) {
      if (ev.type === SimulationEventTypes.BOUNCE) {
        bounceEvents.push(ev);
      }
    }
  }
  assert.equal(p1.mode, 'sunk', 'ball drops across tiers and sinks in cup');
  assert.ok(
    bounceEvents.some(e => e.target === 'drop-tier-1-to-2'),
    'emits landing bounce on Tier 2 landing floor'
  );
  assert.ok(
    bounceEvents.some(e => e.target === 'drop-tier-2-to-3'),
    'emits landing bounce on Tier 3 landing floor'
  );

  // 7. Par solver (SV1) verification
  const resolvedPutt0 = resolvePuttCourse(course, 0);
  const sol0 = solvePar(resolvedPutt0, { maxStrokes: 2 });
  assert.ok(sol0?.strokes <= 2, `Putt 0 solved within par 2 (took ${sol0?.strokes})`);

  const resolvedPutt1 = resolvePuttCourse(course, 1);
  const sol1 = solvePar(resolvedPutt1, { maxStrokes: 2 });
  assert.ok(sol1?.strokes <= 2, `Putt 1 solved within par 2 (took ${sol1?.strokes})`);

  // 8. Three.js scene building
  const dom = new JSDOM('<canvas></canvas>');
  const canvas = dom.window.document.querySelector('canvas');
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
  const library = createMaterialLibrary({ THREE, createCanvas: () => canvas, random: () => 0.5, style: 'toon' });

  const scene0 = buildCourseScene({ library, course, puttIndex: 0 });
  assert.ok(scene0.group, 'Putt 0 Three.js scene built successfully');
  let hasCurvedRampMesh = false;
  scene0.group.traverse(obj => {
    if (obj.isMesh && obj.userData?.surfaceType === 'curved-ramp') {
      hasCurvedRampMesh = true;
    }
  });
  assert.ok(hasCurvedRampMesh, 'Putt 0 scene contains curved ramp mesh');
  scene0.dispose();

  const scene1 = buildCourseScene({ library, course, puttIndex: 1 });
  assert.ok(scene1.group, 'Putt 1 Three.js scene built successfully');
  scene1.dispose();
  library.dispose();

  console.log('--- All Curved Ramps and Multi-Tier Drops tests passed! ---');
})();
