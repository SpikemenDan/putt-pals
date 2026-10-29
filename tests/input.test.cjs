// U1 input adapter parity: the legacy game and the extracted adapter run in one jsdom window.
// Keyboard events go to the shared window, so both see the identical event; pointer events go to each
// one's canvas with identical coordinates, and the adapter picks ground points through the legacy
// camera exactly like the legacy planePoint(). Shots are compared bit for bit.
const assert = require('node:assert/strict');
const { bootLegacy } = require('./support/legacy-dom.cjs');

let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

(async () => {
  const legacy = await bootLegacy();
  const { w, P } = legacy;
  const THREE = w.THREE;
  const [{ createInputAdapter, InputCommands, spread, sway, shotAngle, accuracyText, chargeFromDrag, FULL_PULL_PX, FULL_PULL_CANVAS_FRACTION, AIM_ARROW_MAX_LENGTH }, { createCameraRig }] = await Promise.all([
    import('../src/input/index.js'), import('../src/camera/index.js'),
  ]);
  await legacy.play(0, 0, 'standard');

  const legacyCanvas = legacy.$('cv');
  const canvas = w.document.createElement('canvas');
  w.document.body.appendChild(canvas);
  const rig = createCameraRig();
  const ray = new THREE.Raycaster();
  // Legacy planePoint(): ray from the legacy camera onto the horizontal plane through the ball.
  const pickGround = (clientX, clientY) => {
    ray.setFromCamera(new THREE.Vector2(clientX / 800 * 2 - 1, -clientY / 500 * 2 + 1), P().cam);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(P().me.z + 5)), new THREE.Vector3());
  };
  let active = true, connected = true, forceTransition = false;
  const getState = () => {
    const me = P().me;
    return { active, mode: me.mode, moving: me.moving, connected, transitioning: forceTransition || P().trans, reverse: !!me.pend.rev, steady: !!me.arm.steady };
  };
  const commands = [];
  const dispatch = c => commands.push(c);

  // Track every listener the adapter registers, to prove dispose() removes them all.
  const live = new Map();
  const realAdd = w.EventTarget.prototype.addEventListener, realRemove = w.EventTarget.prototype.removeEventListener;
  const capture = o => (typeof o === 'boolean' ? o : !!(o && o.capture));
  let tracking = false;
  w.EventTarget.prototype.addEventListener = function (type, fn, o) { if (tracking) live.set(fn.toString().length + type + capture(o) + Math.random(), { target: this, type, fn, capture: capture(o) }); return realAdd.call(this, type, fn, o); };
  w.EventTarget.prototype.removeEventListener = function (type, fn, o) {
    for (const [k, v] of live) if (v.target === this && v.type === type && v.fn === fn && v.capture === capture(o)) live.delete(k);
    return realRemove.call(this, type, fn, o);
  };
  tracking = true;
  const input = createInputAdapter({ canvas, window: w, camera: rig, pickGround, getState, dispatch });
  tracking = false;
  const registered = live.size;

  const pointer = (target, type, init) => target.dispatchEvent(new w.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init }));
  const both = (type, init) => { pointer(canvas, type, init); pointer(legacyCanvas, type, init); };
  const key = (type, k, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  let now = 5000;
  // Let the legacy camera settle behind the ball before aiming (the game draws frames first, too).
  for (let i = 0; i < 30; i++) legacy.frame(now += 16);
  const resetBall = () => { const me = P().me; me.moving = false; me.vx = me.vy = 0; me.pend.rev = me.pend.zany = 0; me.arm.steady = 0; };

  /** One drag-and-release on both sides; returns the legacy velocity and the adapter command. */
  function shot({ from = [400, 250], to, frameAt, rev = false, steady = false }) {
    resetBall();
    const me = P().me;
    me.pend.rev = rev ? 1 : 0; me.arm.steady = steady ? 1 : 0;
    commands.length = 0;
    both('pointerdown', { clientX: from[0], clientY: from[1] });
    both('pointermove', { clientX: to[0], clientY: to[1] });
    legacy.frame(frameAt);
    const guide = input.frameAim(frameAt / 1000);
    pointer(canvas, 'pointerup', { clientX: to[0], clientY: to[1] });
    pointer(legacyCanvas, 'pointerup', { clientX: to[0], clientY: to[1] });
    return { vx: me.vx, vy: me.vy, moving: me.moving, command: commands.find(c => c.type === InputCommands.SHOT), guide };
  }

  await scenario('aim rules: spread, sway and the shot angle match the legacy functions exactly', async () => {
    for (let p = 0; p <= 1.0001; p += 0.0625) {
      assert.equal(spread(p), P().spread(p));
      for (const t of [0, 0.35, 0.7, 1.05, 1.4, 3.3, 12.345]) assert.equal(sway(p, t), P().sway(p, t));
    }
    assert.ok([0, 0.7, 1.4].every(t => Math.abs(sway(1, t)) < 1e-9), 'zero crossings give a straight shot (legacy smoke tolerance)');
    assert.equal(chargeFromDrag(100, 0, 1600), 100 / FULL_PULL_PX);
    assert.equal(chargeFromDrag(0, 500, 400), 1, 'capped at full power');
    assert.equal(chargeFromDrag(0, 0, 800), 0, 'no pull, no power');
    assert.equal(chargeFromDrag(60, 80, 1600) * 2, chargeFromDrag(120, 160, 1600), 'linear in the pull');
    assert.equal(chargeFromDrag(100, 0, 400), 100 / (400 * FULL_PULL_CANVAS_FRACTION), 'small canvases scale by width');
    assert.equal(accuracyText(false, 0.5), 'Pull to set power');
    assert.equal(accuracyText(true, 0.5), '50% power · ±' + (spread(0.5) * 180 / Math.PI).toFixed(1) + '° spread');
  });

  await scenario('shots: drag direction, power, sway phase, reverse and steady match legacy launches bit for bit', async () => {
    const cases = [
      { to: [300, 330], frameAt: now += 16 },
      { to: [520, 120], frameAt: now += 517 },
      { to: [410, 255], frameAt: now += 233 },
      { to: [100, 480], frameAt: now += 701 },
      { to: [330, 260], frameAt: now += 350, rev: true },
      { to: [610, 400], frameAt: now += 90, steady: true },
      { to: [250, 90], frameAt: now += 1400, rev: true, steady: true },
    ];
    for (const c of cases) {
      const r = shot(c);
      assert.equal(r.moving, true, 'legacy launched');
      assert.ok(r.command, 'adapter dispatched a shot');
      // U2 intentionally changed the drag-to-power mapping (FULL_PULL_PX), so the legacy launch speed and sway
      // phase no longer match bit for bit. Launch scaling, the aim direction and the sway maths still do.
      assert.equal(r.command.power, r.guide.charge, `power is the shown charge for ${JSON.stringify(c)}`);
      assert.ok(r.command.power > 0 && r.command.power <= 1);
      assert.ok(r.guide.charge <= Math.min(1, Math.hypot(c.to[0] - 400, c.to[1] - 250) / 260), 'no more sensitive than the legacy pull (260 px)');
      assert.equal(r.command.angle, shotAngle({ aimAngle: r.guide.aimAngle, charge: r.guide.charge, time: c.frameAt / 1000, reverse: !!c.rev, steady: !!c.steady }));
    }
  });

  await scenario('aim guide: the swayed direction shown is the one released, and matches the legacy guide dots', async () => {
    resetBall();
    both('pointerdown', { clientX: 400, clientY: 250 });
    both('pointermove', { clientX: 280, clientY: 380 });
    const t = now += 444;
    legacy.frame(t);
    const guide = input.frameAim(t / 1000);
    const dots = [];
    P().ball.parent.traverse(o => { if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 2.8 && o.visible) dots.push(o); });
    assert.equal(dots.length, 12, 'legacy shows twelve guide dots');
    const ball = P().ball.position, lc = Math.min(1, Math.hypot(120, 130) / 260), L = 50 + lc * 250, la = shotAngle({ aimAngle: guide.aimAngle, charge: lc, time: t / 1000 });
    // U2: the legacy guide used the legacy 260 px charge, so it is recomputed with that charge; the aim direction is shared.
    assert.equal(guide.angle, shotAngle({ aimAngle: guide.aimAngle, charge: guide.charge, time: t / 1000 }));
    assert.ok(Math.abs(dots[0].position.x - (ball.x + Math.cos(la) * L / 12)) < 1e-9, 'first dot x');
    assert.ok(Math.abs(dots[0].position.z - (ball.z + Math.sin(la) * L / 12)) < 1e-9, 'first dot z');
    assert.equal(guide.spread, spread(guide.charge));
    // Release later without a new frame: legacy and adapter both reuse the last shown sway time.
    now += 300;
    commands.length = 0;
    pointer(canvas, 'pointerup', { clientX: 280, clientY: 380 });
    pointer(legacyCanvas, 'pointerup', { clientX: 280, clientY: 380 });
    assert.equal(commands[0].angle, guide.angle);
    assert.equal(commands[0].power, guide.charge, 'release uses the charge shown (U2 mapping; legacy launch speed differs)');
  });

  await scenario('cancel: small pulls, Escape, pointer cancel, lost capture and blur never shoot', async () => {
    const attempts = [
      () => { both('pointerdown', { clientX: 400, clientY: 250 }); both('pointermove', { clientX: 403, clientY: 252 }); legacy.frame(now += 16); input.frameAim(now / 1000); both('pointerup', { clientX: 403, clientY: 252 }); },
      // Between the guide threshold (0.015) and the shot threshold (0.025): guide shown, release cancels. // U2: slightly longer pull on the adapter canvas to clear the guide threshold under the gentler mapping.
      () => { both('pointerdown', { clientX: 400, clientY: 250 }); pointer(canvas, 'pointermove', { clientX: 407, clientY: 252 }); pointer(legacyCanvas, 'pointermove', { clientX: 405, clientY: 252 }); legacy.frame(now += 16); assert.ok(input.frameAim(now / 1000), 'guide shown'); pointer(canvas, 'pointerup', { clientX: 407, clientY: 252 }); pointer(legacyCanvas, 'pointerup', { clientX: 405, clientY: 252 }); },
      () => { both('pointerdown', { clientX: 400, clientY: 250 }); both('pointermove', { clientX: 300, clientY: 330 }); key('keydown', 'Escape'); key('keyup', 'Escape'); both('pointerup', { clientX: 300, clientY: 330 }); },
      () => { both('pointerdown', { clientX: 400, clientY: 250 }); both('pointermove', { clientX: 300, clientY: 330 }); both('pointercancel', {}); both('pointerup', { clientX: 300, clientY: 330 }); },
      () => { both('pointerdown', { clientX: 400, clientY: 250 }); both('pointermove', { clientX: 300, clientY: 330 }); both('lostpointercapture', {}); both('pointerup', { clientX: 300, clientY: 330 }); },
      () => { both('pointerdown', { clientX: 400, clientY: 250 }); both('pointermove', { clientX: 300, clientY: 330 }); w.dispatchEvent(new w.Event('blur')); both('pointerup', { clientX: 300, clientY: 330 }); },
      () => { both('pointerdown', { clientX: 400, clientY: 250, button: 1 }); both('pointermove', { clientX: 300, clientY: 330 }); both('pointerup', { clientX: 300, clientY: 330 }); },
    ];
    for (const attempt of attempts) {
      resetBall(); commands.length = 0;
      attempt();
      assert.equal(P().me.moving, false, 'legacy did not shoot');
      assert.equal(commands.filter(c => c.type === InputCommands.SHOT).length, 0, 'adapter did not shoot');
      assert.equal(input.charging, false);
      assert.equal(input.charge, 0);
    }
    assert.ok(commands.length === 0 || commands.every(c => c.type !== InputCommands.SHOT));
  });

  await scenario('guards: no shot while moving, spectating, disconnected, inactive or transitioning', async () => {
    const blockers = [
      () => { P().me.moving = true; return () => { P().me.moving = false; }; },
      () => { P().me.mode = 'spectator'; return () => { P().me.mode = 'play'; }; },
      () => { connected = false; return () => { connected = true; }; },
      () => { active = false; return () => { active = true; }; },
      () => { forceTransition = true; return () => { forceTransition = false; }; },
    ];
    for (const block of blockers) {
      resetBall(); commands.length = 0;
      const undo = block();
      pointer(canvas, 'pointerdown', { clientX: 400, clientY: 250 });
      pointer(canvas, 'pointermove', { clientX: 300, clientY: 330 });
      assert.equal(input.charging, false, 'charge not started');
      pointer(canvas, 'pointerup', { clientX: 300, clientY: 330 });
      undo();
      assert.equal(commands.filter(c => c.type === InputCommands.SHOT).length, 0);
    }
  });

  await scenario('camera input: right-drag orbit and arrow keys track the legacy camera angles exactly', async () => {
    resetBall();
    both('pointerdown', { clientX: 400, clientY: 250, button: 2 });
    both('pointermove', { clientX: 470, clientY: 300 });
    both('pointerup', { clientX: 470, clientY: 300 });
    assert.equal(rig.state.azimuth, P().camAz);
    assert.equal(rig.state.elevation, P().camEl);
    for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight']) { key('keydown', k); key('keyup', k); }
    assert.equal(rig.state.azimuth, P().camAz);
    assert.equal(rig.state.elevation, P().camEl);
    // Elevation clamps exactly like legacy.
    for (let i = 0; i < 40; i++) { key('keydown', 'ArrowDown'); key('keyup', 'ArrowDown'); }
    assert.equal(rig.state.elevation, P().camEl);
    const before = rig.state.distance;
    canvas.dispatchEvent(new w.WheelEvent('wheel', { deltaY: 120, cancelable: true }));
    assert.equal(rig.state.distance, Math.min(300, before + 18));
  });

  await scenario('shortcuts: C, K, Escape, 1–3 and M dispatch commands; text fields are ignored', async () => {
    commands.length = 0;
    for (const k of ['c', 'K', 'Escape', '1', '2', '3', 'm']) { key('keydown', k); key('keyup', k); }
    assert.deepEqual(commands.filter(c => c.type !== InputCommands.USER_GESTURE), [
      { type: InputCommands.CYCLE_CAMERA }, { type: InputCommands.TOGGLE_CARD }, { type: InputCommands.CLOSE_CARD },
      { type: InputCommands.USE_ITEM, index: 0 }, { type: InputCommands.USE_ITEM, index: 1 }, { type: InputCommands.USE_ITEM, index: 2 },
      { type: InputCommands.TOGGLE_SOUND },
    ]);
    assert.ok(commands.some(c => c.type === InputCommands.USER_GESTURE), 'key presses count as user gestures (audio unlock)');
    // C must cycle the legacy view too: both listen to the same window event.
    assert.equal(legacy.$('vw').textContent, 'View: Hole view');
    rig.cycleView();
    // Hole view: arrows rotate the aim instead of the camera, as in legacy.
    const az = rig.state.azimuth, aim = input.aimAngle;
    key('keydown', 'ArrowLeft'); key('keyup', 'ArrowLeft');
    assert.equal(rig.state.azimuth, az);
    assert.equal(input.aimAngle, aim - 0.06);
    // Hole view: right-drag also rotates the aim, adding the whole drag distance on every move (legacy quirk).
    const before = input.aimAngle;
    both('pointerdown', { clientX: 400, clientY: 250, button: 2 });
    both('pointermove', { clientX: 410, clientY: 250 });
    both('pointermove', { clientX: 420, clientY: 250 });
    both('pointerup', { clientX: 420, clientY: 250 });
    assert.equal(input.aimAngle, before + 10 * 0.006 + 20 * 0.006);
    assert.equal(rig.state.azimuth, az, 'hole view camera does not orbit');
    // Typing in a text field: no shortcut, no held key.
    const field = w.document.getElementById('nm');
    commands.length = 0;
    for (const k of ['c', 'k', '1', 'm', 'w']) key('keydown', k, field);
    assert.deepEqual(commands.filter(c => c.type !== InputCommands.USER_GESTURE), []);
    assert.equal(input.keys.has('w'), false);
    // Back to Ball cam on both sides.
    for (let i = 0; i < 2; i++) { key('keydown', 'c'); key('keyup', 'c'); rig.cycleView(); }
    assert.equal(legacy.$('vw').textContent, 'View: Ball cam');
  });

  await scenario('free roam: held keys, look drag and wheel dolly drive the camera rig', async () => {
    rig.update({ now: 0, dt: 0.016, ball: [0, 5, 0], hole: [100, 0, 0], free: true });
    assert.equal(rig.state.freeRoam, true);
    for (const k of ['w', 'Shift', 'e']) key('keydown', k);
    assert.deepEqual([...input.keys].sort(), ['e', 'shift', 'w']);
    const space = new w.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    w.document.body.dispatchEvent(space);
    assert.equal(space.defaultPrevented, true, 'space does not scroll the page in free roam');
    key('keyup', 'w');
    assert.equal(input.keys.has('w'), false);
    w.dispatchEvent(new w.Event('blur'));
    assert.equal(input.keys.size, 0, 'blur releases held keys');
    const yaw = rig.state.freeYaw, pitch = rig.state.freePitch;
    pointer(canvas, 'pointerdown', { pointerId: 9, clientX: 100, clientY: 100 });
    pointer(canvas, 'pointermove', { pointerId: 9, clientX: 150, clientY: 80 });
    assert.equal(rig.state.freeYaw, yaw + 50 * 0.006);
    assert.equal(rig.state.freePitch, Math.max(-1.5, Math.min(1.5, pitch + 20 * 0.006)));
    pointer(canvas, 'pointerup', { pointerId: 9, clientX: 150, clientY: 80 });
    pointer(canvas, 'pointermove', { pointerId: 9, clientX: 400, clientY: 400 });
    assert.equal(rig.state.freeYaw, yaw + 50 * 0.006, 'look stops after release');
    // Wheel dollies along the view direction (legacy free-roam wheel handler).
    const at = rig.update({ now: 0, dt: 0, ball: [0, 5, 0], hole: [100, 0, 0], free: true }).position;
    canvas.dispatchEvent(new w.WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    const moved = rig.update({ now: 0, dt: 0, ball: [0, 5, 0], hole: [100, 0, 0], free: true }).position;
    const k = 50, cpi = Math.cos(rig.state.freePitch);
    assert.ok(Math.abs(moved[0] - Math.max(-300, Math.min(1100, at[0] + Math.cos(rig.state.freeYaw) * cpi * k))) < 1e-9, 'dolly x');
    assert.ok(Math.abs(moved[2] - Math.max(-300, Math.min(800, at[2] + Math.sin(rig.state.freeYaw) * cpi * k))) < 1e-9, 'dolly z');
    assert.notDeepEqual(moved, at);
    rig.update({ now: 0, dt: 0.016, ball: [0, 5, 0], hole: [100, 0, 0], free: false });
  });

  await scenario('power meter source: subscribers see charge changes; per-frame values never need React state', async () => {
    const seen = [];
    const stop = input.subscribeAim((charging, charge) => seen.push([charging, charge]));
    resetBall();
    pointer(canvas, 'pointerdown', { clientX: 400, clientY: 250 });
    pointer(canvas, 'pointermove', { clientX: 330, clientY: 300 });
    pointer(canvas, 'pointercancel', {});
    stop();
    assert.deepEqual(seen.map(s => s[0]), [false, true, true, false]);
    assert.equal(seen[2][1], chargeFromDrag(70, 50, 800));
    assert.equal(input.frameAim(1), null, 'no guide when not charging');
  });

  await scenario('aim arrow: guide length is proportional to charge and sway keeps the legacy maths', async () => {
    resetBall();
    pointer(canvas, 'pointerdown', { clientX: 400, clientY: 250 });
    pointer(canvas, 'pointermove', { clientX: 400, clientY: 250 + 190 });
    const g = input.frameAim(0.35);
    assert.equal(g.length, g.charge * AIM_ARROW_MAX_LENGTH);
    assert.equal(g.angle, shotAngle({ aimAngle: g.aimAngle, charge: g.charge, time: 0.35, reverse: g.reverse }));
    const z = input.frameAim(0.7);
    assert.ok(Math.abs(z.angle - z.aimAngle - (g.reverse ? Math.PI : 0)) < 1e-9, 'dead straight at a sway zero crossing');
    pointer(canvas, 'pointercancel', {});
  });

  await scenario('ownership: dispose() removes every listener it added and is idempotent', async () => {
    assert.ok(registered >= 20, `adapter registered ${registered} listeners`);
    input.dispose();
    input.dispose();
    assert.equal(live.size, 0, 'all adapter listeners removed');
    commands.length = 0;
    for (const k of ['c', 'm', '1']) key('keydown', k);
    pointer(canvas, 'pointerdown', { clientX: 400, clientY: 250 });
    assert.deepEqual(commands, [], 'no commands after dispose');
    assert.throws(() => createInputAdapter({ canvas }), /required/);
  });

  assert.deepEqual(legacy.errors, [], 'legacy game reported no errors');
  console.log(`Input: ${passed} scenarios passed (jsdom pointer/keyboard events against the legacy handlers; no real-browser claim).`);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
