/**
 * Builds the Three.js scene graph for one course putt.
 *
 * A faithful port of the legacy buildAll(): same meshes, order, dimensions,
 * materials and cup cutouts. Geometry comes from a legacy-shaped course
 * definition (src/courses) instead of the HTML's global HOLES array, and every
 * GPU resource created here is owned by the returned build and released by
 * its dispose().
 */

import { cupOf, rampHeight, surfaceHeight, CUP_DEPTH, WALL_HEIGHT } from '../simulation/physics.js';
import { displayColor, TELEPORTER_COLORS } from './materials.js';
import { createWorldTransform, resolveRenderCourse } from './transform.js';

/** Text sprite used for tee/cup markers and player names (legacy label()). */
export function createLabel(library, text) {
  const { THREE } = library;
  const canvas = library.createCanvas();
  canvas.width = 256; canvas.height = 64;
  const g = canvas.getContext('2d');
  g.font = 'bold 34px system-ui'; g.textAlign = 'center'; g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(text, 128, 44);
  g.fillStyle = '#fff'; g.fillText(text, 128, 44);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
  sprite.scale.set(70, 17.5, 1);
  sprite.renderOrder = 5;
  return sprite;
}

/** Disposes a sprite label's own material and texture (the sprite geometry is shared by Three.js). */
export function disposeLabel(sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

function box(THREE, w, h, d, material, position, shadows) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(...position);
  if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
  return mesh;
}

/** World-space cup cutout on standard materials (legacy cutCup); returns the replaced material. */
function cutCup(THREE, mesh, course, origin) {
  if (!mesh.isMesh || !mesh.material.isMeshStandardMaterial) return null;
  const replaced = mesh.material;
  const material = replaced.clone();
  mesh.material = material;
  const radius = cupOf(course);
  material.onBeforeCompile = shader => {
    shader.uniforms.cupCenter = { value: new THREE.Vector2(course.hole[0] + origin[0], course.hole[1] + origin[1]) };
    shader.vertexShader = 'varying vec3 cupWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ncupWorld=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader = 'varying vec3 cupWorld;uniform vec2 cupCenter;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif(distance(cupWorld.xz,cupCenter)<' + radius.toFixed(1) + ')discard;');
  };
  material.customProgramCacheKey = () => 'cup-cut-v5-' + radius;
  return replaced;
}

/**
 * @param {object} options
 * @param {ReturnType<import('./materials.js').createMaterialLibrary>} options.library
 * @param {object} options.course Legacy-shaped course definition with optional putts
 * @param {number} [options.puttIndex=0]
 * @param {object} [options.environment=null] Environment map texture (owned by the caller)
 * @param {[number, number]} [options.origin=[0, 0]]
 */
