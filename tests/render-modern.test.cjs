// Installed Three.js migration checks for the default toon style (V1a #58), plus the legacy style's
// environment map and toon-versus-legacy layout. Historical scene parity stays in render.test.cjs.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
(async () => {
  const THREE = await import('three');
  const { createGameRenderer, createGameView } = await import('../src/render/index.js');
  const { createCourseData } = await import('../src/courses/index.js');
  const { displayColor, TELEPORTER_COLORS, TOON_PALETTE } = await import('../src/render/materials.js');
  const dom = new JSDOM('<canvas></canvas>');
  const canvas = dom.window.document.querySelector('canvas');
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({width: 10}) : key === 'createRadialGradient' ? () => ({addColorStop() {}}) : () => {}, set: () => true });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
  let disposed = 0, targetDisposed = 0, generatorDisposed = 0;
  const env = new THREE.Texture();
  const namespace = { ...THREE, PMREMGenerator: class { fromScene() { return { texture: env, dispose() { targetDisposed++; } }; } dispose() { generatorDisposed++; } } };
  const backend = { capabilities: { getMaxAnisotropy: () => 4 }, shadowMap: {}, info: { memory: {geometries: 2, textures: 3}, programs: [1], render: {calls: 4, triangles: 5} }, setSize() {}, setPixelRatio() {}, render() {}, dispose() { disposed++; } };
  const r = createGameRenderer({ THREE: namespace, canvas, random: () => .37, createWebGLRenderer: () => backend });
  const view = createGameView({ renderer: r });
  const modern = Number(THREE.REVISION) >= 152;
  assert.equal(modern ? backend.outputColorSpace : backend.outputEncoding, modern ? THREE.SRGBColorSpace : THREE.sRGBEncoding);
  for (const t of Object.values(r.library.textures)) assert.equal(modern ? t.colorSpace : t.encoding, modern ? THREE.SRGBColorSpace : THREE.sRGBEncoding);
  const sun = r.scene.children.find(o => o.isDirectionalLight);
  assert.equal(sun.intensity, 1.5 * (Number(THREE.REVISION) >= 155 ? Math.PI : 1));
  assert.equal(generatorDisposed, 0, 'flat toon materials need no environment map');
  assert.equal(backend.toneMapping, THREE.NoToneMapping, 'toon palette colours are shown untone-mapped');
  assert.equal(sun.color.getHex(), 0xffffff, 'white toon lights: the bands compare light levels only');
  assert.equal(r.scene.children.filter(o => o.isMesh && o.geometry.parameters?.width === 14000).length, 0, 'no ground plane');
  assert.equal(r.scene.children.filter(o => o.material?.isMeshStandardMaterial).length, 0, 'no floating dream shapes or other textured scenery');
  assert.deepEqual(Object.keys(r.library.textures).sort(), ['blob', 'soft'], 'no surface pattern textures');
  const { definitions } = createCourseData();
  const skyResources = [], skyReleased = new Set();
  let builds = 0, patches = 0, inked = 0, cutInk = 0, trees = 0;
  const beams = [];
  const created = new Set(), released = new Set();
  const track = obj => {
    for (const resource of [obj.isSprite ? null : obj.geometry, ...[obj.material].flat().filter(Boolean)]) {
      if (!resource || created.has(resource) || r.library.isShared(resource)) continue;
      created.add(resource); resource.addEventListener('dispose', () => released.add(resource));
    }
  };
  for (const c of definitions) for (let k = 0; k < (c.putts?.length || 1); k++) {
    view.setCourse(c, k); builds++;
    const build = r.course;
    build.group.traverse(o => {
      track(o);
      const positions = o.geometry?.attributes.position;
      if (positions) assert.ok(Array.from(positions.array).every(Number.isFinite), 'finite vertices');
      const m = o.material;
      if (m?.isMeshBasicMaterial && m.blending === THREE.AdditiveBlending) beams.push([m.color.r, m.color.g, m.color.b]);
      if (m && !o.userData.inkHull) {
        assert.ok(!m.map || m.isSpriteMaterial || m === r.library.textures.soft || m.map === r.library.textures.soft, 'no image textures on course surfaces');
        assert.ok(!m.isMeshStandardMaterial, 'lit course surfaces are toon materials');
      }
      if (m?.userData.toon) {
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
        m.onBeforeCompile(shader);
        assert.ok(shader.fragmentShader.includes('toonBand') && shader.uniforms.toonDot === r.library.inkUniforms.dot, 'cel-shading patch');
        if (m.customProgramCacheKey().startsWith('cup-cut')) {
          patches++;
          // V1a: the cup cutout chains onto the toon patch instead of replacing it.
          assert.ok(shader.vertexShader.includes('cupWorld=(modelMatrix'));
          assert.ok(shader.fragmentShader.includes('if(distance(cupWorld.xz,cupCenter)'));
          assert.ok(m.customProgramCacheKey().endsWith('|toon-v1'));
        }
      }
      if (o.isMesh && o.userData.ink) {
        inked++;
        const hull = o.userData.ink;
        assert.equal(hull.parent, o, 'ink hull rides on its mesh');
        assert.ok(hull.material.userData.ink && !hull.castShadow, 'ink hull');
        if (hull.material.defines.INK_PLANAR !== undefined) {
          assert.ok(hull.geometry.attributes.inkEdge, 'planar ink marks its border');
          assert.equal(o.material.stencilZPass, THREE.ReplaceStencilOp, 'planar owner masks its own ink');
        } else assert.ok(hull.geometry.index && hull.geometry.attributes.normal, 'smoothed hull');
        if (hull.material.defines.INK_CUP !== undefined) cutInk++;
      }
      if (o.geometry?.type === 'IcosahedronGeometry') trees++;
    });
    for (const w of build.wallFade) assert.ok(w.mesh.userData.ink, 'walls and platforms are inked');
    const c0 = build.course;
    for (const mode of ['play', 'sunk', 'play']) view.frame({now: builds * 1000, dt: 1/60, local: {x: c0.tee[0], y: c0.tee[1], z: 0, vx: 0, vy: 0, mode, moving: true, color: 0, effect: 'mag'}, remotes: [{id: 'guest', name: '<Guest>', x: 100, y: 100, z: 0, color: 1, effect: 'steady'}], aim: {charge: .5, angle: .2, aimAngle: .2, spread: .1}});
  }
  assert.equal(builds, 52); assert.ok(patches > 52);
  assert.equal(trees, 0, 'no landscape trees');
  assert.ok(inked > 52 * 10 && cutInk >= 52, `ink on every solid (${inked} hulls, ${cutInk} with the cup cutout)`);
  assert.ok(r.localBall.userData.ink?.material === r.library.ink.ball, 'local ball is inked, lifted so a wall behind it cannot clip the ring');
  {
    // Remote (see-through) balls draw their ink after themselves so the hull never shows through.
    const remote = r.scene.children.find(o => o.isMesh && o !== r.localBall && o.material.userData?.toon && o.material.transparent);
    assert.ok(remote && remote.userData.ink.material === r.library.ink.overlay && remote.userData.ink.renderOrder > remote.renderOrder, 'remote ball overlay ink');
  }
  {
    // A wall that fades (camera inside it) drops its ink at once; a clear view brings it back.
    view.setCourse(definitions[0], 0);
    const wall = r.course.wallFade[0], centre = wall.mesh.getWorldPosition(new THREE.Vector3()).toArray();
    const pose = (position, fadeTarget) => ({ position, look: [100, 0, 100], sunTarget: [100, 0, 100], fadeTarget, events: [] });
    r.render({ now: 0, dt: 1, local: null, camera: pose(centre, [100, 5, 100]) });
    assert.equal(wall.alpha < 1 && wall.mesh.userData.ink.visible, false, 'faded wall has no ink');
    r.render({ now: 0, dt: 1, local: null, camera: pose([100, 900, 100], [100, 5, 100]) });
    assert.equal(wall.alpha === 1 && wall.mesh.userData.ink.visible, true, 'opaque wall is inked again');
  }
  assert.ok(TOON_PALETTE.turf !== TOON_PALETTE.slime && TOON_PALETTE.ice !== TOON_PALETTE.turf, 'surface roles stay distinguishable');
  // R2c #57: effect shaders output display values as on r128, so no tone mapping or re-encoding.
  const effects = [];
  r.scene.traverse(o => { if (o.material?.isShaderMaterial) effects.push(o.material); });
  assert.ok(effects.length >= 4, 'sky, trail, confetti and aura shaders in the scene');
  for (const m of [...effects, r.library.water, r.library.pad, r.library.portal(0xb44cff), r.library.hazard(), r.library.vortex(), r.library.vortexParticles(), r.library.powerBlock()]) {
    assert.ok(!/tonemapping_fragment|colorspace_fragment/.test(m.fragmentShader), 'effect shader keeps raw display output');
  }
  const raw = hex => [hex >> 16 & 255, hex >> 8 & 255, hex & 255].map(v => v / 255);
  const close = (color, hex) => raw(hex).forEach((v, i) => assert.ok(Math.abs([color.r, color.g, color.b][i] - v) < 1e-6, 'sRGB uniform component'));
  close(r.library.portal(0xb44cff).uniforms.col.value, 0xb44cff);
  close(displayColor(new THREE.Color(), '#ff4fb8'), 0xff4fb8);
  const aura = effects.find(m => m.uniforms.kind);
  close(aura.uniforms.col.value, 0x36cfff);
  assert.ok(beams.length > 0, 'portal beams checked');
  for (const color of beams) assert.ok(TELEPORTER_COLORS.some(hex => raw(hex).every((v, i) => Math.abs(color[i] - v) < 1e-6)), 'portal beam keeps the r128 sRGB components');
  // V1b #59: sky world. Decoration only, far from the playable area, released with the renderer.
  {
    const dome = r.scene.children.find(o => o.geometry?.parameters?.radius === 6000);
    const sky = r.scene.children.find(o => o.isGroup && o.children.some(c => c.material?.vertexColors));
    assert.ok(dome && sky, 'sky dome and cloud/bird layers in the toon scene');
    assert.deepEqual(dome.position.toArray(), [100, 900, 100], 'dome follows the camera');
    const [horizon, deck, flock] = sky.children;
    assert.equal(horizon.children.length + 1, 2, 'horizon clouds are one merged mesh');
    const radii = [], heights = [];
    const pos = horizon.children[0].geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) radii.push(Math.hypot(pos.getX(i), pos.getZ(i)));
    const deckPos = deck.geometry.attributes.position;
    for (let i = 0; i < deckPos.count; i++) heights.push(deckPos.getY(i));
    assert.ok(Math.min(...radii) > 1500, 'horizon clouds stay far from the camera');
    assert.ok(Math.max(...heights) < -300, 'cloud deck sits well below the courses');
    for (const object of [...horizon.children, deck, ...flock.children]) assert.equal(object.castShadow, false, 'sky decoration casts no shadow');
    assert.equal(flock.children.length, 7, 'distant birds');
    const before = flock.children[0].position.toArray();
    r.render({ now: 5000, dt: 1, local: null, camera: { position: [100, 900, 100], look: [100, 0, 100], sunTarget: [100, 0, 100], fadeTarget: null, events: [] } });
    assert.notDeepEqual(flock.children[0].position.toArray(), before, 'birds circle over time');
    for (const bird of flock.children) assert.ok(Math.hypot(bird.position.x, bird.position.z) > 2000, 'birds stay in the distance');
    skyResources.push(horizon.children[0].geometry, deck.geometry, dome.geometry, dome.material, horizon.children[0].material);
    for (const resource of skyResources) resource.addEventListener('dispose', () => skyReleased.add(resource));
  }
  const counters = r.diagnostics(); counters.textures = -1;
  assert.equal(r.diagnostics().textures, 3, 'detached diagnostics');
  view.dispose(); view.dispose();
  assert.equal(disposed, 1); assert.equal(targetDisposed, 0);
  assert.equal(released.size, created.size, 'every course geometry and material released');
  assert.equal(skyReleased.size, skyResources.length, 'sky world geometry and materials released');
  assert.throws(() => view.setCourse(definitions[0]), /disposed/);
  let failedGeneratorReleased = 0, temporaryReleased = 0;
  const fallbackNamespace = { ...THREE,
    SphereGeometry: class extends THREE.SphereGeometry {
      constructor(...args) { super(...args); if (args[0] === 50) this.addEventListener('dispose', () => temporaryReleased++); }
    },
    PMREMGenerator: class { fromScene() { throw new Error('injected PMREM failure'); } dispose() { failedGeneratorReleased++; } },
  };
  // The legacy style (kept for the historical parity suite) still owns a PMREM environment map.
  generatorDisposed = targetDisposed = 0;
  const legacy = createGameRenderer({ THREE: namespace, canvas, random: () => .37, createWebGLRenderer: () => backend, style: 'legacy' });
  assert.equal(generatorDisposed, 1);
  assert.equal(targetDisposed, 0, 'environment stays alive until renderer disposal');
  assert.equal(backend.toneMapping, THREE.ACESFilmicToneMapping);
  legacy.dispose();
  assert.equal(targetDisposed, 1);
  // Toon builds keep the legacy object layout: the same objects in the same places, minus the
  // landscape trees, plus ink hulls.
  {
    const { buildCourseScene, createMaterialLibrary } = await import('../src/render/index.js');
    const layout = o => ({ type: o.type, p: o.position.toArray(), r: o.rotation.toArray().slice(0, 3), s: o.scale.toArray(),
      g: o.geometry && !o.isSprite ? [o.geometry.type, o.geometry.parameters || null] : null,
      c: o.children.filter(c => !c.userData.inkHull && !(c.isGroup && c.children.some(t => t.geometry?.type === 'IcosahedronGeometry'))).map(layout) });
    for (const course of definitions) {
      const [toonLayout, legacyLayout] = ['toon', 'legacy'].map(style => {
        const library = createMaterialLibrary({ THREE, createCanvas: () => canvas, random: () => .5, style });
        const build = buildCourseScene({ library, course });
        const d = JSON.parse(JSON.stringify(layout(build.group)));
        build.dispose(); library.dispose();
        return d;
      });
      assert.deepEqual(toonLayout, legacyLayout, `toon layout of ${course.name}`);
    }
  }
  const fallback = createGameRenderer({ THREE: fallbackNamespace, canvas, createWebGLRenderer: () => backend, style: 'legacy' });
  assert.equal(failedGeneratorReleased, 1); assert.equal(temporaryReleased, 1);
  fallback.setCourse(definitions[0]); fallback.dispose();
  dom.window.close();
  console.log(`Render migration r${THREE.REVISION}: 52 toon builds, ${patches} chained cup shader patches, ${inked} ink hulls, toon/legacy layout, color/lighting/output/disposal checks passed (stubbed WebGL).`);
})().catch(e => { console.error(e); process.exitCode = 1; });
