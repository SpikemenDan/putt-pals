/**
 * 3D models for the loading-screen sky (VIS-M1): chunky, simple toy shapes for a jet, a ship, a satellite, a balloon, cities, towns,
 * villages, ports, trees, wind turbines, moon bases and cumulus clouds.
 *
 * Every builder returns one BufferGeometry with vertex colours, drawn with the game's own toon material and ink hull (materials.js,
 * outline.js): few, smooth forms and flat colours, so the cel bands and the ink do the detailing. Local axes: +x forward (nose, bow,
 * pier), +y up, +z right. A ship's waterline is y = 0. Original models; `THREE` and randomness are injected.
 */

/** One geometry from many parts [{ geometry, color, at? }], `at` a Matrix4, `color` a hex or THREE.Color. */
export function mergeParts(THREE, parts) {
  const positions = [], normals = [], colors = [];
  for (const { geometry, color, at } of parts) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (at) flat.applyMatrix4(at);
    const c = new THREE.Color(color), p = flat.attributes.position, n = flat.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(c.r, c.g, c.b);
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}

const moved = (THREE, x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
const stretched = (THREE, x, y, z, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

/** A flat plate from an outline of [x, z] points, `thick` tall. */
function plate(THREE, points, thick) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

/** A toy airliner about 6 units long: a fat rounded body, two plain wings, a coloured tail. Nose at +x. */
export function makePlane(THREE) {
  const white = 0xf8f8fc, wing = 0xffd640, pink = 0xff3d6e, glass = 0x2a4a86;
  const parts = [
    { geometry: new THREE.SphereGeometry(1, 20, 14), color: white, at: stretched(THREE, 0, 0, 0, 3.1, 0.68, 0.68) },
    { geometry: new THREE.SphereGeometry(0.34, 12, 10), color: glass, at: stretched(THREE, 2.05, 0.2, 0, 1.2, 0.72, 1.3) },
  ];
  for (const s of [1, -1]) {
    parts.push({ geometry: plate(THREE, [[0.7, 0.4 * s], [-0.5, 3.1 * s], [-1.2, 3.1 * s], [-0.8, 0.4 * s]], 0.16), color: wing, at: moved(THREE, 0, -0.2, 0) });
    parts.push({ geometry: plate(THREE, [[-2.1, 0.2 * s], [-2.7, 1.2 * s], [-3.1, 1.2 * s], [-2.8, 0.2 * s]], 0.12), color: wing, at: moved(THREE, 0, 0.12, 0) });
  }
  const fin = new THREE.ExtrudeGeometry(new THREE.Shape([[-1.9, 0.3], [-2.75, 1.65], [-3.25, 1.65], [-2.95, 0.3]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.16, bevelEnabled: false });
  parts.push({ geometry: fin, color: pink, at: moved(THREE, 0, 0, -0.08) });
  return mergeParts(THREE, parts);
}

/** A toy ship about 8 units long: a pointed hull low in the water, one white cabin, one funnel and a block of cargo. */
export function makeShip(THREE, cargo = 0xffa726) {
  const outline = [[-3.6, -0.9], [1.6, -0.9], [4, 0], [1.6, 0.9], [-3.6, 0.9]];
  return mergeParts(THREE, [
    { geometry: plate(THREE, outline, 1.3), color: 0xd93a4e, at: moved(THREE, 0, -0.55, 0) }, // the part below y = 0 is under the sea
    { geometry: plate(THREE, outline.map(([x, z]) => [x * 0.94, z * 0.86]), 0.12), color: 0xfff1d6, at: moved(THREE, 0, 0.75, 0) },
    { geometry: new THREE.BoxGeometry(1.7, 1.25, 1.35), color: 0xf8f8fc, at: moved(THREE, -2.25, 1.45, 0) },
    { geometry: new THREE.CylinderGeometry(0.34, 0.42, 1, 14), color: 0xffd640, at: moved(THREE, -2.4, 2.5, 0) },
    { geometry: new THREE.BoxGeometry(2.6, 0.95, 1.25), color: cargo, at: moved(THREE, 0.45, 1.3, 0) },
  ]);
}

/** A simple satellite: a gold drum and two blue wings. */
export function makeSatellite(THREE) {
  return mergeParts(THREE, [
    { geometry: new THREE.CylinderGeometry(0.8, 0.8, 1.5, 14), color: 0xffd640 },
    { geometry: new THREE.BoxGeometry(1.5, 0.12, 2.8), color: 0x2e7be0, at: moved(THREE, 0, 0, 2.5) },
    { geometry: new THREE.BoxGeometry(1.5, 0.12, 2.8), color: 0x2e7be0, at: moved(THREE, 0, 0, -2.5) },
  ]);
}

/** A hot-air balloon: a round envelope with one bright band, and a basket. */
export function makeBalloon(THREE, color = 0xff3d6e) {
  return mergeParts(THREE, [
    { geometry: new THREE.SphereGeometry(1.5, 18, 14), color, at: stretched(THREE, 0, 2.3, 0, 1, 1.12, 1) },
    { geometry: new THREE.CylinderGeometry(1.53, 1.3, 0.62, 18), color: 0xffd640, at: moved(THREE, 0, 1.75, 0) },
    { geometry: new THREE.BoxGeometry(0.62, 0.5, 0.62), color: 0x9a6a3c, at: moved(THREE, 0, 0, 0) },
  ]);
}

const BLOCK_COLOURS = [0xfff1d6, 0x8fd3ff, 0xff9d8a, 0xa8ecc5, 0xffdf80, 0xd6c6ff];

/** Tallest building a city can have, in city units (before `loading.citySize`). */
export const CITY_TOP = 21;

/**
 * One city: a dozen big simple towers (blocks, round towers with domes, pointed spires), tall in the middle, about 15 units across, sunk
 * a little so it sits on the curve of the planet. `tint` is the local ground colour [r, g, b], mixed into the walls so a desert city
 * and a forest city each belong to their land.
 */
export function makeCity(THREE, random, tint = [150, 150, 130]) {
  const ground = new THREE.Color(`rgb(${tint.map(q => Math.round(q)).join(',')})`), parts = [];
  const tone = () => new THREE.Color(BLOCK_COLOURS[Math.floor(random() * BLOCK_COLOURS.length)]).lerp(ground, 0.14);
  let top = 0;
  for (let k = 0; k < 13; k++) {
    const a = k * 2.4 + random(), dist = k === 0 ? 0 : 0.28 + 0.72 * Math.sqrt(k / 13), x = Math.cos(a) * dist * 6.4, z = Math.sin(a) * dist * 6.4, core = (1 - dist) ** 1.5;
    const h = 3.4 + random() * 2.4 + core * (12 + random() * 3), w = 1.7 + random() * 1 + core * 0.5, c = tone(), kind = k === 0 ? 2 : Math.floor(random() * 3), base = -3, mid = (h + base) / 2, tall = h - base;
    if (kind === 0) { // block with a flat cap
      parts.push({ geometry: new THREE.BoxGeometry(w, tall, w), color: c, at: moved(THREE, x, mid, z) });
      parts.push({ geometry: new THREE.BoxGeometry(w * 0.68, 0.7, w * 0.68), color: tone(), at: moved(THREE, x, h + 0.35, z) });
      top = Math.max(top, h + 0.7);
    } else if (kind === 1) { // round tower with a dome
      parts.push({ geometry: new THREE.CylinderGeometry(w * 0.56, w * 0.6, tall, 16), color: c, at: moved(THREE, x, mid, z) });
      parts.push({ geometry: new THREE.SphereGeometry(w * 0.56, 16, 10), color: tone(), at: stretched(THREE, x, h, z, 1, 0.8, 1) });
      top = Math.max(top, h + w * 0.45);
    } else { // tapered tower with a spire
      parts.push({ geometry: new THREE.CylinderGeometry(w * 0.38, w * 0.66, tall, 10), color: c, at: moved(THREE, x, mid, z) });
      parts.push({ geometry: new THREE.ConeGeometry(w * 0.38, 2.6, 10), color: 0xff6f7d, at: moved(THREE, x, h + 1.3, z) });
      top = Math.max(top, h + 2.6);
    }
  }
  const g = mergeParts(THREE, parts);
  g.userData.top = top;
  return g;
}

const house = (THREE, x, z, yaw, wall, roof, s = 1) => [
  { geometry: new THREE.BoxGeometry(1.5 * s, 2.4 * s, 1.5 * s), color: wall, at: moved(THREE, x, 0.3 * s - 0.2, z, 0, yaw) },
  { geometry: new THREE.ConeGeometry(1.32 * s, 1.1 * s, 4), color: roof, at: moved(THREE, x, 2 * s - 0.2, z, 0, yaw + Math.PI / 4) },
];

/** A town: a ring of red-roofed houses around a church. About 8 units across. */
export function makeTown(THREE, random) {
  const parts = [
    { geometry: new THREE.BoxGeometry(1.5, 6, 1.5), color: 0xfff1d6, at: moved(THREE, 0, 1.6, 0) },
    { geometry: new THREE.ConeGeometry(1.2, 2.2, 4), color: 0x4d6fd6, at: moved(THREE, 0, 5.7, 0, 0, Math.PI / 4) },
  ];
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + random() * 0.4, r = 2.3 + random() * 1.8; parts.push(...house(THREE, Math.cos(a) * r, Math.sin(a) * r, random() * 3, BLOCK_COLOURS[k % 5], k % 3 ? 0xe2554a : 0xc9772e, 0.8 + random() * 0.35)); }
  return mergeParts(THREE, parts);
}

/** A village: a few round thatched huts. */
export function makeVillage(THREE, random) {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2 + random(), x = Math.cos(a) * 1.7, z = Math.sin(a) * 1.7;
    parts.push({ geometry: new THREE.CylinderGeometry(0.72, 0.8, 1.9, 12), color: 0xf6dfb4, at: moved(THREE, x, 0.1, z) });
    parts.push({ geometry: new THREE.ConeGeometry(1.08, 1.05, 12), color: 0xd9a03f, at: moved(THREE, x, 1.5, z) });
  }
  return mergeParts(THREE, parts);
}

/** A port on the shore, facing +x: a long pier, a warehouse, a crane, stacked boxes and a striped lighthouse. */
export function makePort(THREE) {
  return mergeParts(THREE, [
    { geometry: new THREE.BoxGeometry(9, 1.5, 1.7), color: 0xc9a06a, at: moved(THREE, 4.2, -0.2, 0) },
    { geometry: new THREE.BoxGeometry(3.4, 2.6, 2.8), color: 0x8fd3ff, at: moved(THREE, -1.8, 0.6, 2.6) },
    { geometry: new THREE.BoxGeometry(3.6, 0.5, 3), color: 0xe2554a, at: moved(THREE, -1.8, 2.1, 2.6) },
    { geometry: new THREE.BoxGeometry(0.6, 5.4, 0.6), color: 0xffd640, at: moved(THREE, 3.2, 2.2, -1.2) },
    { geometry: new THREE.BoxGeometry(5, 0.5, 0.5), color: 0xffd640, at: moved(THREE, 4.2, 4.8, -1.2) },
    { geometry: new THREE.BoxGeometry(1.2, 0.8, 0.9), color: 0xff3d6e, at: moved(THREE, 5.6, 0.95, 0) },
    { geometry: new THREE.BoxGeometry(1.2, 0.8, 0.9), color: 0x2fbf5b, at: moved(THREE, 4.1, 0.95, 0.1) },
    { geometry: new THREE.CylinderGeometry(0.6, 0.85, 3, 14), color: 0xf8f8fc, at: moved(THREE, -2, 0.9, -2.6) },
    { geometry: new THREE.CylinderGeometry(0.66, 0.72, 1, 14), color: 0xe2554a, at: moved(THREE, -2, 1.4, -2.6) },
    { geometry: new THREE.ConeGeometry(0.72, 0.9, 14), color: 0xe2554a, at: moved(THREE, -2, 3.3, -2.6) },
  ]);
}

/** A round storybook tree: trunk and crown. Tinted per tree by the instance colour, so it stays white here. */
export function makeTree(THREE) {
  return mergeParts(THREE, [
    { geometry: new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), color: 0xb9925f, at: moved(THREE, 0, 0.2, 0) },
    { geometry: new THREE.IcosahedronGeometry(0.85, 1), color: 0xffffff, at: stretched(THREE, 0, 1.4, 0, 1, 1.25, 1) },
  ]);
}