export function buildCourseScene({ library, course, puttIndex = 0, environment = null, origin = [0, 0] }) {
  const { THREE, textures: T } = library;
  const random = library.random;
  const hl = resolveRenderCourse(course, puttIndex);
  const transform = createWorldTransform(origin);
  const at = (x, y, h) => transform.local(x, y, h);
  const orphans = [];
  const flags = [], fans = [], vortices = [], movers = [], wallFade = [];

  const g = new THREE.Group();
  g.position.set(...transform.ground(0, 0, 0));

  for (const tile of hl.tiles) {
    g.add(box(THREE, tile[2], 35, tile[3], library.patterned(T.brick, 3, 1), at(tile[0] + tile[2] / 2, tile[1] + tile[3] / 2, -25)));
    const floor = box(THREE, tile[2], 10, tile[3], library.patterned(T.turf, tile[2] / 80, tile[3] / 80, { roughness: 0.9 }), at(tile[0] + tile[2] / 2, tile[1] + tile[3] / 2, -5));
    floor.receiveShadow = true;
    g.add(floor);
  }
  for (const s of hl.sand) g.add(box(THREE, s[2], 1.5, s[3], library.patterned(T.sand, s[2] / 80, s[3] / 80, { roughness: 1 }), at(s[0] + s[2] / 2, s[1] + s[3] / 2, 0.8)));
  for (const s of hl.ice) g.add(box(THREE, s[2], 1.5, s[3], library.patterned(T.ice, s[2] / 80, s[3] / 80, { roughness: 0.08, metalness: 0.25 }), at(s[0] + s[2] / 2, s[1] + s[3] / 2, 0.8)));
  for (const s of hl.slime) g.add(box(THREE, s[2], 1.5, s[3], library.patterned(T.slime, s[2] / 80, s[3] / 80, { roughness: 0.35 }), at(s[0] + s[2] / 2, s[1] + s[3] / 2, 0.8)));
  for (const r of hl.w) {
    const wall = box(THREE, r[2], WALL_HEIGHT, r[3], library.patterned(T.brick, Math.max(r[2], r[3]) / 90, 1, { transparent: true }), at(r[0] + r[2] / 2, r[1] + r[3] / 2, WALL_HEIGHT / 2), true);
    wall.userData.fade = true;
    g.add(wall);
  }
  for (const p of hl.pl) {
    const platform = box(THREE, p[2], p[4] + 10, p[3], library.patterned(T.plat, p[2] / 90, p[3] / 90, { roughness: 0.4, transparent: true }), at(p[0] + p[2] / 2, p[1] + p[3] / 2, p[4] / 2 - 5), true);
    platform.userData.fade = true;
    g.add(platform);
  }
  for (const r of hl.rp) {
    const geometry = new THREE.BufferGeometry(), verts = [], uv = [], N = 48;
    const alongX = r[4][1] === 'x';
    for (let k = 0; k < N; k++) {
      const quad = [];
      for (const [t, v] of [[k / N, 0], [(k + 1) / N, 0], [(k + 1) / N, 1], [k / N, 1]]) {
        const x = r[0] + (alongX ? t : v) * r[2], y = r[1] + (alongX ? v : t) * r[3];
        quad.push([...at(x, y, rampHeight(r, x, y)), t, v]);
      }
      for (const n of [0, 2, 1, 0, 3, 2]) { verts.push(...quad[n].slice(0, 3)); uv.push(...quad[n].slice(3)); }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    const ramp = new THREE.Mesh(geometry, library.patterned(T.ramp, 2, 2, { side: THREE.DoubleSide }));
    ramp.receiveShadow = ramp.castShadow = true;
    g.add(ramp);
  }
  for (const p of hl.pit) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(p[2], p[3]), library.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(...at(p[0] + p[2] / 2, p[1] + p[3] / 2, 1.2));
    g.add(water);
  }
  for (const p of hl.pd) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(18, 32), library.pad);
    pad.rotation.x = -Math.PI / 2; pad.position.set(...at(p[0], p[1], 1.6)); g.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(18, 2, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa7700, metalness: 0.6, roughness: 0.3, envMap: environment, envMapIntensity: 1 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(...at(p[0], p[1], 2.5)); g.add(ring);
  }
  for (const t of hl.tp) for (let k = 0; k < 2; k++) {
    const x = k ? t[2] : t[0], y = k ? t[3] : t[1], color = TELEPORTER_COLORS[t[4] % 3];
    const portal = new THREE.Mesh(new THREE.CircleGeometry(22, 32), library.portal(color));
    portal.rotation.x = -Math.PI / 2; portal.position.set(...at(x, y, 1.8)); g.add(portal);
    // r128 used the beam hex unconverted; keep that additive glow rather than the linearised colour (R2c #57).
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 80, 24, 1, true), new THREE.MeshBasicMaterial({ color: displayColor(new THREE.Color(), color), userData: { displayColor: true }, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.set(...at(x, y, 40)); g.add(beam);
  }
  for (const fa of hl.fan) {
    const fanGroup = new THREE.Group(), span = fa[4] ? fa[3] : fa[2];
    fanGroup.position.set(...at(fa[0] + fa[2] / 2 - fa[4] * fa[2] / 2, fa[1] + fa[3] / 2 - fa[5] * fa[3] / 2, 32));
    fanGroup.rotation.y = Math.atan2(fa[4], fa[5]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(span, fa[4] ? fa[3] : fa[2]) / 2 * 0.9, 3, 10, 32), new THREE.MeshStandardMaterial({ color: 0x666a80, metalness: 0.8, roughness: 0.3, envMap: environment, envMapIntensity: 1 }));
    ring.castShadow = true; fanGroup.add(ring);
    const blades = new THREE.Group(), radius = Math.min(fa[2], fa[3]) * 0.42;
    for (let k = 0; k < 4; k++) {
      const blade = box(THREE, radius, 6, 2, new THREE.MeshStandardMaterial({ color: 0xdde3ff, metalness: 0.7, roughness: 0.25 }), [radius / 2, 0, 0], true);
      const pivot = new THREE.Group(); pivot.rotation.z = k * Math.PI / 2; pivot.add(blade); blades.add(pivot);
    }
    fanGroup.add(blades); g.add(fanGroup);
    const N = 36, positions = new Float32Array(N * 3), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 7, map: T.soft, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    points.frustumCulled = false; g.add(points);
    fans.push({ blades, positions, geometry, fan: fa, count: N, phases: Array.from({ length: N }, () => random()) });
  }

  g.traverse(mesh => { const replaced = cutCup(THREE, mesh, hl, transform.origin); if (replaced) orphans.push(replaced); });
  g.updateMatrixWorld(true);
  g.traverse(mesh => { if (mesh.userData.fade) wallFade.push({ mesh, alpha: 1, box: null }); });

  const cup = cupOf(hl);
  const holeHeight = surfaceHeight(hl, hl.hole[0], hl.hole[1]);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(cup, cup, CUP_DEPTH, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x283c35, roughness: 0.85, side: THREE.BackSide }));
  sleeve.position.set(...at(hl.hole[0], hl.hole[1], holeHeight - CUP_DEPTH / 2)); g.add(sleeve);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(cup, 64), new THREE.MeshBasicMaterial({ color: 0 }));
  bottom.rotation.x = -Math.PI / 2; bottom.position.set(...at(hl.hole[0], hl.hole[1], holeHeight - CUP_DEPTH)); g.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(cup + 0.7, 0.65, 8, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2; rim.position.set(...at(hl.hole[0], hl.hole[1], holeHeight + 0.2)); g.add(rim);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 60, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.3, envMap: environment, envMapIntensity: 0.9 }));
  pole.position.set(...at(hl.hole[0], hl.hole[1], holeHeight + 30)); pole.castShadow = true; g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(26, 16, 12, 6), new THREE.MeshBasicMaterial({ color: 0xff4fb8, side: THREE.DoubleSide }));
  flag.position.set(...at(hl.hole[0] + 13, hl.hole[1], holeHeight + 52)); g.add(flag); flags.push(flag);

  (course.putts || []).forEach((putt, k) => {
    if (k === puttIndex) return;
    const y = surfaceHeight(hl, putt.hole[0], putt.hole[1]);
    const marker = new THREE.Mesh(new THREE.CircleGeometry(cupOf({ cup: putt.cup || course.cup }), 40), new THREE.MeshBasicMaterial({ color: 0x101418, transparent: true, opacity: 0.8 }));
    marker.rotation.x = -Math.PI / 2; marker.position.set(...at(putt.hole[0], putt.hole[1], y + 0.5)); g.add(marker);
    const cupLabel = createLabel(library, 'CUP ' + (k + 1)); cupLabel.position.set(...at(putt.hole[0], putt.hole[1], y + 34)); g.add(cupLabel);
    const teeLabel = createLabel(library, 'TEE ' + (k + 1)); teeLabel.position.set(...at(putt.tee[0], putt.tee[1], surfaceHeight(hl, putt.tee[0], putt.tee[1]) + 22)); g.add(teeLabel);
  });

  const powerBlocks = hl.q.map(q => {
    const block = box(THREE, 24, 24, 24, library.powerBlock(), at(q[0], q[1], surfaceHeight(hl, ...q) + 18), true);
    g.add(block);
    return { mesh: block, at: q };
  });

  // Deterministic landscape outside the playable rails.
  for (let j = 0; j < 10; j++) {
    const tree = new THREE.Group();
    tree.position.set(...at(30 + j * 83, j % 2 ? -58 : 558, -5));
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(3, 6, 58, 8), new THREE.MeshStandardMaterial({ color: 0x665039, roughness: 1 }));
    trunk.position.y = 29; trunk.castShadow = true; tree.add(trunk);
    for (let k = 0; k < 3; k++) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(25 - k * 4, 1), new THREE.MeshStandardMaterial({ color: [0x3d6d49, 0x528552, 0x79a361][k], roughness: 1 }));
      crown.position.set(Math.sin(k * 2 + j) * 9, 58 + k * 15, Math.cos(k + j) * 6); crown.castShadow = true; tree.add(crown);
    }
    g.add(tree);
  }
  for (const v of hl.tornado) {
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(v[2] * 0.6, 10, 150, 40, 16, true), library.vortex());
    funnel.position.set(...at(v[0], v[1], 75)); g.add(funnel);
    const count = 180, geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const particles = new THREE.Points(geometry, library.vortexParticles());
    particles.frustumCulled = false; g.add(particles);
    vortices.push({ vortex: v, mesh: funnel, particles, count });
  }
  for (const h of hl.movers) {
    const mesh = box(THREE, h[2], WALL_HEIGHT, h[3], library.hazard(), at(h[0] + h[2] / 2, h[1] + h[3] / 2, surfaceHeight(hl, h[0], h[1]) + WALL_HEIGHT / 2), true);
    g.add(mesh);
    movers.push({ mesh, mover: h });
  }

  let disposed = false;
  return {
    group: g,
    course: hl,
    puttIndex,
    transform,
    flags, fans, vortices, movers, wallFade, powerBlocks,
    /** Cup centre in world space (legacy holePos: surface height, no ball offset). */
    holePosition: transform.ground(hl.hole[0], hl.hole[1], holeHeight),
    /** Releases every geometry, material and texture this build created. Idempotent. */
    dispose() {
      if (disposed) return;
      disposed = true;
      g.parent?.remove(g);
      const geometries = new Set(), materials = new Set(orphans), maps = new Set();
      g.traverse(o => {
        if (o.geometry && !o.isSprite) geometries.add(o.geometry);
        if (o.material && !library.isShared(o.material)) materials.add(o.material);
      });
      for (const material of materials) if (material.map && !library.isShared(material.map)) maps.add(material.map);
      geometries.forEach(x => x.dispose());
      materials.forEach(x => x.dispose());
      maps.forEach(x => x.dispose());
      flags.length = fans.length = vortices.length = movers.length = wallFade.length = powerBlocks.length = 0;
    },
  };
}
