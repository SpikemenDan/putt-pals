/**
 * 3D models for the loading-screen sky (VIS-M1): a jet, a cargo ship, a satellite, city blocks and cumulus clouds.
 *
 * Every builder returns one BufferGeometry with vertex colours, drawn with the game's own toon material and ink hull (materials.js,
 * outline.js), so these share the look of the courses. Local axes: +x forward (nose, bow), +y up, +z right. A ship's waterline is
 * y = 0. Original models; `THREE` and randomness are injected.
 */

const col = (THREE, hex) => new THREE.Color(hex);

/** One geometry from many parts [{ geometry, color, at? }], `at` a Matrix4. Keeps position, normal and a colour per vertex. */
export function mergeParts(THREE, parts) {
  const positions = [], normals = [], colors = [];
  for (const { geometry, color, at } of parts) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (at) flat.applyMatrix4(at);
    const c = col(THREE, color), p = flat.attributes.position, n = flat.attributes.normal;
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

/** An airliner about 6.6 units long: rounded fuselage, swept wings with engines under them, a coloured tail. Nose at +x. */
export function makePlane(THREE) {
  const white = 0xf5f6fb, belly = 0xc8d0e0, wing = 0xb9c4d8, pink = 0xff3d6e, yellow = 0xffd640, glass = 0x24324e, metal = 0x6b7488;
  const tube = (r0, r1, len, seg = 14) => new THREE.CylinderGeometry(r0, r1, len, seg).rotateZ(-Math.PI / 2); // r0 at +x
  const parts = [
    { geometry: tube(0.42, 0.42, 3.8), color: white, at: moved(THREE, 0.1, 0, 0) },
    { geometry: new THREE.SphereGeometry(0.42, 14, 10), color: white, at: stretched(THREE, 2, -0.02, 0, 2.1, 0.96, 1) }, // nose
    { geometry: tube(0.42, 0.1, 1.7), color: white, at: moved(THREE, -2.65, 0.1, 0) }, // tail cone
    { geometry: new THREE.SphereGeometry(0.43, 14, 8), color: belly, at: stretched(THREE, 0.1, -0.13, 0, 4.4, 0.72, 0.97) }, // belly
    { geometry: tube(0.43, 0.43, 0.34), color: pink, at: moved(THREE, 1.1, 0, 0) }, // livery band
    { geometry: new THREE.SphereGeometry(0.2, 10, 8), color: glass, at: stretched(THREE, 2.32, 0.14, 0, 1.3, 0.62, 1.55) }, // cockpit
    { geometry: new THREE.BoxGeometry(2.9, 0.07, 0.88), color: glass, at: moved(THREE, 0.1, 0.17, 0) }, // cabin windows
  ];
  for (const s of [1, -1]) {
    parts.push({ geometry: plate(THREE, [[0.75, 0.3 * s], [-0.55, 3.35 * s], [-1.05, 3.35 * s], [-0.75, 0.3 * s]], 0.1), color: wing, at: moved(THREE, 0, -0.16, 0) });
    parts.push({ geometry: plate(THREE, [[-0.55, 3.35 * s], [-1.05, 3.35 * s], [-1.1, 3.4 * s], [-0.65, 3.4 * s]], 0.42), color: pink, at: moved(THREE, 0, -0.16, 0) }); // winglet
    parts.push({ geometry: plate(THREE, [[-2.6, 0.1 * s], [-3.2, 1.2 * s], [-3.5, 1.2 * s], [-3.3, 0.1 * s]], 0.06), color: wing, at: moved(THREE, 0, 0.26, 0) });
    parts.push({ geometry: tube(0.2, 0.17, 0.82, 12), color: metal, at: moved(THREE, 0.35, -0.36, 1.3 * s) }); // engine
    parts.push({ geometry: new THREE.CircleGeometry(0.17, 12).rotateY(Math.PI / 2), color: 0x14102a, at: moved(THREE, 0.77, -0.36, 1.3 * s) });
  }
  const fin = new THREE.ExtrudeGeometry(new THREE.Shape([[-2.25, 0.3], [-3.25, 1.75], [-3.72, 1.75], [-3.3, 0.3]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.09, bevelEnabled: false });
  parts.push({ geometry: fin, color: pink, at: moved(THREE, 0, 0, -0.045) });
  parts.push({ geometry: new THREE.BoxGeometry(0.45, 0.16, 0.1), color: yellow, at: moved(THREE, -3.28, 1.32, 0) });
  return mergeParts(THREE, parts);
}

/** A cargo ship about 8 units long: a pointed hull that sits low in the water, stacked containers, a white bridge aft and a funnel. */
export function makeShip(THREE, random) {
  const hullOutline = [[-3.8, -0.72], [1.9, -0.72], [3.1, -0.42], [4.1, 0], [3.1, 0.42], [1.9, 0.72], [-3.8, 0.72]];
  const parts = [
    { geometry: plate(THREE, hullOutline, 1.15), color: 0x24345e, at: moved(THREE, 0, -0.5, 0) }, // hull: the part below y = 0 is under the sea
    { geometry: plate(THREE, hullOutline.map(([x, z]) => [x * 0.985, z * 0.97]), 0.08), color: 0xc2523e, at: moved(THREE, 0, 0.62, 0) }, // deck
    { geometry: new THREE.BoxGeometry(1.2, 1.2, 1.2), color: 0xf4f5f7, at: stretched(THREE, -2.75, 1.3, 0, 1.1, 1.12, 1) }, // bridge block
    { geometry: new THREE.BoxGeometry(0.75, 0.32, 1.65), color: 0xf4f5f7, at: moved(THREE, -2.5, 2.1, 0) }, // bridge wings
    { geometry: new THREE.BoxGeometry(0.78, 0.13, 1.68), color: 0x24324e, at: moved(THREE, -2.5, 2.12, 0) }, // bridge windows
    { geometry: new THREE.CylinderGeometry(0.2, 0.26, 0.95, 10), color: 0xff3d6e, at: moved(THREE, -3.4, 2.15, 0) }, // funnel
    { geometry: new THREE.CylinderGeometry(0.21, 0.21, 0.16, 10), color: 0x14102a, at: moved(THREE, -3.4, 2.62, 0) },
  ];
  const boxes = [0xff3d6e, 0xffa726, 0x2fbf5b, 0x36a2ff, 0xffd640, 0xdce3ee];
  for (let bay = 0; bay < 6; bay++) for (let row = -1; row <= 1; row++) {
    const stack = 1 + Math.floor(random() * 3), width = bay > 4 ? 0.8 : 1;
    for (let tier = 0; tier < stack; tier++) parts.push({ geometry: new THREE.BoxGeometry(0.72, 0.34, 0.4), color: boxes[Math.floor(random() * boxes.length)], at: moved(THREE, -1.65 + bay * 0.78, 0.88 + tier * 0.35, row * 0.42 * width) });
  }
  return mergeParts(THREE, parts);
}

/** A comic-size satellite: a gold body, a dish and two solar wings. Forward is +x. */
export function makeSatellite(THREE) {
  const parts = [
    { geometry: new THREE.BoxGeometry(1.1, 1.1, 1.3), color: 0xffd640 },
    { geometry: new THREE.ConeGeometry(0.6, 0.4, 14, 1, true), color: 0xeef1ff, at: moved(THREE, 0, 0.8, 0, Math.PI) },
  ];
  for (const s of [1, -1]) {
    parts.push({ geometry: new THREE.BoxGeometry(0.1, 0.1, 0.7), color: 0x6b7488, at: moved(THREE, 0, 0, 0.95 * s) });
    parts.push({ geometry: new THREE.BoxGeometry(1.3, 0.06, 2.6), color: 0x2e62c9, at: moved(THREE, 0, 0, 2.5 * s) });
  }
  return mergeParts(THREE, parts);
}

/** Adds the visible faces of a block to `out`. Walls carry window coordinates (`cell` units per window); roofs are marked with -1. */
function pushBlock(out, x, z, w, d, y0, y1, c, cell) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const quad = (a, b, e, f, n, wide, tall) => {
    for (const [p, u, v] of [[a, 0, 0], [b, wide, 0], [e, wide, tall], [a, 0, 0], [e, wide, tall], [f, 0, tall]]) {
      out.position.push(...p); out.normal.push(...n); out.color.push(c.r, c.g, c.b); out.win.push(tall < 0 ? -1 : u, tall < 0 ? -1 : v);
    }
  };
  const wide = Math.round(w / cell), deep = Math.round(d / cell), tall = Math.round((y1 - y0) / cell);
  quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], deep, tall);
  quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], deep, tall);
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], wide, tall);
  quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], wide, tall);
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], 1, -1);
}

