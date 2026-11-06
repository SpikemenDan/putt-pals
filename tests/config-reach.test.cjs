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
    // Loading screen (src/ui/planet-scene.js): each setting changes exactly its own measurement.
    const planet = await import(url('src/ui/planet-scene.js'));
    const loadingMeasure = display => {
      const dom = new JSDOM('<canvas></canvas><canvas></canvas>', { pretendToBeVisual: true });
      const [canvas, sprites] = dom.window.document.querySelectorAll('canvas');
      let pixels = null;
      canvas.getBoundingClientRect = () => ({ width: 800, height: 600 });
      canvas.getContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: image => { pixels = image; } });
      sprites.getContext = () => new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
      const scene = planet.createPlanetScene({ canvas, sprites, display, random: planet.mulberry32(9), win: dom.window });
      scene.start();
      scene.step(0.5);
      const w = canvas.width, h = canvas.height, d = pixels.data;
      let top = h, hash = 0, white = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; if (d[o + 3] === 255) { top = Math.min(top, y); if (y > h - 12) hash = (hash * 31 + d[o] + d[o + 1] * 3 + d[o + 2] * 7) % 1000003; if (d[o] > 235 && d[o + 1] > 235 && d[o + 2] > 235) white++; } }
      const out = { spin: scene.spin, top, hash, white, traffic: scene.traffic, stats: scene.stats };
      scene.dispose(); dom.window.close();
      return out;
    };
    const lbase = loadingMeasure(DEFAULT_DISPLAY);
    const changed = (key, value) => loadingMeasure(createDisplay({ loading: { [key]: value } }));
    assert.ok(Math.abs(changed('spinSpeed', 40).spin - 20) < 1e-9 && Math.abs(lbase.spin - 2) < 1e-9, 'loading.spinSpeed turns the planet');
    assert.ok(changed('horizonHeight', 0.8).top > lbase.top, 'loading.horizonHeight moves the planet down');
    assert.notEqual(changed('axisTilt', -40).hash, lbase.hash, 'loading.axisTilt reorients the surface');
    assert.ok(changed('cloudCover', 1).white > lbase.white && changed('cloudCover', 0).white < lbase.white, 'loading.cloudCover thickens and clears the clouds');
    assert.deepEqual(lbase.traffic, { planes: 5, boats: 9, satellites: 3 });
    assert.ok(changed('landSmoothness', 0).stats.pixelSize > lbase.stats.pixelSize && changed('landSmoothness', 1).stats.pixelSize < lbase.stats.pixelSize, 'loading.landSmoothness sets the pixel size of the surface');
    assert.ok(changed('landSmoothness', 0).stats.levels < lbase.stats.levels, 'and the palette levels');
    assert.ok(lbase.stats.citiesDrawn > 3 && changed('citySize', 3).stats.tallestCity > lbase.stats.tallestCity * 1.5, 'loading.citySize makes the skylines taller');
    assert.notEqual(changed('cityStyle', 2).stats.citySignature, lbase.stats.citySignature, 'loading.cityStyle picks another skyline style');
    assert.equal(changed('planes', 2).traffic.planes, 2, 'loading.planes sets the number of planes');
    assert.equal(changed('boats', 14).traffic.boats, 14, 'loading.boats sets the number of boats');
    assert.equal(changed('satellites', 6).traffic.satellites, 6, 'loading.satellites sets the number of satellites');
    const { createPuttProgress } = await import(url('src/ui/putt-progress.js'));
    const finishSteps = display => { const pr = createPuttProgress(display); pr.step(1); pr.finish(); let n = 0; while (!pr.done && n < 1000) { pr.step(0.05); n++; } return n * 0.05; };
    assert.ok(Math.abs(finishSteps(DEFAULT_DISPLAY) - 0.8) < 0.06 && Math.abs(finishSteps(createDisplay({ loading: { finishTime: 2 } })) - 2) < 0.06, 'loading.finishTime sets how long the ball takes to roll home');
    // The table covers every DISPLAY setting, so a new setting cannot be added without a reach check.
    assert.deepEqual([...Object.keys(expectations), 'ball.visualScale', ...['spinSpeed', 'axisTilt', 'horizonHeight', 'cloudCover', 'cloudDrift', 'finishTime', 'landSmoothness', 'citySize', 'cityStyle', 'planes', 'boats', 'satellites'].map(k => 'loading.' + k)].sort(), DISPLAY_FIELDS.map(f => f[0]).sort());
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
