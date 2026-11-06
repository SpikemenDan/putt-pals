/**
 * 3D models for the loading-screen sky (VIS-M1): planes, ships, satellites, balloons, cities, towns, villages, ports, a lighthouse,
 * windmills, volcanoes, mountains, plants, moon bases and cumulus clouds.
 *
 * Each kind comes in several designs, and settlements are styled for their biome, so a desert town does not look like a northern one.
 * Every builder returns one BufferGeometry with vertex colours, drawn with the game's own toon material and ink hull (materials.js,
 * outline.js). Local axes: +x forward (nose, bow, pier), +y up, +z right. A ship's waterline is y = 0. Original models; `THREE` and
 * randomness are injected.
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

/** A triangular roof `w` wide, `h` tall and `d` long, ridge along z, base at y = 0. */
function gable(THREE, w, h, d) {
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  return new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

export const PLANE_KINDS = Object.freeze(['jet', 'prop', 'jumbo']);

/** A plane, nose at +x. 'jet' is a toy airliner, 'prop' a high-winged propeller plane, 'jumbo' a long two-tone wide-body. */
export function makePlane(THREE, kind = 'jet', livery = 0xff3d6e) {
  const white = 0xf8f8fc, wing = 0xdfe4ee, glass = 0x2a4a86, trim = 0xffd640;
  const body = (len, r) => ({ geometry: new THREE.SphereGeometry(1, 20, 14), color: white, at: stretched(THREE, 0, 0, 0, len, r, r) });
  const parts = [];
  const tail = (x, fin) => {
    const shape = new THREE.Shape([[x + 1.1, 0.3], [x + 0.2, fin], [x - 0.3, fin], [x, 0.3]].map(([a, b]) => new THREE.Vector2(a, b)));
    parts.push({ geometry: new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false }), color: livery, at: moved(THREE, 0, 0, -0.08) });
    for (const s of [1, -1]) parts.push({ geometry: plate(THREE, [[x + 0.8, 0.2 * s], [x + 0.2, 1.3 * s], [x - 0.2, 1.3 * s], [x + 0.1, 0.2 * s]], 0.12), color: wing, at: moved(THREE, 0, 0.14, 0) });
  };
  if (kind === 'prop') {
    parts.push(body(2.5, 0.6), { geometry: new THREE.SphereGeometry(0.32, 12, 10), color: glass, at: stretched(THREE, 1.2, 0.32, 0, 1.3, 0.8, 1.3) });
    parts.push({ geometry: new THREE.BoxGeometry(1.15, 0.14, 7.2), color: livery, at: moved(THREE, 0.2, 0.6, 0) });
    parts.push({ geometry: new THREE.CylinderGeometry(0.1, 0.2, 0.4, 10).rotateZ(-Math.PI / 2), color: trim, at: moved(THREE, 2.6, 0, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.06, 2, 0.2), color: 0x2a2a3a, at: moved(THREE, 2.72, 0, 0) });
    tail(-3, 1.4);
  } else {
    const long = kind === 'jumbo', len = long ? 3.8 : 3.1, r = long ? 0.82 : 0.68;
    parts.push(body(len, r), { geometry: new THREE.SphereGeometry(0.34, 12, 10), color: glass, at: stretched(THREE, len - 1.05, r * 0.3, 0, 1.2, 0.72, 1.3) });
    if (long) parts.push({ geometry: new THREE.SphereGeometry(1, 16, 10), color: livery, at: stretched(THREE, -0.1, -0.3, 0, 3.72, 0.56, 0.8) }); // lower body in the livery
    for (const s of [1, -1]) {
      parts.push({ geometry: plate(THREE, [[0.7, 0.4 * s], [-0.8, 3.6 * s], [-1.5, 3.6 * s], [-0.9, 0.4 * s]], 0.16), color: wing, at: moved(THREE, 0, -0.2, 0) });
      parts.push({ geometry: new THREE.CylinderGeometry(0.28, 0.24, 0.9, 12).rotateZ(-Math.PI / 2), color: livery, at: moved(THREE, 0.2, -0.46, 1.5 * s) });
      if (long) parts.push({ geometry: new THREE.CylinderGeometry(0.26, 0.22, 0.8, 12).rotateZ(-Math.PI / 2), color: livery, at: moved(THREE, -0.3, -0.42, 2.55 * s) });
    }
    tail(-len + 0.2, long ? 2 : 1.65);
  }
  return mergeParts(THREE, parts);
}

export const SHIP_KINDS = Object.freeze(['cargo', 'ferry', 'tanker', 'trawler', 'yacht']);