/** Tallest building a city can have, in city units (before `loading.citySize`). */
export const CITY_TOP = 24;

/**
 * One city: a dense downtown of tiered towers that falls away to low blocks, about 12 units across and up to CITY_TOP tall, sunk a
 * little into the ground so it sits on the curve of the planet. `tint` is the local ground colour [r, g, b], mixed into the stone so a
 * desert city and a forest city each belong to their land. Geometry has a `win` attribute for the window shader.
 */
export function makeCity(THREE, random, tint = [150, 150, 130]) {
  const out = { position: [], normal: [], color: [], win: [] }, ground = new THREE.Color(`rgb(${tint.map(q => Math.round(q)).join(',')})`);
  const stone = [0xdfd6c6, 0xc9d3de, 0xa9c4dc, 0xeeeae2, 0xd8b9a0, 0x8fb0cf].map(h => new THREE.Color(h).lerp(ground, 0.22));
  let top = 0;
  for (let k = 0; k < 46; k++) {
    const a = random() * Math.PI * 2, dist = Math.sqrt(random()), x = Math.cos(a) * dist * 6.2, z = Math.sin(a) * dist * 6.2, core = (1 - dist) ** 2;
    const h = 1.6 + random() * 2.2 + core * (9 + random() * 13), w = 0.9 + random() * 0.8 + core * 0.3, d = 0.9 + random() * 0.8 + core * 0.3, c = stone[Math.floor(random() * stone.length)];
    pushBlock(out, x, z, w, d, -3, h * (h > 9 ? 0.62 : 1), c, 0.32);
    if (h > 9) { // setbacks: towers narrow as they rise
      pushBlock(out, x, z, w * 0.74, d * 0.74, h * 0.62, h * 0.88, c, 0.32);
      pushBlock(out, x, z, w * 0.46, d * 0.46, h * 0.88, h, c, 0.32);
      pushBlock(out, x, z, 0.1, 0.1, h, h * 1.08, new THREE.Color(0x4a5272), 9);
    } else if (random() < 0.5) pushBlock(out, x, z, w * 0.5, d * 0.5, h, h + 0.34, new THREE.Color(0xc2523e).lerp(ground, 0.2), 9); // rooftop plant
    top = Math.max(top, h * (h > 9 ? 1.08 : 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.color, 3));
  g.setAttribute('win', new THREE.Float32BufferAttribute(out.win, 2));
  g.userData.top = Math.min(top, CITY_TOP * 1.1);
  return g;
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
