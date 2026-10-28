// Installed Three.js migration checks. Historical scene parity stays in render.test.cjs.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
(async () => {
  const THREE = await import('three');
  const { createGameRenderer, createGameView } = await import('../src/render/index.js');
  const { createCourseData } = await import('../src/courses/index.js');
  const { displayFragment } = await import('../src/render/materials.js');
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
  assert.equal(generatorDisposed, 1);
  assert.equal(targetDisposed, 0, 'environment stays alive until renderer disposal');
  const { definitions } = createCourseData();
  let builds = 0, patches = 0;
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
      if (m?.onBeforeCompile && m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
        m.onBeforeCompile(shader); patches++;
        assert.ok(shader.vertexShader.includes('cupWorld=(modelMatrix'));
        assert.ok(shader.fragmentShader.includes('if(distance(cupWorld.xz,cupCenter)'));
      }
    });
    const c0 = build.course;
    for (const mode of ['play', 'sunk', 'play']) view.frame({now: builds * 1000, dt: 1/60, local: {x: c0.tee[0], y: c0.tee[1], z: 0, vx: 0, vy: 0, mode, moving: true, color: 0, effect: 'mag'}, remotes: [{id: 'guest', name: '<Guest>', x: 100, y: 100, z: 0, color: 1, effect: 'steady'}], aim: {charge: .5, angle: .2, aimAngle: .2, spread: .1}});
  }
  assert.equal(builds, 52); assert.ok(patches > 52);
  const fragment = displayFragment(THREE, 'void main(){gl_FragColor=vec4(1.);}');
  if (Number(THREE.REVISION) >= 154) for (const chunk of ['tonemapping_fragment', 'colorspace_fragment']) {
    assert.ok(fragment.includes('#include <' + chunk + '>')); assert.ok(THREE.ShaderChunk[chunk]);
  }
  const counters = r.diagnostics(); counters.textures = -1;
  assert.equal(r.diagnostics().textures, 3, 'detached diagnostics');
  view.dispose(); view.dispose();
  assert.equal(disposed, 1); assert.equal(targetDisposed, 1);
  assert.equal(released.size, created.size, 'every course geometry and material released');
  assert.throws(() => view.setCourse(definitions[0]), /disposed/);
  let failedGeneratorReleased = 0, temporaryReleased = 0;
  const fallbackNamespace = { ...THREE,
    SphereGeometry: class extends THREE.SphereGeometry {
      constructor(...args) { super(...args); if (args[0] === 50) this.addEventListener('dispose', () => temporaryReleased++); }
    },
    PMREMGenerator: class { fromScene() { throw new Error('injected PMREM failure'); } dispose() { failedGeneratorReleased++; } },
  };
  const fallback = createGameRenderer({ THREE: fallbackNamespace, canvas, createWebGLRenderer: () => backend });
  assert.equal(failedGeneratorReleased, 1); assert.equal(temporaryReleased, 1);
  fallback.setCourse(definitions[0]); fallback.dispose();
  dom.window.close();
  console.log(`Render migration r${THREE.REVISION}: 52 builds, ${patches} cup shader patches, color/lighting/output/disposal checks passed (stubbed WebGL).`);
})().catch(e => { console.error(e); process.exitCode = 1; });