/** A ship, bow at +x, low in the water. The part below y = 0 is under the sea. */
export function makeShip(THREE, kind = 'cargo', paint = 0xffa726) {
  const hullOf = (long, beam) => [[-long, -beam], [long * 0.45, -beam], [long * 1.1, 0], [long * 0.45, beam], [-long, beam]];
  const hull = (long, beam, colour, top = 0.75) => [
    { geometry: plate(THREE, hullOf(long, beam), top + 0.55), color: colour, at: moved(THREE, 0, -0.55, 0) },
    { geometry: plate(THREE, hullOf(long, beam).map(([x, z]) => [x * 0.94, z * 0.86]), 0.12), color: 0xfff1d6, at: moved(THREE, 0, top, 0) },
  ];
  if (kind === 'ferry') return mergeParts(THREE, [
    ...hull(3.4, 1, 0x1f6fbf),
    { geometry: new THREE.BoxGeometry(5, 0.8, 1.6), color: 0xf8f8fc, at: moved(THREE, -0.3, 1.25, 0) },
    { geometry: new THREE.BoxGeometry(5.02, 0.22, 1.62), color: 0x2a4a86, at: moved(THREE, -0.3, 1.3, 0) },
    { geometry: new THREE.BoxGeometry(3.6, 0.7, 1.4), color: 0xf8f8fc, at: moved(THREE, -0.6, 1.98, 0) },
    { geometry: new THREE.BoxGeometry(1, 0.5, 1.5), color: 0xf8f8fc, at: moved(THREE, 0.9, 2.5, 0) },
    { geometry: new THREE.CylinderGeometry(0.3, 0.36, 0.9, 12), color: paint, at: moved(THREE, -1.5, 2.7, 0) },
  ]);
  if (kind === 'tanker') return mergeParts(THREE, [
    ...hull(4.4, 1, 0xc0392b, 0.55),
    { geometry: new THREE.BoxGeometry(1.5, 1.5, 1.5), color: 0xf8f8fc, at: moved(THREE, -3.2, 1.35, 0) },
    { geometry: new THREE.CylinderGeometry(0.28, 0.34, 0.8, 12), color: 0x2a2a3a, at: moved(THREE, -3.5, 2.4, 0) },
    { geometry: new THREE.CylinderGeometry(0.16, 0.16, 4.8, 8).rotateZ(Math.PI / 2), color: paint, at: moved(THREE, 0.1, 0.9, 0) },
    ...[-1.4, 0.2, 1.8].map(x => ({ geometry: new THREE.SphereGeometry(0.7, 14, 8), color: 0xeef1f6, at: stretched(THREE, x, 0.72, 0, 1, 0.56, 1) })),
  ]);
  if (kind === 'trawler') return mergeParts(THREE, [
    ...hull(2, 0.8, 0x2f9e6b, 0.9),
    { geometry: new THREE.BoxGeometry(1, 1, 0.95), color: 0xf8f8fc, at: moved(THREE, 0.1, 1.45, 0) },
    { geometry: new THREE.BoxGeometry(1.02, 0.26, 0.97), color: 0x2a4a86, at: moved(THREE, 0.1, 1.62, 0) },
    { geometry: new THREE.CylinderGeometry(0.05, 0.08, 2.6, 8), color: 0x9a6a3c, at: moved(THREE, -1, 2.1, 0) },
    { geometry: new THREE.CylinderGeometry(0.04, 0.04, 2, 6).rotateZ(1), color: 0x9a6a3c, at: moved(THREE, -1.7, 2.2, 0) },
  ]);
  if (kind === 'yacht') {
    const sail = (points, thick) => new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b))), { depth: thick, bevelEnabled: false });
    return mergeParts(THREE, [
      ...hull(2, 0.62, 0xf8f8fc, 0.4),
      { geometry: new THREE.CylinderGeometry(0.05, 0.07, 5, 8), color: 0x9a6a3c, at: moved(THREE, 0.2, 2.9, 0) },
      { geometry: sail([[0.1, 0.8], [-1.9, 0.8], [0.1, 5]], 0.05), color: 0xf8f8fc, at: moved(THREE, 0, 0, 0.06) },
      { geometry: sail([[0.3, 1], [2, 0.9], [0.3, 4.6]], 0.05), color: paint, at: moved(THREE, 0, 0, -0.1) },
    ]);
  }
  return mergeParts(THREE, [
    ...hull(3.6, 0.9, 0xd93a4e),
    { geometry: new THREE.BoxGeometry(1.7, 1.25, 1.35), color: 0xf8f8fc, at: moved(THREE, -2.25, 1.45, 0) },
    { geometry: new THREE.BoxGeometry(1.72, 0.26, 1.37), color: 0x2a4a86, at: moved(THREE, -2.25, 1.8, 0) },
    { geometry: new THREE.CylinderGeometry(0.34, 0.42, 1, 14), color: 0xffd640, at: moved(THREE, -2.4, 2.5, 0) },
    ...[-0.5, 0.45, 1.4].flatMap((x, k) => [{ geometry: new THREE.BoxGeometry(0.88, 0.95, 1.25), color: k % 2 ? 0x36a2ff : paint, at: moved(THREE, x, 1.3, 0) }]),
  ]);
}

