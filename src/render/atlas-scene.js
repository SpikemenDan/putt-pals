/**
 * Gaia unfolded (VIS-M1): the level-select world as a real 3D scene, the planet from the main menu laid flat and viewed from above with a
 * slight tilt. Land is the same closed coast paths as the globe, extruded into a low plinth with an ink contour; biome colours are averaged
 * from the globe's own land colours; cities, towns, villages, plants, peaks and volcanoes are the same models, scaled for a flat view.
 *
 * The camera has two stops, world and region, and moves between them smoothly. `hit` and the highlight both read the region footprints in
 * planet-data.js, so what you can click is exactly what lights up. Presentation only: no simulation, no React. `THREE` is injected.
 */

import { createMaterialLibrary } from './materials.js';
import { sizeInk, smoothHullGeometry } from './outline.js';
import { BIOMES, TEX_H, TEX_W, gaiaPlanet, gaiaRegions, surfaceDir } from './planet-data.js';
import { makeCity, makeLighthouse, makeMill, makePeak, makePlant, makePort, makeTown, makeVillage, makeVolcano, PLANT_KINDS } from './sky-models.js';
import { RANGES } from '../shared/gaia-map.js';
import { COAST_RINGS } from '../shared/gaia-coast.js';

const PLINTH = 1.1, FOV = 26, TILT_WORLD = 22, TILT_REGION = 38, MOVE_SECONDS = 1.15;
const WORLD_TOP = 82, WORLD_BOTTOM = -62;
const SCALE = Object.freeze({ city: 0.36, town: 0.36, village: 0.32, port: 0.34, lighthouse: 0.34, mill: 0.36, plant: 0.5, volcano: 4.4 });

export const atlasX = u => (u - 0.5) * 360;
export const atlasZ = lat => -lat;
const defaultRenderer = (THREE, canvas) => new THREE.WebGLRenderer({ canvas, antialias: true });
void surfaceDir;

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Rings as shapes: a ring inside another is a hole in it (an inland sea). */
function coastShapes(THREE) {
  const contains = (ring, [u, lat]) => { let on = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [au, al] = ring[i], [bu, bl] = ring[j]; if ((al > lat) !== (bl > lat) && u < (bu - au) * (lat - al) / (bl - al) + au) on = !on; } return on; };
  const shapes = [], point = ([u, lat]) => new THREE.Vector2(atlasX(u), lat);
  COAST_RINGS.forEach((ring, k) => {
    const outer = COAST_RINGS.filter((r, j) => j !== k && contains(r, ring[0])).length;
    if (outer % 2) return;
    const shape = new THREE.Shape(ring.map(point));
    COAST_RINGS.forEach((r, j) => { if (j !== k && contains(ring, r[0])) shape.holes.push(new THREE.Path(r.map(point))); });
    shapes.push(shape);
  });
  return shapes;
}

