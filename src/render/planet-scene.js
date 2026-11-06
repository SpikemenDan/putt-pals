/**
 * The loading-screen sky (VIS-M1): the camera flies through cumulus clouds high above Gaia, with the planet's curved horizon ahead,
 * real 3D cities rising over it, ships ploughing the sea, airliners on great circles, satellites, and Ares and Luna in the distance.
 *
 * One Three.js scene, one sun, the game's own toon material and ink hulls (materials.js, outline.js), so everything shares the look of
 * the courses. The planet turns so its surface comes toward the camera, the same way the clouds pass it: the whole scene reads as
 * flight. Reads the live `display.loading` settings each frame (src/shared/display.js). With `reducedMotion` it draws one still frame.
 * Presentation only: no simulation, no React. `THREE`, randomness and the WebGL renderer are injected.
 */

import { createMaterialLibrary } from './materials.js';
import { createInkMaterial, sizeInk, smoothHullGeometry } from './outline.js';
import { ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX, CLOUD_FRAGMENT, CLOUD_SHELL_FRAGMENT, CLOUD_VERTEX, CONTRAIL_FRAGMENT, PLANET_FRAGMENT, SPHERE_VERTEX, TRAIL_VERTEX, WAKE_FRAGMENT } from './planet-shaders.js';
import { MAX_BOATS, MAX_PLANES, MAX_SATELLITES, TEX_H, TEX_W, buildPlanet, flightRoutes, shipRoutes, surfaceDir } from './planet-data.js';
import { makeCity, makeCumulus, makePlane, makeSatellite, makeShip } from './sky-models.js';
import { buildAresTexture, buildLunaTexture, WORLD_TEX_H, WORLD_TEX_W } from './worlds.js';
import { clamp } from './noise.js';

export const PLANET_RADIUS = 100;
const FOV = 32, SUN = [-0.55, 0.62, 0.56], CITY_UNIT = 0.36;
const NEAR_CLOUDS = 16, GLOBE_CLOUDS = 34, CLOUD_FAR = 100, CLOUD_NEAR = 20, CLOUD_INK = 'vec3(.2,.26,.52)';

const count = (value, max) => Math.max(0, Math.min(max, Math.round(value)));
const defaultRenderer = (THREE, canvas) => new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });

/**
 * Where the camera sits so the planet's limb crosses the screen at `horizonHeight` (fraction of the height from the top) and the disc
 * is as wide as the screen. Returns the camera's height and distance from the planet, in the planet's units.
 */
export function frameCamera(width, height, horizonHeight, radius = PLANET_RADIUS) {
  const t = Math.tan(FOV * Math.PI / 360), tanA = Math.max(width / height, 1.2) * t, alpha = Math.atan(tanA), dist = radius / Math.sin(alpha);
  const theta = alpha - Math.atan((1 - 2 * horizonHeight) * t);
  return { y: dist * Math.sin(theta), z: dist * Math.cos(theta) };
}

/**
 * Creates the scene on `canvas`. If WebGL is unavailable it stays inert (the CSS sky remains), and its clock and counts still work.
 * @param {object} options
 * @param {object} options.THREE
 * @param {HTMLCanvasElement} options.canvas
 * @param {{loading: object}} options.display live settings
 * @param {() => number} options.random seeded generator (same seed, same planet and traffic)
 * @param {ReturnType<typeof buildPlanet>} [options.planet] a planet already built, to share between scenes
 * @param {boolean} [options.reducedMotion] draw one still frame
 * @param {'city'|'ship'|'plane'|null} [options.focus] preview gallery: follow one object closely
 * @param {Window} [options.win]
 * @param {Function} [options.createWebGLRenderer] renderer seam (tests)
 */