/** A satellite: 'panel' has two blue wings, 'dish' a big white dish. */
export function makeSatellite(THREE, kind = 'panel') {
  const parts = [{ geometry: new THREE.CylinderGeometry(0.8, 0.8, 1.5, 14), color: 0xffd640 }];
  if (kind === 'dish') parts.push({ geometry: new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, 1), color: 0xeef1ff, at: moved(THREE, 0, -0.1, 0) }, { geometry: new THREE.BoxGeometry(0.2, 0.2, 3.4), color: 0x2e7be0 });
  else for (const s of [1, -1]) {
    parts.push({ geometry: new THREE.BoxGeometry(1.5, 0.12, 2.8), color: 0x2e7be0, at: moved(THREE, 0, 0, 2.5 * s) });
    for (const q of [-0.4, 0.4]) parts.push({ geometry: new THREE.BoxGeometry(0.05, 0.14, 2.82), color: 0xcfe4ff, at: moved(THREE, q, 0, 2.5 * s) });
  }
  return mergeParts(THREE, parts);
}

/** A hot-air balloon: a round envelope with bright bands, and a basket. */
export function makeBalloon(THREE, color = 0xff3d6e, band = 0xffd640) {
  return mergeParts(THREE, [
    { geometry: new THREE.SphereGeometry(1.5, 18, 14), color, at: stretched(THREE, 0, 2.3, 0, 1, 1.12, 1) },
    { geometry: new THREE.CylinderGeometry(1.53, 1.3, 0.62, 18), color: band, at: moved(THREE, 0, 1.75, 0) },
    { geometry: new THREE.CylinderGeometry(1.3, 1.53, 0.5, 18), color: band, at: moved(THREE, 0, 3.05, 0) },
    { geometry: new THREE.BoxGeometry(0.62, 0.5, 0.62), color: 0x9a6a3c, at: moved(THREE, 0, 0, 0) },
  ]);
}

/** Palettes per building style: walls, accents and roofs. */
const STYLES = Object.freeze({
  temperate: { walls: [0xc9d3de, 0xa9c4dc, 0xeeeae2, 0xd8b9a0, 0x8fb0cf, 0xb86b52], accent: 0x3b5a86, roofs: [0xe2554a, 0x6e7c94, 0xc9772e], types: ['glass', 'stepped', 'round', 'spire', 'tower', 'row', 'twist'] },
  tropical: { walls: [0xfff1d6, 0xff9d8a, 0xa8ecc5, 0xffdf80, 0x8fe0e8, 0xf8f8fc], accent: 0x2c8c9c, roofs: [0xff7a59, 0x2fbf9b, 0xffc24a], types: ['round', 'hall', 'twist', 'glass', 'stepped'] },
  desert: { walls: [0xecd2a2, 0xdcb782, 0xf3e3c3, 0xcf9f6c], accent: 0x8a5a36, roofs: [0x3fa7a0, 0xd9a03f, 0xf3e3c3], types: ['stepped', 'hall', 'spire', 'round'] },
  boreal: { walls: [0x7a8596, 0xb6a48e, 0x8c5a48, 0xd9dde4], accent: 0x2c3442, roofs: [0x3e6e7e, 0x54403a, 0xeef1f6], types: ['spire', 'row', 'pagoda', 'glass', 'tower'] },
});
const styleOf = biome => (biome === 'tropical' || biome === 'wetland' ? 'tropical' : biome === 'desert' || biome === 'savanna' ? 'desert' : biome === 'boreal' || biome === 'tundra' ? 'boreal' : 'temperate');

