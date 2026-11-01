const assert = require('node:assert/strict');

(async () => {
  const G = await import('../src/gameplay/index.js');
  const aim = await import('../src/input/aim.js');
  const protocol = await import('../src/network/protocol.js');
  const { createPutt } = await import('../src/app/putt.js');
  const { TUNING } = await import('../src/shared/tuning.js');
  let cases = 0;

  // ---- catalog: opponent-targeted, next-shot, never in solo, validated as effect messages and presence
  assert.deepEqual(G.catalogProblems(), []);
  for (const id of ['aim360', 'aim180']) {
    const e = G.getPowerup(id);
    assert.equal(e.target, 'opponent'); assert.equal(e.solo, false); assert.equal(e.duration.kind, 'next-shot');
    assert.ok(G.isOpponentPowerup(id) && !(id in G.armedState()) && id in G.pendingState());
    assert.ok(!G.spawnPool({ solo: true }).some(x => x.id === id), id + ' must not spawn in solo');
    assert.ok(G.spawnPool({ solo: false }).some(x => x.id === id));
    assert.equal(G.validEffectMessage({ id: 1, t: id }), true);
    assert.equal(protocol.validPresence({ x: 1, y: 2, z: 0, mode: 'play', strokes: 1, fx: { id: 1, t: id } }), true);
    assert.equal(protocol.validPresence({ x: 1, y: 2, z: 0, mode: 'play', strokes: 1, fx: { id: 1, t: id, extra: 1 } }), false);
    cases++;
  }

  // ---- indicator modes: no mode adds nothing; spin covers a full circle; sweep stays within a half circle
  const base = { aimAngle: 0.7, charge: 0.5, time: 3.3 };
  assert.equal(aim.aimModeOffset('', 5), 0);
  assert.equal(aim.aimModeOffset('nonsense', 5), 0);
  assert.equal(aim.shotAngle(base), aim.shotAngle({ ...base, aimMode: '' }), 'no mode is bit-identical');
  assert.equal(aim.shotAngle({ ...base, steady: true, aimMode: 'spin', time: 0 }), 0.7, 'spin starts at the aimed direction');
  let spinMin = Infinity, spinMax = -Infinity, sweepMin = Infinity, sweepMax = -Infinity;
  for (let t = 0; t < 12; t += 0.01) {
    const s = aim.aimModeOffset('spin', t), w = aim.aimModeOffset('sweep', t);
    spinMin = Math.min(spinMin, s); spinMax = Math.max(spinMax, s); sweepMin = Math.min(sweepMin, w); sweepMax = Math.max(sweepMax, w);
  }
  assert.ok(spinMin >= 0 && spinMax > 2 * Math.PI * 0.99 && spinMax < 2 * Math.PI, 'spin turns one full circle per period');
  assert.ok(Math.abs(sweepMin + Math.PI / 2) < 1e-3 && Math.abs(sweepMax - Math.PI / 2) < 1e-3, 'sweep covers 180 degrees');
  assert.equal(aim.aimModeOffset('spin', TUNING.aim.spinPeriod * 2), 0, 'spin repeats every period');
  assert.ok(Math.abs(aim.aimModeOffset('sweep', TUNING.aim.sweepPeriod)) < 1e-9, 'sweep repeats every period');
  // what you see is what you shoot: the angle depends only on the recorded time
  assert.equal(aim.shotAngle({ ...base, aimMode: 'spin' }), aim.shotAngle({ ...base, aimMode: 'spin' }));
  cases++;

  // ---- the target's putt: effect lands, shows as the aim mode, expires at launch
  const def = { tiles: [[-100, -100, 1200, 600]], tee: [0, 0], hole: [1000, 0], w: [], cup: 15 };
  const make = () => createPutt({ definition: def, rule: { par: 3, penalty: 2 }, puttIndex: 0, id: 'me', name: 'Me', playing: true, timed: false, roundStartTime: 0, limitSeconds: 0, roomNow: () => 0, now: () => 0 });
  const putt = make();
  assert.equal(G.aimModeOf(putt.player), '');
  assert.match(putt.receiveAttack('aim360', 'Rival'), /Rival used 360° Aim on you!/);
  assert.equal(G.aimModeOf(putt.player), 'spin');
  assert.equal(putt.receiveAttack('mag', 'Rival'), null, 'a self power-up cannot be sent');
  assert.equal(putt.effect, 'aim360');
  putt.receiveAttack('aim180', 'Other');
  assert.equal(G.aimModeOf(putt.player), 'spin', 'first in catalog order wins when both are pending');
  putt.shoot(0, 0.5);
  assert.equal(G.aimModeOf(putt.player), '', 'the effect expires with the shot');
  assert.equal(putt.effect, '');
  putt.dispose();

  const sender = make(); sender.player.inventory = ['aim180'];
  const used = sender.useItem(0, 0);
  assert.deepEqual(sender.fx, { id: 1, t: 'aim180' }); assert.match(used.toasts.join(), /sent to everyone else/);
  assert.equal(G.aimModeOf(sender.player), '', 'the sender is not affected');
  assert.deepEqual(sender.player.inventory, []);
  sender.dispose();
  const spectator = createPutt({ definition: def, rule: { par: 3, penalty: 2 }, puttIndex: 0, id: 'me', name: 'Me', playing: false, timed: false, roundStartTime: 0, limitSeconds: 0, roomNow: () => 0, now: () => 0 });
  assert.equal(spectator.receiveAttack('aim360', 'Rival'), null, 'only a putting player is affected');
  spectator.dispose();
  cases++;

  console.log(`aim sabotage tests passed (${cases} cases)`);
})().catch(e => { console.error(e); process.exit(1); });
