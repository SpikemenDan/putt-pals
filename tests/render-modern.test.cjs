// Installed Three.js migration checks for the default toon style (V1a #58), plus the legacy style's
// environment map and toon-versus-legacy layout. Historical scene parity stays in render.test.cjs.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
(async () => {
  await require('./cosmetics.test.cjs'); // F1 catalog, persistence and actor checks run with the render suite
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
  r.setCosmetics({ ball: 'ember', trail: 'comet', celebration: 'gold' });
  assert.equal(r.localBall.material.emissive.getHex(), 0xff5a1f, 'the chosen ball skin is applied to the local ball');
  r.setCosmetics({ ball: 'nope' });
  assert.equal(r.localBall.material.emissiveIntensity, 0, 'an unknown id falls back to the classic skin');
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
  const domeOf = renderer => renderer.scene.children.find(o => o.geometry?.parameters?.radius === 6000);
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
  // V1c #60: per-map palettes, ambient weather (visual only) and fan wind streaks.
  {
    const { COURSE_PALETTES, DEFAULT_PALETTE, PALETTE_ROLES, paletteForCourse } = await import('../src/courses/palettes.js');
    const { lightningFlash, LIGHTNING_PERIOD } = await import('../src/render/weather.js');
    const starters = ['Switchback Garden', 'Dune Serpent', 'Frost Hollow', 'Slime Springs', 'Cyclone Ring', 'Grand Finale'];
    assert.deepEqual(Object.keys(COURSE_PALETTES), starters, 'one palette per starter map');
    const palettes = starters.map(name => COURSE_PALETTES[name]);
    for (const p of palettes) {
      assert.deepEqual(Object.keys(p.surfaces).sort(), [...PALETTE_ROLES].sort(), `${p.id} defines every surface role`);
      assert.ok(Object.values(p.surfaces).every(Number.isInteger) && p.sky.up.length === 5 && p.sky.down.length === 3, `${p.id} palette shape`);
      assert.ok(Object.values(p.sky.clouds).every(Number.isFinite) && p.sky.clouds.ring > 0 && p.sky.clouds.deck > 0 && p.sky.clouds.scale > 0, `${p.id} cloud parameters`);
      assert.ok(new Set([p.surfaces.turf, p.surfaces.tile, p.surfaces.wall, p.surfaces.ice, p.surfaces.slime, p.surfaces.sand]).size === 6, `${p.id} surfaces stay distinguishable`);
    }
    for (const role of ['turf', 'tile', 'wall']) assert.equal(new Set(palettes.map(p => p.surfaces[role])).size, 6, `six distinct ${role} colours`);
    assert.equal(new Set(palettes.map(p => p.sky.up.join())).size, 6, 'six distinct skies');
    assert.equal(new Set(palettes.map(p => p.sky.clouds.seed)).size, 6, 'six distinct cloud seeds');
    assert.deepEqual({ ...DEFAULT_PALETTE.surfaces }, { ...TOON_PALETTE, wind: 0xffffff }, 'the garden palette is the approved V1a look');
    assert.equal(paletteForCourse({ name: 'Moonshot' }), DEFAULT_PALETTE, 'non-starter maps keep the default palette');
    assert.deepEqual(palettes.map(p => p.weather), [null, null, 'snow', null, 'storm', null], 'weather on Frost Hollow and Cyclone Ring only');

    // Lightning is a pure function of time: calm periods, no fast flicker, always within 0..1.
    let flashes = 0, quietPeriods = 0, worst = 0;
    for (let period = 0; period < 200; period++) {
      let clusters = 0, previous = 0, lastStart = -9;
      for (let i = 0; i < LIGHTNING_PERIOD * 100; i++) {
        const t = period * LIGHTNING_PERIOD + i / 100, f = lightningFlash(t);
        assert.ok(f >= 0 && f <= 1 && f === lightningFlash(t), 'deterministic flash in 0..1');
        if (f > 0 && previous === 0 && t - lastStart > 0.5) { clusters++; lastStart = t; }
        previous = f;
      }
      worst = Math.max(worst, clusters); flashes += clusters; quietPeriods += clusters === 0;
    }
    assert.equal(worst, 1, 'at most one flash cluster per period');
    assert.ok(quietPeriods > 20 && flashes > 100, `occasional flashes (${flashes} in 200 periods, ${quietPeriods} quiet)`);
    assert.equal(lightningFlash(-3), 0);

    const layerOf = (type, attribute) => r.scene.children.flatMap(o => o.isGroup ? o.children : []).filter(o => o[type] && o.geometry.attributes[attribute]);
    const snowLayer = () => layerOf('isPoints', 'seed')[0], rainLayer = () => layerOf('isLineSegments', 'seed')[0];
    const poseAt = { position: [300, 500, 200], look: [300, 0, 200], sunTarget: [300, 0, 200], fadeTarget: null, events: [] };
    const find = name => definitions.find(c => c.name === name);
    const raw = hex => [hex >> 16 & 255, hex >> 8 & 255, hex & 255].map(v => v / 255);
    const expected = { 'Frost Hollow': [true, false], 'Cyclone Ring': [false, true], 'Switchback Garden': [false, false], 'Grand Finale': [false, false], Moonshot: [false, false] };
    for (const [name, [snows, rains]] of Object.entries(expected)) {
      view.setCourse(find(name), 0);
      const palette = paletteForCourse(find(name));
      assert.equal(snowLayer().visible, snows, `${name} snow`);
      assert.equal(rainLayer().visible, rains, `${name} rain`);
      assert.equal(r.scene.fog.color.getHex(), palette.sky.up[0], `${name} fog matches the horizon band`);
      const turfs = []; r.course.group.traverse(o => { if (o.material?.userData.toon && o.material.color.getHex() === palette.surfaces.turf) turfs.push(o); });
      assert.ok(turfs.length > 0, `${name} turf uses its palette colour`);
      // The sky takes the palette's bands (display sRGB written raw) and sun strength.
      const uniforms = domeOf(r).material.uniforms;
      palette.sky.up.forEach((hex, k) => raw(hex).forEach((v, i) => assert.ok(Math.abs([uniforms.skyUp.value[k].r, uniforms.skyUp.value[k].g, uniforms.skyUp.value[k].b][i] - v) < 1e-6, `${name} sky band ${k}`)));
      assert.equal(uniforms.sunAmount.value, palette.sky.sun, `${name} sun strength`);
    }
    // Rain and snow move in the vertex shader from the shared clock: no per-frame CPU buffer writes.
    view.setCourse(find('Cyclone Ring'), 0);
    const washOf = () => r.scene.children.flatMap(o => o.isGroup ? o.children : []).find(o => o.renderOrder === 100 && o.material.isShaderMaterial);
    const rain = rainLayer(), rainVersion = rain.geometry.attributes.seed.version;
    let flashSeen = 0;
    for (let t = 0; t < 140; t += 0.05) {
      r.render({ now: t * 1000, dt: 0.05, local: null, camera: poseAt });
      const flashing = domeOf(r).material.uniforms.flash.value > 0;
      if (flashing) flashSeen++;
      assert.equal(washOf().visible, flashing, 'the full-screen wash shows only during a flash');
    }
    assert.equal(rain.geometry.attributes.seed.version, rainVersion, 'weather particles are not rewritten each frame');
    assert.ok(flashSeen > 10, 'lightning flashes the sky in the storm');
    view.setCourse(find('Frost Hollow'), 0);
    r.render({ now: 5000, dt: 1, local: null, camera: poseAt });
    assert.equal(domeOf(r).material.uniforms.flash.value, 0, 'no lightning in the snow');
    assert.ok(!washOf().visible, 'no lightning wash in the snow');
    r.setWeather(false);
    assert.ok(!snowLayer().visible && !rainLayer().visible, 'weather can be turned off');
    view.setCourse(find('Cyclone Ring'), 0);
    assert.ok(!rainLayer().visible, 'the off choice survives a course swap');
    r.setWeather(true);
    assert.ok(rainLayer().visible && !snowLayer().visible, 'and back on');

    // Procedural clouds: deterministic per map, different across maps, always far from the camera and the courses.
    {
      const horizonMesh = () => r.scene.children.find(o => o.isGroup && o.children.some(c => c.material?.vertexColors)).children[0].children[0];
      const deckMesh = () => r.scene.children.find(o => o.isGroup && o.children.some(c => c.material?.vertexColors)).children[1];
      const signature = geometry => { const a = geometry.attributes.position.array; return `${a.length}:${a[0]}:${a[a.length - 1]}:${a[Math.floor(a.length / 2)]}`; };
      const seen = new Map();
      for (const name of starters) {
        view.setCourse(find(name), 0);
        const ring = horizonMesh().geometry, deckGeometry = deckMesh().geometry;
        const first = signature(ring);
        view.setCourse(find('Switchback Garden'), 0); view.setCourse(find(name), 0);
        assert.equal(signature(horizonMesh().geometry), first, `${name} clouds are the same every time`);
        seen.set(name, first);
        const p = horizonMesh().geometry.attributes.position;
        let near = Infinity, far = 0, top = -Infinity;
        for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)); near = Math.min(near, d); far = Math.max(far, d); }
        const dp = deckMesh().geometry.attributes.position;
        for (let i = 0; i < dp.count; i++) top = Math.max(top, dp.getY(i));
        assert.ok(near > 1500 && far < 7800, `${name} horizon clouds stay between 1500 and 7800 units from the camera (${near.toFixed(0)}..${far.toFixed(0)})`);
        assert.ok(top < -300, `${name} cloud deck stays below the courses (top ${top.toFixed(0)})`);
        assert.ok(Array.from(p.array).every(Number.isFinite) && Array.from(dp.array).every(Number.isFinite), `${name} finite cloud vertices`);
      }
      assert.equal(new Set(seen.values()).size, 6, 'every starter map has its own cloud layout');
      // A swap to different cloud parameters releases the old geometry; the same parameters reuse it.
      view.setCourse(find('Dune Serpent'), 0);
      const before = horizonMesh().geometry; let released = 0; before.addEventListener('dispose', () => released++);
      view.setCourse(find('Dune Serpent'), 1);
      assert.equal(horizonMesh().geometry, before, 'same cloud parameters: nothing rebuilt');
      view.setCourse(find('Cyclone Ring'), 0);
      assert.equal(released, 1, 'old cloud geometry released on a swap');
      const heavy = horizonMesh().geometry.attributes.position.count;
      view.setCourse(find('Dune Serpent'), 0);
      assert.ok(heavy > horizonMesh().geometry.attributes.position.count, 'the storm bank has more cloud than the sparse desert sky');
    }

    // Fans: toon wind streaks in the palette's wind colour, blown along the fan direction.
    view.setCourse(find('Cyclone Ring'), 0);
    r.render({ now: 3000, dt: 1 / 60, local: null, camera: poseAt });
    const fans = r.course.fans;
    assert.ok(fans.length === 4 && fans.every(f => f.wind), 'Cyclone Ring fans use wind streaks');
    for (const f of fans) {
      const p = f.wind.geometry.attributes.position.array, [fx, fy, fw, fh, dx, dz] = f.fan;
      assert.ok(Array.from(p).every(Number.isFinite) && Array.from(p).some(v => v !== 0), 'streak geometry is filled');
      assert.equal(f.wind.mesh.material.color.getHex(), COURSE_PALETTES['Cyclone Ring'].surfaces.wind, 'wind colour from the palette');
      for (let i = 0; i < f.count; i++) {
        const tail = [p[i * 24], p[i * 24 + 2]], head = [f.positions[i * 3], f.positions[i * 3 + 2]];
        assert.ok(dx === 0 || Math.sign(head[0] - tail[0]) === Math.sign(dx), 'streak points along the wind (x)');
        assert.ok(dz === 0 || Math.sign(head[1] - tail[1]) === Math.sign(dz), 'streak points along the wind (z)');
        assert.ok(head[0] >= fx - 1e-3 && head[0] <= fx + fw + 1e-3 && head[1] >= fy - 1e-3 && head[1] <= fy + fh + 1e-3, 'streak heads stay in the fan area');
      }
    }
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
  // landscape trees and fan particles, plus ink hulls.
  {
    const { buildCourseScene, createMaterialLibrary } = await import('../src/render/index.js');
    const layout = o => ({ type: o.type, p: o.position.toArray(), r: o.rotation.toArray().slice(0, 3), s: o.scale.toArray(),
      g: o.geometry && !o.isSprite ? [o.geometry.type, o.geometry.parameters || null] : null,
      // Fan particles are the one intended difference (V1c): the toon style draws wind streaks instead.
      c: o.children.filter(c => !c.userData.inkHull && !c.userData.windStreaks && !(c.isPoints && c.material.isPointsMaterial) && !(c.isGroup && c.children.some(t => t.geometry?.type === 'IcosahedronGeometry'))).map(layout) });
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