export function createPlanetScene({ THREE, canvas, display, random, planet: prebuilt = null, reducedMotion = false, focus = null, win = canvas.ownerDocument.defaultView, createWebGLRenderer = defaultRenderer }) {
  const doc = canvas.ownerDocument, settings = () => display.loading;
  const planet = prebuilt ?? buildPlanet(random);
  let renderer = null;
  try { renderer = createWebGLRenderer(THREE, canvas); } catch { renderer = null; }
  renderer?.setClearColor?.(0x000000, 0);
  const library = createMaterialLibrary({ THREE, createCanvas: () => doc.createElement('canvas'), random, maxAnisotropy: renderer?.capabilities?.getMaxAnisotropy?.() ?? 1 });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 1, 8000);
  const sun = new THREE.Vector3(...SUN).normalize();
  const owned = new Set(), own = r => { owned.add(r); return r; };
  scene.add(camera, new THREE.AmbientLight(0xffffff, 2.8));
  const light = new THREE.DirectionalLight(0xffffff, 5.4);
  light.position.copy(sun).multiplyScalar(1000);
  scene.add(light);

  // ---- Textures
  const data = (bytes, w, h, srgb = false) => {
    const texture = own(new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat));
    Object.assign(texture, { wrapS: THREE.RepeatWrapping, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, anisotropy: renderer?.capabilities?.getMaxAnisotropy?.() ?? 1, needsUpdate: true });
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const rgba = rgb => { const out = new Uint8Array(rgb.length / 3 * 4); for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { out[j] = rgb[i]; out[j + 1] = rgb[i + 1]; out[j + 2] = rgb[i + 2]; out[j + 3] = 255; } return out; };
  const grey = bytes => { const out = new Uint8Array(bytes.length * 4); for (let i = 0; i < bytes.length; i++) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = bytes[i]; out[i * 4 + 3] = 255; } return out; };
  const fieldTexture = data(planet.field, TEX_W, TEX_H), landTexture = data(planet.landRgb, TEX_W, TEX_H), cloudTexture = data(grey(planet.cloud), TEX_W, TEX_H);

  // ---- Planet: tilt holds the axis (nearly level, so the land rolls over the horizon toward us); spin and cloudSpin turn inside it.
  const tilt = new THREE.Group(), spinner = new THREE.Group(), cloudSpinner = new THREE.Group();
  tilt.add(spinner, cloudSpinner);
  scene.add(tilt);
  const shared = { sun: { value: sun }, time: { value: 0 }, dotCell: library.inkUniforms.dot, atmosphere: { value: 0.7 }, cloudGate: { value: 0.5 }, cloudShift: { value: 0 }, inkPx: { value: 1.2 } };
  const sphere = (radius, a, b) => own(new THREE.SphereGeometry(radius, a, b));
  const surface = own(new THREE.ShaderMaterial({ vertexShader: SPHERE_VERTEX, fragmentShader: PLANET_FRAGMENT, uniforms: { ...shared, field: { value: fieldTexture }, landMap: { value: landTexture }, cloudMap: { value: cloudTexture }, texel: { value: new THREE.Vector2(1.5 / TEX_W, 1.5 / TEX_H) } } }));
  spinner.add(new THREE.Mesh(sphere(PLANET_RADIUS, 192, 128), surface));
  const shellMaterial = own(new THREE.ShaderMaterial({ vertexShader: SPHERE_VERTEX, fragmentShader: CLOUD_SHELL_FRAGMENT, transparent: true, depthWrite: false, uniforms: { ...shared, cloudMap: { value: cloudTexture } } }));
  const shell = new THREE.Mesh(sphere(PLANET_RADIUS + 1.1, 128, 96), shellMaterial);
  cloudSpinner.add(shell);
  const air = new THREE.Mesh(sphere(PLANET_RADIUS * 1.11, 96, 64), own(new THREE.ShaderMaterial({ vertexShader: ATMOSPHERE_VERTEX, fragmentShader: ATMOSPHERE_FRAGMENT, side: THREE.BackSide, transparent: true, premultipliedAlpha: true, depthWrite: false, uniforms: { sun: shared.sun, atmosphere: shared.atmosphere, radius: { value: PLANET_RADIUS }, shell: { value: PLANET_RADIUS * 1.11 } } })));
  scene.add(air);

  // Ink hulls: built once per shape, as every city, ship and cloud reuses a handful of geometries.
  const outlined = [], hulls = new Map();
  const inked = (mesh, material = library.ink.solid) => {
    if (!hulls.has(mesh.geometry)) hulls.set(mesh.geometry, own(smoothHullGeometry(THREE, mesh.geometry)));
    const hull = new THREE.Mesh(hulls.get(mesh.geometry), material);
    mesh.add(hull);
    outlined.push(hull);
    return mesh;
  };
  const standUp = (object, dir) => { object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir)); return object; };

  // ---- Toon materials shared by the models. Cities add a window grid to the wall colour.
  const painted = own(library.toon(0xffffff));
  painted.vertexColors = true;
  const cityMaterial = own(library.toon(0xffffff));
  cityMaterial.vertexColors = true;
  const toonCompile = cityMaterial.onBeforeCompile;
  cityMaterial.onBeforeCompile = (shader, r) => {
    toonCompile(shader, r);
    shader.vertexShader = 'attribute vec2 win;varying vec2 vWin;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin=win;');
    shader.fragmentShader = 'varying vec2 vWin;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if(vWin.x>=0.){vec2 g=fract(vWin);float clear=1.-smoothstep(.3,.62,max(fwidth(vWin.x),fwidth(vWin.y)));
        float pane=step(.18,g.x)*step(g.x,.82)*step(.24,g.y)*step(g.y,.76);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.42+vec3(.02,.05,.1),pane*clear);}`);
  };
  cityMaterial.customProgramCacheKey = () => 'planet-city-v1';

  // ---- Cities: a few skylines per climate, reused with a turn so no two neighbours match.
  const cityGeometries = new Map();
  const cityFor = tint => {
    const key = tint.map(q => Math.round(q / 48)).join();
    if (!cityGeometries.has(key)) cityGeometries.set(key, own(makeCity(THREE, random, tint)));
    return cityGeometries.get(key);
  };
  const cities = planet.cities.map(c => {
    const dir = surfaceDir(c.u, c.lat), geometry = cityFor(c.tint), mesh = inked(new THREE.Mesh(geometry, cityMaterial));
    mesh.position.set(...dir).multiplyScalar(PLANET_RADIUS);
    standUp(mesh, dir).rotateY(random() * Math.PI * 2);
    spinner.add(mesh);
    return { mesh, dir, top: geometry.userData.top };
  });

  /** A body riding a circle `rho` around `centre`: its nose (+x) always points along its travel, its top (+y) away from the planet. */
  const rig = (parent, { centre, rho, speed }, radius, body, phase) => {
    const pivot = standUp(new THREE.Group(), centre), turn = new THREE.Group();
    const at = new THREE.Vector3(Math.sin(rho), Math.cos(rho), 0), forward = new THREE.Vector3(0, 0, speed > 0 ? -1 : 1), side = new THREE.Vector3().crossVectors(forward, at);
    body.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, at, side));
    body.position.copy(at).multiplyScalar(radius);
    turn.add(body); pivot.add(turn); parent.add(pivot);
    turn.rotation.y = phase;
    return { pivot, turn, body, speed, phase, radius, rho, sign: Math.sign(speed) };
  };

  // ---- Ships: hull sunk into the sphere, so the sea really cuts it at the waterline; a foaming wake trails behind.
  const wakeMaterial = own(new THREE.ShaderMaterial({ vertexShader: TRAIL_VERTEX, fragmentShader: WAKE_FRAGMENT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, uniforms: { time: shared.time } }));
  const wakeGeometry = (() => {
    const position = [], trail = [], index = [], rows = 14, cols = 8;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const f = i / rows, s = j / cols * 2 - 1;
      position.push(3 - f * 20, 0.12, s * (0.75 + f * 3.4)); trail.push(f, s);
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; index.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('trail', new THREE.Float32BufferAttribute(trail, 2));
    g.setIndex(index);
    return own(g);
  })();
  const shipGeometries = [0, 1, 2].map(() => own(makeShip(THREE, random)));
  const ships = shipRoutes(planet, random).slice(0, MAX_BOATS).map((route, k) => {
    const body = inked(new THREE.Mesh(shipGeometries[k % 3], painted));
    body.scale.setScalar(0.72);
    body.add(new THREE.Mesh(wakeGeometry, wakeMaterial));
    return rig(spinner, route, PLANET_RADIUS, body, random() * Math.PI * 2);
  });

  // ---- Planes and satellites: their orbits do not turn with the planet.
  const viewSide = new THREE.Vector3(0, 0.7, 0.72).normalize();
  const planeGeometry = own(makePlane(THREE)), satelliteGeometry = own(makeSatellite(THREE));
  const contrailMaterial = own(new THREE.ShaderMaterial({ vertexShader: TRAIL_VERTEX, fragmentShader: CONTRAIL_FRAGMENT, transparent: true, depthWrite: false }));
  /** A thin tube bending back along the orbit behind the plane, in the orbit's own frame, so it curves round the planet. */
  const contrail = (radius, offset, sign) => {
    const position = [], trail = [], index = [], rows = 26, ring = 6;
    for (let i = 0; i <= rows; i++) for (let j = 0; j < ring; j++) {
      const f = i / rows, a = sign * (0.02 + f * 0.34), w = 0.2 + f * 0.5, q = j / ring * Math.PI * 2, r = radius + Math.cos(q) * w;
      position.push(Math.cos(a) * r, offset + Math.sin(q) * w, Math.sin(a) * r); trail.push(f, 0);
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring; index.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('trail', new THREE.Float32BufferAttribute(trail, 2));
    g.setIndex(index);
    return new THREE.Mesh(own(g), contrailMaterial);
  };
  const planes = flightRoutes(MAX_PLANES, random, viewSide.toArray()).map(route => {
    const body = inked(new THREE.Mesh(planeGeometry, painted)), radius = PLANET_RADIUS + 9 + random() * 5;
    body.scale.setScalar(0.92);
    const r = rig(scene, route, radius, body, random() * Math.PI * 2);
    for (const offset of [-1.2, 1.2]) r.turn.add(contrail(radius - 0.3, offset, r.sign));
    return r;
  });
  const satellites = flightRoutes(MAX_SATELLITES, random, viewSide.toArray()).map(route => {
    const body = inked(new THREE.Mesh(satelliteGeometry, painted));
    body.scale.setScalar(1.15);
    return rig(scene, { ...route, speed: route.speed * 0.5 }, PLANET_RADIUS * (1.28 + random() * 0.2), body, random() * Math.PI * 2);
  });

  // ---- Clouds. One shader everywhere: the piles standing on the globe and the ones the camera flies through.
  const cloudInkUniforms = { ...library.inkUniforms };
  const cloudMaterial = (fade, haze) => own(new THREE.ShaderMaterial({ vertexShader: CLOUD_VERTEX, fragmentShader: CLOUD_FRAGMENT, uniforms: { sun: shared.sun, dotCell: shared.dotCell, fade: { value: fade }, haze: { value: haze } } }));
  const bigClouds = Array.from({ length: 5 }, () => own(makeCumulus(THREE, random, { puffs: 16, detail: 4 })));
  const smallClouds = Array.from({ length: 3 }, () => own(makeCumulus(THREE, random, { puffs: 9, detail: 2 })));
  /** Cloud ink sits a little behind the cloud in depth (no shift on screen), so it draws the silhouette and not every lobe. */
  const cloudInk = options => Object.assign(own(createInkMaterial(THREE, cloudInkUniforms, { color: CLOUD_INK, ...options })), { polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 600 });
  const globeMaterial = cloudMaterial(1, 0.08), globeInk = cloudInk();
  const denseSpots = [];
  for (let tries = 0; tries < 3000 && denseSpots.length < GLOBE_CLOUDS; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.08 + random() * 0.84) * TEX_H);
    if (planet.cloud[y * TEX_W + x] > 140) denseSpots.push(surfaceDir(x / TEX_W, (0.5 - (y + 0.5) / TEX_H) * 180));
  }
  const globeClouds = denseSpots.map((dir, k) => {
    const mesh = inked(new THREE.Mesh(smallClouds[k % 3], globeMaterial), globeInk);
    mesh.position.set(...dir).multiplyScalar(PLANET_RADIUS + 2.4);
    standUp(mesh, dir).rotateY(random() * Math.PI * 2);
    mesh.scale.set(3.4 + random() * 3, 2.2 + random() * 1.8, 3 + random() * 2.6);
    cloudSpinner.add(mesh);
    return mesh;
  });
  /** Clouds around the camera, in its own frame. Each flies from the distance past the lens, dissolving in and out through halftone dots. */
  const nearClouds = Array.from({ length: NEAR_CLOUDS }, (_, k) => {
    const material = cloudMaterial(1, 0), ink = cloudInk({ dissolve: material.uniforms.fade });
    const mesh = inked(new THREE.Mesh(bigClouds[k % bigClouds.length], material), ink);
    const left = k % 2 ? 1 : -1, low = k % 4 !== 3; // mostly a deck below and beside us, a few towers higher up
    const c = { mesh, material, x: left * (17 + random() * 30), y: low ? -(11 + random() * 12) : -6 + random() * 9, z: CLOUD_NEAR + (k + random()) / NEAR_CLOUDS * (CLOUD_FAR - CLOUD_NEAR), scale: 3.4 + random() * 4.6, speed: 3.4 + random() * 2 };
    mesh.scale.set(c.scale, c.scale * (0.72 + random() * 0.4), c.scale);
    mesh.rotation.y = random() * Math.PI * 2;
    camera.add(mesh);
    return c;
  });
  const wisps = Array.from({ length: 6 }, () => {
    const sprite = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: library.textures.soft, transparent: true, depthWrite: false, opacity: 0 })));
    const w = { sprite, x: (random() - 0.5) * 44, y: -16 + random() * 14, z: CLOUD_NEAR + random() * 70, speed: 7 + random() * 5, size: 26 + random() * 26 };
    sprite.scale.set(w.size * 1.8, w.size * 0.55, 1);
    camera.add(sprite);
    return w;
  });

  // ---- Ares and Luna: real shaded spheres, fixed in the frame, ready for a planet menu that flies to them.
  const world = (rgb, distance) => {
    const material = own(library.toon(0xffffff));
    material.map = data(rgba(rgb), WORLD_TEX_W, WORLD_TEX_H, true);
    const mesh = inked(new THREE.Mesh(sphere(1, 64, 48), material));
    camera.add(mesh);
    return { mesh, distance };
  };
  const ares = world(buildAresTexture(random), 5200), luna = world(buildLunaTexture(random), 1500);

  // ---- Per-frame state
  let frameId = null, last = null, spin = 0, cloudSpin = 0, clock = 0, disposed = false, sizeKey = '', framing = { y: 0, z: 0 };
  const stats = { limb: 0, nearClouds: 0, globeClouds: 0, tallestCity: 0, ink: 0 };
  const scratch = new THREE.Vector3(), scratch2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  const viewport = () => { const rect = canvas.getBoundingClientRect?.(); return { w: rect?.width || win?.innerWidth || 1280, h: rect?.height || win?.innerHeight || 720 }; };

  function fit(w, h, s) {
    const key = `${w}x${h}:${s.horizonHeight}`;
    if (key === sizeKey) return;
    sizeKey = key;
    const ratio = Math.min(win?.devicePixelRatio || 1, 1.5);
    renderer?.setPixelRatio?.(ratio);
    renderer?.setSize?.(w, h, false);
    sizeInk(library.inkUniforms, w * ratio, h * ratio);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    framing = frameCamera(w, h, s.horizonHeight);
    camera.position.set(0, framing.y, framing.z);
    camera.rotation.set(0, 0, 0);
    const t = Math.tan(FOV * Math.PI / 360);
    const place = ({ mesh, distance }, nx, ny, size) => { mesh.position.set(nx * distance * t * camera.aspect, ny * distance * t, -distance); mesh.scale.setScalar(size * distance * t * camera.aspect); };
    place(luna, 0.76, 0.46, 0.09); // Gaia's moon: big and near. Ares: a small far world.
    place(ares, -0.72, 0.74, 0.03);
    stats.limb = 1 - 2 * s.horizonHeight;
  }

  /** Applies the live settings that need no rebuild. */
  function applySettings(s, w) {
    tilt.rotation.z = -Math.PI / 2 + s.axisTilt * Math.PI / 180;
    spinner.rotation.y = spin * Math.PI / 180;
    cloudSpinner.rotation.y = cloudSpin * Math.PI / 180;
    shared.cloudShift.value = -(cloudSpin - spin) / 360;
    shared.cloudGate.value = 1 - s.cloudCover * 0.58;
    shared.atmosphere.value = s.atmosphere;
    shared.time.value = clock;
    air.visible = s.atmosphere > 0;
    const ratio = renderer?.getPixelRatio?.() ?? 1;
    library.inkUniforms.ink.value = stats.ink = s.outlineWidth * w * ratio / 1280;
    shared.inkPx.value = Math.max(0.8, s.outlineWidth * 0.8);
    for (const hull of outlined) hull.visible = s.outlineWidth > 0;
    stats.tallestCity = 0;
    for (const c of cities) { const k = s.citySize * CITY_UNIT; c.mesh.scale.setScalar(k); stats.tallestCity = Math.max(stats.tallestCity, c.top * k); }
    const show = (list, n) => list.forEach((item, i) => { (item.pivot ?? item).visible = i < n; });
    show(planes, count(s.planes, MAX_PLANES)); show(ships, count(s.boats, MAX_BOATS)); show(satellites, count(s.satellites, MAX_SATELLITES));
    stats.globeClouds = count(s.cloudCover * GLOBE_CLOUDS, GLOBE_CLOUDS);
    stats.nearClouds = count(s.cloudCover * 1.5 * NEAR_CLOUDS, NEAR_CLOUDS);
    show(globeClouds, stats.globeClouds);
    shell.visible = s.cloudCover > 0;
    const aspect = camera.aspect / (16 / 9);
    nearClouds.forEach((c, i) => {
      c.mesh.visible = !focus && i < stats.nearClouds;
      c.mesh.position.set(c.x * Math.max(0.6, aspect), c.y, -c.z);
      c.material.uniforms.fade.value = clamp((CLOUD_FAR - c.z) / 12) * clamp((c.z - CLOUD_NEAR) / 10);
      c.material.uniforms.haze.value = clamp((c.z - 40) / 90) * 0.34;
    });
    wisps.forEach((q, i) => {
      q.sprite.visible = !focus && i < stats.nearClouds;
      q.sprite.position.set(q.x, q.y, -q.z);
      q.sprite.material.opacity = 0.2 * clamp((CLOUD_FAR - q.z) / 20) * clamp((q.z - CLOUD_NEAR) / 14);
    });
  }

  /** Gallery close-ups: hold the camera near one object. */
  function followFocus() {
    if (!focus) return;
    const target = focus === 'ship' ? ships[0]?.body : focus === 'plane' ? planes[0]?.body : cities[0]?.mesh;
    if (!target) return;
    target.updateWorldMatrix(true, false);
    target.getWorldPosition(scratch);
    const out = scratch2.copy(scratch).normalize(), span = focus === 'city' ? 34 : focus === 'ship' ? 11 : 13;
    camera.up.copy(out);
    camera.position.copy(scratch).addScaledVector(out, span * 0.42).add(new THREE.Vector3().crossVectors(out, up).normalize().multiplyScalar(span));
    camera.lookAt(scratch.addScaledVector(out, focus === 'city' ? 6 : 0));
  }

  function draw() {
    const { w, h } = viewport(), s = settings();
    fit(w, h, s);
    applySettings(s, w);
    followFocus();
    renderer?.render?.(scene, camera);
  }

  /** Advances the scene by `dt` seconds and redraws. Exposed so tests and the animation loop share one path. */
  function step(dt) {
    if (disposed) return;
    const s = settings();
    clock += dt;
    if (!reducedMotion) {
      spin = (spin + s.spinSpeed * dt) % 360;
      cloudSpin = (cloudSpin + s.spinSpeed * s.cloudDrift * dt) % 360;
      for (const m of [...planes, ...satellites, ...ships]) m.turn.rotation.y += m.speed * dt;
      for (const c of nearClouds) { c.z -= c.speed * s.cloudDrift * dt; if (c.z < CLOUD_NEAR) c.z += CLOUD_FAR - CLOUD_NEAR; }
      for (const q of wisps) { q.z -= q.speed * s.cloudDrift * dt; if (q.z < CLOUD_NEAR) q.z += CLOUD_FAR - CLOUD_NEAR; }
      luna.mesh.rotation.y += dt * 0.03; ares.mesh.rotation.y += dt * 0.05;
    }
    draw();
  }

  function frame(now) {
    frameId = null;
    if (disposed) return;
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    frameId = win.requestAnimationFrame(frame);
  }

  return {
    /** Draws the first frame and, unless motion is reduced, starts the animation loop. */
    start() {
      if (disposed || frameId !== null) return;
      if (reducedMotion || !win?.requestAnimationFrame) { draw(); win?.addEventListener?.('resize', draw); return; }
      frameId = win.requestAnimationFrame(frame);
    },
    step,
    /** How many planes, ships and satellites the current settings show. */
    get traffic() { const s = settings(); return { planes: count(s.planes, MAX_PLANES), boats: Math.min(count(s.boats, MAX_BOATS), ships.length), satellites: count(s.satellites, MAX_SATELLITES) }; },
    /** What the last frame used: limb height in screen coordinates, clouds shown, tallest skyline in planet units, ink width in pixels. */
    get stats() { return { ...stats, cameraHeight: framing.y }; },
    /** Moving bodies, for checks: world position, forward (nose) and up of each. */
    bodies(kind) {
      scene.updateMatrixWorld(true);
      return ({ planes, ships, satellites })[kind].map(m => {
        const e = m.body.matrixWorld.elements, n = v => { const l = Math.hypot(...v); return v.map(q => q / l); };
        return { position: [e[12], e[13], e[14]], forward: n([e[0], e[1], e[2]]), up: n([e[4], e[5], e[6]]) };
      });
    },
    get cities() { return planet.cities; },
    get spin() { return spin; },
    get land() { return planet.land; },
    get texture() { return planet.rgb; },
    dispose() {
      disposed = true;
      win?.removeEventListener?.('resize', draw);
      if (frameId !== null) win?.cancelAnimationFrame?.(frameId);
      frameId = null;
      for (const resource of owned) resource.dispose?.();
      owned.clear();
      library.dispose();
      renderer?.dispose?.();
    },
  };
}
