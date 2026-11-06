/**
 * The loading-screen sky (VIS-M1): the view from high in Gaia's atmosphere, with the planet's curved horizon, banks of cumulus sailing
 * round the globe, and a living world below: cities, towns, villages, ports, forests, wind farms, ships, airliners, balloons and
 * satellites. Beyond it, a night sky of stars, clusters and two faint galaxies, a rare shooting star, Luna at its true distance and Ares
 * far away, each with polar ice, signs of life and one tiny base.
 *
 * One Three.js scene, one sun, the game's own toon material and ink hulls (materials.js, outline.js), so everything shares the look of
 * the courses. The camera never moves: the planet turns under it and the clouds circle with it, west to east, so nothing flies at the
 * lens. Reads the live `display.loading` settings each frame (src/shared/display.js). With `reducedMotion` it draws one still frame.
 * Presentation only: no simulation, no React. `THREE`, randomness and the WebGL renderer are injected.
 */

import { createMaterialLibrary } from './materials.js';
import { createInkMaterial, sizeInk, smoothHullGeometry } from './outline.js';
import { ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX, CLOUD_FRAGMENT, CLOUD_SHELL_FRAGMENT, CLOUD_VERTEX, CONTRAIL_FRAGMENT, GALAXY_FRAGMENT, GALAXY_VERTEX, PLANET_FRAGMENT, SPHERE_VERTEX, STAR_FRAGMENT, STAR_VERTEX, STREAK_FRAGMENT, STREAK_VERTEX, TRAIL_VERTEX, WAKE_FRAGMENT } from './planet-shaders.js';
import { MAX_BOATS, MAX_PLANES, MAX_SATELLITES, TEX_H, TEX_W, buildPlanet, flightRoutes, shipRoutes, surfaceDir } from './planet-data.js';
import { TURBINE_HUB, makeBalloon, makeBase, makeCity, makeCumulus, makePlane, makePort, makeSatellite, makeShip, makeTown, makeTree, makeTurbine, makeTurbineBlades, makeVillage } from './sky-models.js';
import { buildAresTexture, buildLunaTexture, WORLD_TEX_H, WORLD_TEX_W } from './worlds.js';

