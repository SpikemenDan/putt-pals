const assert = require('node:assert/strict');

(async () => {
  const { stepBall } = await import('../src/simulation/physics.js');
  const { createPlayerState, applyShot } = await import('../src/shared/simulation.js');
  const G = await import('../src/gameplay/index.js');
  const D = await import('../src/gameplay/deployables.js');
  const P = D.DEPLOYABLE_PARAMS;
  const dt = 1 / 240;
  let cases = 0;

  const course = { hole: [5000, 5000], tee: [0, 0], tiles: [[-6000, -6000, 12000, 12000]], w: [], cup: 15 };
  const rec = (kind, x, y, extra = {}) => ({ id: 'd1', kind, x, y, owner: 'p1', impacts: 0, placedAt: 0, map: 0, putt: 0, ...extra });
  const roll = (deployables, { armed = {}, steps = 600, speed = 200 } = {}) => {
    const p = createPlayerState('Probe', 0, { x: 0, y: 0, z: 0 });
    p.armedPowerups = { ...G.armedState(), ...armed };
    if (deployables !== undefined) p.deployables = deployables;
    applyShot(p, 0, 1, speed);
    const events = [];
    for (let i = 0; i < steps && p.moving; i++) events.push(...stepBall(p, course, dt));
    cases++;
    return { p, events };
  };

  // ---- catalog: course targets, never in solo, not auras
  assert.deepEqual(G.catalogProblems(), []);
  for (const id of ['bumper', 'orbital']) {
    const e = G.getPowerup(id);
    assert.equal(e.target, 'course'); assert.equal(e.solo, false); assert.equal(e.duration.kind, 'impacts');
    assert.ok(G.isDeployablePowerup(id));
    assert.ok(!G.spawnPool({ solo: true }).some(x => x.id === id), id + ' must not spawn in solo');
    assert.ok(G.spawnPool({}).some(x => x.id === id));
    assert.ok(!(id in G.armedState()) && !(id in G.pendingState()), id + ' is neither armed nor pending');
    assert.ok(!G.auraIds().includes(id));
  }
  const act = G.activatePowerup({ armedPowerups: G.armedState(), pendingPowerups: G.pendingState() }, 'bumper', 1);
  assert.equal(act.ok, true); assert.deepEqual(act.deploy, { kind: 'bumper' }); assert.equal(act.message, undefined);
  cases++;

  // ---- record validation
  assert.equal(D.validDeployable(rec('bumper', 10, 20)), true);
  assert.equal(D.validDeployable(rec('orbital', 10, 20, { impacts: P.maxImpacts - 1 })), true);
  for (const bad of [null, [], {}, rec('mag', 1, 1), rec('bumper', NaN, 1), rec('bumper', 1, 2e6), rec('bumper', 1, 1, { impacts: P.maxImpacts }),
    rec('bumper', 1, 1, { impacts: -1 }), rec('bumper', 1, 1, { id: 'bad id' }), rec('bumper', 1, 1, { owner: '' }), rec('bumper', 1, 1, { map: 22 }),
    rec('bumper', 1, 1, { putt: 6 }), { ...rec('bumper', 1, 1), extra: 1 }, rec('bumper', 1, 1, { placedAt: Infinity })]) {
    assert.equal(D.validDeployable(bad), false, JSON.stringify(bad));
  }
  const mixed = [rec('bumper', 0, 0), rec('bumper', 0, 0, { id: 'd2', map: 3 }), rec('bumper', 0, 0, { id: 'd3', putt: 2 }), rec('mag', 0, 0, { id: 'd4' })];
  assert.deepEqual(D.activeDeployables(mixed, 0, 0).map(d => d.id), ['d1']);
  assert.deepEqual(D.activeDeployables(undefined, 0, 0), []);
  cases++;

  // ---- three-impact lifetime
  let list = [rec('bumper', 50, 0)];
  list = D.recordImpact(list, 'd1'); assert.equal(list[0].impacts, 1);
  list = D.recordImpact(list, 'd1'); assert.equal(list[0].impacts, 2);
  assert.equal(D.recordImpact(list, 'nope'), list, 'unknown id leaves the list unchanged');
  list = D.recordImpact(list, 'd1'); assert.deepEqual(list, [], 'removed on the third impact');
  cases++;

  // ---- inactive is bit-identical: absent, empty, far away, ghost ball past a bumper
  const plain = roll(undefined).p;
  for (const none of [[], [rec('bumper', 0, 5000)], [rec('orbital', 0, -5000)]]) {
    const { p, events } = roll(none);
    assert.deepEqual([p.x, p.y, p.vx, p.vy], [plain.x, plain.y, plain.vx, plain.vy]);
    assert.equal(events.filter(e => e.type === D.DEPLOYABLE_HIT).length, 0);
  }
  const ghost = roll([rec('bumper', 100, 0)], { armed: { ghost: 1 } });
  const ghostPlain = roll(undefined, { armed: { ghost: 1 } });
  assert.deepEqual([ghost.p.x, ghost.p.vx], [ghostPlain.p.x, ghostPlain.p.vx], 'Ghost Ball passes through a bumper');
  assert.equal(ghost.events.filter(e => e.type === D.DEPLOYABLE_HIT).length, 0);
  cases++;

  // ---- deterministic bumper collision: head-on bounce returns the ball with the restitution gain
  const a = roll([rec('bumper', 100, 0)]), b = roll([rec('bumper', 100, 0)]);
  assert.deepEqual([a.p.x, a.p.y, a.p.vx, a.p.vy], [b.p.x, b.p.y, b.p.vx, b.p.vy], 'same input, same result');
  const hits = a.events.filter(e => e.type === D.DEPLOYABLE_HIT);
  assert.equal(hits.length, 1, 'one contact, one event'); assert.equal(hits[0].id, 'd1');
  assert.ok(a.p.x < 100 - P.bumperRadius + 1, 'the ball never ends up inside or past the bumper');
  assert.ok(a.p.vx <= 0 || a.p.x < plain.x, 'the ball came back');
  const probe = { x: 100 - P.bumperRadius - 8 + 1, y: 0, vx: 100, vy: 0 };
  const ev = D.bumperContact([rec('bumper', 100, 0)], probe, 8);
  assert.equal(ev.length, 1);
  assert.ok(Math.abs(probe.vx + 100 * P.bumperRestitution) < 1e-9, 'normal speed is reflected with the restitution gain');
  assert.equal(probe.vy, 0);
  const away = { x: 100 - P.bumperRadius - 8 + 1, y: 0, vx: -50, vy: 0 };
  assert.deepEqual(D.bumperContact([rec('bumper', 100, 0)], away, 8), [], 'moving away: pushed out, no impact');
  assert.equal(away.vx, -50);
  cases++;

  // ---- an off-centre hit deflects sideways and keeps the tangential speed
  const side = { x: 100 - 15, y: 14, vx: 100, vy: 0 };
  D.bumperContact([rec('bumper', 100, 0)], side, 8);
  assert.ok(side.vy > 0 && side.vx < 100);
  cases++;

  // ---- orbital ring bends a passing shot toward the centre; outside the range nothing happens
  const pass = roll([rec('orbital', 250, 40)], { steps: 500 }).p;
  assert.ok(pass.vy > plain.vy || pass.y > plain.y, 'the ring pulled the ball toward y = 40');
  const [ax, ay] = D.orbitalAcceleration([rec('orbital', 0, 0)], P.orbitalRange * 2, 0, dt);
  assert.deepEqual([ax, ay], [0, 0]);
  const [bx] = D.orbitalAcceleration([rec('orbital', 100, 0)], 100 - P.orbitalRange / 2, 0, 1);
  assert.ok(Math.abs(bx - P.orbitalPull / 2) < 1e-9, 'half-way pull is half strength');
  assert.deepEqual(D.orbitalAcceleration([rec('bumper', 50, 0)], 40, 0, 1), [0, 0], 'a plain bumper has no ring');
  cases++;

  console.log(`deployables tests passed (${cases} groups)`);
})().catch(e => { console.error(e); process.exit(1); });
