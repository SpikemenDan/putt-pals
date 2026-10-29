const assert = require('node:assert/strict');

(async () => {
  const { stepBall, bounce, WALL_HEIGHT } = await import('../src/simulation/physics.js');
  const { createPlayerState, applyShot } = await import('../src/shared/simulation.js');
  const G = await import('../src/gameplay/index.js');
  const { BALL_RADIUS } = await import('../src/shared/constants.js');
  const { TUNING } = await import('../src/shared/tuning.js');
  const dt = 1 / 240;
  let cases = 0;

  const courseWith = ({ w = [], cup = 15, hole = [2000, 2000] } = {}) => ({ hole, tee: [0, 0], tiles: [[-3000, -3000, 6000, 6000]], w, cup });
  const WALL = [100, -200, 10, 400]; // x 100..110, taller than any ball

  /** Fires one shot along +x and steps until rest. */
  function run({ armed = [], course = courseWith({ w: [WALL] }), speed = 300, y = 0, steps = 4000, state = null } = {}) {
    const player = createPlayerState('Probe', 0, { x: 0, y, z: 0 });
    player.armedPowerups = G.armedState();
    for (const id of armed) player.armedPowerups[id] = 1;
    if (state) Object.assign(player, state);
    applyShot(player, 0, 1, speed);
    G.clearAtLaunch(player);
    const events = [], trace = [];
    let maxX = 0, maxZ = 0;
    for (let i = 0; i < steps && player.moving && player.mode === 'play'; i++) {
      events.push(...stepBall(player, course, dt));
      assert([player.x, player.y, player.z, player.vx, player.vy, player.vz].every(Number.isFinite));
      maxX = Math.max(maxX, player.x); maxZ = Math.max(maxZ, player.z);
      trace.push([player.x, player.y, player.z]);
    }
    cases++;
    return { player, events, trace, maxX, maxZ, bounces: events.filter(e => e.type === 'bounce').length };
  }

  // ---- inactive effects are bit-identical (armed flags all zero, absent, or radius at its default)
  const plain = run();
  assert.ok(plain.bounces >= 1 && plain.player.x < 100, 'baseline: the wall rebounds the ball');
  const absent = (() => {
    const course = courseWith({ w: [WALL] }), player = createPlayerState('Probe', 0, { x: 0, y: 0, z: 0 });
    player.armedPowerups = { mag: 0, steady: 0 }; // the pre-G1b state shape
    applyShot(player, 0, 1, 300);
    const trace = [];
    for (let i = 0; i < 4000 && player.moving; i++) { stepBall(player, course, dt); trace.push([player.x, player.y, player.z]); }
    return trace;
  })();
  assert.deepEqual(plain.trace, absent, 'unarmed G1b flags change nothing');
  assert.equal(G.ballRadiusOf({ armedPowerups: G.armedState() }), BALL_RADIUS);
  assert.equal(G.ballRadiusOf({}), BALL_RADIUS);

  // ---- Chip In: lofted launch over a wall; lasts one shot
  const chip = run({ armed: ['chip'] });
  assert.ok(chip.maxZ > WALL_HEIGHT + 10, 'the ball clears the wall height');
  assert.ok(chip.player.x > 110, 'the chip lands past the wall');
  assert.equal(chip.player.vz === 0 || chip.player.moving === false, true);
  const chipPlayer = createPlayerState('c', 0); chipPlayer.armedPowerups = G.armedState(); chipPlayer.armedPowerups.chip = 1;
  applyShot(chipPlayer, 0, 1, 300);
  assert.equal(chipPlayer.vz, TUNING.powerups.chipLaunch); assert.equal(chipPlayer.z, 1);
  G.clearAtLaunch(chipPlayer);
  assert.equal(chipPlayer.armedPowerups.chip, 0, 'Chip In is spent at launch');
  const second = createPlayerState('c', 0); second.armedPowerups = chipPlayer.armedPowerups;
  applyShot(second, 0, 1, 300);
  assert.equal(second.vz, 0, 'the next shot is a normal putt');

  // ---- Ghost Ball: passes through walls, ends at rest
  const ghost = run({ armed: ['ghost'] });
  assert.ok(ghost.player.x > 110 && ghost.bounces === 0, 'no wall bounce');
  assert.equal(ghost.player.armedPowerups.ghost, 0, 'cleared when the ball rests');
  const mover = { ...courseWith(), movers: [[90, -200, 40, 400, 0, 0, 0, 0]] };
  assert.ok(run({ course: mover }).bounces >= 1, 'baseline: a mover blocks the ball');
  assert.equal(run({ course: mover, armed: ['ghost'] }).bounces, 0, 'Ghost Ball also skips moving obstacles');

  // ---- Sticky Ball: no rebound
  const sticky = run({ armed: ['sticky'] });
  assert.ok(sticky.bounces >= 1);
  assert.ok(Math.abs(sticky.player.x - plain.player.x) > 20, 'sticky ends somewhere else than the rebounding ball');
  assert.ok(sticky.player.x > 90 && sticky.player.x < 100, 'it stops at the wall instead of rolling back');
  assert.equal(sticky.player.armedPowerups.sticky, 0);
  const head = createPlayerState('s', 0, { x: 98, y: 0, z: 0 }); head.armedPowerups = G.armedState(); head.armedPowerups.sticky = 1; head.vx = 300; head.vy = 40;
  assert.equal(bounce(head, WALL), true);
  assert.equal(head.vx, 0, 'normal speed removed'); assert.equal(head.vy, 40, 'tangential speed kept');

  // ---- Small and Tall Ball: per-ball radius
  const small = TUNING.powerups.smallBallScale * BALL_RADIUS, tall = TUNING.powerups.tallBallScale * BALL_RADIUS;
  const radius = (...ids) => { const p = { armedPowerups: G.armedState() }; ids.forEach(i => { p.armedPowerups[i] = 1; }); return G.ballRadiusOf(p); };
  assert.equal(radius('small'), small); assert.equal(radius('tall'), tall);
  assert.equal(radius('small', 'tall'), BALL_RADIUS * TUNING.powerups.smallBallScale * TUNING.powerups.tallBallScale, 'stacked effects multiply');
  assert.ok(small < BALL_RADIUS && BALL_RADIUS < tall);
  const touch = (r, gap) => { const p = createPlayerState('r', 0, { x: 100 - gap, y: 0, z: 0 }); p.vx = 100; return bounce(p, WALL, r); };
  assert.equal(touch(BALL_RADIUS, 4), true); assert.equal(touch(small, 4), false, 'a small ball is still clear of the wall');
  assert.equal(touch(tall, 6), true); assert.equal(touch(BALL_RADIUS, 6), false, 'a tall ball touches sooner');
  // A gap narrower than the ball: only the small ball slips through.
  const gapCourse = courseWith({ w: [[100, -200, 10, 196], [100, 4, 10, 196]] }); // 8 wide gap centred on y = 0
  assert.ok(run({ course: gapCourse }).player.x < 100, 'a normal ball cannot pass');
  assert.ok(run({ course: gapCourse, armed: ['small'] }).player.x > 110, 'a small ball passes');
  assert.ok(run({ course: gapCourse, armed: ['small'] }).player.armedPowerups.small === 0, 'radius reverts at rest');
  // The smallest cup still takes a tall ball, and a small one.
  for (const ids of [['tall'], ['small']]) {
    const cup = courseWith({ cup: 8, hole: [60, 0] });
    const r = run({ course: cup, armed: ids, speed: 90 });
    assert.equal(r.player.mode, 'sunk', ids + ' ball sinks in the smallest cup');
  }

  // ---- stroke-long effects clear when the ball is reset or sinks too
  const swim = createPlayerState('o', 0, { x: 5, y: 5, z: 0 }); swim.armedPowerups = G.armedState(); swim.armedPowerups.ghost = swim.armedPowerups.small = 1;
  const { outOfBounds } = await import('../src/simulation/physics.js');
  outOfBounds(swim, courseWith(), []);
  assert.deepEqual([swim.armedPowerups.ghost, swim.armedPowerups.small], [0, 0]);

  // ---- catalog
  for (const id of ['chip', 'ghost', 'small', 'tall', 'sticky']) assert.ok(G.spawnPool({ solo: true }).some(e => e.id === id), id + ' is in the solo pool');
  assert.deepEqual(G.catalogProblems(), []);

  console.log(`SELF-UTILITY TESTS PASSED (${cases} simulated shots)`);
})().catch(err => { console.error('FAILED with error:', err); process.exit(1); });