/** Adds one building of `type` at (x, z), `h` tall, its foot sunk to y = -3. Returns its top. */
function addBuilding(THREE, parts, type, x, z, w, h, wall, style, random) {
  const roof = style.roofs[Math.floor(random() * style.roofs.length)], foot = -3;
  const block = (bw, y0, y1, color = wall, turn = 0) => parts.push({ geometry: new THREE.BoxGeometry(bw, y1 - y0, bw), color, at: moved(THREE, x, (y0 + y1) / 2, z, 0, turn) });
  const bands = (bw, y0, y1, turn = 0) => { for (let y = y0 + 0.8; y < y1 - 0.4; y += 1.2) parts.push({ geometry: new THREE.BoxGeometry(bw * 1.03, 0.42, bw * 1.03), color: style.accent, at: moved(THREE, x, y, z, 0, turn) }); };
  const round = (r0, r1, y0, y1, color = wall) => parts.push({ geometry: new THREE.CylinderGeometry(r0, r1, y1 - y0, 16), color, at: moved(THREE, x, (y0 + y1) / 2, z) });
  const dome = (r, y, color = roof, squash = 0.85) => parts.push({ geometry: new THREE.SphereGeometry(r, 16, 10), color, at: stretched(THREE, x, y, z, 1, squash, 1) });
  if (type === 'glass') { block(w, foot, h * 0.72); bands(w, 0, h * 0.72); block(w * 0.68, h * 0.72, h); bands(w * 0.68, h * 0.72, h); block(w * 0.3, h, h + 0.6, roof); return h + 0.6; }
  if (type === 'stepped') { const steps = 4; for (let k = 0; k < steps; k++) { const y0 = k ? h * k / steps : foot, y1 = h * (k + 1) / steps, bw = w * (1 - k * 0.2); block(bw, y0, y1, k % 2 ? wall : style.walls[0]); bands(bw, Math.max(0, y0), y1); } return h; }
  if (type === 'round') { round(w * 0.55, w * 0.6, foot, h); for (let y = 1.2; y < h - 0.6; y += 1.6) round(w * 0.57, w * 0.6, y, y + 0.42, style.accent); dome(w * 0.56, h); return h + w * 0.46; }
  if (type === 'spire') { round(w * 0.36, w * 0.64, foot, h); parts.push({ geometry: new THREE.ConeGeometry(w * 0.38, 3, 12), color: roof, at: moved(THREE, x, h + 1.5, z) }); return h + 3; }
  if (type === 'twist') { const rows = Math.max(4, Math.round(h / 1.5)); for (let k = 0; k < rows; k++) { const y0 = k ? h * k / rows : foot, turn = k * 0.16; block(w * (1 - k * 0.012), y0, h * (k + 1) / rows, k % 2 ? wall : style.accent, turn); } return h; }
  if (type === 'tower') { round(w * 0.16, w * 0.3, foot, h); dome(w * 0.46, h * 0.86, wall, 0.62); round(w * 0.5, w * 0.5, h * 0.84, h * 0.87, style.accent); parts.push({ geometry: new THREE.ConeGeometry(0.1, 2.6, 8), color: roof, at: moved(THREE, x, h + 1.3, z) }); return h + 2.6; }
  if (type === 'hall') { round(w * 0.92, w * 0.96, foot, h * 0.42); dome(w * 0.92, h * 0.42, roof, 0.72); round(0.09, 0.09, h * 0.4, h * 0.42 + w, style.accent); return h * 0.42 + w; }
  if (type === 'pagoda') { const steps = 4; for (let k = 0; k < steps; k++) { const y0 = k ? h * k / steps : foot, y1 = h * (k + 1) / steps, bw = w * (1 - k * 0.17); block(bw * 0.72, y0, y1); parts.push({ geometry: new THREE.ConeGeometry(bw * 0.88, 1, 4), color: roof, at: moved(THREE, x, y1 + 0.1, z, 0, Math.PI / 4) }); } return h + 0.6; }
  block(w * 1.3, foot, h * 0.6); parts.push({ geometry: gable(THREE, w * 1.42, 1.4, w * 1.42), color: roof, at: moved(THREE, x, h * 0.6, z) }); // row house
  return h * 0.6 + 1.4;
}

/** Tallest building a city can have, in city units (before `loading.citySize`). */
export const CITY_TOP = 23;

/**
 * One city, styled for its `biome`: about fourteen buildings of mixed designs, tallest in the middle, about 15 units across, sunk a
 * little so it sits on the curve of the planet. `tint` is the local ground colour [r, g, b], mixed into the walls so it belongs to
 * its land.
 */
export function makeCity(THREE, random, tint = [150, 150, 130], biome = 'temperate') {
  const ground = new THREE.Color(`rgb(${tint.map(q => Math.round(q)).join(',')})`), parts = [], style = STYLES[styleOf(biome)];
  let top = 0;
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4 + random(), dist = k === 0 ? 0 : 0.28 + 0.72 * Math.sqrt(k / 14), x = Math.cos(a) * dist * 6.6, z = Math.sin(a) * dist * 6.6, core = (1 - dist) ** 1.5;
    const h = 3.2 + random() * 2.6 + core * (12 + random() * 3), w = 1.6 + random() * 1 + core * 0.5;
    const wall = new THREE.Color(style.walls[Math.floor(random() * style.walls.length)]).lerp(ground, 0.1);
    const type = style.types[(k === 0 ? 0 : Math.floor(random() * style.types.length))];
    top = Math.max(top, addBuilding(THREE, parts, core > 0.35 && type === 'row' ? 'glass' : type, x, z, w, h, wall, style, random));
  }
  const g = mergeParts(THREE, parts);
  g.userData.top = top;
  return g;
}

