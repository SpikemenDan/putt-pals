const assert = require('node:assert/strict');

async function run() {
  const { TUNING, DEFAULT_TUNING, TUNING_FIELDS, createTuning, tuningProblems } = await import('../src/shared/tuning.js');
  const shared = await import('../src/shared/index.js');
  const physics = await import('../src/simulation/physics.js');
  const aim = await import('../src/input/aim.js');
  const rules = await import('../src/app/rules.js');

  // Defaults equal the numbers the game shipped with before T2.
  assert.equal(shared.BALL_RADIUS, 5);
  assert.equal(shared.DEFAULT_CUP_RADIUS, 15);
  assert.equal(shared.MIN_CUP_RADIUS, 8);
  assert.equal(shared.TURF_FRICTION, 0.75);
  assert.equal(shared.SHOT_POWER, 900);
  assert.deepEqual({ ...shared.SURFACE_DRAG }, { turf: 1.0, sand: 3.5, ice: 0.15, slime: 6.0 });
  assert.equal(physics.GRAVITY, 700);
  assert.equal(physics.WALL_HEIGHT, 28);
  assert.equal(physics.CUP_DEPTH, 36);
  const s = TUNING.surface;
  assert.deepEqual([s.turf.friction, s.turf.drag, s.sand.friction, s.ice.friction, s.ice.drag, s.slime.friction, s.slime.drag, s.padFrictionBonus],
    [0.75, 30, 3.2, 0.12, 4, 5.5, 45, 0.05]);
  assert.deepEqual([TUNING.bounce.wallRestitution, TUNING.bounce.ledgeDamping, TUNING.bounce.ledgeHeight, TUNING.bounce.landingRestitution, TUNING.bounce.landingSpeed], [1.82, 0.8, 5, 0.25, 180]);
  assert.deepEqual([TUNING.rest.maxSlope, TUNING.rest.maxSpeed, TUNING.rest.maxVertical, TUNING.rest.airTolerance, TUNING.rest.groundTolerance], [0.015, 6, 5, 0.8, 0.6]);
  assert.deepEqual([TUNING.powerups.zanyMultiplier, TUNING.powerups.magnetRange, TUNING.powerups.magnetPull], [1.6, 90, 300]);
  assert.deepEqual([TUNING.hazards.padRadius, TUNING.hazards.padLaunch, TUNING.hazards.padCooldown, TUNING.hazards.teleporterRadius, TUNING.hazards.teleporterCooldown], [18, 400, 0.6, 16, 0.8]);
  assert.deepEqual([TUNING.cup.sinkMargin, TUNING.cup.lipRestitutionBase, TUNING.cup.lipRestitutionGain], [1.5, 1.15, 0.6]);
  assert.equal(rules.ZANY_POWER, 1.6);
  assert.equal(aim.SWAY_PERIOD, 1.4);
  assert.equal(aim.FULL_PULL_PX, 380);
  assert.equal(aim.AIM_STEP, 0.06);
  assert.equal(aim.DRAG_RADIANS_PER_PX, 0.006);
  assert.equal(aim.GUIDE_MIN_CHARGE, 0.015);
  assert.equal(aim.SHOT_MIN_CHARGE, 0.025);
  for (const p of [0, 0.25, 0.5, 1]) assert.equal(aim.spread(p), 0.002 + 0.14 * Math.pow(p, 2.6));
  assert.equal(aim.chargeFromDrag(300, 0, 1000), Math.min(1, 300 / Math.min(380, 1000 * 0.6)));

  // Frozen, and every field is documented and validated.
  assert.ok(Object.isFrozen(TUNING) && Object.isFrozen(TUNING.surface.turf));
  assert.deepEqual(tuningProblems(DEFAULT_TUNING), []);
  assert.ok(TUNING_FIELDS.every(f => f.length === 4 && f[3].length > 0));

  // Invalid tuning is rejected.
  assert.throws(() => createTuning({ gravity: NaN }), /gravity/);
  assert.throws(() => createTuning({ gravity: Infinity }), /gravity/);
  assert.throws(() => createTuning({ shotPower: -1 }), /shotPower/);
  assert.throws(() => createTuning({ shotPower: '900' }), /shotPower/);
  assert.throws(() => createTuning({ surface: { ice: { friction: 1e9 } } }), /surface\.ice\.friction/);
  assert.throws(() => createTuning({ cup: { minRadius: 20 } }), /minRadius/);
  assert.throws(() => createTuning({ aim: { swayPeriod: 0 } }), /swayPeriod/);
  assert.equal(createTuning({ gravity: 650 }).gravity, 650);
  console.log('ALL TUNING TESTS PASSED');
}

run().catch(err => { console.error('FAILED with error:', err); process.exit(1); });
