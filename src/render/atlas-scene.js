/**
 * Gaia unfolded (VIS-M1): the level-select world as a real 3D scene, the planet from the main menu laid flat and viewed from above with a
 * slight tilt. Land is the reference world's coast (src/shared/gaia-reference-regions.js), extruded into a low plinth with an ink contour,
 * lakes cut out; its top is the flat master map (src/render/reference-map.js), so the level select looks like the approved map. Cities,
 * towns, villages, plants and volcanoes are the globe's own models, scaled for a flat view; mountains are the painted rock and snow.
 *
 * The camera has two stops, world and region, and moves between them smoothly. `hit` and the highlight both read the region footprints in
 * planet-data.js, so what you can click is exactly what lights up. Presentation only: no simulation, no React. `THREE` is injected.
 */

import { createMaterialLibrary } from './materials.js';
import { sizeInk, smoothHullGeometry } from './outline.js';
import { TEX_H, TEX_W, gaiaPlanet, gaiaRegions } from './planet-data.js';
import { worldMap, paintMapAsync } from './map-paint.js';
import { REFERENCE_LOOKS, paintReferenceMap } from './reference-map.js';
import { MAP_HEIGHT, MAP_WIDTH } from '../shared/gaia-reference.js';
import { MODEL_REACH, makeCity, makeLighthouse, makeMill, makePlant, makePort, makeTown, makeVillage, makeVolcano, PLANT_KINDS } from './sky-models.js';
import { REFERENCE_COAST, REFERENCE_LAKES } from '../shared/gaia-reference-regions.js';

const PLINTH = 1.1, FOV = 26, TILT_WORLD = 46, TILT_REGION = 56, MOVE_SECONDS = 1.15;
/** Haze of the air the camera flies through: far land fades into it, so the view sits in the atmosphere, not in space. */
const HAZE = 0xbfe3ff;
/** Size of a region close-up painting, in pixels along its longer side. */
const DETAIL_PX = 3072;
const WORLD_TOP = 80, WORLD_BOTTOM = -72;
const COAST_RINGS = [...REFERENCE_COAST, ...REFERENCE_LAKES]; // a lake is a ring inside a land ring, so it becomes a hole
const SCALE = Object.freeze({ cityHeight: 2.7, town: 0.24, village: 0.32, port: 0.34, lighthouse: 0.34, mill: 0.36, plant: 0.5, volcano: 4.4 });

