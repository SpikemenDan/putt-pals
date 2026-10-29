// R1 renderer/camera parity: the legacy game and the extracted modules run side by side in one
// jsdom window with the real embedded Three.js r128. WebGL output is stubbed, so this compares
// scene graphs, materials, shader sources, canvas drawing commands and camera poses — not pixels.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'putt-pals.html'), 'utf8');
const threeSource = html.match(/<script>\/\* three\.js \(inlined\) \*\/([\s\S]*?)<\/script>/)[1];
const gameSource = html.match(/<script id="game">([\s\S]*?)<\/script>/)[1];
const RANDOM = 0.37;
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 16);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await sleep(20); } return false; }

let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

// ---- jsdom window shared by the legacy game and the extracted modules ----
function createWindow() {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window, errors = [];
  w.addEventListener('error', e => errors.push(String(e.message)));
  w.console.error = (...a) => errors.push(a.join(' '));
  w.alert = m => errors.push('alert: ' + m);
  // Each canvas records its 2D drawing commands so canvas textures can be compared exactly.
  w.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this, ops = canvas.__ops || (canvas.__ops = []);
    const refs = new WeakMap();
    const plain = value => typeof value === 'function' ? (refs.get(value) || 'ref') : value;
    const recorder = label => {
      const proxy = new Proxy(function () {}, {
        get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'toJSON' || typeof key === 'symbol' ? undefined : recorder(label + '.' + String(key)),
        set: (_, key, value) => { ops.push(['set', label + '.' + String(key), plain(value)]); return true; },
        apply: (_, __, args) => { ops.push([label, ...args.map(plain)]); return recorder(label + '()'); },
      });
      refs.set(proxy, 'ref:' + label);
      return proxy;
    };
    return recorder('ctx');
  };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.Math.random = () => RANDOM;
  // Controlled clocks and a manual animation frame queue.
  const clock = { now: 1000, epoch: 1_700_000_000_000 };
  w.performance.now = () => clock.now;
  const RealDate = w.Date;
  w.Date = class extends RealDate { static now() { return clock.epoch + clock.now; } };
  let pending = null;
  w.requestAnimationFrame = cb => { pending = cb; return 1; };
  w.eval(threeSource);
  const renders = [];
  w.THREE.WebGLRenderer = function () {
    return { capabilities: { getMaxAnisotropy: () => 1 }, shadowMap: {}, setSize() {}, setPixelRatio() {}, render(scene, camera) { renders.push({ scene, camera }); }, dispose() {} };
  };
  return {
    w, errors, clock, renders,
    tick(now) { clock.now = now; const cb = pending; pending = null; assert.ok(cb, 'legacy requested an animation frame'); cb(now); },
  };
}

async function bootLegacy(env) {
  env.w.AudioContext = undefined;
  env.w.Peer = function () { throw new Error('no network in render parity tests'); };
  env.w.__PP_TEST = true;
  env.w.eval(gameSource);
  const P = () => env.w.__pp;
  assert.ok(P(), 'legacy test hook');
  env.w.document.getElementById('solo').click();
  assert.ok(await until(() => P().room && P().room.phase === 'lobby'), 'solo lobby');
  return P;
}

/** Puts the legacy game on a map/putt through its own room path, then waits for the build. */
async function legacyPlay(env, P, map, putt, mode = 'puttprac') {
  const R = P().R, r = R.room();
  R.setRoom({ phase: 'play', map, putt, mode, round: r.round + 1, startAt: R.now(), roster: [R.id()], card: {} });
  assert.ok(await until(() => P().active === r.round + 1 && P().me.mode === 'play'), `legacy plays map ${map} putt ${putt}`);
}