/** A house with a pitched roof, its foot at y = -0.4. */
function house(THREE, parts, x, z, yaw, wall, roof, s = 1, flat = false) {
  parts.push({ geometry: new THREE.BoxGeometry(1.5 * s, 1.9 * s, 1.3 * s), color: wall, at: moved(THREE, x, 0.55 * s, z, 0, yaw) });
  parts.push({ geometry: new THREE.BoxGeometry(0.4 * s, 0.7 * s, 1.32 * s), color: 0x5a4632, at: moved(THREE, x, 0.3 * s, z, 0, yaw) }); // door band
  if (flat) parts.push({ geometry: new THREE.BoxGeometry(1.6 * s, 0.24 * s, 1.4 * s), color: roof, at: moved(THREE, x, 1.6 * s, z, 0, yaw) });
  else parts.push({ geometry: gable(THREE, 1.8 * s, 1 * s, 1.5 * s), color: roof, at: moved(THREE, x, 1.5 * s, z, 0, yaw + Math.PI / 2) });
}

/** A town styled for its `biome`: houses of different sizes round a landmark (church, market hall or mosque-like dome tower). About 8 units across. */
export function makeTown(THREE, random, biome = 'temperate') {
  const name = styleOf(biome), style = STYLES[name], parts = [], flat = name === 'desert';
  const pickOf = list => list[Math.floor(random() * list.length)];
  const landmark = Math.floor(random() * 3);
  if (landmark === 0) { // tower with a pointed roof
    parts.push({ geometry: new THREE.BoxGeometry(1.5, 6, 1.5), color: pickOf(style.walls), at: moved(THREE, 0, 1.6, 0) });
    parts.push({ geometry: new THREE.ConeGeometry(1.2, 2.2, 4), color: pickOf(style.roofs), at: moved(THREE, 0, 5.7, 0, 0, Math.PI / 4) });
    parts.push({ geometry: new THREE.BoxGeometry(2.8, 2.2, 1.7), color: pickOf(style.walls), at: moved(THREE, 1.6, 0.7, 0) });
    parts.push({ geometry: gable(THREE, 2, 1.1, 3).rotateY(Math.PI / 2), color: pickOf(style.roofs), at: moved(THREE, 1.6, 1.8, 0) });
  } else if (landmark === 1) { // domed hall
    parts.push({ geometry: new THREE.CylinderGeometry(1.5, 1.6, 2.6, 16), color: pickOf(style.walls), at: moved(THREE, 0, 0.8, 0) });
    parts.push({ geometry: new THREE.SphereGeometry(1.5, 16, 10), color: pickOf(style.roofs), at: stretched(THREE, 0, 2.1, 0, 1, 0.85, 1) });
  } else { // market square: a striped awning on posts
    parts.push({ geometry: new THREE.ConeGeometry(2.1, 1.1, 8), color: pickOf(style.roofs), at: moved(THREE, 0, 2.6, 0) });
    for (let k = 0; k < 4; k++) parts.push({ geometry: new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6), color: 0x9a6a3c, at: moved(THREE, Math.cos(k * 1.57 + 0.8) * 1.5, 1, Math.sin(k * 1.57 + 0.8) * 1.5) });
  }
  const count = 8 + Math.floor(random() * 4);
  for (let k = 0; k < count; k++) { const a = k / count * Math.PI * 2 + random() * 0.4, r = 3 + random() * 2.2; house(THREE, parts, Math.cos(a) * r, Math.sin(a) * r, random() * 3, pickOf(style.walls), pickOf(style.roofs), 0.8 + random() * 0.5, flat); }
  return mergeParts(THREE, parts);
}

/** A village: huts built from what the `biome` offers: thatch, adobe, log cabins with snow, or stilt huts over the marsh. */
export function makeVillage(THREE, random, biome = 'temperate') {
  const name = styleOf(biome), parts = [];
  for (let k = 0; k < 4 + Math.floor(random() * 2); k++) {
    const a = k * 1.4 + random(), x = Math.cos(a) * 1.9, z = Math.sin(a) * 1.9;
    if (name === 'tropical') {
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) parts.push({ geometry: new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6), color: 0x7a5a3a, at: moved(THREE, x + dx, 0.2, z + dz) });
      parts.push({ geometry: new THREE.BoxGeometry(1.3, 0.8, 1.3), color: 0xd9b37a, at: moved(THREE, x, 1.2, z) });
      parts.push({ geometry: new THREE.ConeGeometry(1.2, 1, 4), color: 0xc9a03f, at: moved(THREE, x, 2.1, z, 0, Math.PI / 4) });
    } else if (name === 'desert') {
      parts.push({ geometry: new THREE.BoxGeometry(1.5, 1.4, 1.5), color: 0xdcb782, at: moved(THREE, x, 0.3, z, 0, a) });
      parts.push({ geometry: new THREE.SphereGeometry(0.62, 12, 8), color: 0xf3e3c3, at: stretched(THREE, x, 1, z, 1, 0.7, 1) });
    } else if (name === 'boreal') {
      parts.push({ geometry: new THREE.BoxGeometry(1.7, 1.2, 1.3), color: 0x7a4e30, at: moved(THREE, x, 0.3, z, 0, a) });
      parts.push({ geometry: gable(THREE, 2, 1, 1.5), color: 0xf4f6fa, at: moved(THREE, x, 0.9, z, 0, a + Math.PI / 2) });
    } else {
      parts.push({ geometry: new THREE.CylinderGeometry(0.72, 0.8, 1.7, 12), color: 0xf6dfb4, at: moved(THREE, x, 0.1, z) });
      parts.push({ geometry: new THREE.ConeGeometry(1.08, 1.05, 12), color: 0xd9a03f, at: moved(THREE, x, 1.4, z) });
    }
  }
  return mergeParts(THREE, parts);
}