export const atlasX = u => (u - 0.5) * 360;
export const atlasZ = lat => -lat;
const defaultRenderer = (THREE, canvas) => new THREE.WebGLRenderer({ canvas, antialias: true });

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
  const mapLook = REFERENCE_LOOKS.comic;
  renderer.setClearColor?.(HAZE, 1);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 4, 2600);
  scene.fog = new THREE.Fog(HAZE, 300, 900);
  scene.add(new THREE.AmbientLight(0xffffff, 3.7));
  const sun = new THREE.DirectionalLight(0xffffff, 4.7);
  sun.position.set(-150, 240, 90);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -210, right: 210, top: 130, bottom: -130, near: 10, far: 700 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // Sea and land share one painting, so nothing can drift apart. It is painted in a worker (map-paint.js); until it arrives the globe's own
  // colours stand in. Without workers it is painted here.
  const anisotropy = renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
  const fromBitmap = bitmap => { const c = doc.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; c.getContext('2d')?.drawImage(bitmap, 0, 0); return c; };
  const canvasTexture = canvas => { const t = own(new THREE.CanvasTexture(canvas)); Object.assign(t, { colorSpace: THREE.SRGBColorSpace, anisotropy }); return t; };
  const standIn = () => { // the globe's surface colours, rows flipped so the north is up as in a canvas texture
    const rgba = new Uint8Array(TEX_W * TEX_H * 4);
    for (let y = 0; y < TEX_H; y++) for (let x = 0; x < TEX_W; x++) { const from = ((TEX_H - 1 - y) * TEX_W + x) * 3, to = (y * TEX_W + x) * 4; rgba[to] = planet.rgb[from]; rgba[to + 1] = planet.rgb[from + 1]; rgba[to + 2] = planet.rgb[from + 2]; rgba[to + 3] = 255; }
    const t = own(new THREE.DataTexture(rgba, TEX_W, TEX_H, THREE.RGBAFormat));
    Object.assign(t, { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, needsUpdate: true });
    return t;
  };
  const art = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' ? canvasTexture(paintReferenceMap(doc, 'comic').canvas) : standIn();
  const seaMaterial = own(library.toon(0xffffff));
  seaMaterial.map = art;
  const sea = new THREE.Mesh(own(new THREE.PlaneGeometry(360, 180).rotateX(-Math.PI / 2)), seaMaterial);
  sea.receiveShadow = true;
  scene.add(sea);
  const beyond = new THREE.Mesh(own(new THREE.PlaneGeometry(1800, 1000).rotateX(-Math.PI / 2).translate(0, -0.2, 0)), own(new THREE.MeshBasicMaterial({ color: mapLook.sea })));
  scene.add(beyond);
  const blank = new Uint8Array(TEX_W * TEX_H * 4);
  const maskTexture = own(new THREE.DataTexture(blank, TEX_W, TEX_H, THREE.RGBAFormat));
  Object.assign(maskTexture, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, needsUpdate: true });
  const glow = { regionMask: { value: maskTexture }, regionOn: { value: 0 } };
  // A sharp close-up of the open region, painted on demand, drawn over the world painting inside its window (cropMin and cropSize, in uv).
  const detail = { detailMap: { value: maskTexture }, detailOn: { value: 0 }, cropMin: { value: new THREE.Vector2() }, cropSize: { value: new THREE.Vector2(1, 1) } };
  const DETAIL_GLSL = 'uniform sampler2D detailMap;uniform float detailOn;uniform vec2 cropMin,cropSize;\n';
  const MAP_WITH_DETAIL = `#ifdef USE_MAP
      vec4 sampledDiffuseColor=texture2D(map,vMapUv);
      if(detailOn>.5){vec2 d=(vMapUv-cropMin)/cropSize;
        if(d.x>0.&&d.y>0.&&d.x<1.&&d.y<1.){float edge=smoothstep(0.,.03,min(min(d.x,d.y),min(1.-d.x,1.-d.y)));sampledDiffuseColor=mix(sampledDiffuseColor,texture2D(detailMap,d),edge);}}
      diffuseColor*=sampledDiffuseColor;
      #endif`;
  const withDetail = (material, key, more = s => s) => {
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      compile(shader, r);
      Object.assign(shader.uniforms, detail);
      shader.fragmentShader = more(DETAIL_GLSL + shader.fragmentShader.replace('#include <map_fragment>', MAP_WITH_DETAIL + '\n#include <map_fragment_done>'), shader).replace('#include <map_fragment_done>', '');
    };
    material.customProgramCacheKey = () => key;
  };
  withDetail(seaMaterial, 'atlas-sea-v2');
  const landMaterial = own(library.toon(0xffffff));
  landMaterial.map = art;
  withDetail(landMaterial, 'atlas-land-v2', (text, shader) => {
    Object.assign(shader.uniforms, glow);
    return 'uniform sampler2D regionMask;uniform float regionOn;\n' + text.replace('#include <map_fragment_done>', `#include <map_fragment_done>
      if(regionOn>.5){float m=texture2D(regionMask,vec2(vMapUv.x,1.-vMapUv.y)).r,w=max(fwidth(m)*1.5,.004);
        float inside=smoothstep(.5-w,.5+w,m),line=1.-smoothstep(w*.4,w*1.8,abs(m-.5));
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.8+vec3(.2,.16,.03),inside*.75);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.84,.2),line);}`);
  });
  if (art.isDataTexture) worldMap().then(bitmap => { // the finished painting replaces the stand-in
    if (!bitmap || disposed) return;
    const painted = canvasTexture(fromBitmap(bitmap));
    seaMaterial.map = landMaterial.map = painted;
    art.dispose(); owned.delete(art);
    dirty = true; wake();
  });
  const landGeometry = own(new THREE.ExtrudeGeometry(coastShapes(THREE), { depth: PLINTH, bevelEnabled: false }).rotateX(-Math.PI / 2));
  { // every vertex takes its map position, so the fills land where the globe has them
    const p = landGeometry.attributes.position, uv = landGeometry.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 360 + 0.5, 0.5 + -p.getZ(i) / 180);
  }
  const land = new THREE.Mesh(landGeometry, landMaterial);
  land.receiveShadow = land.castShadow = true;
  scene.add(land);
  scene.add(new THREE.Mesh(own(coastInk(THREE, 0.26)), own(new THREE.MeshBasicMaterial({ color: 0x14102a, side: THREE.DoubleSide }))));

  // The menu planet's own models, stood on the flat world.
  const painted = own(library.toon(0xffffff));
  painted.vertexColors = true;
  const hulls = new Map();
  const closeInk = []; // outlines only show up close; from the whole world they would turn small models black
  const inked = mesh => { if (!hulls.has(mesh.geometry)) hulls.set(mesh.geometry, own(smoothHullGeometry(THREE, mesh.geometry))); const hull = new THREE.Mesh(hulls.get(mesh.geometry), library.ink.solid); hull.visible = false; closeInk.push(hull); mesh.add(hull); return mesh; };
  const shapes = new Map();
  const shaped = (key, designs, make) => { if (!shapes.has(key)) shapes.set(key, Array.from({ length: designs }, () => own(make()))); return shapes.get(key)[Math.floor(random() * designs)]; };
  const closeUp = new THREE.Group(); // towns, villages and small things only appear near the ground: from the whole world they are speckle
  closeUp.visible = false;
  scene.add(closeUp);
  const stand = (geometry, u, lat, scale, ink = false, parent = closeUp) => { // ink only on the big landmarks: on small models it would swallow the shape
    const mesh = new THREE.Mesh(geometry, painted);
    if (ink) inked(mesh);
    mesh.position.set(atlasX(u), PLINTH, atlasZ(lat));
    mesh.rotation.y = random() * Math.PI * 2;
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  for (const c of planet.cities) { const shape = shaped('city:' + c.culture, 2, () => makeCity(THREE, random, c.tint, c.culture)); stand(shape, c.u, c.lat, SCALE.cityHeight * (c.tier ?? 1) / (shape.userData.top || 1), true, scene); } // every skyline below the volcanoes
  for (const c of planet.towns) stand(shaped('town:' + c.culture, 2, () => makeTown(THREE, random, c.culture)), c.u, c.lat, SCALE.town);
  for (const c of planet.villages) stand(shaped('village:' + c.culture, 2, () => makeVillage(THREE, random, c.culture)), c.u, c.lat, SCALE.village);
  const portShape = own(makePort(THREE));
  for (const c of planet.ports) stand(portShape, c.u, c.lat, SCALE.port);
  const lighthouseShape = own(makeLighthouse(THREE));
  for (const c of planet.lighthouses) stand(lighthouseShape, c.u, c.lat, SCALE.lighthouse);
  const mill = makeMill(THREE, 'windmill');
  own(mill.mast); own(mill.blades);
  for (const c of planet.mills) { const m = stand(mill.mast, c.u, c.lat, SCALE.mill), b = new THREE.Mesh(mill.blades, painted); b.position.y = mill.hub; m.add(b); }
  // Each volcano stays on its island: never wider at the foot than its distance to the sea (atlas units are degrees, as are TEX_H rows).
  planet.volcanoes.forEach((v, k) => stand(own(makeVolcano(THREE, random)), v.u, v.lat, Math.min(SCALE.volcano * (k % 2 ? 0.8 : 1), (v.room * 180 / TEX_H) / MODEL_REACH.volcano), true, scene));

  const instanced = [];
  const scatter = (geometry, list, sizeOf, parent = scene) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geometry, painted, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), y = new THREE.Vector3(0, 1, 0);
    list.forEach((item, i) => {
      const k = sizeOf(item), shade = (item.shade ?? 1) * (0.9 + random() * 0.2);
      mesh.setMatrixAt(i, m.compose(p.set(atlasX(item.u), PLINTH - 0.02, atlasZ(item.lat)), q.setFromAxisAngle(y, random() * 6.3), s.set(k * (item.wide ?? 1), k, k * (item.wide ?? 1))));
      mesh.setColorAt(i, c.setRGB(shade, shade, shade));
    });
    mesh.castShadow = true;
    parent.add(mesh);
    instanced.push(mesh);
  };
  // Plants stand in groves: a seed tree and its neighbours, shown close up, over the painted forests.
  const grove = (plant, i) => Math.sin(plant.u * 460) * Math.sin(plant.lat * 2.3) > 0.1 && i % 2 === 0;
  for (const kind of PLANT_KINDS) scatter(own(makePlant(THREE, kind)), planet.plants.filter((plant, i) => plant.kind === kind && grove(plant, i)), () => SCALE.plant * (0.9 + random() * 0.5), closeUp);
  // No summit models: the map paints high ground as grey rock and snow, as the owner chose for the flat map.

  // Camera: the two stops and the move between them.
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), fromEye = new THREE.Vector3(), fromLook = new THREE.Vector3(), toEye = new THREE.Vector3(), toLook = new THREE.Vector3();
  let width = 1280, height = 720, moveT = 1, resolveMove = null, frameId = null, last = null, disposed = false, dirty = true, listener = () => {};
  const stop = (u, lat, span, tilt, spanLat) => {
    const t = Math.tan(FOV * Math.PI / 360), need = Math.max(spanLat / 2 / t, span / 2 / (t * camera.aspect)) * 1.04, a = tilt * Math.PI / 180;
    const target = new THREE.Vector3(atlasX(u), 0, atlasZ(lat));
    return { look: target, eye: target.clone().add(new THREE.Vector3(0, Math.cos(a) * need, Math.sin(a) * need)) };
  };
  const worldStop = () => stop(0.5, (WORLD_TOP + WORLD_BOTTOM) / 2, 372, TILT_WORLD, WORLD_TOP - WORLD_BOTTOM);
  const regionStop = id => { const r = regions.byId[id]; return stop(r.u, r.lat - r.spanLat * 0.06, Math.max(r.spanU * 360 * 1.22, 44), TILT_REGION, Math.max(r.spanLat * 1.3, 26)); };
  // The close-up painting covers the region with room round it for the tilted view: its window in map pixels, and its size.
  const detailFrame = id => {
    const r = regions.byId[id], wide = Math.min(360, Math.max(r.spanU * 360 * 1.22, 44) * 1.5), tall = Math.min(180, Math.max(r.spanLat * 1.3, 26) * 2.1);
    const x0 = Math.max(0, (r.u * 360 - wide / 2) / 360 * MAP_WIDTH), y0 = Math.max(0, (90 - (r.lat + tall * 0.6)) / 180 * MAP_HEIGHT);
    const view = { x: x0, y: y0, w: Math.min(MAP_WIDTH - x0, wide / 360 * MAP_WIDTH), h: Math.min(MAP_HEIGHT - y0, tall / 180 * MAP_HEIGHT) };
    const k = DETAIL_PX / Math.max(view.w, view.h);
    return { view, width: Math.round(view.w * k), height: Math.round(view.h * k) };
  };
  const details = new Map(); // region id -> promise of { texture, view }, newest last; two are kept
  const showDetail = id => {
    if (!details.has(id)) {
      const frame = detailFrame(id);
      details.set(id, paintMapAsync(frame).then(bitmap => (bitmap && !disposed ? { texture: canvasTexture(fromBitmap(bitmap)), view: frame.view } : null)));
      while (details.size > 2) { const [old, job] = details.entries().next().value; details.delete(old); job.then(d => { if (d) { d.texture.dispose(); owned.delete(d.texture); } }); }
    }
    details.get(id).then(d => {
      if (!d || view !== id || disposed) return;
      detail.detailMap.value = d.texture; detail.detailOn.value = 1;
      detail.cropMin.value.set(d.view.x / MAP_WIDTH, 1 - (d.view.y + d.view.h) / MAP_HEIGHT); detail.cropSize.value.set(d.view.w / MAP_WIDTH, d.view.h / MAP_HEIGHT);
      dirty = true; wake();
    });
  };
  let view = 'world';
  const aim = () => { // the haze starts just past what the camera looks at, so only the far land fades
    camera.position.copy(eye); camera.lookAt(look); camera.updateMatrixWorld();
    const reach = eye.distanceTo(look); scene.fog.near = reach * 0.8; scene.fog.far = reach * 2.1;
  };
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
    openRegion(id) { view = id; closeUp.visible = true; for (const h of closeInk) h.visible = true; showDetail(id); return moveTo(regionStop(id)); },
    openWorld() { view = 'world'; closeUp.visible = false; detail.detailOn.value = 0; for (const h of closeInk) h.visible = false; return moveTo(worldStop()); },
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
