// R1 renderer/camera parity. The extracted modules run in a jsdom window with the real Three.js r128
// (tests/vendor/three-r128.js) and are compared with what the legacy game produced for the same scripted
// states, replayed from tests/fixtures/legacy-reference/render-tape.json. WebGL output is stubbed, so this
// compares scene graphs, materials, shader sources, canvas drawing commands and camera poses, not pixels.
// The tape was recorded from the legacy page; `git show b1a57c4:tests/render.test.cjs` has the recording mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const TAPE_FILE = path.join(__dirname, 'fixtures/legacy-reference/render-tape.json');
const html = '<!doctype html><html><body><canvas id="cv"></canvas></body></html>';
const threeSource = fs.readFileSync(path.join(__dirname, 'vendor/three-r128.js'), 'utf8');
const RANDOM = 0.37;
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 16);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await sleep(20); } return false; }

let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

// ---- legacy oracle tape: every value the legacy game produced is replayed from the recording, in a fixed order ----
const tape = JSON.parse(fs.readFileSync(TAPE_FILE, 'utf8')).tape;
let cursor = 0;
async function ora(label) {
  const entry = tape[cursor++];
  assert.ok(entry && entry[0] === label, `legacy tape out of step at ${cursor - 1}: expected ${label}, found ${entry && entry[0]}`);
  return entry[1];
}

// ---- jsdom window for the extracted modules ----
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
  w.eval(threeSource);
  const renders = [];
  w.THREE.WebGLRenderer = function () {
    return { capabilities: { getMaxAnisotropy: () => 1 }, shadowMap: {}, setSize() {}, setPixelRatio() {}, render(scene, camera) { renders.push({ scene, camera }); }, dispose() {} };
  };
  return { w, errors };
}

// ---- scene serialization ----
function shaderPatch(material) {
  if (!material.onBeforeCompile || material.onBeforeCompile === material.constructor.prototype.onBeforeCompile) return null;
  const shader = { uniforms: {}, vertexShader: 'A\n#include <begin_vertex>\nB', fragmentShader: 'C\n#include <clipping_planes_fragment>\nD' };
  material.onBeforeCompile(shader);
  // S3 widened the cutout by the fillet and lowered the rim; undo that so the legacy comparison still bites.
  const w = TUNING.cup.filletWidth;
  const modern = material.customProgramCacheKey().includes('cup-cut-v6-');
  const undo = s => !modern ? s : s.replace(/cup-cut-v6-([\d.]+)/, (m, r) => 'cup-cut-v5-' + (+r - w)).replace(/cupCenter\)<([\d.]+)\)/, (m, r) => 'cupCenter)<' + (+r - w).toFixed(1) + ')');
  return { key: undo(material.customProgramCacheKey()), vs: shader.vertexShader, fs: undo(shader.fragmentShader), center: shader.uniforms.cupCenter.value.toArray() };
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
    type: o.type, position: o.userData.cupRim ? [o.position.x, +(o.position.y + TUNING.cup.filletDepth).toFixed(6), o.position.z] : o.position.toArray(), rotation: o.rotation.toArray().slice(0, 3), scale: o.scale.toArray(),
    visible: o.visible, castShadow: o.castShadow, receiveShadow: o.receiveShadow, renderOrder: o.renderOrder, frustumCulled: o.frustumCulled,
    fade: !!o.userData.fade, geometry: o.isSprite ? null : geometry(o.geometry), material: material(o.material),
    children: skipChildren ? undefined : o.children.filter(c => !c.userData.fillet).map(c => node(c)),
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