/** A port on the shore, facing +x: a long pier, a warehouse, a gantry crane and stacked boxes. */
export function makePort(THREE, variant = 0) {
  const boxes = variant ? [0x2fbf5b, 0xff3d6e, 0x36a2ff] : [0xff3d6e, 0xffa726, 0x2fbf5b];
  const parts = [
    { geometry: new THREE.BoxGeometry(9, 1.5, 1.7), color: 0xc9a06a, at: moved(THREE, 4.2, -0.2, 0) },
    { geometry: new THREE.BoxGeometry(3.4, 2.6, 2.8), color: variant ? 0xeeeae2 : 0x8fd3ff, at: moved(THREE, -1.8, 0.6, 2.6) },
    { geometry: gable(THREE, 3.2, 1, 3.6).rotateY(Math.PI / 2), color: 0xe2554a, at: moved(THREE, -1.8, 1.9, 2.6) },
    { geometry: new THREE.BoxGeometry(0.5, 5.4, 0.5), color: 0xffd640, at: moved(THREE, 2.4, 2.2, -1.2) },
    { geometry: new THREE.BoxGeometry(0.5, 5.4, 0.5), color: 0xffd640, at: moved(THREE, 2.4, 2.2, 1.2) },
    { geometry: new THREE.BoxGeometry(5.6, 0.5, 0.6), color: 0xffd640, at: moved(THREE, 3.8, 4.8, 0) },
    { geometry: new THREE.BoxGeometry(0.1, 1.8, 0.1), color: 0x2a2a3a, at: moved(THREE, 5.6, 3.7, 0) },
    { geometry: new THREE.BoxGeometry(1.2, 0.5, 0.8), color: boxes[0], at: moved(THREE, 5.6, 2.6, 0) },
  ];
  for (let k = 0; k < 6; k++) parts.push({ geometry: new THREE.BoxGeometry(1.2, 0.72, 0.9), color: boxes[k % 3], at: moved(THREE, -3.6 + (k % 3) * 1.3, 0.2 + Math.floor(k / 3) * 0.74, -1.9) });
  return mergeParts(THREE, parts);
}

/** A tall striped lighthouse on a rock, its lamp at LIGHTHOUSE_LAMP. */
export const LIGHTHOUSE_LAMP = 11;
export function makeLighthouse(THREE) {
  const parts = [
    { geometry: new THREE.DodecahedronGeometry(2.2, 0), color: 0x8a8378, at: stretched(THREE, 0, -0.4, 0, 1.2, 0.7, 1.2) },
    { geometry: new THREE.ConeGeometry(0.95, 0.9, 16), color: 0xe2554a, at: moved(THREE, 0, 12.3, 0) },
    { geometry: new THREE.CylinderGeometry(0.72, 0.72, 1.2, 12), color: 0xfff1b0, at: moved(THREE, 0, 11.3, 0) },
    { geometry: new THREE.CylinderGeometry(1.1, 1.1, 0.24, 16), color: 0x2a2a3a, at: moved(THREE, 0, 10.6, 0) },
  ];
  for (let k = 0; k < 5; k++) { const y0 = k * 2.1, r0 = 1.55 - k * 0.15; parts.push({ geometry: new THREE.CylinderGeometry(r0 - 0.15, r0, 2.1, 16), color: k % 2 ? 0xe2554a : 0xf8f8fc, at: moved(THREE, 0, y0 + 1.05, 0) }); }
  return mergeParts(THREE, parts);
}

/**
 * A mill for open ground: `kind` 'turbine' (a slim white wind turbine) or 'windmill' (a tapered stone tower with a cap and four sails).
 * Returns { mast, blades, hub }: the blades turn about x at height `hub`.
 */
