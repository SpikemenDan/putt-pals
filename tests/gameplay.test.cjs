const assert = require('node:assert/strict');

async function run() {
  const G = await import('../src/gameplay/index.js');
  const { GameModes } = await import('../src/shared/session.js');
  const { createPlayerState } = await import('../src/shared/simulation.js');
  const { createCourseData } = await import('../src/courses/index.js');
  const { createPutt } = await import('../src/app/putt.js');
  const { surfaceHeight } = await import('../src/simulation/physics.js');
  const protocol = await import('../src/network/protocol.js');

  // A catalog with an opponent-targeted entry, so framework paths the shipped catalog does not use yet are covered.
  const entry = (id, extra = {}) => ({
    id, name: id.toUpperCase(), group: 'test', target: 'self', solo: true, weight: 1,
    duration: { kind: 'next-shot' }, hook: 'launch', banner: id.toUpperCase(), toast: id + ' armed', ...extra,
  });
  const TEST_CATALOG = [entry('aa'), entry('bb', { duration: { kind: 'stroke' }, weight: 3 }), entry('xx', { target: 'opponent', solo: false })];

  // ---- catalog
  assert.deepEqual(G.catalogProblems(), [], 'shipped catalog is valid');
  assert.deepEqual(G.catalogProblems(TEST_CATALOG), []);
  assert.deepEqual(G.powerupIds(), ['mag', 'steady'], 'Rewind, Reversiball and Zanyball are gone');
  assert.ok(Object.isFrozen(G.POWERUP_CATALOG) && Object.isFrozen(G.POWERUP_CATALOG[0].duration));
  assert.deepEqual(G.auraIds(), ['', 'mag', 'steady']);
  assert.equal(G.powerupName('mag'), 'Hole Magnet');
  assert.equal(G.powerupName('nope'), 'nope');
  assert.equal(G.isPowerupId('steady'), true);
  for (const id of ['rew', 'rev', 'zany', '', null]) assert.equal(G.isPowerupId(id), false, String(id));
  const bad = [entry('aa'), entry('aa'), entry('Bad'), entry('cc', { target: 'course' }), entry('dd', { weight: 0 }), entry('ee', { target: 'opponent', solo: true }),
    entry('ff', { duration: { kind: 'forever' } }), entry('gg', { hook: '' })];
  const problems = G.catalogProblems(bad);
  for (const re of [/duplicate id aa/, /id must be/, /target must be/, /weight must be positive/, /only self-targeted/, /duration\.kind/, /hook required/]) {
    assert.ok(problems.some(p => re.test(p)), String(re));
  }

  // ---- spawn table, solo and No Power-Ups filtering
  assert.deepEqual(G.spawnPool({}, TEST_CATALOG).map(e => e.id), ['aa', 'bb', 'xx']);
  assert.deepEqual(G.spawnPool({ solo: true }, TEST_CATALOG).map(e => e.id), ['aa', 'bb'], 'solo draws only self-only entries');
  assert.deepEqual(G.spawnPool({ powerups: false }, TEST_CATALOG), [], 'No Power-Ups spawns nothing');
  assert.deepEqual(G.spawnPool({ powerups: false, solo: true }), []);
  const pool = G.spawnPool({}, TEST_CATALOG); // weights 1, 3, 1 of 5
  assert.equal(G.rollPowerup(pool, () => 0), 'aa');
  assert.equal(G.rollPowerup(pool, () => 0.19), 'aa');
  assert.equal(G.rollPowerup(pool, () => 0.2), 'bb');
  assert.equal(G.rollPowerup(pool, () => 0.79), 'bb');
  assert.equal(G.rollPowerup(pool, () => 0.8), 'xx');
  assert.equal(G.rollPowerup(pool, () => 0.999999), 'xx');
  assert.equal(G.rollPowerup([], () => 0.5), null);
  let seed = 7; const lcg = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const first = Array.from({ length: 20 }, () => G.rollPowerup(pool, lcg));
  seed = 7;
  assert.deepEqual(Array.from({ length: 20 }, () => G.rollPowerup(pool, lcg)), first, 'same seed, same boxes');

  // ---- policy and inventory
  const policy = mode => G.powerupPolicy({ mode, rosterSize: 4 });
  for (const mode of [GameModes.TOURNAMENT_3, GameModes.TOURNAMENT_6, GameModes.TOURNAMENT_9]) assert.equal(policy(mode).carryover, true, mode);
  for (const mode of [GameModes.STANDARD, GameModes.PRACTICE, GameModes.PUTT_PRACTICE]) assert.equal(policy(mode).carryover, false, mode);
  assert.equal(G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 1 }).solo, true);
  assert.equal(G.powerupPolicy({ mode: GameModes.PRACTICE, rosterSize: 4 }).solo, true);
  assert.equal(policy(GameModes.STANDARD).solo, false);
  assert.equal(G.powerupPolicy({ mode: GameModes.STANDARD, powerups: false }).spawn, false);
  assert.equal(policy(GameModes.STANDARD).spawn, true);
  assert.deepEqual(G.startingInventory(policy(GameModes.TOURNAMENT_3), ['mag', 'steady']), ['mag', 'steady']);
  assert.deepEqual(G.startingInventory(policy(GameModes.STANDARD), ['mag', 'steady']), [], 'single play resets');
  const carried = ['mag']; G.startingInventory(policy(GameModes.TOURNAMENT_3), carried).push('steady');
  assert.deepEqual(carried, ['mag'], 'carryover copies');
  const inv = [];
  assert.equal(G.MAX_INVENTORY, 3);
  for (const id of ['mag', 'steady', 'mag']) assert.equal(G.addToInventory(inv, id), true);
  assert.equal(G.addToInventory(inv, 'steady'), false, 'three slots only');
  assert.deepEqual(inv, ['mag', 'steady', 'mag']);
  assert.equal(G.takeFromInventory(inv, 1), 'steady');
  assert.deepEqual(inv, ['mag', 'mag']);
  for (const i of [-1, 2, 1.5, NaN, undefined]) assert.equal(G.takeFromInventory(inv, i), null, String(i));
  assert.deepEqual(inv, ['mag', 'mag']);

  // ---- activation, stacking, hooks
  const fresh = () => { const p = createPlayerState('t'); p.armedPowerups = G.armedState(TEST_CATALOG); p.pendingPowerups = G.pendingState(TEST_CATALOG); return p; };
  assert.deepEqual(G.armedState(), { mag: 0, steady: 0 });
  assert.deepEqual(G.pendingState(), {});
  assert.deepEqual(G.pendingState(TEST_CATALOG), { xx: 0 });
  let p = fresh();
  assert.deepEqual(G.activatePowerup(p, 'aa', 1, TEST_CATALOG), { ok: true, entry: TEST_CATALOG[0], toast: 'aa armed' });
  assert.deepEqual(G.activatePowerup(p, 'bb', 2, TEST_CATALOG).ok, true);
  assert.deepEqual(p.armedPowerups, { aa: 1, bb: 1 }, 'several armed effects stack on one shot');
  const again = G.activatePowerup(p, 'aa', 3, TEST_CATALOG);
  assert.equal(again.ok, false); assert.match(again.toast, /already armed/);
  assert.equal(G.activatePowerup(p, 'zz', 4, TEST_CATALOG).ok, false, 'unknown id');
  const sent = G.activatePowerup(p, 'xx', 9, TEST_CATALOG);
  assert.deepEqual(sent.message, { id: 9, t: 'xx' }); assert.match(sent.toast, /sent to everyone else/);
  assert.equal(p.pendingPowerups.xx, 0, 'an opponent effect does not land on its sender');
  assert.equal(G.auraOf(p, 0, TEST_CATALOG), 'aa');
  p.flashType = 'bb'; p.flashUntil = 100;
  p.armedPowerups.aa = p.armedPowerups.bb = 0;
  assert.equal(G.auraOf(p, 50, TEST_CATALOG), 'bb', 'activation flash'); assert.equal(G.auraOf(p, 150, TEST_CATALOG), '');
  p.pendingPowerups.xx = 1; p.armedPowerups.aa = 1;
  assert.equal(G.auraOf(p, 0, TEST_CATALOG), 'xx', 'pending opponent effect shows first');
  G.clearAtLaunch(p, TEST_CATALOG);
  assert.deepEqual([p.armedPowerups.aa, p.pendingPowerups.xx], [0, 0], 'next-shot effects and pending effects clear at launch');
  p.armedPowerups.bb = 1; G.clearAtLaunch(p, TEST_CATALOG);
  assert.equal(p.armedPowerups.bb, 1, 'stroke-long effects outlive the launch (physics clears them at rest)');
  p = fresh(); p.mode = 'play';
  assert.equal(G.receiveEffect(p, 'xx', TEST_CATALOG), true); assert.equal(p.pendingPowerups.xx, 1);
  assert.equal(G.receiveEffect(p, 'aa', TEST_CATALOG), false, 'self effects cannot be sent');
  p.mode = 'sunk'; assert.equal(G.receiveEffect(p, 'xx', TEST_CATALOG), false, 'only a putting player is affected');

  // ---- message validation
  assert.equal(G.validEffectMessage({ id: 3, t: 'xx' }, TEST_CATALOG), true);
  for (const m of [{ id: 3, t: 'aa' }, { id: -1, t: 'xx' }, { id: 1.5, t: 'xx' }, { id: 1, t: 'xx', extra: 1 }, { id: 1 }, { t: 'xx' }, 'xx', null, [], { id: 1, t: 'zany' }]) {
    assert.equal(G.validEffectMessage(m, TEST_CATALOG), false, JSON.stringify(m));
  }
  assert.equal(G.validEffectMessage({ id: 1, t: 'mag' }), false, 'no shipped power-up is opponent-targeted yet');
  const base = { x: 1, y: 2, z: 0, mode: 'play', strokes: 1 };
  assert.deepEqual([...protocol.PRESENCE_EFFECTS], ['', 'mag', 'steady']);
  for (const fx of [{ id: 1, t: 'rev' }, { id: 1, t: 'zany' }]) assert.equal(protocol.validPresence({ ...base, fx }), false);

  // ---- putt integration: boxes, inventory carryover, activation
  const data = createCourseData();
  const definition = data.definitions.find(d => (d.putts?.[0]?.q || d.q || []).length > 0) || data.definitions[0];
  const make = options => createPutt({
    definition, rule: data.rules[data.definitions.indexOf(definition)].putts[0], puttIndex: 0, id: 'me', name: 'Me', playing: true, timed: false,
    roundStartTime: 0, limitSeconds: 120, roomNow: () => 0, now: () => 0, ...options,
  });
  const sit = putt => {
    const q = putt.course.q[0], pl = putt.player;
    pl.x = q[0]; pl.y = q[1]; pl.z = surfaceHeight(putt.course, q[0], q[1]); pl.moving = false;
  };
  const noBoxes = make({ random: () => 0, powerups: { spawn: false, pool: [] } });
  assert.ok(noBoxes.course.q.length > 0, 'test course has boxes');
  sit(noBoxes); noBoxes.frame(0, 0.016);
  assert.deepEqual(noBoxes.player.inventory, [], 'No Power-Ups: boxes award nothing');
  noBoxes.dispose();
  // GM1: the No Power-Ups policy hides every box and nothing can be collected; other policies leave them.
  const off = G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 4, powerups: false });
  assert.deepEqual([off.spawn, off.boxes, off.pool.length], [false, false, 0]);
  assert.equal(G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 4 }).boxes, true);
  assert.equal(G.powerupPolicy({ mode: GameModes.PRACTICE, rosterSize: 1, powerups: false }).boxes, true, 'practice ignores the flag');
  assert.equal(G.powerupPolicy({ mode: GameModes.PUTT_PRACTICE, rosterSize: 1, powerups: false }).spawn, true);
  const hidden = make({ random: () => 0, powerups: off });
  assert.ok(Object.keys(hidden.player.collectedPickups).length === hidden.course.q.length, 'every box counts as collected, so none is drawn');
  sit(hidden); hidden.frame(0, 0.016);
  assert.deepEqual(hidden.player.inventory, [], 'no power-ups can be gained');
  hidden.dispose();
  const shown = make({ random: () => 0, powerups: G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 1 }) });
  assert.deepEqual(shown.player.collectedPickups, {}, 'boxes are drawn when power-ups are on');
  shown.dispose();
  const solo = G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 1 });
  const boxed = make({ random: () => 0.99, powerups: solo, inventory: ['mag', 'mag', 'steady'] });
  sit(boxed); assert.match(boxed.frame(0, 0.016).toasts.join('|'), /Inventory full/);
  assert.deepEqual(boxed.player.inventory, ['mag', 'mag', 'steady'], 'a full inventory loses the box');
  boxed.dispose();
  const picker = make({ random: () => 0.99, powerups: solo, inventory: ['mag'] });
  sit(picker); assert.match(picker.frame(0, 0.016).toasts.join('|'), /Got Steady Aim!/);
  assert.deepEqual(picker.player.inventory, ['mag', 'steady'], 'carried slots are kept and the box adds one');
  const used = picker.useItem(1, 0);
  assert.deepEqual(used.toasts, ['Your next shot has no wobble.']);
  assert.deepEqual(used.banners, [['Me', 'STEADY AIM ACTIVATED', 'power']]);
  assert.deepEqual(picker.player.inventory, ['mag']);
  assert.equal(picker.effect, 'steady');
  picker.useItem(0, 0); assert.equal(picker.player.armedPowerups.mag, 1, 'two effects armed together');
  assert.equal(picker.useItem(5, 0).toasts.length, 0, 'empty slot does nothing');
  assert.equal(picker.fx, null);
  assert.equal(picker.receiveAttack('zany', 'Ben'), null, 'removed attacks cannot land');
  assert.equal(picker.receiveAttack('mag', 'Ben'), null);
  picker.dispose();

  console.log('ALL GAMEPLAY TESTS PASSED');
}

run().catch(err => { console.error('FAILED with error:', err); process.exit(1); });
