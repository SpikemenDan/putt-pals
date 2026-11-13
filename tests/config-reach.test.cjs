// Non-default settings reach the code that reads them. DISPLAY: every setting, measured on its real consumers (the aim guide and
// the renderer; the input adapter's use of arrowMaxLength is covered in input.test.cjs). TUNING: representative settings, run in
// child processes whose TUNING is built with overrides by a test-only loader hook, measured on the real simulation, input and
// effects code. The static "read by" evidence for every TUNING setting is in config-meta.test.cjs.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const url = rel => pathToFileURL(path.join(root, rel)).href;
let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

(async () => {
  const THREE = await import('three');
  const { createDisplay, DEFAULT_DISPLAY, DISPLAY_FIELDS } = await import(url('src/shared/display.js'));
  const { createAimGuide } = await import(url('src/render/actors.js'));
  const { createGameRenderer, createGameView } = await import(url('src/render/index.js'));
  const { createCourseData } = await import(url('src/courses/index.js'));

  const guideMeasure = display => {
    const guide = createAimGuide(THREE, display);
    guide.show(new THREE.Vector3(0, 5, 0), { charge: 1, angle: 0 }); // no explicit length: the guide uses display.aim.arrowMaxLength
    const p = guide.arrow.geometry.attributes.position;
    return {
      length: +p.getX(7).toFixed(4), shaft: +Math.abs(p.getZ(0)).toFixed(4), head: +Math.abs(p.getZ(6)).toFixed(4),
      headLength: +(p.getX(7) - p.getX(6)).toFixed(4), opacity: +guide.arrow.material.opacity.toFixed(4),
    };
  };

  const { definitions } = createCourseData();
  const ballScale = display => {
    const dom = new JSDOM('<canvas></canvas>');
    const canvas = dom.window.document.querySelector('canvas');
    const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
    dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
    const env = new THREE.Texture();
    const namespace = { ...THREE, PMREMGenerator: class { fromScene() { return { texture: env, dispose() {} }; } dispose() {} } };
    const backend = { capabilities: { getMaxAnisotropy: () => 4 }, shadowMap: {}, info: { memory: { geometries: 0, textures: 0 }, programs: [], render: { calls: 0, triangles: 0 } }, setSize() {}, setPixelRatio() {}, render() {}, dispose() {} };
    const renderer = createGameRenderer({ THREE: namespace, canvas, random: () => 0.37, createWebGLRenderer: () => backend, display });
    const view = createGameView({ renderer });
    view.setCourse(definitions[0], 0);
    view.frame({ now: 16, dt: 0.016, local: { x: 10, y: 20, z: 0, vx: 0, vy: 0, moving: false, mode: 'play', color: 0 } });
    const out = { scale: renderer.localBall.scale.x, y: renderer.localBall.position.y };
    view.dispose();
    dom.window.close();
    return out;
  };
  // VIS-E: the world atmosphere on a course tagged Ares or Luna, measured over a stretch of frames (gusts and flares vary with time).
  const atmosphereMeasure = (display, world) => {
    const dom = new JSDOM('<canvas></canvas>');
    const canvas = dom.window.document.querySelector('canvas');
    const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
    dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
    const backend = { capabilities: { getMaxAnisotropy: () => 4 }, shadowMap: {}, info: { memory: { geometries: 0, textures: 0 }, programs: [], render: { calls: 0, triangles: 0 } }, setSize() {}, setPixelRatio() {}, render() {}, dispose() {} };
    const renderer = createGameRenderer({ THREE, canvas, random: () => 0.37, createWebGLRenderer: () => backend, display });
    const view = createGameView({ renderer });
    view.setCourse({ ...definitions[0], world }, 0);
    const out = { aresStreaks: 0, aresDust: 0, lunaDust: 0, lunaSolar: 0, wash: 0 };
    for (let t = 0; t < 30; t += 0.25) {
      view.frame({ now: t * 1000, dt: 0.25, local: { x: 10, y: 20, z: 0, vx: 0, vy: 0, moving: false, mode: 'play', color: 0 } });
      const a = renderer.atmosphere;
      for (const k of ['aresStreaks', 'aresDust', 'lunaDust', 'lunaSolar']) out[k] = Math.max(out[k], a.drawn[k]);
      out.wash = Math.max(out.wash, a.wash);
    }
    view.dispose();
    dom.window.close();
    return out;
  };

  await scenario('DISPLAY: each setting changes exactly its own measurement on the aim guide and the renderer', async () => {
    const base = guideMeasure(DEFAULT_DISPLAY);
    assert.deepEqual(base, { length: 100, shaft: 2.6, head: 7, headLength: 14, opacity: 0.92 });
    const expectations = {
      'aim.arrowMaxLength': ['length', 140, { length: 140, headLength: 14 }],
      'aim.arrowShaftHalfWidth': ['shaft', 4, { shaft: 4 }],
      'aim.arrowHeadHalfWidth': ['head', 9, { head: 9 }],
      'aim.arrowHeadLength': ['headLength', 20, { headLength: 20 }],
      'aim.arrowOpacity': ['opacity', 0.5, { opacity: 0.5 }],
    };
    for (const [pathName, [, value, expected]] of Object.entries(expectations)) {
      const [group, key] = pathName.split('.');
      const measured = guideMeasure(createDisplay({ [group]: { [key]: value } }));
      assert.deepEqual(measured, { ...base, ...expected }, `${pathName} reaches the aim guide and nothing else changes`);
    }
    const normal = ballScale(DEFAULT_DISPLAY);
    const big = ballScale(createDisplay({ ball: { visualScale: 2 } }));
    assert.equal(normal.scale, 1);
    assert.equal(big.scale, 2, 'ball.visualScale reaches the renderer');
    assert.ok(Math.abs((big.y - normal.y) - 5) < 1e-9, 'and its resting height');
    // Loading screen (src/render/planet-scene.js): each setting changes exactly its own measurement.
    const THREE = await import(url('node_modules/three/build/three.module.js'));
    const { createPlanetScene } = await import(url('src/render/planet-scene.js'));
    const { buildPlanet, mulberry32 } = await import(url('src/render/planet-data.js'));
    const sharedPlanet = buildPlanet(mulberry32(9));
    const loadingMeasure = display => {
      const dom = new JSDOM('<canvas></canvas>', { pretendToBeVisual: true });
      dom.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
      const canvas = dom.window.document.querySelector('canvas');
      canvas.getBoundingClientRect = () => ({ width: 1280, height: 720 });
      let seen = null;
      const createWebGLRenderer = () => ({ render(scene) { seen = scene; }, setPixelRatio() {}, getPixelRatio: () => 1, setSize() {}, setClearColor() {}, dispose() {}, capabilities: { getMaxAnisotropy: () => 1 } });
      const scene = createPlanetScene({ THREE, canvas, display, random: mulberry32(9), planet: sharedPlanet, win: dom.window, createWebGLRenderer });
      scene.start();
      scene.step(0.5);
      seen.updateMatrixWorld(true);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(seen.children.find(o => o.isGroup).quaternion);
      let glow = null, gate = null;
      seen.traverse(o => { const u = o.material?.uniforms; if (u?.atmosphere && glow === null) glow = u.atmosphere.value; if (u?.cloudGate && gate === null) gate = u.cloudGate.value; });
      const cloudLead = seen.children.find(o => o.isGroup).children.map(g => g.rotation.y);
      const out = { spin: scene.spin, axisX: axis.x, glow, gate, cloudLead: cloudLead[1] - cloudLead[0], traffic: scene.traffic, stats: scene.stats, camera: scene.cameraPosition };
      scene.dispose(); dom.window.close();
      return out;
    };
    const lbase = loadingMeasure(DEFAULT_DISPLAY);
    const changed = (key, value) => loadingMeasure(createDisplay({ loading: { [key]: value } }));
    assert.ok(Math.abs(changed('spinSpeed', 40).spin - 20) < 1e-9 && Math.abs(lbase.spin - 2) < 1e-9, 'loading.spinSpeed turns the planet');
    assert.ok(changed('horizonHeight', 0.8).stats.limb < lbase.stats.limb && changed('horizonHeight', 0.8).stats.cameraHeight > lbase.stats.cameraHeight, 'loading.horizonHeight moves the horizon down the screen');
    assert.ok(changed('axisTilt', -40).axisX < lbase.axisX - 0.01 || changed('axisTilt', -40).axisX > lbase.axisX + 0.01, 'loading.axisTilt reorients the planet');
    assert.ok(changed('cloudCover', 1).stats.deckClouds > lbase.stats.deckClouds && changed('cloudCover', 0).stats.deckClouds === 0, 'loading.cloudCover sets the high clouds');
    assert.ok(changed('cloudCover', 1).gate < lbase.gate, 'and the cloud layer on the planet');
    assert.ok(changed('cloudDrift', 4).cloudLead > lbase.cloudLead, 'loading.cloudDrift slides the clouds ahead of the ground');
    assert.deepEqual(lbase.traffic, { planes: 3, boats: 9, satellites: 2 });
    assert.ok(changed('atmosphere', 0.1).glow < lbase.glow && changed('atmosphere', 1).glow > lbase.glow, 'loading.atmosphere sets the air glow');
    assert.ok(changed('atmosphereHeight', 0.8).stats.airTop > lbase.stats.airTop && Math.abs(lbase.stats.airTop - 162) < 1e-9, 'loading.atmosphereHeight lifts the top of the air');
    assert.ok(changed('citySize', 3).stats.tallestCity > lbase.stats.tallestCity * 1.5 && lbase.stats.tallestCity > 5 && lbase.stats.tallestCity < 10, 'loading.citySize makes the skylines taller; by default the tallest stands clear of the ground but below the big mountains');
    assert.ok(Math.abs(changed('outlineWidth', 3).stats.ink - 3) < 1e-9 && Math.abs(lbase.stats.ink - 1.6) < 1e-9, 'loading.outlineWidth sets the ink width in pixels at 1280 wide');
    assert.ok(Math.abs(changed('lunaSize', 1).stats.lunaPixels * 2.6 - lbase.stats.lunaPixels) < 1e-6 && changed('lunaSize', 1).stats.lunaPixels > 5 && changed('lunaSize', 1).stats.lunaPixels < 16, 'loading.lunaSize scales Luna, and 1 is its true size at the real distance');
    assert.equal(changed('planes', 2).traffic.planes, 2, 'loading.planes sets the number of planes');
    assert.equal(changed('boats', 5).traffic.boats, 5, 'loading.boats sets the number of boats');
    assert.equal(changed('satellites', 6).traffic.satellites, 6, 'loading.satellites sets the number of satellites');
    const reach = m => Math.hypot(...m.camera) - 100;
    assert.ok(Math.abs(reach(lbase) - 40) < 1e-6 && Math.abs(reach(changed('cameraAltitude', 1.2)) - 120) < 1e-6, 'loading.cameraAltitude sets how high the camera flies (40 units by default, inside the air)');
    // environment (VIS-E #166): strength and density reach the Ares and Luna scenery, and only their own world's.
    const env = (values, world) => atmosphereMeasure(createDisplay({ environment: values }), world);
    const ares = env({}, 'ares'), luna = env({}, 'luna');
    assert.ok(ares.aresStreaks === 260 && ares.aresDust === 520 && ares.wash > 0 && ares.lunaDust === 0, 'an Ares course draws wind by default');
    assert.ok(luna.lunaDust === 600 && luna.lunaSolar === 160 && luna.wash > 0 && luna.aresStreaks === 0, 'a Luna course draws dust and solar activity by default');
    assert.ok(env({ aresWind: 2 }, 'ares').wash > ares.wash && env({ aresWind: 0 }, 'ares').aresStreaks === 0, 'environment.aresWind sets the wind strength');
    assert.ok(env({ aresWindDensity: 0.5 }, 'ares').aresStreaks === 130 && env({ aresWindDensity: 0.5 }, 'ares').aresDust === 260, 'environment.aresWindDensity sets the streak and grain count');
    assert.ok(env({ lunaDust: 0 }, 'luna').lunaDust === 0 && env({ lunaDust: 0 }, 'luna').lunaSolar === 160, 'environment.lunaDust hides the motes and leaves the sun particles');
    assert.ok(env({ lunaDustDensity: 2 }, 'luna').lunaDust === 1200 && env({ lunaDustDensity: 2 }, 'luna').lunaSolar === 320, 'environment.lunaDustDensity sets the mote and particle count');
    assert.ok(env({ lunaSolar: 0 }, 'luna').wash === 0 && env({ lunaSolar: 2 }, 'luna').wash > luna.wash, 'environment.lunaSolar sets the solar flare strength');
    assert.deepEqual(env({ aresWind: 2, lunaDust: 0 }, 'gaia'), { aresStreaks: 0, aresDust: 0, lunaDust: 0, lunaSolar: 0, wash: 0 }, 'Gaia courses draw none of it');
    // loading.finishTime is checked in tests/ui.test.cjs, where the screen really closes after it, and so is the menu group
    // (VIS-M2), where each value lands on its own CSS variable on the real main menu.
    // The table covers every DISPLAY setting, so a new setting cannot be added without a reach check.
    assert.deepEqual([...Object.keys(expectations), 'ball.visualScale', ...['spinSpeed', 'axisTilt', 'horizonHeight', 'cameraAltitude', 'cloudCover', 'cloudDrift', 'finishTime', 'atmosphere', 'atmosphereHeight', 'citySize', 'lunaSize', 'outlineWidth', 'planes', 'boats', 'satellites'].map(k => 'loading.' + k), ...['buttonScale', 'stagger', 'bob', 'tilt'].map(k => 'menu.' + k), ...['aresWind', 'aresWindDensity', 'lunaDust', 'lunaDustDensity', 'lunaSolar'].map(k => 'environment.' + k)].sort(), DISPLAY_FIELDS.map(f => f[0]).sort());
  });

  // ---- TUNING probes: [name, setting, value, code printing one number, expected default, expected with the override]
  const imports = `
    import { SimulationEngine } from '${url('src/simulation/index.js')}';
    import { cupOf } from '${url('src/simulation/physics.js')}';
    import { chargeFromDrag, SWAY_PERIOD } from '${url('src/input/aim.js')}';
    import { ballRadiusOf } from '${url('src/gameplay/effects.js')}';
  `;
  const rollDistance = `
    const course = { tiles: [[0, 0, 40000, 400]], w: [], pit: [], fan: [], tornado: [], movers: [], pl: [], rp: [], pd: [], tp: [], q: [], sand: [], ice: [], slime: [], tee: [100, 200], hole: [39900, 390] };
    const engine = new SimulationEngine(course, 0, { hazardTime: 0 }); const p = engine.addPlayer('p', 'P', 0);
    Object.assign(p, { vx: 300, vy: 0, moving: true });
    for (let i = 0; i < 24000 && p.moving; i++) engine.step();
    console.log(Math.round(p.x - 100));`;
  const probes = [
    ['surface.turf.friction slows the roll', { 'surface.turf.friction': 1.5 }, rollDistance, 416, v => v < 416 * 0.7],
    ['shotPower sets the launch speed', { shotPower: 450 }, `const e = new SimulationEngine({ tiles: [[0, 0, 4000, 400]], w: [], tee: [100, 200], hole: [3900, 390] }, 0, { hazardTime: 0 }); const p = e.addPlayer('p', 'P', 0); e.launch('p', 0, 1); console.log(Math.round(p.vx));`, 600, v => v === 450],
    ['cup.defaultRadius sets the default cup', { 'cup.defaultRadius': 12 }, 'console.log(cupOf({}));', 15, v => v === 12],
    ['aim.fullPullPx sets the drag for full power', { 'aim.fullPullPx': 200 }, 'console.log(chargeFromDrag(100, 0, 2000));', 100 / 380, v => v === 0.5],
    ['aim.swayPeriod sets the sway cycle', { 'aim.swayPeriod': 2.8 }, 'console.log(SWAY_PERIOD);', 1.4, v => v === 2.8],
    ['powerups.smallBallScale sets the Small Ball radius', { 'powerups.smallBallScale': 0.5 }, 'console.log(ballRadiusOf({ armedPowerups: { small: 1 } }));', null, v => v === 2.5],
  ];
  const nest = flat => { const out = {}; for (const [k, v] of Object.entries(flat)) { const parts = k.split('.'); let o = out; for (const q of parts.slice(0, -1)) o = o[q] ??= {}; o[parts.at(-1)] = v; } return out; };
  const runProbe = (code, overrides) => {
    const env = { ...process.env };
    delete env.PP_TUNING_OVERRIDES;
    if (overrides) env.PP_TUNING_OVERRIDES = JSON.stringify(nest(overrides));
    const result = spawnSync(process.execPath, ['--no-warnings', '--import', url('tests/support/register-tuning-overrides.mjs'), '--input-type=module', '-e', imports + code], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return Number(result.stdout.trim());
  };

  await scenario('TUNING: representative non-default settings change the real simulation, input and effects code', async () => {
    for (const [name, overrides, code, expectedDefault, expectedOverride] of probes) {
      const baseline = runProbe(code, null);
      const changed = runProbe(code, overrides);
      if (expectedDefault !== null) assert.ok(Math.abs(baseline - expectedDefault) < 1e-9 || Math.abs(baseline - expectedDefault) <= 1, `${name}: shipped value ${baseline}`);
      assert.ok(expectedOverride(changed), `${name}: with the override the consumer reports ${changed} (shipped ${baseline})`);
      assert.notEqual(changed, baseline, `${name}: the value moved`);
    }
  });

  await scenario('the override hook only changes a child process: this process keeps the shipped TUNING, and a bad override is rejected by validation', async () => {
    const { TUNING } = await import(url('src/shared/tuning.js'));
    assert.equal(TUNING.surface.turf.friction, 0.5);
    const bad = spawnSync(process.execPath, ['--no-warnings', '--import', url('tests/support/register-tuning-overrides.mjs'), '--input-type=module', '-e', `import '${url('src/shared/tuning.js')}';`], { cwd: root, env: { ...process.env, PP_TUNING_OVERRIDES: JSON.stringify({ gravity: -5 }) }, encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /gravity/);
  });

  console.log(`ALL CONFIG REACH TESTS PASSED (${passed} scenarios)`);
})().catch(error => { console.error('FAILED with error:', error); process.exitCode = 1; });