let TUNING;
(async () => {
  ({ TUNING } = await import('../src/shared/tuning.js'));
  const env = createWindow();
  const { w } = env;
  const THREE = w.THREE;
  const [{ createCourseData }, render, camera, physics, coords] = await Promise.all([
    import('../src/courses/index.js'), import('../src/render/index.js'), import('../src/camera/index.js'), import('../src/simulation/physics.js'), import('../src/shared/coords.js'),
  ]);
  const { definitions } = createCourseData();
  // This oracle records the pre-G1e scenes. Approved non-colliding starter pickups
  // are covered with current course data in render-modern, course and browser tests.
  for (const course of definitions) if (course.putts) course.q = [];
  const canvas = w.document.getElementById('cv');
  const makeView = () => {
    const renderer = render.createGameRenderer({ THREE, canvas, random: () => RANDOM, style: 'legacy', createWebGLRenderer: () => new THREE.WebGLRenderer() });
    // Pose parity with the legacy renderer; the CL2 camera collision has its own scenario below.
    return render.createGameView({ renderer, cameraCollision: false });
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
    const clean = n => {
      delete n.position; delete n.rotation; delete n.scale; delete n.visible;
      if (n.material) { delete n.material.color; delete n.material.opacity; delete n.material.uniforms; }
      return n;
    };
    const expected = await ora('static-env');
    const view = makeView();
    view.setCourse(definitions[0], 0);
    const mine = view.renderer.scene;
    const M = mine.children.filter(c => c !== view.renderer.course?.group && !isAimGuide(c)).map(c => clean(node(c, { skipChildren: true })));
    assert.equal(M.length, expected.hashes.length, 'same number of static scene children');
    M.forEach((n, i) => assert.equal(sha(n), expected.hashes[i], `scene child ${i} (${expected.types[i]})`));
    same(mine.fog && [mine.fog.color.getHex(), mine.fog.near, mine.fog.far], expected.fog, 'fog');
    view.dispose();
  });

  await scenario('scene: every putt of all 22 courses builds the identical scene graph', async () => {
    const view = makeView();
    let builds = 0;
    for (let map = 0; map < definitions.length; map++) {
      const putts = definitions[map].putts ? definitions[map].putts.length : 1;
      for (let putt = 0; putt < putts; putt++) {
        const expected = await ora('course');
        const build = view.setCourse(definitions[map], putt);
        if (expected.time !== null) view.renderer.library.time.value = expected.time;
        const label = `course ${map} (${definitions[map].name}) putt ${putt}`;
        const mineChildren = build.group.children.filter(c => !c.userData.fillet).map(c => sha(node(c)));
        mineChildren.forEach((h, i) => assert.equal(h, expected.children[i], `${label}: child ${i}`));
        assert.equal(mineChildren.length, expected.children.length, `${label}: child count`);
        assert.equal(sha(node(build.group)), expected.hash, label);
        assert.equal(build.wallFade.length, expected.wallFade, 'wall-fade entries');
        builds++;
      }
    }
    assert.equal(builds, 52, '16 single-putt maps plus 36 starter putts');
    view.dispose();
  });

  /** Advances the modular renderer one frame and compares everything the frame touched with the legacy frame. Returns the legacy frame. */
  async function stepBoth(view, now, { keys = new Set(), remotes = [], label = '' } = {}) {
    const frame = await ora('frame');
    const me = frame.local;
    view.frame({ now, dt: frame.dt, hazardTime: frame.hazard, local: me, remotes, free: me.mode === 'wait' || me.mode === 'spectator', keys });
    const mineCam = view.renderer.camera;
    same([...mineCam.position.toArray(), ...mineCam.quaternion.toArray()], frame.cam, `${label} camera @${now}`);
    const ms = view.renderer.scene;
    // CL2 #103 fades walls more than legacy did (the wall around a free-roam camera, walls hiding the ball's lower half);
    // the wall-fade scenario covers that, so the rest of the scene stays compared with legacy wall state copied over.
    frame.wall.forEach(([alpha, opacity, depthWrite], i) => {
      const entry = view.renderer.course.wallFade[i], material = entry.mesh.material;
      entry.alpha = alpha;
      material.opacity = opacity; material.depthWrite = depthWrite;
    });
    const M = ms.children.filter(c => !isAimGuide(c) && (!c.isGroup || c === view.renderer.course.group)).map(c => sha(node(c)));
    assert.equal(M.length, frame.children.length, `${label} full scene @${now}: child count`);
    M.forEach((h, i) => assert.equal(h, frame.children[i], `${label} full scene @${now}: child ${i} (${ms.children.filter(c => !isAimGuide(c) && (!c.isGroup || c === view.renderer.course.group))[i].type})`));
    return frame;
  }

  // One renderer for every round, as in the game: camera zoom/orbit/view persist across rounds.
  const sharedView = makeView();

  await scenario('frames: resting ball in ball cam, hole view and world view, with orbit and zoom input', async () => {
    const map = definitions.findIndex(d => d.fan.length && d.movers.length);
    const target = map >= 0 ? map : definitions.findIndex(d => d.fan.length);
    const view = sharedView;
    // Dream shapes and the ball spin a little every frame since boot; the legacy game has drawn more
    // frames than this new view, so copy those accumulated rotations once. Everything else is compared.
    const start = await ora('resting-start');
    view.setCourse(definitions[target], 0);
    {
      const M = view.renderer.scene.children.filter(c => !c.isGroup && !isAimGuide(c));
      assert.equal(M.length, start.rotations.length);
      M.forEach((o, i) => o.rotation.set(...start.rotations[i]));
    }
    let now = start.now;
    for (let i = 0; i < 12; i++) await stepBoth(view, now += 16.7, { label: 'follow' });
    // Wheel zoom and keyboard orbit through the legacy listeners and the rig API.
    view.rig.zoom(120);
    assert.equal(view.rig.orbitKey('ArrowLeft'), true);
    view.rig.orbitKey('ArrowUp');
    const angles = await ora('cam-angles');
    assert.deepEqual([view.rig.state.azimuth, view.rig.state.elevation], angles);
    for (let i = 0; i < 10; i++) await stepBoth(view, now += 16.7, { label: 'follow orbit' });
    for (const label of ['hole', 'strategic', 'follow']) {
      const r = view.rig.cycleView();
      assert.equal(r.view, label); assert.equal(r.label, { hole: 'Hole view', strategic: 'World view', follow: 'Ball cam' }[label]);
      for (let i = 0; i < 15; i++) await stepBoth(view, now += 16.7 + (i % 3), { label });
    }
    await stepBoth(view, now += 120, { label: 'long frame clamps dt' });
  });

  await scenario('frames: moving ball spins, trails and follows; sinking bursts confetti', async () => {
    const target = 0;
    const view = sharedView;
    let now = await ora('moving-start');
    view.setCourse(definitions[target], 0);
    await stepBoth(view, now += 16.7, { label: 'before shot' });
    // Roll in hole view: the short putt keeps the hole camera inside its distance clamps.
    assert.equal(view.rig.cycleView().view, 'hole');
    let sank = false;
    for (let i = 0; i < 900 && !sank; i++) { const f = await stepBoth(view, now += 16.7, { label: 'rolling' }); sank = f.local.mode === 'sunk'; }
    for (const expected of ['strategic', 'follow']) assert.equal(view.rig.cycleView().view, expected);
    assert.ok(sank, 'the straight putt sinks');
    for (let i = 0; i < 20; i++) await stepBoth(view, now += 16.7, { label: 'confetti' });
  });

  await scenario('frames: spectators fly the free-roam camera with held keys', async () => {
    const view = sharedView;
    let now = await ora('free-start');
    view.setCourse(definitions[8], 0);
    await stepBoth(view, now += 16.7, { label: 'before free roam' });
    const keys = new Set();
    const press = key => keys.add(key.toLowerCase());
    const release = key => keys.delete(key.toLowerCase());
    await stepBoth(view, now += 16.7, { keys, label: 'enter free roam' });
    assert.equal(await ora('free'), true); assert.equal(view.rig.state.freeRoam, true);
    press('w'); press('Shift');
    for (let i = 0; i < 8; i++) await stepBoth(view, now += 16.7, { keys, label: 'fly forward fast' });
    release('Shift'); press('d'); press('e');
    for (let i = 0; i < 8; i++) await stepBoth(view, now += 16.7, { keys, label: 'strafe and rise' });
    release('w'); release('d'); release('e');
    for (let i = 0; i < 6; i++) await stepBoth(view, now += 16.7, { keys, label: 'leave free roam' });
    assert.equal(view.rig.state.freeRoam, false);
  });

  await scenario('frames: remote players ease toward snapshots, show names, auras and shadows', async () => {
    const view = sharedView;
    let now = await ora('remote-start');
    view.setCourse(definitions[8], 0);
    const ghost = { n: 'Ghost Rider With A Long Name', x: 120, y: 140, z: 0, c: 3, effect: 'mag' };
    const remote = () => [{ id: 'ghost', name: ghost.n, x: ghost.x, y: ghost.y, z: ghost.z, color: ghost.c, effect: ghost.effect }];
    for (let i = 0; i < 5; i++) await stepBoth(view, now += 16.7, { remotes: remote(), label: 'ghost appears' });
    ghost.x += 60; ghost.y += 20; ghost.z = 12;
    for (let i = 0; i < 6; i++) await stepBoth(view, now += 16.7, { remotes: remote(), label: 'ghost eases' });
    ghost.x += 400; ghost.n = 'Renamed'; ghost.effect = 'steady';
    for (let i = 0; i < 3; i++) await stepBoth(view, now += 16.7, { remotes: remote(), label: 'ghost teleports and renames' });
    await stepBoth(view, now += 16.7, { remotes: [], label: 'ghost leaves' });
    assert.equal(view.renderer.remoteCount, 1, 'remote actors are hidden, not rebuilt');
  });

  await scenario('frames: putt-to-putt transition arcs the ball and hands back to the camera', async () => {
    const view = sharedView;
    let now = await ora('transition-start');
    view.setCourse(definitions[0], 0);
    for (let i = 0; i < 10; i++) await stepBoth(view, now += 16.7, { label: 'putt 1' });
    const clock = await ora('transition-begin');
    view.setCourse(definitions[0], 1);
    view.startPuttTransition({ previousHole: definitions[0].putts[0].hole, nextTee: definitions[0].putts[1].tee, now: clock });
    assert.equal(view.rig.transitioning, true);
    let frames = 0;
    while (await ora('transitioning')) { await stepBoth(view, now += 16.7, { label: 'transition' }); frames++; assert.ok(frames < 200, 'transition ends'); }
    assert.equal(view.rig.transitioning, false);
    for (let i = 0; i < 10; i++) await stepBoth(view, now += 16.7, { label: 'after transition' });
  });

  await scenario('wall fade: walls between camera and ball, and the wall around the camera, fade like legacy', async () => {
    const map = definitions.findIndex(d => d.name === 'Fortress Spiral');
    const legacyCount = await ora('wall-entries');
    const view = makeView();
    const build = view.setCourse(definitions[map], 0);
    const fade = render.createWallFade(THREE);
    assert.ok(build.wallFade.length >= 5 && build.wallFade.length === legacyCount, 'wall entries');
    const V = THREE.Vector3;
    const cases = [
      [new V(400, 40, 100), new V(400, 5, 250), 'wall between camera and ball'],
      [new V(400, 40, 100), new V(400, 5, 250), 'held for another frame'],
      [new V(400, 14, 159), new V(400, 5, 300), 'camera inside a wall, ball beyond it'],
      [new V(100, 300, 100), new V(110, 5, 110), 'clear view recovers'],
      [new V(200, 30, 400), new V(420, 5, 260), 'diagonal through two walls'],
    ];
    let blockedFrames = 0, minimum = 1;
    for (const [from, to, label] of cases) {
      for (const dt of [0.016, 0.033, 0.05, 0.2]) {
        const L = await ora('wall-fade');
        fade(build.wallFade, dt, from, to);
        const M = build.wallFade.map(e => [e.alpha, e.mesh.material.opacity, e.mesh.material.depthWrite]);
        // Platforms fade exactly like legacy; walls also fade for the lower-half ray, so never less than legacy (CL2 #103).
        build.wallFade.forEach((e, i) => {
          if (e.mesh.userData.wall) assert.ok(M[i][0] <= L[i][0] + 1e-12, `${label} dt=${dt}: wall ${i} fades at least as much as legacy`);
          else same(M[i], L[i], `${label} dt=${dt}: platform ${i}`);
        });
        if (L.some(([a]) => a < 1)) blockedFrames++;
        minimum = Math.min(minimum, ...M.map(([a]) => a));
      }
    }
    assert.ok(blockedFrames >= 6, 'some walls actually faded');
    assert.equal(minimum, render.FADE_MIN, 'fade reaches the minimum opacity');
    // CL2 #103: with no ball (free roam, putt transition) the wall around the camera still fades; legacy left it opaque.
    const solo = render.createWallFade(THREE), inside = new V(400, 14, 159);
    for (let i = 0; i < 20; i++) solo(build.wallFade, 0.05, inside, null);
    const faded = build.wallFade.filter(e => e.alpha === render.FADE_MIN);
    assert.ok(faded.length >= 1 && faded.every(e => e.box.containsPoint(inside)), 'only walls containing the camera fade without a ball');
    for (let i = 0; i < 20; i++) solo(build.wallFade, 0.05, new V(100, 300, 100), null);
    assert.ok(build.wallFade.every(e => e.alpha === 1), 'walls recover once the camera leaves them');
    view.dispose();
  });

  await scenario('wall fade lower ray and aim arrow depth (CL2 #103)', async () => {
    const V = THREE.Vector3, fade = render.createWallFade(THREE);
    // A wall whose top edge clears the ball centre but hides its lower half, seen from just above the wall.
    const make = isWall => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 28, 2), new THREE.MeshBasicMaterial({ transparent: true }));
      mesh.position.set(0, 14, 11); mesh.userData.fade = true; if (isWall) mesh.userData.wall = true;
      mesh.updateMatrixWorld(true);
      return { mesh, alpha: 1, box: null };
    };
    const wall = make(true), platform = make(false);
    for (let i = 0; i < 20; i++) { fade([wall], 0.05, new V(0, 30, 0), new V(0, 24, 40)); fade([platform], 0.05, new V(0, 30, 0), new V(0, 24, 40)); }
    assert.equal(wall.alpha, render.FADE_MIN, 'a wall hiding only the lower half of the ball fades');
    assert.equal(platform.alpha, 1, 'a platform never fades for the lower ray, so the one under the ball stays solid');
    const guide = (await import('../src/render/actors.js')).createAimGuide(THREE);
    assert.notEqual(guide.arrow.material.depthTest, false, 'the aim arrow is depth-tested');
  });

  await scenario('camera collision: the drawn camera never ends inside a wall or platform (CL2 #103)', async () => {
    const { resolveCameraPosition, insideSolid, CAMERA_CLEARANCE } = await import('../src/camera/collision.js');
    const box = { min: [0, 0, 0], max: [100, 20, 10] };
    const clear = [50, 100, 50];
    assert.equal(resolveCameraPosition(clear, [box]), clear, 'a clear camera is returned untouched');
    const nearSide = resolveCameraPosition([50, 10, 8], [box]);
    assert.ok(!insideSolid(nearSide, box, CAMERA_CLEARANCE - 1e-9) && nearSide[2] === 10 + CAMERA_CLEARANCE, 'pushed out through the nearest side');
    const low = resolveCameraPosition([50, 1, 5], [box]);
    assert.ok(low[1] >= 0, 'never pushed below the floor');
    const touching = resolveCameraPosition([50, 10, 5], [box, { min: [0, 0, 10], max: [100, 20, 20] }]);
    assert.ok(![box, { min: [0, 0, 10], max: [100, 20, 20] }].some(s => insideSolid(touching, s, CAMERA_CLEARANCE - 1e-9)), 'two adjacent solids resolve together');
    // Every shipped map, every camera view, a free-roam sweep through its solids.
    for (const [index, definition] of definitions.entries()) {
      const view = render.createGameView({ renderer: makeView().renderer });
      const build = view.setCourse(definition, 0);
      for (const solid of build.solids) {
        const centre = solid.min.map((v, i) => (v + solid.max[i]) / 2);
        const resolved = resolveCameraPosition(centre, build.solids);
        assert.ok(!build.solids.some(s => insideSolid(resolved, s, CAMERA_CLEARANCE - 1e-9)), `${definition.name} (#${index}): a camera dropped inside a solid is pushed fully clear`);
      }
      view.dispose();
    }
    // End to end: a rig that reports a pose inside a wall is drawn outside it, for every view mode.
    const map = definitions.findIndex(d => d.w.length);
    for (const mode of ['follow', 'hole', 'strategic', 'free', 'transition']) {
      const probe = { position: null, look: [0, 0, 0], sunTarget: [0, 0, 0], ball: null, fadeTarget: null, mode, transitioning: false, events: [] };
      const view = render.createGameView({ renderer: makeView().renderer, rig: { reset() {}, update: () => probe } });
      const build = view.setCourse(definitions[map], 0);
      probe.position = build.solids[0].min.map((v, i) => (v + build.solids[0].max[i]) / 2);
      view.frame({ now: 16, dt: 0.016, local: null });
      const drawn = view.renderer.camera.position.toArray();
      assert.ok(!build.solids.some(s => insideSolid(drawn, s, CAMERA_CLEARANCE - 1e-6)), `${mode}: frame() draws the camera outside every solid`);
      view.dispose();
    }
  });

  await scenario('aim guide: one arrow, length proportional to pull, along the swayed direction, no cone', async () => {
    const guide = (await import('../src/render/actors.js')).createAimGuide(THREE);
    assert.equal(guide.cone, undefined, 'spread cone removed');
    assert.equal(guide.dots, undefined, 'dots removed');
    const bp = new THREE.Vector3(100, 5, 200);
    const tip = (charge, angle) => {
      guide.show(bp, { charge, angle, aimAngle: 0, spread: 0.05, length: charge * 180 });
      const p = guide.arrow.geometry.attributes.position;
      return { x: p.getX(7), y: p.getY(7), z: p.getZ(7) };
    };
    for (const c of [0.02, 0.1, 0.5, 1]) {
      const t = tip(c, 0.4);
      assert.ok(Math.abs(Math.hypot(t.x - 100, t.z - 200) - c * 180) < 1e-3, `length at charge ${c}`);
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

  await scenario('aim guide: non-default DISPLAY settings change the arrow geometry and opacity, defaults keep the shipped look', async () => {
    const { createAimGuide } = await import('../src/render/actors.js');
    const { createDisplay } = await import('../src/shared/display.js');
    const bp = new THREE.Vector3(100, 5, 200);
    const measure = guide => {
      guide.show(bp, { charge: 1, angle: 0, aimAngle: 0, spread: 0 });
      const p = guide.arrow.geometry.attributes.position;
      return { shaft: Math.abs(p.getZ(0) - 200), head: Math.abs(p.getZ(6) - 200), headStart: p.getX(6) - 100, tip: p.getX(7) - 100, opacity: guide.arrow.material.opacity };
    };
    const base = measure(createAimGuide(THREE));
    const near = (actual, expected, message) => { for (const k of Object.keys(expected)) assert.ok(Math.abs(actual[k] - expected[k]) < 1e-4, `${message}: ${k} ${actual[k]} vs ${expected[k]}`); };
    near(base, { shaft: 2.6, head: 7, headStart: 86, tip: 100, opacity: 0.92 }, 'default arrow is the shipped look');
    const custom = measure(createAimGuide(THREE, createDisplay({ aim: { arrowMaxLength: 100, arrowShaftHalfWidth: 2, arrowHeadHalfWidth: 6, arrowHeadLength: 20, arrowOpacity: 0.5 } })));
    near(custom, { shaft: 2, head: 6, headStart: 80, tip: 100, opacity: 0.5 }, 'custom arrow');
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
  assert.deepEqual(env.errors, [], 'the window reported no errors');
  assert.equal(cursor, tape.length, 'every recorded legacy reading was consumed');
  console.log(`Render: ${passed} scenarios passed (scene graphs, shaders, canvas commands and camera poses; no pixel or real-WebGL claim).`);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