export const PLANET_RADIUS = 100;
/** Real distances and sizes in Earth radii, at this planet's radius: the Moon is 60 away and 0.27 across. */
export const LUNA_DISTANCE = 60 * PLANET_RADIUS, LUNA_RADIUS = 0.27 * PLANET_RADIUS;
const ARES_DISTANCE = 24000, ARES_SHARE = 0.0042; // Ares shows as a small far disc: its radius as a share of the screen height
const FOV = 32, SUN = [-0.55, 0.62, 0.56], CITY_UNIT = 0.62, AXIS_LEAN = 30 * Math.PI / 180;
const DECK_CLOUDS = 44, GLOBE_CLOUDS = 40, CLOUD_INK = 'vec3(.2,.26,.52)';
const SHOOTING_GAP = [35, 110]; // seconds between shooting stars

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
 * @param {'city'|'port'|'town'|'ship'|'plane'|'luna'|'ares'|null} [options.focus] preview gallery: look closely at one object
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
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 1, 60000);
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

  // ---- Planet: the axis stands up, leaning a little away from us, so the world turns west to east and the far land stays on the horizon.
  const tilt = new THREE.Group(), spinner = new THREE.Group(), cloudSpinner = new THREE.Group(), deck = new THREE.Group();
  tilt.add(spinner, cloudSpinner, deck);
  tilt.rotation.x = -AXIS_LEAN;
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
  const yAxis = new THREE.Vector3(0, 1, 0);
  const standUp = (object, dir) => { object.quaternion.setFromUnitVectors(yAxis, new THREE.Vector3(...dir)); return object; };
  const painted = own(library.toon(0xffffff));
  painted.vertexColors = true;

  // ---- Settlements. A few shapes per kind, reused with a turn, so no two neighbours match.
  const pick = (list, k) => list[k % list.length];
  const settle = (site, geometry, parent = spinner) => {
    const dir = surfaceDir(site.u, site.lat), mesh = inked(new THREE.Mesh(geometry, painted));
    mesh.position.set(...dir).multiplyScalar(PLANET_RADIUS);
    standUp(mesh, dir).rotateY(random() * Math.PI * 2);
    parent.add(mesh);
    return { mesh, dir, top: geometry.userData.top ?? 0 };
  };
  const cityShapes = new Map();
  const cityFor = tint => {
    const key = tint.map(q => Math.round(q / 64)).join();
    if (!cityShapes.has(key)) cityShapes.set(key, own(makeCity(THREE, random, tint)));
    return cityShapes.get(key);
  };
  const cities = planet.cities.map(c => settle(c, cityFor(c.tint)));
  const townShapes = [0, 1, 2].map(() => own(makeTown(THREE, random))), villageShapes = [0, 1].map(() => own(makeVillage(THREE, random)));
  const towns = planet.towns.map((c, k) => settle(c, pick(townShapes, k)));
  const villages = planet.villages.map((c, k) => settle(c, pick(villageShapes, k)));
  const portShape = own(makePort(THREE)), beaconMaterial = own(new THREE.MeshBasicMaterial({ color: 0xffe066 })), beaconShape = sphere(0.5, 10, 8);
  const ports = planet.ports.map(p => {
    const place = settle(p, portShape), up = new THREE.Vector3(...place.dir), out = new THREE.Vector3(...p.sea).sub(up);
    out.addScaledVector(up, -out.dot(up)).normalize(); // the pier points out to sea
    place.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(out, up, new THREE.Vector3().crossVectors(out, up)));
    const beacon = new THREE.Mesh(beaconShape, beaconMaterial);
    beacon.position.set(-2, 3.2, -2.6);
    place.mesh.add(beacon);
    return { ...place, beacon, phase: random() * 6 };
  });
  const places = [...cities, ...towns, ...villages, ...ports];

  // ---- Forests: instanced trees, far too many for separate meshes, tinted by their climate.
  const treeShape = own(makeTree(THREE));
  const trees = new THREE.InstancedMesh(treeShape, painted, planet.forests.length);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    planet.forests.forEach((f, i) => {
      const dir = surfaceDir(f.u, f.lat), size = 0.7 + random() * 0.6;
      m.compose(p.set(...dir).multiplyScalar(PLANET_RADIUS - 0.1), q.setFromUnitVectors(yAxis, new THREE.Vector3(...dir)), s.set(size, size, size));
      trees.setMatrixAt(i, m);
      trees.setColorAt(i, c.setRGB(...f.tint.map(v => v / 255), THREE.SRGBColorSpace));
    });
  }
  spinner.add(trees);

  // ---- Wind turbines beside some towns: the only things on the ground that move by themselves.
  const mastShape = own(makeTurbine(THREE)), bladeShape = own(makeTurbineBlades(THREE));
  const turbines = planet.towns.filter((_, k) => k % 3 === 0).map(site => {
    const near = { u: site.u + 0.006, lat: site.lat + 1.1 }, place = settle(near, mastShape), blades = inked(new THREE.Mesh(bladeShape, painted));
    blades.position.y = TURBINE_HUB;
    place.mesh.add(blades);
    return { ...place, blades, speed: 1.1 + random() * 1.4 };
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
  const shipShapes = [0xffa726, 0x2fbf5b, 0x36a2ff].map(c => own(makeShip(THREE, c)));
  const ships = shipRoutes(planet, random).slice(0, MAX_BOATS).map((route, k) => {
    const body = inked(new THREE.Mesh(pick(shipShapes, k), painted));
    body.scale.setScalar(0.9);
    body.add(new THREE.Mesh(wakeGeometry, wakeMaterial));
    return rig(spinner, route, PLANET_RADIUS, body, random() * Math.PI * 2);
  });

  // ---- Planes, satellites and balloons: their orbits do not turn with the planet.
  const viewSide = new THREE.Vector3(0, 0.7, 0.72).normalize();
  const planeGeometry = own(makePlane(THREE)), satelliteGeometry = own(makeSatellite(THREE));
  const contrailMaterial = own(new THREE.ShaderMaterial({ vertexShader: TRAIL_VERTEX, fragmentShader: CONTRAIL_FRAGMENT, transparent: true, depthWrite: false }));
  /** A thin tube bending back along the orbit behind the plane, in the orbit's own frame, so it curves round the planet. */
  const contrail = (radius, sign) => {
    const position = [], trail = [], index = [], rows = 26, ring = 6;
    for (let i = 0; i <= rows; i++) for (let j = 0; j < ring; j++) {
      const f = i / rows, a = sign * (0.02 + f * 0.3), w = 0.3 + f * 0.6, q = j / ring * Math.PI * 2, r = radius + Math.cos(q) * w;
      position.push(Math.cos(a) * r, Math.sin(q) * w, Math.sin(a) * r); trail.push(f, 0);
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring; index.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('trail', new THREE.Float32BufferAttribute(trail, 2));
    g.setIndex(index);
    return new THREE.Mesh(own(g), contrailMaterial);
  };
  const planes = flightRoutes(MAX_PLANES, random, viewSide.toArray()).map(route => {
    const body = inked(new THREE.Mesh(planeGeometry, painted)), radius = PLANET_RADIUS + 10 + random() * 6;
    body.scale.setScalar(1.25);
    const r = rig(scene, route, radius, body, random() * Math.PI * 2);
    r.turn.add(contrail(radius - 0.2, r.sign));
    return r;
  });
  const satellites = flightRoutes(MAX_SATELLITES, random, viewSide.toArray()).map(route => {
    const body = inked(new THREE.Mesh(satelliteGeometry, painted));
    body.scale.setScalar(1.3);
    return rig(scene, { ...route, speed: route.speed * 0.5 }, PLANET_RADIUS * (1.28 + random() * 0.2), body, random() * Math.PI * 2);
  });
  const balloonShapes = [0xff3d6e, 0x36a2ff, 0x2fbf5b].map(c => own(makeBalloon(THREE, c)));
  const balloons = flightRoutes(7, random, viewSide.toArray()).map((route, k) => {
    const body = inked(new THREE.Mesh(pick(balloonShapes, k), painted));
    return rig(spinner, { ...route, speed: route.speed * 0.12 }, PLANET_RADIUS + 6 + random() * 3, body, random() * Math.PI * 2);
  });

  // ---- Clouds circle the globe. One shader for all of them: small piles among the cloud layer, and a high deck of big cumulus that
  // passes between the camera and the ground, so the view sits inside the atmosphere.
  const cloudMaterial = haze => own(new THREE.ShaderMaterial({ vertexShader: CLOUD_VERTEX, fragmentShader: CLOUD_FRAGMENT, uniforms: { sun: shared.sun, dotCell: shared.dotCell, haze: { value: haze } } }));
  /** Cloud ink sits a little behind the cloud in depth (no shift on screen), so it draws the silhouette and not every lobe. */
  const cloudInk = Object.assign(own(createInkMaterial(THREE, library.inkUniforms, { color: CLOUD_INK })), { polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 600 });
  const bigClouds = Array.from({ length: 5 }, () => own(makeCumulus(THREE, random, { puffs: 16, detail: 4 })));
  const smallClouds = Array.from({ length: 3 }, () => own(makeCumulus(THREE, random, { puffs: 9, detail: 2 })));
  const globeMaterial = cloudMaterial(0.08), deckMaterial = cloudMaterial(0);
  const denseSpots = [];
  for (let tries = 0; tries < 3000 && denseSpots.length < GLOBE_CLOUDS; tries++) {
    const x = Math.floor(random() * TEX_W), y = Math.floor((0.08 + random() * 0.84) * TEX_H);
    if (planet.cloud[y * TEX_W + x] > 140) denseSpots.push(surfaceDir(x / TEX_W, (0.5 - (y + 0.5) / TEX_H) * 180));
  }
  const globeClouds = denseSpots.map((dir, k) => {
    const mesh = inked(new THREE.Mesh(pick(smallClouds, k), globeMaterial), cloudInk);
    mesh.position.set(...dir).multiplyScalar(PLANET_RADIUS + 2.4);
    standUp(mesh, dir).rotateY(random() * Math.PI * 2);
    mesh.scale.set(3.4 + random() * 3, 2.2 + random() * 1.8, 3 + random() * 2.6);
    cloudSpinner.add(mesh);
    return mesh;
  });
  const deckClouds = Array.from({ length: DECK_CLOUDS }, (_, k) => {
    const u = (k + random() * 0.7) / DECK_CLOUDS, lat = -52 + random() * 78, altitude = 14 + random() * (lat < -12 ? 36 : 8), dir = surfaceDir(u, lat); // the band of sky the camera looks through
    const mesh = inked(new THREE.Mesh(pick(bigClouds, k), deckMaterial), cloudInk), size = 7 + random() * 9;
    mesh.position.set(...dir).multiplyScalar(PLANET_RADIUS + altitude);
    standUp(mesh, dir).rotateY(Math.PI / 2 + (random() - 0.5) * 0.7);
    mesh.scale.set(size * 1.25, size * (0.75 + random() * 0.35), size);
    deck.add(mesh);
    return mesh;
  });

  // ---- The night sky, drawn far behind everything in the camera's frame.
  const sky = new THREE.Group();
  camera.add(sky);
  const skyDistance = 50000, skyT = Math.tan(FOV * Math.PI / 360) * skyDistance;
  const starMaterial = own(new THREE.ShaderMaterial({ vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT, transparent: true, premultipliedAlpha: true, depthWrite: false, uniforms: { time: shared.time, pixel: { value: 1 } } }));
  {
    const position = [], size = [], tone = [], phase = [];
    const tints = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.9, 0.72], [1, 0.76, 0.66], [0.76, 0.82, 1]];
    const star = (x, y, s) => { position.push(x * skyT * 2.6, y * skyT, -skyDistance); size.push(s); tone.push(...tints[Math.floor(random() * tints.length)]); phase.push(random()); };
    for (let k = 0; k < 900; k++) { const b = random(); star(random() * 2 - 1, random() * 1.3 - 0.3, 1 + b * b * b * 2.6); }
    for (const [cx, cy, n, spread] of [[-0.22, 0.72, 90, 0.05], [0.26, 0.6, 70, 0.04], [0.1, 0.9, 60, 0.03]]) { // star clusters
      for (let k = 0; k < n; k++) { const r = spread * Math.sqrt(-2 * Math.log(1 - random() * 0.99)), a = random() * Math.PI * 2; star(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r, 0.9 + random() * 1.2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute('tone', new THREE.Float32BufferAttribute(tone, 3));
    g.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
    const stars = new THREE.Points(own(g), starMaterial);
    stars.frustumCulled = false;
    sky.add(stars);
  }
  const galaxy = (x, y, size, roll, lean, tone) => {
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.ShaderMaterial({ vertexShader: GALAXY_VERTEX, fragmentShader: GALAXY_FRAGMENT, transparent: true, premultipliedAlpha: true, depthWrite: false, uniforms: { tone: { value: new THREE.Color(...tone) }, strength: { value: 0.5 } } })));
    mesh.position.set(x * skyT * 1.78, y * skyT, -skyDistance * 0.98);
    mesh.rotation.set(lean, 0, roll);
    mesh.scale.setScalar(size * skyT);
    sky.add(mesh);
  };
  galaxy(0.5, 0.86, 0.075, 0.6, 0.9, [0.72, 0.78, 1]);
  galaxy(-0.46, 0.5, 0.05, -0.8, 1.1, [1, 0.8, 0.9]);
  const streak = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.ShaderMaterial({ vertexShader: STREAK_VERTEX, fragmentShader: STREAK_FRAGMENT, transparent: true, premultipliedAlpha: true, depthWrite: false, uniforms: { life: { value: 0 } } })));
  streak.visible = false;
  sky.add(streak);
  let nextStreak = SHOOTING_GAP[0] + random() * (SHOOTING_GAP[1] - SHOOTING_GAP[0]), streakAge = -1, streakCount = 0;
  const streakPath = { x: 0, y: 0, dx: 0, dy: 0 };

  // ---- Luna and Ares, real spheres in the scene, each with its ice, its signs of life and one tiny base.
  const world = (rgb, distance, opacity = 1) => {
    const material = own(library.toon(0xffffff, opacity < 1 ? { transparent: true, opacity } : {}));
    material.map = data(rgba(rgb), WORLD_TEX_W, WORLD_TEX_H, true);
    const mesh = new THREE.Mesh(sphere(1, 64, 48), material);
    scene.add(mesh);
    return { mesh, distance };
  };
  const ares = world(buildAresTexture(random), ARES_DISTANCE, 0.78), luna = world(buildLunaTexture(random), LUNA_DISTANCE);
  inked(luna.mesh);
  const baseOn = ({ mesh }, dir, size, dome) => {
    const base = new THREE.Mesh(own(makeBase(THREE, dome)), painted), d = new THREE.Vector3(...dir).normalize();
    base.position.copy(d);
    base.quaternion.setFromUnitVectors(yAxis, d);
    base.scale.setScalar(size);
    mesh.add(base);
  };
  baseOn(luna, [-0.45, 0.42, 0.79], 0.034, 0x8fe6ff); // on the side facing Gaia: barely visible
  baseOn(ares, [-0.3, 0.3, 0.9], 0.012, 0xa8ffcc); // far tinier still

  // ---- Per-frame state
  let frameId = null, last = null, spin = 0, cloudSpin = 0, clock = 0, disposed = false, sizeKey = '', framing = { y: 0, z: 0 };
  const stats = { limb: 0, deckClouds: 0, globeClouds: 0, tallestCity: 0, ink: 0, lunaPixels: 0 };
  const scratch = new THREE.Vector3(), scratch2 = new THREE.Vector3();

  const viewport = () => { const rect = canvas.getBoundingClientRect?.(); return { w: rect?.width || win?.innerWidth || 1280, h: rect?.height || win?.innerHeight || 720 }; };

  function fit(w, h, s) {
    const key = `${w}x${h}:${s.horizonHeight}:${s.lunaSize}`;
    if (key === sizeKey) return;
    sizeKey = key;
    const ratio = Math.min(win?.devicePixelRatio || 1, 1.5);
    renderer?.setPixelRatio?.(ratio);
    renderer?.setSize?.(w, h, false);
    sizeInk(library.inkUniforms, w * ratio, h * ratio);
    starMaterial.uniforms.pixel.value = ratio * Math.max(1, h / 720);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    framing = frameCamera(w, h, s.horizonHeight);
    camera.position.set(0, framing.y, framing.z);
    camera.rotation.set(0, 0, 0);
    const t = Math.tan(FOV * Math.PI / 360);
    const place = ({ mesh, distance }, nx, ny, radius) => { mesh.position.set(nx * distance * t * camera.aspect, framing.y + ny * distance * t, framing.z - distance); mesh.scale.setScalar(radius); };
    place(luna, 0.7, 0.62, LUNA_RADIUS * s.lunaSize);
    place(ares, -0.6, 0.8, ARES_SHARE * ARES_DISTANCE * t * 2);
    stats.lunaPixels = LUNA_RADIUS * s.lunaSize / (LUNA_DISTANCE * t) * h;
    stats.limb = 1 - 2 * s.horizonHeight;
  }

  /** Applies the live settings that need no rebuild. */
  function applySettings(s, w) {
    tilt.rotation.z = -s.axisTilt * Math.PI / 180;
    spinner.rotation.y = spin * Math.PI / 180;
    cloudSpinner.rotation.y = cloudSpin * Math.PI / 180;
    deck.rotation.y = cloudSpin * 0.8 * Math.PI / 180;
    shared.cloudShift.value = -(cloudSpin - spin) / 360;
    shared.cloudGate.value = 0.96 - s.cloudCover * 0.58;
    shared.atmosphere.value = s.atmosphere;
    shared.time.value = clock;
    air.visible = s.atmosphere > 0;
    const ratio = renderer?.getPixelRatio?.() ?? 1;
    library.inkUniforms.ink.value = stats.ink = s.outlineWidth * w * ratio / 1280;
    shared.inkPx.value = Math.max(0.8, s.outlineWidth * 0.8);
    for (const hull of outlined) hull.visible = s.outlineWidth > 0;
    stats.tallestCity = 0;
    const k = s.citySize * CITY_UNIT;
    for (const c of places) c.mesh.scale.setScalar(k);
    for (const c of turbines) c.mesh.scale.setScalar(k);
    for (const c of cities) stats.tallestCity = Math.max(stats.tallestCity, c.top * k);
    for (const p of ports) p.beacon.visible = Math.sin(clock * 2.2 + p.phase) > 0.2;
    const show = (list, n) => list.forEach((item, i) => { (item.pivot ?? item).visible = i < n; });
    show(planes, count(s.planes, MAX_PLANES)); show(ships, count(s.boats, MAX_BOATS)); show(satellites, count(s.satellites, MAX_SATELLITES));
    stats.globeClouds = count(s.cloudCover * GLOBE_CLOUDS, GLOBE_CLOUDS);
    stats.deckClouds = count(s.cloudCover * 1.6 * DECK_CLOUDS, DECK_CLOUDS);
    show(globeClouds, stats.globeClouds);
    show(deckClouds, focus ? 0 : stats.deckClouds);
    shell.visible = s.cloudCover > 0;
  }

  /** Gallery close-ups: hold the camera near one object. */
  function followFocus() {
    if (!focus) return;
    if (focus === 'luna' || focus === 'ares') {
      const { mesh } = focus === 'luna' ? luna : ares, r = mesh.scale.x;
      mesh.getWorldPosition(scratch);
      camera.up.set(0, 1, 0);
      camera.position.copy(scratch).add(new THREE.Vector3(-0.3, 0.3, 0.9).normalize().multiplyScalar(r * 3.4));
      camera.lookAt(scratch);
      return;
    }
    const pool = { ship: ships.map(m => m.body), plane: planes.map(m => m.body), port: ports.map(m => m.mesh), town: towns.map(m => m.mesh), city: cities.map(m => m.mesh) }[focus];
    const target = pool?.[0];
    if (!target) return;
    target.updateWorldMatrix(true, false);
    target.getWorldPosition(scratch);
    const out = scratch2.copy(scratch).normalize(), span = { city: 34, ship: 13, plane: 15, port: 15, town: 12 }[focus];
    camera.up.copy(out);
    camera.position.copy(scratch).addScaledVector(out, span * 0.42).add(new THREE.Vector3().crossVectors(out, yAxis).normalize().multiplyScalar(span));
    camera.lookAt(scratch.addScaledVector(out, focus === 'city' ? 6 : 0));
  }

  function draw() {
    const { w, h } = viewport(), s = settings();
    fit(w, h, s);
    applySettings(s, w);
    followFocus();
    renderer?.render?.(scene, camera);
  }

  /** A rare shooting star: waits a long random while, then crosses part of the upper sky in about a second. */
  function stepStreak(dt) {
    if (streakAge < 0) {
      nextStreak -= dt;
      if (nextStreak > 0) return;
      streakAge = 0; streakCount++;
      const a = Math.PI + 0.2 + random() * 0.5;
      Object.assign(streakPath, { x: (random() - 0.2) * 1.2, y: 0.5 + random() * 0.45, dx: Math.cos(a) * 0.9, dy: Math.sin(a) * 0.9 });
      streak.rotation.z = a + Math.PI;
      streak.scale.set(skyT * 0.26, skyT * 0.006, 1);
      streak.visible = true;
    }
    streakAge += dt;
    const life = streakAge / 1.1;
    streak.material.uniforms.life.value = Math.min(1, life);
    streak.position.set((streakPath.x + streakPath.dx * life) * skyT * 1.78, (streakPath.y + streakPath.dy * life) * skyT, -skyDistance * 0.97);
    if (life >= 1) { streak.visible = false; streakAge = -1; nextStreak = SHOOTING_GAP[0] + random() * (SHOOTING_GAP[1] - SHOOTING_GAP[0]); }
  }

  /** Advances the scene by `dt` seconds and redraws. Exposed so tests and the animation loop share one path. */
  function step(dt) {
    if (disposed) return;
    const s = settings();
    clock += dt;
    if (!reducedMotion) {
      spin = (spin + s.spinSpeed * dt) % 360;
      cloudSpin = (cloudSpin + s.spinSpeed * s.cloudDrift * dt) % 360;
      for (const m of [...planes, ...satellites, ...ships, ...balloons]) m.turn.rotation.y += m.speed * dt;
      for (const t of turbines) t.blades.rotation.x += t.speed * dt;
      luna.mesh.rotation.y += dt * 0.01;
      stepStreak(dt);
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
    /** What the last frame used, for checks. */
    get stats() { return { ...stats, cameraHeight: framing.y, shootingStars: streakCount, places: { cities: cities.length, towns: towns.length, villages: villages.length, ports: ports.length, trees: planet.forests.length, turbines: turbines.length, balloons: balloons.length } }; },
    /** Camera position: it never moves during a load. */
    get cameraPosition() { return camera.position.toArray(); },
    /** World positions of the clouds in the high deck. */
    get deck() { scene.updateMatrixWorld(true); return deckClouds.map(m => m.getWorldPosition(new THREE.Vector3()).toArray()); },
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
      trees.dispose();
      library.dispose();
      renderer?.dispose?.();
    },
  };
}
