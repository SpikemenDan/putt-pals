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

  // ---- host reducers: placement caps and the impact rate limit
  const ctx = (extra = {}) => ({ playerId: 'p1', map: 0, putt: 0, time: 5, sequence: 1, ...extra });
  const put = (list, kind, extra) => D.placeDeployable(list, { kind, x: 30, y: 40 }, ctx(extra));
  // Bodies may sit close, but not inside each other; the cup stays uncovered.
  {
    const R = D.DEPLOYABLE_PARAMS.bumperRadius, base = [D.placeDeployable([], { kind: 'bumper', x: 100, y: 100 }, ctx()).placed];
    assert.equal(D.placeDeployable(base, { kind: 'bumper', x: 100 + 2 * R - 1, y: 100 }, ctx({ sequence: 2 })).reason, 'overlap', 'bodies would overlap');
    assert.equal(D.placeDeployable(base, { kind: 'orbital', x: 100 + 2 * R, y: 100 }, ctx({ sequence: 2 })).placed?.id, 'd2', 'touching bodies are fine');
    const arena = { tiles: [[0, 0, 400, 200]], hole: [200, 100], cup: 15, w: [] };
    assert.equal(D.placementClear(arena, 200 + 15 + R - 1, 100), false, 'covers the cup');
    assert.equal(D.placementClear(arena, 200 + 15 + R + 1, 100), true, 'just beside the cup');
  }
  let placed = put([], 'bumper');
  assert.deepEqual(placed.placed, { id: 'd1', kind: 'bumper', x: 30, y: 40, owner: 'p1', impacts: 0, placedAt: 5, map: 0, putt: 0 });
  assert.equal(put([], 'mag').reason, 'invalid', 'only course items can be deployed');
  assert.equal(D.placeDeployable([], { kind: 'bumper', x: NaN, y: 0 }, ctx()).reason, 'invalid');
  assert.equal(put([], 'bumper', { validPlacement: () => false }).reason, 'blocked');
  const twoMine = [rec('bumper', 1, 1, { id: 'a' }), rec('orbital', 2, 2, { id: 'b' })];
  assert.equal(put(twoMine, 'bumper').reason, 'player-full');
  assert.equal(put(twoMine, 'bumper', { playerId: 'p2' }).placed.owner, 'p2');
  const roomFull = Array.from({ length: 12 }, (_, i) => rec('bumper', i, i, { id: 'x' + i, owner: 'p' + (i % 6 + 10) }));
  assert.equal(put(roomFull, 'bumper', { playerId: 'zz' }).reason, 'room-full');
  const seen = new Map();
  let l = [rec('bumper', 0, 0)];
  assert.equal(D.hitDeployable(l, 'nope', 0, seen).counted, false);
  let r1 = D.hitDeployable(l, 'd1', 1000, seen); assert.equal(r1.counted, true); assert.equal(r1.list[0].impacts, 1);
  let r2 = D.hitDeployable(r1.list, 'd1', 1000 + P.hitCooldownMs - 1, seen); assert.equal(r2.counted, false, 'flooding is ignored');
  r2 = D.hitDeployable(r1.list, 'd1', 1000 + P.hitCooldownMs, seen); assert.equal(r2.list[0].impacts, 2);
  const r3 = D.hitDeployable(r2.list, 'd1', 5000, seen); assert.deepEqual(r3.list, [], 'gone after maxImpacts hits'); assert.equal(seen.size, 0);
  cases++;

  // ---- wire validators
  const proto = await import('../src/network/protocol.js');
  assert.equal(proto.validCommand({ type: 'DEPLOY_OBJECT', kind: 'bumper', x: 1, y: 2 }, false), true);
  for (const bad of [{ type: 'DEPLOY_OBJECT', kind: 'mag', x: 1, y: 2 }, { type: 'DEPLOY_OBJECT', kind: 'bumper', x: 1 }, { type: 'DEPLOY_OBJECT', kind: 'bumper', x: 1, y: 2, owner: 'x' },
    { type: 'DEPLOY_HIT' }, { type: 'DEPLOY_HIT', id: 'a b' }, { type: 'DEPLOY_HIT', id: 'd1', extra: 1 }]) assert.equal(proto.validCommand(bad, false), false, JSON.stringify(bad));
  assert.equal(proto.validCommand({ type: 'DEPLOY_HIT', id: 'd1' }, false), true);
  cases++;

  // ---- host binding: a verified guest places, hits and the list rides in the snapshot; others are ignored
  const { bindRoomSession } = await import('../src/network/session.js');
  const sent = []; let listener = () => {}, clock = 0;
  const snap = { phase: 'play', mapIndex: 0, puttIndex: 0, roundNumber: 1, hostId: 'host', roster: ['host', 'g1', 'g2'],
    players: { host: { connected: true }, g1: { connected: true }, g2: { connected: true } } };
  const transport = { isHost: true, peerId: 'host', links: new Map(), subscribe: f => { listener = f; return () => {}; }, send: m => sent.push(m), localNow: () => clock,
    lastSeen: () => 0, detach() {}, greet: () => false, reject() {} };
  const session = { getSnapshot: () => snap, send() {}, subscribe: () => () => {} };
  const timers = { setTimeout: () => 0, clearTimeout() {} };
  const unbind = bindRoomSession(transport, session, { clock: timers });
  const last = () => sent[sent.length - 1].payload;
  assert.equal(last().deployables, undefined, 'absent when nothing is placed');
  const cmd = (senderId, payload) => listener({ type: 'command', senderId, payload });
  cmd('g1', { type: 'DEPLOY_OBJECT', kind: 'bumper', x: 5, y: 6 });
  assert.equal(last().deployables, undefined, 'an unverified guest is ignored');
  cmd('g1', { type: 'JOIN_ROOM', name: 'G' }); cmd('g2', { type: 'JOIN_ROOM', name: 'H' });
  clock = 2000;
  cmd('g1', { type: 'DEPLOY_OBJECT', kind: 'bumper', x: 5, y: 6 });
  assert.ok(last().deployables.every(d => D.validDeployable(d)), 'every published record passes the wire validator');
  assert.equal(last().deployables.length, 1); assert.equal(last().deployables[0].owner, 'g1'); assert.equal(last().deployables[0].placedAt, 2);
  assert.equal(unbind.deploy({ kind: 'orbital', x: 9 + 3 * D.DEPLOYABLE_PARAMS.bumperRadius, y: 9 }), true, 'the host places for itself');
  assert.equal(last().deployables.length, 2);
  cmd('g2', { type: 'DEPLOY_HIT', id: 'd1' }); assert.equal(last().deployables.find(d => d.id === 'd1').impacts, 1);
  cmd('g2', { type: 'DEPLOY_HIT', id: 'd1' }); assert.equal(last().deployables.find(d => d.id === 'd1').impacts, 1, 'rate-limited');
  clock += 300; cmd('g2', { type: 'DEPLOY_HIT', id: 'd1' }); clock += 300; cmd('g2', { type: 'DEPLOY_HIT', id: 'd1' });
  assert.deepEqual(last().deployables.map(d => d.id), ['d2'], 'd1 is gone after three impacts');
  snap.puttIndex = 1; unbind.hit('d2');
  assert.equal(last().deployables, undefined, 'a new putt clears the objects');
  unbind(); cases++;
  // ---- test chambers: a walled box, tee (40,100), cup (360,100). Each element changes the outcome of a fixed shot.
  {
    cases++;
    const box = { tee: [40, 100], hole: [360, 100], cup: 15, tiles: [[0, 0, 400, 200]], w: [[0, -4, 400, 4], [0, 200, 400, 4], [-4, 0, 4, 200], [400, 0, 4, 200]] };
    const shoot = (angle, speed, deployables) => {
      const p = createPlayerState('Chamber', 0, { x: 40, y: 100, z: 0 });
      p.deployables = deployables; applyShot(p, angle, 1, speed);
      let sunk = false, hits = 0;
      for (let i = 0; i < 4800 && p.moving && !sunk; i++) for (const e of stepBall(p, box, dt)) { if (e.type === 'sink') sunk = true; if (e.type === D.DEPLOYABLE_HIT) hits++; }
      return { sunk, hits };
    };
    // Bumper chamber: the straight shot sinks, and with a bumper on the line it is thrown back and never sinks.
    assert.deepEqual(shoot(0, 250, []), { sunk: true, hits: 0 });
    const blocked = shoot(0, 250, [rec('bumper', 200, 100)]);
    assert.equal(blocked.sunk, false, 'the bumper stops a shot that sinks without it'); assert.equal(blocked.hits, 1);
    // Orbital chamber: a shot that misses wide sinks when an orbital ring sits beside the cup (robust over a range of aims).
    for (const aimOff of [25, 30]) {
      const angle = Math.atan2(aimOff, 320);
      assert.equal(shoot(angle, 250, []).sunk, false, `aim ${aimOff} misses without the ring`);
      assert.equal(shoot(angle, 250, [rec('orbital', 360, 150)]).sunk, true, `aim ${aimOff} sinks with the ring`);
    }
  }

  // Placement check: on the floor, off pits, clear of walls by the bumper radius.
  { cases++;
    const arena = { tiles: [[0, 0, 200, 100]], pit: [[150, 0, 20, 100]], w: [[0, 0, 200, 4]] };
    const r = D.DEPLOYABLE_PARAMS.bumperRadius;
    assert.equal(D.placementClear(arena, 60, 50), true, 'open floor');
    assert.equal(D.placementClear(arena, 300, 50), false, 'off the floor tiles');
    assert.equal(D.placementClear(arena, 160, 50), false, 'over a pit');
    assert.equal(D.placementClear(arena, 60, 4 + r - 1), false, 'body would overlap the wall');
    assert.equal(D.placementClear(arena, 60, 4 + r + 1), true, 'just clear of the wall');
  }

  console.log(`deployables tests passed (${cases} groups)`);
})().catch(e => { console.error(e); process.exit(1); });