/** A wind turbine mast; `makeTurbineBlades` turns on top of it, at `TURBINE_HUB`. */
export const TURBINE_HUB = 6;
export function makeTurbine(THREE) {
  return mergeParts(THREE, [{ geometry: new THREE.CylinderGeometry(0.14, 0.3, 7, 8), color: 0xf8f8fc, at: moved(THREE, 0, 2.5, 0) }]);
}
export function makeTurbineBlades(THREE) {
  return mergeParts(THREE, [0, 1, 2].map(k => ({ geometry: new THREE.BoxGeometry(0.1, 2.7, 0.32).translate(0, 1.35, 0), color: 0xf8f8fc, at: moved(THREE, 0.3, 0, 0, k * Math.PI * 2 / 3) })));
}

/** A small base: glass domes joined to a low hall, with a beacon. Sits on +y. */
export function makeBase(THREE, dome = 0x8fe6ff) {
  return mergeParts(THREE, [
    { geometry: new THREE.SphereGeometry(1, 14, 10), color: dome, at: stretched(THREE, -1, 0, 0, 1, 0.8, 1) },
    { geometry: new THREE.SphereGeometry(0.72, 14, 10), color: dome, at: stretched(THREE, 1.2, 0, 0.5, 1, 0.8, 1) },
    { geometry: new THREE.BoxGeometry(2.5, 0.5, 0.7), color: 0xe8ecf5, at: moved(THREE, 0.1, 0.2, 0.2) },
    { geometry: new THREE.CylinderGeometry(0.06, 0.06, 1.7, 6), color: 0xe8ecf5, at: moved(THREE, 0.2, 0.9, -0.5) },
    { geometry: new THREE.SphereGeometry(0.16, 8, 6), color: 0xff3d6e, at: moved(THREE, 0.2, 1.75, -0.5) },
  ]);
}