export function makeMill(THREE, kind = 'turbine') {
  if (kind === 'windmill') return {
    hub: 4.4,
    mast: mergeParts(THREE, [
      { geometry: new THREE.CylinderGeometry(0.9, 1.5, 4.8, 12), color: 0xeee2c8, at: moved(THREE, 0, 1.6, 0) },
      { geometry: new THREE.ConeGeometry(1.1, 1.3, 12), color: 0x8a4a3a, at: moved(THREE, 0, 4.6, 0) },
    ]),
    blades: mergeParts(THREE, [0, 1, 2, 3].flatMap(k => [
      { geometry: new THREE.BoxGeometry(0.1, 3.2, 0.72).translate(0, 2, 0.2), color: 0xf4efe0, at: moved(THREE, 1, 0, 0, k * Math.PI / 2) },
      { geometry: new THREE.BoxGeometry(0.14, 3.4, 0.1).translate(0, 1.7, 0), color: 0x7a5a3a, at: moved(THREE, 1.02, 0, 0, k * Math.PI / 2) },
    ])),
  };
  return {
    hub: 6,
    mast: mergeParts(THREE, [{ geometry: new THREE.CylinderGeometry(0.14, 0.3, 7, 8), color: 0xf8f8fc, at: moved(THREE, 0, 2.5, 0) }, { geometry: new THREE.BoxGeometry(0.9, 0.34, 0.34), color: 0xf8f8fc, at: moved(THREE, 0.1, 6, 0) }]),
    blades: mergeParts(THREE, [0, 1, 2].map(k => ({ geometry: new THREE.BoxGeometry(0.1, 2.9, 0.32).translate(0, 1.45, 0), color: 0xf8f8fc, at: moved(THREE, 0.56, 0, 0, k * Math.PI * 2 / 3) }))),
  };
}

/** A volcano with a glowing crater and lava streams. */
export function makeVolcano(THREE) {
  const parts = [
    { geometry: new THREE.CylinderGeometry(2.1, 9, 8, 14), color: 0x4c3c44, at: moved(THREE, 0, 2.6, 0) },
    { geometry: new THREE.CylinderGeometry(1.75, 1.75, 0.3, 14), color: 0xff7a1a, at: moved(THREE, 0, 6.56, 0) },
  ];
  for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.4; parts.push({ geometry: new THREE.BoxGeometry(0.5, 7.4, 0.14), color: 0xff5a1a, at: new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 5.65, 2.75, Math.sin(a) * 5.65), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -0.82, 'YXZ')), new THREE.Vector3(1, 1, 1)) }); }
  return mergeParts(THREE, parts);
}

/** A rounded mountain with a smooth snow cap, `variant` 0 or 1. About 2 tall and 2 wide; scale it in place. */
export function makePeak(THREE, variant = 0) {
  return mergeParts(THREE, [
    { geometry: new THREE.CylinderGeometry(0.34, 1, 1.5, 12, 1, true), color: variant ? 0x8d7a6c : 0x7c7f8c, at: moved(THREE, 0, 0.55, 0) },
    { geometry: new THREE.SphereGeometry(0.42, 12, 8), color: 0xf6f9ff, at: stretched(THREE, 0, 1.36, 0, 0.9, 1.24, 0.9) },
  ]);
}

export const PLANT_KINDS = Object.freeze(['broadleaf', 'birch', 'autumn', 'blossom', 'pine', 'snowpine', 'palm', 'jungle', 'acacia', 'cactus', 'shrub', 'mangrove', 'reeds', 'deadtree']);