/** Biome colours as flat fills on a canvas, each the average of the globe's land colour there, with thin lines where biomes meet, and rivers. */
function biomeTexture(doc, planet) {
  const w = 2048, h = 1024, canvas = doc.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const sums = BIOMES.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < planet.biome.length; i++) if (planet.land[i] >= 0.4) { const s = sums[planet.biome[i]]; s[0] += planet.landRgb[i * 4]; s[1] += planet.landRgb[i * 4 + 1]; s[2] += planet.landRgb[i * 4 + 2]; s[3]++; }
  const colours = sums.map(([r, gr, b, n]) => (n ? [r / n, gr / n, b / n] : [200, 200, 200]));
  const image = g.createImageData(w, h), px = image.data, kinds = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(TEX_H - 1.001, (y + 0.5) / h * TEX_H - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / w * TEX_W - 0.5, x0 = Math.floor(fx), tx = fx - x0, xa = (x0 + TEX_W) % TEX_W, xb = (x0 + 1) % TEX_W;
      const a = planet.biome[y0 * TEX_W + xa], b = planet.biome[y0 * TEX_W + xb], c = planet.biome[(y0 + 1) * TEX_W + xa], e = planet.biome[(y0 + 1) * TEX_W + xb];
      let k = a;
      if (a !== b || a !== c || a !== e) { const score = q => (q === a ? (1 - tx) * (1 - ty) : 0) + (q === b ? tx * (1 - ty) : 0) + (q === c ? (1 - tx) * ty : 0) + (q === e ? tx * ty : 0); k = [a, b, c, e].reduce((p, q) => (score(q) > score(p) ? q : p)); }
      kinds[y * w + x] = k;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = kinds[i], c = colours[k], o = i * 4, edge = (x + 1 < w && kinds[i + 1] !== k) || (y + 1 < h && kinds[i + w] !== k), m = edge ? 0.72 : 1;
    px[o] = c[0] * m; px[o + 1] = c[1] * m; px[o + 2] = c[2] * m; px[o + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  g.strokeStyle = '#2f8fd8'; g.lineWidth = 2; g.lineCap = g.lineJoin = 'round';
  for (const river of planet.rivers) { g.beginPath(); river.forEach(([u, lat], i) => (i ? g.lineTo(u * w, (0.5 - lat / 180) * h) : g.moveTo(u * w, (0.5 - lat / 180) * h))); g.stroke(); }
  return canvas;
}

/** A dark band along every shore at the top of the land: the crisp contour of the comic. */
function coastInk(THREE, width) {
  const position = [], index = [];
  for (const ring of COAST_RINGS) {
    const n = ring.length, base = position.length / 3;
    for (let i = 0; i < n; i++) {
      const [px, pz] = [atlasX(ring[(i + n - 1) % n][0]), atlasZ(ring[(i + n - 1) % n][1])], [x, z] = [atlasX(ring[i][0]), atlasZ(ring[i][1])], [qx, qz] = [atlasX(ring[(i + 1) % n][0]), atlasZ(ring[(i + 1) % n][1])];
      let nx = -(qz - pz), nz = qx - px;
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      position.push(x + nx * width, PLINTH + 0.03, z + nz * width, x - nx * width, PLINTH + 0.03, z - nz * width);
      const a = base + i * 2, b = base + ((i + 1) % n) * 2;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  return g;
}

/**
 * Creates the atlas on `canvas`. Returns null without WebGL, so the caller can show the plain course list.
 * @param {object} options
 * @param {object} options.THREE
 * @param {HTMLCanvasElement} options.canvas
 * @param {() => number} options.random
 * @param {boolean} [options.reducedMotion] the camera cuts instead of moving
 * @param {Window} [options.win]
 * @param {Function} [options.createWebGLRenderer] renderer seam (tests)
 */
export function createAtlasScene({ THREE, canvas, random, reducedMotion = false, win = canvas.ownerDocument.defaultView, createWebGLRenderer = defaultRenderer }) {
  let renderer = null;
  try { renderer = createWebGLRenderer(THREE, canvas); } catch { return null; }
  if (!renderer) return null;
  const doc = canvas.ownerDocument, planet = gaiaPlanet(), regions = gaiaRegions();
  const library = createMaterialLibrary({ THREE, createCanvas: () => doc.createElement('canvas'), random, maxAnisotropy: renderer.capabilities?.getMaxAnisotropy?.() ?? 1 });
  const owned = new Set(), own = r => { owned.add(r); return r; };
  if (renderer.shadowMap) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  renderer.setClearColor?.(0x3b9fe2, 1);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 4, 2600);
  scene.add(new THREE.AmbientLight(0xffffff, 3.7));
  const sun = new THREE.DirectionalLight(0xffffff, 4.7);
  sun.position.set(-150, 240, 90);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -210, right: 210, top: 130, bottom: -130, near: 10, far: 700 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // Sea and land.
  const seaMaterial = own(library.toon(0x3b9fe2));
  const sea = new THREE.Mesh(own(new THREE.PlaneGeometry(1400, 900).rotateX(-Math.PI / 2)), seaMaterial);
  sea.receiveShadow = true;
  scene.add(sea);
  const biomeMap = own(new THREE.CanvasTexture(biomeTexture(doc, planet)));
  biomeMap.colorSpace = THREE.SRGBColorSpace;
  biomeMap.anisotropy = renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
  const blank = new Uint8Array(TEX_W * TEX_H * 4);
  const maskTexture = own(new THREE.DataTexture(blank, TEX_W, TEX_H, THREE.RGBAFormat));
  Object.assign(maskTexture, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, needsUpdate: true });
  const glow = { regionMask: { value: maskTexture }, regionOn: { value: 0 } };
  const landMaterial = own(library.toon(0xffffff));
  landMaterial.map = biomeMap;
  const toonCompile = landMaterial.onBeforeCompile;
  landMaterial.onBeforeCompile = (shader, r) => {
    toonCompile(shader, r);
    Object.assign(shader.uniforms, glow);
    shader.fragmentShader = 'uniform sampler2D regionMask;uniform float regionOn;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if(regionOn>.5){float m=texture2D(regionMask,vec2(vMapUv.x,1.-vMapUv.y)).r,w=max(fwidth(m)*1.5,.004);
        float inside=smoothstep(.5-w,.5+w,m),line=1.-smoothstep(w*.4,w*1.8,abs(m-.5));
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.8+vec3(.2,.16,.03),inside*.75);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.84,.2),line);}`);
  };
  landMaterial.customProgramCacheKey = () => 'atlas-land-v1';
  const landGeometry = own(new THREE.ExtrudeGeometry(coastShapes(THREE), { depth: PLINTH, bevelEnabled: false }).rotateX(-Math.PI / 2));
  { // every vertex takes its map position, so the fills land where the globe has them
    const p = landGeometry.attributes.position, uv = landGeometry.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 360 + 0.5, 0.5 + -p.getZ(i) / 180);
  }
  const land = new THREE.Mesh(landGeometry, landMaterial);
  land.receiveShadow = land.castShadow = true;
  scene.add(land);
  scene.add(new THREE.Mesh(own(coastInk(THREE, 0.3)), own(new THREE.MeshBasicMaterial({ color: 0x14102a, side: THREE.DoubleSide }))));

  // The menu planet's own models, stood on the flat world.
  const painted = own(library.toon(0xffffff));
  painted.vertexColors = true;
  const hulls = new Map();
  const closeInk = []; // outlines only show up close; from the whole world they would turn small models black
  const inked = mesh => { if (!hulls.has(mesh.geometry)) hulls.set(mesh.geometry, own(smoothHullGeometry(THREE, mesh.geometry))); const hull = new THREE.Mesh(hulls.get(mesh.geometry), library.ink.solid); hull.visible = false; closeInk.push(hull); mesh.add(hull); return mesh; };
  const shapes = new Map();
  const shaped = (key, designs, make) => { if (!shapes.has(key)) shapes.set(key, Array.from({ length: designs }, () => own(make()))); return shapes.get(key)[Math.floor(random() * designs)]; };
  const stand = (geometry, u, lat, scale, ink = false) => { // ink only on the big landmarks: on small models it would swallow the shape
    const mesh = new THREE.Mesh(geometry, painted);
    if (ink) inked(mesh);
    mesh.position.set(atlasX(u), PLINTH, atlasZ(lat));
    mesh.rotation.y = random() * Math.PI * 2;
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  };
  for (const c of planet.cities) stand(shaped('city:' + c.culture, 2, () => makeCity(THREE, random, c.tint, c.culture)), c.u, c.lat, SCALE.city * (c.tier ?? 1), true);
  for (const c of planet.towns) stand(shaped('town:' + c.culture, 2, () => makeTown(THREE, random, c.culture)), c.u, c.lat, SCALE.town);
  for (const c of planet.villages) stand(shaped('village:' + c.culture, 2, () => makeVillage(THREE, random, c.culture)), c.u, c.lat, SCALE.village);
  const portShape = own(makePort(THREE));
  for (const c of planet.ports) stand(portShape, c.u, c.lat, SCALE.port);
  const lighthouseShape = own(makeLighthouse(THREE));
  for (const c of planet.lighthouses) stand(lighthouseShape, c.u, c.lat, SCALE.lighthouse);
  const mill = makeMill(THREE, 'windmill');
  own(mill.mast); own(mill.blades);
  for (const c of planet.mills) { const m = stand(mill.mast, c.u, c.lat, SCALE.mill), b = new THREE.Mesh(mill.blades, painted); b.position.y = mill.hub; m.add(b); }
  planet.volcanoes.forEach((v, k) => stand(own(makeVolcano(THREE, random)), v.u, v.lat, SCALE.volcano * (k % 2 ? 0.8 : 1), true));

  const instanced = [];
  const scatter = (geometry, list, sizeOf) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geometry, painted, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), y = new THREE.Vector3(0, 1, 0);
    list.forEach((item, i) => {
      const k = sizeOf(item), shade = (item.shade ?? 1) * (0.9 + random() * 0.2);
      mesh.setMatrixAt(i, m.compose(p.set(atlasX(item.u), PLINTH - 0.02, atlasZ(item.lat)), q.setFromAxisAngle(y, random() * 6.3), s.set(k * (item.wide ?? 1), k, k * (item.wide ?? 1))));
      mesh.setColorAt(i, c.setRGB(shade, shade, shade));
    });
    mesh.castShadow = true;
    scene.add(mesh);
    instanced.push(mesh);
  };
  for (const kind of PLANT_KINDS) scatter(own(makePlant(THREE, kind)), planet.plants.filter((plant, i) => plant.kind === kind && i % 3 === 0), () => SCALE.plant * (0.8 + random() * 0.5));
  // A few long ridgelines: massifs chained along each range, tallest in the middle, tapering to foothills.
  const ridge = [[], [], []];
  for (const range of RANGES) {
    const pts = [];
    for (let i = 0; i + 1 < range.line.length; i++) { const [au, al] = range.line[i], [bu, bl] = range.line[i + 1], n = Math.max(2, Math.round(Math.hypot((bu - au) * 360, bl - al) / 2.9)); for (let k = 0; k < n; k++) pts.push([au + (bu - au) * k / n, al + (bl - al) * k / n]); }
    pts.forEach(([u, lat], k) => { const swell = Math.sin((k + 0.5) / pts.length * Math.PI); ridge[k % 3].push({ u: u + (random() - 0.5) * 0.004, lat: lat + (random() - 0.5) * 1.2, height: range.height * (0.45 + 0.55 * swell) * (0.8 + random() * 0.4), wide: 0.95 }); });
  }
  ridge.forEach((list, k) => scatter(own(makePeak(THREE, random, k)), list, peak => 2.2 + peak.height * 6.4));

  // Camera: the two stops and the move between them.
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), fromEye = new THREE.Vector3(), fromLook = new THREE.Vector3(), toEye = new THREE.Vector3(), toLook = new THREE.Vector3();
  let width = 1280, height = 720, moveT = 1, resolveMove = null, frameId = null, last = null, disposed = false, dirty = true, listener = () => {};
  const stop = (u, lat, span, tilt, spanLat) => {
    const t = Math.tan(FOV * Math.PI / 360), need = Math.max(spanLat / 2 / t, span / 2 / (t * camera.aspect)) * 1.04, a = tilt * Math.PI / 180;
    const target = new THREE.Vector3(atlasX(u), 0, atlasZ(lat));
    return { look: target, eye: target.clone().add(new THREE.Vector3(0, Math.cos(a) * need, Math.sin(a) * need)) };
  };
  const worldStop = () => stop(0.5, (WORLD_TOP + WORLD_BOTTOM) / 2, 372, TILT_WORLD, WORLD_TOP - WORLD_BOTTOM);
  const regionStop = id => { const r = regions.byId[id]; return stop(r.u, r.lat - r.spanLat * 0.04, Math.max(r.spanU * 360 * 1.5, 54), TILT_REGION, Math.max(r.spanLat * 1.6, 30)); };
  let view = 'world';
  const aim = () => { camera.position.copy(eye); camera.lookAt(look); camera.updateMatrixWorld(); };
  const place = target => { eye.copy(target.eye); look.copy(target.look); aim(); dirty = true; };

  function fit() {
    const rect = canvas.getBoundingClientRect?.(), w = rect?.width || win?.innerWidth || 1280, h = rect?.height || win?.innerHeight || 720;
    if (w === width && h === height && last !== null) return;
    width = w; height = h;
    const ratio = Math.min(win?.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio?.(ratio);
    renderer.setSize?.(w, h, false);
    sizeInk(library.inkUniforms, w * ratio, h * ratio);
    library.inkUniforms.ink.value = Math.max(1, 1.3 * w * ratio / 1280);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (moveT >= 1) place(view === 'world' ? worldStop() : regionStop(view));
    dirty = true;
  }

  /** Moves the camera to a stop; resolves when it arrives. */
  function moveTo(target) {
    fromEye.copy(eye); fromLook.copy(look); toEye.copy(target.eye); toLook.copy(target.look);
    resolveMove?.();
    if (reducedMotion || !win?.requestAnimationFrame) { moveT = 1; place(target); draw(); return Promise.resolve(); }
    moveT = 0;
    wake();
    return new Promise(resolve => { resolveMove = resolve; });
  }

  function draw() {
    renderer.render?.(scene, camera);
    dirty = false;
    listener();
  }

  /** Advances the camera by `dt` seconds and redraws if anything changed. Shared with tests. */
  function step(dt) {
    if (disposed) return;
    fit();
    if (moveT < 1) {
      moveT = Math.min(1, moveT + dt / MOVE_SECONDS);
      const k = ease(moveT);
      eye.lerpVectors(fromEye, toEye, k); look.lerpVectors(fromLook, toLook, k);
      aim();
      dirty = true;
      if (moveT >= 1) { resolveMove?.(); resolveMove = null; }
    }
    if (dirty) draw();
  }
  function frame(now) {
    frameId = null;
    if (disposed) return;
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    step(dt);
    if (moveT < 1 || dirty) wake();
  }
  function wake() { if (frameId === null && win?.requestAnimationFrame) frameId = win.requestAnimationFrame(frame); }
  const onResize = () => { dirty = true; last = last ?? 0; wake(); };
  win?.addEventListener?.('resize', onResize);
  const point = new THREE.Vector3(), ray = new THREE.Vector3();

  return {
    start() { fit(); place(worldStop()); dirty = true; last = 0; wake(); step(0); },
    step,
    /** Called after every drawn frame, so overlays can follow the camera. */
    onFrame(fn) { listener = fn; },
    get view() { return view; },
    get moving() { return moveT < 1; },
    get size() { return { width, height }; },
    /** Screen position in CSS px of a place on the map. */
    project(u, lat, y = PLINTH) {
      point.set(atlasX(u), y, atlasZ(lat)).project(camera);
      return { x: (point.x + 1) / 2 * width, y: (1 - point.y) / 2 * height };
    },
    /** The region under a screen point, or null: the same footprint the highlight shows. */
    hit(x, y) {
      point.set(x / width * 2 - 1, 1 - y / height * 2, 0.5).unproject(camera);
      ray.copy(point).sub(camera.position).normalize();
      const t = (PLINTH - camera.position.y) / ray.y;
      if (!(t > 0)) return null;
      const wx = camera.position.x + ray.x * t, wz = camera.position.z + ray.z * t, u = wx / 360 + 0.5, lat = -wz;
      if (u < 0 || u >= 1 || Math.abs(lat) >= 90) return null;
      return regions.at(u, lat);
    },
    /** Lights a region's footprint, or clears it with null. */
    highlight(id) {
      glow.regionOn.value = id ? 1 : 0;
      if (id) { maskTexture.image.data = regions.byId[id].texture; maskTexture.needsUpdate = true; }
      dirty = true; wake();
    },
    openRegion(id) { view = id; for (const h of closeInk) h.visible = true; return moveTo(regionStop(id)); },
    openWorld() { view = 'world'; for (const h of closeInk) h.visible = false; return moveTo(worldStop()); },
    dispose() {
      disposed = true;
      win?.removeEventListener?.('resize', onResize);
      if (frameId !== null) win?.cancelAnimationFrame?.(frameId);
      for (const r of owned) r.dispose?.();
      for (const m of instanced) m.dispose();
      library.dispose();
      renderer.dispose?.();
    },
  };
}