// ---- scene serialization ----
function shaderPatch(material) {
  if (!material.onBeforeCompile || material.onBeforeCompile === material.constructor.prototype.onBeforeCompile) return null;
  const shader = { uniforms: {}, vertexShader: 'A\n#include <begin_vertex>\nB', fragmentShader: 'C\n#include <clipping_planes_fragment>\nD' };
  material.onBeforeCompile(shader);
  return { key: material.customProgramCacheKey(), vs: shader.vertexShader, fs: shader.fragmentShader, center: shader.uniforms.cupCenter.value.toArray() };
}
function texture(t) {
  if (!t) return null;
  return { type: t.type, repeat: t.repeat.toArray(), wrap: [t.wrapS, t.wrapT], anisotropy: t.anisotropy, encoding: t.encoding, image: t.image && t.image.__ops ? sha(t.image.__ops) : null, size: t.image ? [t.image.width, t.image.height] : null };
}
function uniformValue(v) {
  if (v && v.isColor) return v.getHex();
  if (v && v.isVector2) return v.toArray();
  return typeof v === 'number' ? v : typeof v;
}
function material(m) {
  if (!m) return null;
  const keys = ['type', 'transparent', 'opacity', 'side', 'depthWrite', 'depthTest', 'blending', 'roughness', 'metalness', 'envMapIntensity', 'bumpScale', 'clearcoat', 'clearcoatRoughness', 'emissiveIntensity', 'size', 'fog', 'toneMapped'];
  const out = {};
  for (const k of keys) if (m[k] !== undefined) out[k] = m[k];
  if (m.color) out.color = m.color.getHex();
  if (m.emissive) out.emissive = m.emissive.getHex();
  out.map = texture(m.map); out.bumpMap = texture(m.bumpMap); out.envMap = !!m.envMap;
  if (m.isShaderMaterial) { out.vs = sha(m.vertexShader); out.fs = sha(m.fragmentShader); out.uniforms = Object.fromEntries(Object.entries(m.uniforms).map(([k, u]) => [k, uniformValue(u.value)])); }
  out.patch = shaderPatch(m);
  return out;
}
function geometry(g) {
  if (!g) return null;
  const attrs = {};
  for (const [k, a] of Object.entries(g.attributes)) attrs[k] = sha(Array.from(a.array));
  return { type: g.type, parameters: g.parameters || null, attrs, index: g.index ? sha(Array.from(g.index.array)) : null };
}
function node(o, { skipChildren } = {}) {
  return {
    type: o.type, position: o.position.toArray(), rotation: o.rotation.toArray().slice(0, 3), scale: o.scale.toArray(),
    visible: o.visible, castShadow: o.castShadow, receiveShadow: o.receiveShadow, renderOrder: o.renderOrder, frustumCulled: o.frustumCulled,
    fade: !!o.userData.fade, geometry: o.isSprite ? null : geometry(o.geometry), material: material(o.material),
    children: skipChildren ? undefined : o.children.map(c => node(c)),
  };
}
function firstDifference(a, b, at = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return `${at}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) { const d = firstDifference(a[k], b[k], `${at}.${k}`); if (d) return d; }
  return null;
}
const same = (actual, expected, label) => { const d = firstDifference(actual, expected); assert.equal(d, null, `${label}: ${d}`); };

// U2: the legacy spread cone (3 vertices) and twelve guide dots are replaced by one arrow (9 vertices);
// static-scene parity comparisons exclude the guide on both sides (the arrow has its own test).
const isAimGuide = c => c.geometry?.type === 'RingGeometry' /* M1a active-ball ring */ || c.geometry?.parameters?.radius === 2.8 || (c.isMesh && c.geometry?.type === 'BufferGeometry' && [3, 9].includes(c.geometry.attributes.position?.count) && c.material?.side === 2);

const legacyCourseGroup = scene => scene.children.find(c => c.isGroup && c.children.length > 20 && c.children.some(x => x.userData.fade || x.geometry?.type === 'BoxGeometry'));

(async () => {
  const env = createWindow();
  const { w } = env;
  const THREE = w.THREE;
  const P = await bootLegacy(env);
  const [{ createCourseData }, render, camera, physics, coords] = await Promise.all([
    import('../src/courses/index.js'), import('../src/render/index.js'), import('../src/camera/index.js'), import('../src/simulation/physics.js'), import('../src/shared/coords.js'),
  ]);
  const { definitions } = createCourseData();
  const canvas = w.document.getElementById('cv');
  const makeView = () => {
    const renderer = render.createGameRenderer({ THREE, canvas, random: () => RANDOM, style: 'legacy', createWebGLRenderer: () => new THREE.WebGLRenderer() });
    return render.createGameView({ renderer });
  };

  await scenario('transform: explicit sim-to-world mapping matches shared coords and inverts', async () => {
    const t = render.createWorldTransform([30, -40]);
    assert.deepEqual(t.ground(10, 20, 7), [40, 7, -20]);
    assert.deepEqual(t.ball(10, 20, 7), [40, 12, -20]);
    assert.deepEqual(t.local(10, 20, 7), [10, 7, 20]);
    const back = t.toSim(...t.ball(10, 20, 7), 5);
    assert.deepEqual([back.x, back.y, back.z], [10, 20, 7]);
    const s = coords.simToWorld(10, 20, 7, [30, -40]);
    assert.deepEqual(t.ball(10, 20, 7), [s.x, s.y, s.z]);
    const resolved = render.resolveRenderCourse(definitions[0], 1);
    assert.deepEqual(resolved.hole, definitions[0].putts[1].hole);
    assert.equal(resolved.tiles, definitions[0].tiles, 'geometry arrays are inherited, not copied');
  });

  await scenario('scene: static environment matches the legacy scene (lights, sky, dream shapes, ground, actors)', async () => {
    await legacyPlay(env, P, 0, 0);
    env.tick(2000);
    const legacy = env.renders.at(-1).scene;
    const view = makeView();
    view.setCourse(definitions[0], 0);
    const mine = view.renderer.scene;
    const strip = scene => scene.children.filter(c => c !== legacyCourseGroup(scene) && c !== view.renderer.course?.group && !isAimGuide(c)).map(c => node(c, { skipChildren: true }));
    // Legacy draw() has run, so compare only construction-time state of the per-frame objects.
    const L = strip(legacy), M = strip(mine);
    assert.equal(M.length, L.length, 'same number of static scene children');
    for (let i = 0; i < L.length; i++) {
      for (const n of [L[i], M[i]]) {
        delete n.position; delete n.rotation; delete n.scale; delete n.visible;
        if (n.material) { delete n.material.color; delete n.material.opacity; delete n.material.uniforms; }
      }
      same(M[i], L[i], `scene child ${i} (${L[i].type})`);
    }
    same(mine.fog && [mine.fog.color.getHex(), mine.fog.near, mine.fog.far], [legacy.fog.color.getHex(), legacy.fog.near, legacy.fog.far], 'fog');
    view.dispose();
  });

  await scenario('scene: every putt of all 22 courses builds the identical scene graph', async () => {
    const view = makeView();
    let builds = 0;
    for (let map = 0; map < definitions.length; map++) {
      const putts = definitions[map].putts ? definitions[map].putts.length : 1;
      for (let putt = 0; putt < putts; putt++) {
        await legacyPlay(env, P, map, putt);
        const legacyGroup = legacyCourseGroup(P().ball.parent);
        assert.ok(legacyGroup, `legacy course group for ${map}/${putt}`);
        const build = view.setCourse(definitions[map], putt);
        // Shared time uniform: legacy has animated frames already; the frame scenarios compare it live.
        let legacyTime = null;
        legacyGroup.traverse(o => { if (legacyTime === null && o.material?.uniforms?.t) legacyTime = o.material.uniforms.t.value; });
        if (legacyTime !== null) view.renderer.library.time.value = legacyTime;
        same(node(build.group), node(legacyGroup), `course ${map} (${definitions[map].name}) putt ${putt}`);
        assert.equal(build.wallFade.length, P().wallFade.length, 'wall-fade entries');
        builds++;
      }
    }
    assert.equal(builds, 52, '16 single-putt maps plus 36 starter putts');
    view.dispose();
  });

  const effectOf = me => me.pend.rev ? 'rev' : me.pend.zany ? 'zany' : me.arm.mag ? 'mag' : me.arm.steady ? 'steady' : me.flashUntil > w.performance.now() ? me.flashType : '';
  const snapshot = me => ({ x: me.x, y: me.y, z: me.z, vx: me.vx, vy: me.vy, moving: me.moving, mode: me.mode, color: me.c, effect: effectOf(me), collected: { ...me.got } });
  const hazardTime = () => Math.max(0, (P().R.now() - P().room.startAt) / 1000);

  /** Advances both renderers one frame and compares everything the frame touched. */
  function stepBoth(view, now, { keys = new Set(), remotes = [], label = '' } = {}) {
    const last = env.clock.now;
    env.tick(now);
    const dt = Math.min(0.05, (now - last) / 1000);
    const me = P().me;
    view.frame({ now, dt, hazardTime: hazardTime(), local: snapshot(me), remotes, free: me.mode === 'wait' || me.mode === 'spectator', keys });
    const legacyCam = P().cam, mineCam = view.renderer.camera;
    same([...mineCam.position.toArray(), ...mineCam.quaternion.toArray()], [...legacyCam.position.toArray(), ...legacyCam.quaternion.toArray()], `${label} camera @${now}`);
    const ls = P().ball.parent, ms = view.renderer.scene;
    assert.notEqual(ls, ms, "comparing two different scenes");
    const pick = scene => scene.children.filter(c => !isAimGuide(c) && (!c.isGroup || c === legacyCourseGroup(scene) || c === view.renderer.course.group));
    const L = pick(ls).map(c => node(c)), M = pick(ms).map(c => node(c));
    same(M, L, `${label} full scene @${now}`);
  }

  // One renderer for every round, as in the game: camera zoom/orbit/view persist across rounds.
  const sharedView = makeView();

  await scenario('frames: resting ball in ball cam, hole view and world view, with orbit and zoom input', async () => {
    const map = definitions.findIndex(d => d.fan.length && d.movers.length);
    const target = map >= 0 ? map : definitions.findIndex(d => d.fan.length);
    await legacyPlay(env, P, target, 0);
    const view = sharedView;
    view.setCourse(definitions[target], 0);
    // Dream shapes and the ball spin a little every frame since boot; the legacy game has drawn more
    // frames than this new view, so copy those accumulated rotations once. Everything else is compared.
    {
      const legacyScene = P().ball.parent, statics = scene => scene.children.filter(c => !c.isGroup && !isAimGuide(c));
      const L = statics(legacyScene), M = statics(view.renderer.scene);
      assert.equal(M.length, L.length);
      L.forEach((o, i) => M[i].rotation.copy(o.rotation));
    }
    let now = env.clock.now;
    for (let i = 0; i < 12; i++) stepBoth(view, now += 16.7, { label: 'follow' });
    // Wheel zoom and keyboard orbit through the legacy listeners and the rig API.
    canvas.dispatchEvent(new w.WheelEvent('wheel', { deltaY: 120, cancelable: true })); view.rig.zoom(120);
    w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); assert.equal(view.rig.orbitKey('ArrowLeft'), true);
    w.document.body.dispatchEvent(new w.KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); view.rig.orbitKey('ArrowUp');
    w.document.body.dispatchEvent(new w.KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }));
    assert.equal(view.rig.state.azimuth, P().camAz); assert.equal(view.rig.state.elevation, P().camEl);
    for (let i = 0; i < 10; i++) stepBoth(view, now += 16.7, { label: 'follow orbit' });
    for (const label of ['hole', 'strategic', 'follow']) {
      w.document.getElementById('vw').click();
      const r = view.rig.cycleView();
      assert.equal(r.view, label); assert.equal(w.document.getElementById('vw').textContent, 'View: ' + r.label);
      for (let i = 0; i < 15; i++) stepBoth(view, now += 16.7 + (i % 3), { label });
    }
    stepBoth(view, now += 120, { label: 'long frame clamps dt' });
  });

  await scenario('frames: moving ball spins, trails and follows; sinking bursts confetti', async () => {
    const target = 0;
    await legacyPlay(env, P, target, 0);
    const view = sharedView;
    view.setCourse(definitions[target], 0);
    let now = env.clock.now;
    stepBoth(view, now += 16.7, { label: 'before shot' });
    // Recorded robust solution for Switchback Garden putt 1 (tests/fixtures/solver-baseline.json): 31 degrees, power 0.8.
    const me = P().me, angle = 31 * Math.PI / 180, speed = 0.8 * 900;
    me.str++; me.vx = Math.cos(angle) * speed; me.vy = Math.sin(angle) * speed; me.moving = true; me.mt = 0;
    // Roll in hole view: the short putt keeps the hole camera inside its distance clamps.
    w.document.getElementById('vw').click(); assert.equal(view.rig.cycleView().view, 'hole');
    let sank = false;
    for (let i = 0; i < 900 && !sank; i++) { stepBoth(view, now += 16.7, { label: 'rolling' }); sank = P().me.mode === 'sunk'; }
    for (const expected of ['strategic', 'follow']) { w.document.getElementById('vw').click(); assert.equal(view.rig.cycleView().view, expected); }
    assert.ok(sank, 'the straight putt sinks');
    for (let i = 0; i < 20; i++) stepBoth(view, now += 16.7, { label: 'confetti' });
  });

  await scenario('frames: spectators fly the free-roam camera with held keys', async () => {
    await legacyPlay(env, P, 8, 0);
    const view = sharedView;
    view.setCourse(definitions[8], 0);
    let now = env.clock.now;
    stepBoth(view, now += 16.7, { label: 'before free roam' });
    P().me.mode = 'spectator';
    const keys = new Set();
    const press = key => { w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true })); keys.add(key.toLowerCase()); };
    const release = key => { w.document.body.dispatchEvent(new w.KeyboardEvent('keyup', { key, bubbles: true })); keys.delete(key.toLowerCase()); };
    stepBoth(view, now += 16.7, { keys, label: 'enter free roam' });
    assert.equal(P().free, true); assert.equal(view.rig.state.freeRoam, true);
    press('w'); press('Shift');
    for (let i = 0; i < 8; i++) stepBoth(view, now += 16.7, { keys, label: 'fly forward fast' });
    release('Shift'); press('d'); press('e');
    for (let i = 0; i < 8; i++) stepBoth(view, now += 16.7, { keys, label: 'strafe and rise' });
    release('w'); release('d'); release('e');
    P().me.mode = 'play';
    for (let i = 0; i < 6; i++) stepBoth(view, now += 16.7, { keys, label: 'leave free roam' });
    assert.equal(view.rig.state.freeRoam, false);
  });

  await scenario('frames: remote players ease toward snapshots, show names, auras and shadows', async () => {
    await legacyPlay(env, P, 8, 0);
    const view = sharedView;
    view.setCourse(definitions[8], 0);
    const R = P().R, own = R.peers;
    const ghost = { n: 'Ghost Rider With A Long Name', h: 8, round: P().active, mode: 'play', x: 120, y: 140, z: 0, c: 3, effect: 'mag' };
    R.peers = () => [...own(), { peer: 'ghost', isMe: false, presence: ghost }];
    const remote = () => [{ id: 'ghost', name: ghost.n, x: ghost.x, y: ghost.y, z: ghost.z, color: ghost.c, effect: ghost.effect }];
    let now = env.clock.now;
    for (let i = 0; i < 5; i++) stepBoth(view, now += 16.7, { remotes: remote(), label: 'ghost appears' });
    ghost.x += 60; ghost.y += 20; ghost.z = 12;
    for (let i = 0; i < 6; i++) stepBoth(view, now += 16.7, { remotes: remote(), label: 'ghost eases' });
    ghost.x += 400; ghost.n = 'Renamed'; ghost.effect = 'steady';
    for (let i = 0; i < 3; i++) stepBoth(view, now += 16.7, { remotes: remote(), label: 'ghost teleports and renames' });
    R.peers = own;
    stepBoth(view, now += 16.7, { remotes: [], label: 'ghost leaves' });
    assert.equal(view.renderer.remoteCount, 1, 'remote actors are hidden, not rebuilt');
  });

  await scenario('frames: putt-to-putt transition arcs the ball and hands back to the camera', async () => {
    await legacyPlay(env, P, 0, 0, 'standard');
    const view = sharedView;
    view.setCourse(definitions[0], 0);
    let now = env.clock.now;
    for (let i = 0; i < 10; i++) stepBoth(view, now += 16.7, { label: 'putt 1' });
    const R = P().R, r = R.room();
    R.setRoom({ putt: 1, round: r.round + 1, startAt: R.now() });
    assert.ok(await until(() => P().trans), 'legacy transition started');
    view.setCourse(definitions[0], 1);
    view.startPuttTransition({ previousHole: definitions[0].putts[0].hole, nextTee: definitions[0].putts[1].tee, now: env.clock.now });
    assert.equal(view.rig.transitioning, true);
    let frames = 0;
    while (P().trans) { stepBoth(view, now += 16.7, { label: 'transition' }); frames++; assert.ok(frames < 200, 'transition ends'); }
    assert.equal(view.rig.transitioning, false);
    for (let i = 0; i < 10; i++) stepBoth(view, now += 16.7, { label: 'after transition' });
  });

  await scenario('wall fade: walls between camera and ball, and the wall around the camera, fade like legacy', async () => {
    const map = definitions.findIndex(d => d.name === 'Fortress Spiral');
    await legacyPlay(env, P, map, 0);
    const view = makeView();
    const build = view.setCourse(definitions[map], 0);
    const fade = render.createWallFade(THREE);
    const legacyEntries = P().wallFade;
    assert.ok(build.wallFade.length >= 5 && build.wallFade.length === legacyEntries.length, 'wall entries');
    const V = THREE.Vector3;
    const cases = [
      [new V(400, 40, 100), new V(400, 5, 250), 'wall between camera and ball'],
      [new V(400, 40, 100), new V(400, 5, 250), 'held for another frame'],
      [new V(400, 14, 159), null, 'camera inside a wall, no ball'],
      [new V(400, 14, 159), new V(400, 5, 300), 'camera inside a wall, ball beyond it'],
      [new V(100, 300, 100), new V(110, 5, 110), 'clear view recovers'],
      [new V(200, 30, 400), new V(420, 5, 260), 'diagonal through two walls'],
    ];
    let blockedFrames = 0, minimum = 1;
    for (const [from, to, label] of cases) {
      for (const dt of [0.016, 0.033, 0.05, 0.2]) {
        P().updateWallFade(dt, from, to);
        fade(build.wallFade, dt, from, to);
        const L = legacyEntries.map(e => [e.a, e.m.material.opacity, e.m.material.depthWrite]);
        const M = build.wallFade.map(e => [e.alpha, e.mesh.material.opacity, e.mesh.material.depthWrite]);
        same(M, L, `${label} dt=${dt}`);
        if (L.some(([a]) => a < 1)) blockedFrames++;
        minimum = Math.min(minimum, ...M.map(([a]) => a));
      }
    }
    assert.ok(blockedFrames >= 6, 'some walls actually faded');
    assert.equal(minimum, render.FADE_MIN, 'fade reaches the minimum opacity');
    view.dispose();
  });

  await scenario('aim guide: one arrow, length proportional to pull, along the swayed direction, no cone', async () => {
    const guide = (await import('../src/render/actors.js')).createAimGuide(THREE);
    assert.equal(guide.cone, undefined, 'spread cone removed');
    assert.equal(guide.dots, undefined, 'dots removed');
    const bp = new THREE.Vector3(100, 5, 200);
    const tip = (charge, angle) => {
      guide.show(bp, { charge, angle, aimAngle: 0, spread: 0.05, length: charge * 300 });
      const p = guide.arrow.geometry.attributes.position;
      return { x: p.getX(7), y: p.getY(7), z: p.getZ(7) };
    };
    for (const c of [0.02, 0.1, 0.5, 1]) {
      const t = tip(c, 0.4);
      assert.ok(Math.abs(Math.hypot(t.x - 100, t.z - 200) - c * 300) < 1e-3, `length at charge ${c}`);
      assert.ok(Math.abs(Math.atan2(t.z - 200, t.x - 100) - 0.4) < 1e-5, 'points along the swayed angle');
      assert.equal(t.y, 5);
    }
    assert.ok(guide.arrow.visible);
    const p = guide.arrow.geometry.attributes.position;
    for (let i = 0; i < 9; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
    assert.equal(guide.arrow.material.color.getHex(), new THREE.Color().setHSL((120 - 1 * 120) / 360, 0.85, 0.6).getHex());
    guide.hide();
    assert.ok(!guide.arrow.visible);
  });

  await scenario('active-ball ring: hidden by default, shown in the player colour under a ball that may putt, pulses with time', async () => {
    const { createTurnRing, placeTurnRing } = await import('../src/render/actors.js');
    const ring = createTurnRing({ THREE });
    assert.ok(!ring.visible, 'hidden until placed');
    placeTurnRing(ring, 0xff4fb8, 100, 20, 200, true, 0);
    assert.ok(ring.visible);
    assert.deepEqual([ring.position.x, ring.position.z], [100, 200]);
    assert.ok(ring.position.y > 20 && ring.position.y < 22, 'just above the floor');
    assert.equal(ring.material.color.getHex(), 0xff4fb8);
    const sizes = [0, 0.4, 0.8, 1.2].map(t => { placeTurnRing(ring, 0xff4fb8, 100, 20, 200, true, t); return ring.scale.x; });
    assert.ok(Math.max(...sizes) > Math.min(...sizes), 'pulse changes the scale');
    assert.ok(sizes.every(x => x >= 1 && x <= 1.18 + 1e-9));
    placeTurnRing(ring, 0xff4fb8, 100, 20, 200, false, 0);
    assert.ok(!ring.visible, 'hidden when the ball cannot be putted');
  });

  await scenario('ownership: course swaps release every course resource and keep shared ones', async () => {
    const view = makeView();
    const lib = view.renderer.library, disposed = new Set();
    const watch = r => r && r.addEventListener && r.addEventListener('dispose', () => disposed.add(r));
    const resources = group => {
      const out = new Set();
      group.traverse(o => { if (o.geometry && !o.isSprite) out.add(o.geometry); if (o.material) { out.add(o.material); if (o.material.map) out.add(o.material.map); } });
      return out;
    };
    let previous = null;
    const sharedBefore = [...Object.values(lib.textures), lib.water, lib.pad, lib.skyMaterial];
    sharedBefore.forEach(watch);
    for (let i = 0; i < 44; i++) {
      const map = i % definitions.length;
      const build = view.setCourse(definitions[map], 0);
      if (previous) {
        for (const r of previous.owned) if (!lib.isShared(r)) assert.ok(disposed.has(r), `released ${r.type} from course ${previous.map}`);
        assert.equal(previous.group.parent, null, 'old group removed from scene');
      }
      const owned = resources(build.group);
      owned.forEach(watch);
      previous = { owned, group: build.group, map };
    }
    assert.ok(sharedBefore.every(r => !disposed.has(r)), 'shared library resources survive course swaps');
    const scene = view.renderer.scene;
    assert.equal(scene.children.filter(c => c.isGroup && c.children.length > 20).length, 1, 'exactly one course group after 44 swaps');
    // Remote actors and labels are owned too.
    let now = 50000;
    view.frame({ now, dt: 0.016, local: { x: 80, y: 80, z: 0, mode: 'play', color: 0, collected: [] }, remotes: [{ id: 'a', name: 'A', x: 1, y: 2, z: 0, color: 1, effect: 'mag' }] });
    view.frame({ now: now += 16, dt: 0.016, local: { x: 80, y: 80, z: 0, mode: 'play', color: 0, collected: [] }, remotes: [{ id: 'a', name: 'B', x: 1, y: 2, z: 0, color: 1, effect: '' }] });
    const everything = new Set();
    scene.traverse(o => { if (o.geometry && !o.isSprite) everything.add(o.geometry); if (o.material) { everything.add(o.material); if (o.material.map) everything.add(o.material.map); } });
    everything.forEach(watch);
    view.dispose();
    view.dispose();
    for (const r of everything) assert.ok(disposed.has(r), `renderer.dispose() released ${r.type}`);
    assert.ok(sharedBefore.every(r => disposed.has(r)), 'library resources released on renderer dispose');
    assert.throws(() => view.renderer.setCourse(definitions[0]), /disposed/);
  });

  await scenario('camera rig: input clamps match the legacy handlers', async () => {
    const rig = camera.createCameraRig();
    for (let i = 0; i < 100; i++) rig.zoom(500);
    assert.equal(rig.state.distance, camera.CAMERA_MAX_DISTANCE);
    for (let i = 0; i < 100; i++) rig.zoom(-500);
    assert.equal(rig.state.distance, camera.CAMERA_MIN_DISTANCE);
    rig.orbitDrag({ x: 0, y: 0, azimuth: 1, elevation: 0.5 }, 100, 10000);
    assert.equal(rig.state.azimuth, 1 + 100 * 0.006);
    assert.equal(rig.state.elevation, Math.PI / 2 - 0.05);
    rig.cycleView();
    assert.equal(rig.orbitKey('ArrowLeft'), false, 'hole view arrows rotate aim, not the camera');
    rig.freeLook({ x: 0, y: 0, yaw: 0, pitch: 0 }, 10, -1000);
    assert.equal(rig.state.freePitch, 1.5);
    assert.deepEqual(rig.update({ now: 0, dt: 0.016, ball: [0, 5, 0], hole: [100, 0, 0], free: true }).events, ['free-roam-start']);
    assert.deepEqual(rig.cycleView(), { changed: false, view: 'free', label: 'Free roam' });
  });

  sharedView.dispose();
  assert.deepEqual(env.errors, [], 'legacy game reported no errors');
  console.log(`Render: ${passed} scenarios passed (scene graphs, shaders, canvas commands and camera poses; no pixel or real-WebGL claim).`);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