/** One plant of `kind`, about 2 units tall, drawn with instances. Few triangles each, as thousands are on the planet. */
export function makePlant(THREE, kind) {
  const trunk = (r, h, color = 0x8a6a48) => ({ geometry: new THREE.CylinderGeometry(r * 0.7, r, h, 5), color, at: moved(THREE, 0, h / 2 - 0.1, 0) });
  const crown = (r, x, y, z, color, sy = 1) => { // twenty faces with round normals: smooth at this size, and cheap by the thousand
    const geometry = new THREE.IcosahedronGeometry(r, 0);
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) { const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1; n.setXYZ(i, p.getX(i) / l, p.getY(i) / l, p.getZ(i) / l); }
    return { geometry, color, at: stretched(THREE, x, y, z, 1, sy, 1) };
  };
  const cone = (r, h, y, color) => ({ geometry: new THREE.ConeGeometry(r, h, 7), color, at: moved(THREE, 0, y, 0) });
  const table = {
    broadleaf: () => [trunk(0.18, 1), crown(0.72, 0, 1.3, 0, 0x3f9e4a, 1.1), crown(0.42, 0.42, 1, 0.1, 0x57b95a)],
    birch: () => [trunk(0.09, 1.5, 0xeef0ea), crown(0.44, 0, 1.75, 0, 0x8ccb5a, 1.45)],
    autumn: () => [trunk(0.16, 1), crown(0.7, 0, 1.3, 0, 0xf09a2a, 1.05), crown(0.38, -0.38, 1, 0.14, 0xe2552e)],
    blossom: () => [trunk(0.14, 0.9, 0x7a4e3a), crown(0.66, 0, 1.2, 0, 0xffa8cc, 0.95), crown(0.36, 0.36, 1.05, -0.1, 0xffd0e4)],
    pine: () => [trunk(0.12, 0.5), cone(0.72, 1.1, 0.8, 0x1f7a58), cone(0.54, 1, 1.4, 0x27916a), cone(0.34, 0.8, 1.95, 0x2ea87a)],
    snowpine: () => [trunk(0.12, 0.5), cone(0.7, 1.1, 0.8, 0x2a7a64), cone(0.52, 0.95, 1.4, 0xcfe8ee), cone(0.32, 0.8, 1.95, 0xf4fbff)],
    palm: () => [{ geometry: new THREE.CylinderGeometry(0.06, 0.13, 2, 5), color: 0xa98250, at: moved(THREE, 0.1, 0.9, 0, 0, 0, -0.14) }, ...[0, 1, 2, 3, 4].map(k => ({ geometry: new THREE.ConeGeometry(0.2, 1.3, 4).scale(1, 1, 0.4).rotateZ(-1.9), color: k % 2 ? 0x2fb24a : 0x4cc760, at: moved(THREE, 0.24, 1.9, 0, 0, k * 1.26) }))],
    jungle: () => [trunk(0.2, 1.3, 0x6a4a30), crown(0.82, 0, 1.6, 0, 0x128a44, 0.78), crown(0.5, 0.5, 1.25, 0.26, 0x1fa854, 0.8), crown(0.46, -0.48, 1.3, -0.2, 0x0c7a3c, 0.8)],
    acacia: () => [{ geometry: new THREE.CylinderGeometry(0.06, 0.12, 1.4, 5), color: 0x7a5a3a, at: moved(THREE, 0, 0.6, 0) }, crown(0.95, 0, 1.45, 0, 0x8ea83a, 0.3)],
    cactus: () => [{ geometry: new THREE.CapsuleGeometry(0.17, 1.1, 3, 7), color: 0x3f9e5a, at: moved(THREE, 0, 0.7, 0) }, { geometry: new THREE.CapsuleGeometry(0.1, 0.42, 3, 6), color: 0x4cae66, at: moved(THREE, 0.3, 0.9, 0) }, { geometry: new THREE.BoxGeometry(0.28, 0.12, 0.12), color: 0x4cae66, at: moved(THREE, 0.15, 0.68, 0) }],
    shrub: () => [crown(0.46, 0, 0.3, 0, 0x6fae4a, 0.72), crown(0.3, 0.3, 0.24, 0.12, 0x8fc25a, 0.8)],
    mangrove: () => [...[-0.3, 0.3].map(x => ({ geometry: new THREE.CylinderGeometry(0.05, 0.08, 0.9, 4), color: 0x5a4632, at: moved(THREE, x, 0.3, 0, 0, 0, x) })), crown(0.62, 0, 0.98, 0, 0x2a8a68, 0.72)],
    reeds: () => [-0.2, 0, 0.2].map((x, k) => ({ geometry: new THREE.ConeGeometry(0.1, 1.1 + k * 0.2, 4), color: k % 2 ? 0x9fbf5a : 0x6fa84a, at: moved(THREE, x, 0.5, x * 0.6) })),
    deadtree: () => [trunk(0.1, 1.4, 0x3a3238), { geometry: new THREE.CylinderGeometry(0.03, 0.05, 0.7, 4), color: 0x3a3238, at: moved(THREE, 0.2, 1, 0, 0, 0, -0.8) }],
  };
  return mergeParts(THREE, table[kind]());
}

/** A small golf flag marking a map on the globe, about 6 units tall before scaling. */
export function makeFlag(THREE, color = 0xff2e88) {
  const pennant = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 5.8), new THREE.Vector2(2.2, 5), new THREE.Vector2(0, 4.2)]), { depth: 0.12, bevelEnabled: false });
  return mergeParts(THREE, [
    { geometry: new THREE.CylinderGeometry(1.1, 1.3, 0.3, 16), color: 0x2fbf5b, at: moved(THREE, 0, 0, 0) },
    { geometry: new THREE.CylinderGeometry(0.1, 0.12, 5.9, 8), color: 0xf8f8fc, at: moved(THREE, 0, 2.95, 0) },
    { geometry: pennant, color },
  ]);
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
      const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i), bump = 1 + 0.06 * Math.sin(nx * 3.1 + s) * Math.sin(ny * 2.7 + s * 2.1);
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
