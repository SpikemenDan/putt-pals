const assert = require('node:assert/strict');

(async () => {
  const { stepBall } = await import('../src/simulation/physics.js');
  const { createPlayerState, applyShot } = await import('../src/shared/simulation.js');
  const G = await import('../src/gameplay/index.js');
  const { TUNING } = await import('../src/shared/tuning.js');
  const { createPutt } = await import('../src/app/putt.js');
  const dt = 1 / 240;
  const R = TUNING.powerups.auraRange;
  let cases = 0;

  const course = { hole: [5000, 5000], tee: [0, 0], tiles: [[-6000, -6000, 12000, 12000]], w: [], cup: 15 };
  const roll = (sources, { y = 0, steps = 400 } = {}) => {
    const p = createPlayerState('Probe', 0, { x: 0, y, z: 0 });
    p.armedPowerups = G.armedState();
    if (sources !== undefined) p.auraSources = sources;
    applyShot(p, 0, 1, 200);
    for (let i = 0; i < steps && p.moving; i++) stepBall(p, course, dt);
    cases++;
    return p;
  };

  // ---- catalog: Love and Hate are self-armed, stroke-long, never in solo
  assert.deepEqual(G.catalogProblems(), []);
  for (const id of ['love', 'hate']) {
    const e = G.getPowerup(id);
    assert.equal(e.target, 'self'); assert.equal(e.solo, false); assert.equal(e.duration.kind, 'stroke');
    assert.ok(G.auraIds().includes(id));
    assert.ok(!G.spawnPool({ solo: true }).some(x => x.id === id), id + ' must not spawn in solo');
    assert.ok(G.spawnPool({ solo: false }).some(x => x.id === id));
    assert.ok(id in G.armedState());
  }
  cases++;

  // ---- inactive is bit-identical: no sources, empty sources, out of reach
  const plain = roll(undefined);
  for (const none of [[], [{ kind: 'love', x: 100, y: R * 3 }], [{ kind: 'hate', x: 100, y: -R * 3 }]]) {
    const p = roll(none);
    assert.deepEqual([p.x, p.y, p.vx, p.vy], [plain.x, plain.y, plain.vx, plain.vy]);
  }

  // ---- Love pulls toward the source, Hate pushes away, both only inside the reach
  const near = R / 2;
  assert.ok(roll([{ kind: 'love', x: 60, y: near }]).y > plain.y, 'Love Ball pulls the rolling ball toward it');
  assert.ok(roll([{ kind: 'hate', x: 60, y: near }]).y < plain.y, 'Hate Ball pushes the rolling ball away');
  const weak = roll([{ kind: 'love', x: 60, y: R * 0.9 }]).y, strong = roll([{ kind: 'love', x: 60, y: R * 0.2 }]).y;
  assert.ok(weak > 0 && strong > 0);
  assert.deepEqual(G.auraAcceleration([{ kind: 'love', x: 0, y: R }], 0, 0, dt), [0, 0], 'zero at the edge of the reach');
  assert.deepEqual(G.auraAcceleration([{ kind: 'love', x: 0, y: 0 }], 0, 0, dt), [0, 0], 'no singularity at the source');

  // ---- stacking, determinism, finiteness
  const [ax1] = G.auraAcceleration([{ kind: 'love', x: 10, y: 0 }], 0, 0, dt);
  const [ax2] = G.auraAcceleration([{ kind: 'love', x: 10, y: 0 }, { kind: 'love', x: 10, y: 0 }], 0, 0, dt);
  assert.equal(ax2, ax1 * 2);
  const [bx] = G.auraAcceleration([{ kind: 'love', x: 10, y: 0 }, { kind: 'hate', x: 10, y: 0 }], 0, 0, dt);
  assert.ok(Math.abs(bx) < 1e-9, 'equal Love and Hate cancel');
  const again = roll([{ kind: 'love', x: 60, y: near }]);
  assert.deepEqual([again.x, again.y], [roll([{ kind: 'love', x: 60, y: near }]).x, again.y]);
  assert.ok([again.x, again.y, again.vx, again.vy].every(Number.isFinite));

  // ---- presence entries become sources; junk is ignored
  assert.deepEqual(G.auraSourcesOf([
    { x: 1, y: 2, effect: 'love' }, { x: 3, y: 4, effect: 'hate' }, { x: 5, y: 6, effect: 'mag' },
    { x: NaN, y: 0, effect: 'love' }, null, { x: 1, y: 1 },
  ]), [{ kind: 'love', x: 1, y: 2 }, { kind: 'hate', x: 3, y: 4 }]);

  // ---- the putt applies sources to its own ball only while playing
  const def = { tiles: [[-100, -100, 1200, 600]], tee: [0, 0], hole: [1000, 0], w: [], cup: 15 };
  const putt = createPutt({ definition: def, rule: { par: 3, penalty: 2 }, puttIndex: 0, id: 'me', name: 'Me', playing: true, timed: false, roundStartTime: 0, limitSeconds: 0, roomNow: () => 0, now: () => 0 });
  putt.setAuras([{ kind: 'love', x: 50, y: 60 }]);
  assert.equal(putt.player.auraSources.length, 1);
  putt.dispose(); putt.setAuras([{ kind: 'love', x: 1, y: 1 }]);
  assert.deepEqual(putt.player.auraSources, []);
  cases++;

  console.log(`ball aura tests passed (${cases} cases)`);
})().catch(e => { console.error(e); process.exit(1); });