/**
 * A cumulus: many displaced lobes piled into a flat-bottomed dome, about 2 x `stretch` wide and 2 tall. Each vertex keeps its lobe's
 * normal plus a `soft` normal from the whole cloud and an `ao` term (dark underneath): lit together they make one big volume with
 * billowing detail rather than a heap of separate balls.
 */
export function makeCumulus(THREE, random, { puffs = 18, detail = 2, stretch = 2.2 } = {}) {
  const lobes = [];
  for (let k = 0; k < puffs; k++) {
    const t = (k + 0.5) / puffs * 2 - 1 + (random() - 0.5) * 0.18, dome = Math.max(0, 1 - t * t), r = 0.3 + 0.42 * dome * (0.6 + 0.7 * random());
    lobes.push([t * stretch * 0.88, r * 0.5 + dome * 0.62 * random(), (random() - 0.5) * 1.2 * (0.35 + dome), r]);
  }
  for (let k = 0; k < puffs / 3; k++) { // a crown of smaller billows on top
    const t = (random() - 0.5) * 1.3, dome = 1 - t * t, r = 0.2 + 0.2 * random();
    lobes.push([t * stretch * 0.6, 0.72 + dome * 0.62, (random() - 0.5) * 0.7, r]);
  }
  const ball = new THREE.IcosahedronGeometry(1, detail), p = ball.attributes.position, position = [], normal = [], soft = [], ao = [];
  lobes.forEach(([x, y, z, r], index) => {
    const s = index * 1.7 + 0.3;
    for (let i = 0; i < p.count; i++) {
      const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i), bump = 1 + 0.13 * Math.sin(nx * 4.7 + s) * Math.sin(ny * 3.9 + s * 2.1) + 0.07 * Math.sin(nz * 8.3 + s) * Math.sin(nx * 7.1 - s);
      const px = x + nx * r * bump, pz = z + nz * r * bump;
      let py = y + ny * r * bump;
      if (py < 0) py *= 0.16; // flat base
      position.push(px, py, pz); normal.push(nx, ny, nz);
      const l = Math.hypot(px / stretch, py - 0.3, pz) || 1;
      soft.push(px / stretch / l, (py - 0.3) / l, pz / l);
      ao.push(Math.min(1, Math.max(0, 0.22 + py / 1.15)));
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('soft', new THREE.Float32BufferAttribute(soft, 3));
  g.setAttribute('ao', new THREE.Float32BufferAttribute(ao, 1));
  return g;
}
