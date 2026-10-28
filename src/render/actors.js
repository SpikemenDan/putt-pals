import { displayColor } from './materials.js';
/**
 * Per-player scene actors: balls, contact shadows, effect auras, the ball
 * trail, sink confetti and the aim guide. Ported from the legacy renderer
 * with identical geometry and per-frame arithmetic; in the toon style balls
 * are flat and ink-outlined and the trail is hard-edged.
 */

import { BALL_RADIUS } from '../shared/constants.js';
import { EFFECT_COLORS, EFFECT_KINDS } from './materials.js';
import { addInk } from './outline.js';

const R = BALL_RADIUS;

/** Legacy mkBall(): dimpled clear-coated sphere, or a flat inked one in the toon style. Caller adds it to the scene. */
export function createBall(library, color, opacity, environment) {
  const { THREE } = library;
  if (library.style === 'toon') {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), library.toon(color, { transparent: opacity < 1, opacity }));
    mesh.castShadow = true;
    // A see-through remote ball draws its ink after itself, so the hull's inside never shows through it.
    addInk(THREE, mesh, opacity < 1 ? library.ink.overlay : library.ink.solid);
    return mesh;
  }
  const map = library.textures.ball.clone();
  map.needsUpdate = true;
  map.repeat.set(4, 2);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), new THREE.MeshPhysicalMaterial({ color, map, bumpMap: map, bumpScale: 1.4, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, envMap: environment, envMapIntensity: 1.1, transparent: opacity < 1, opacity }));
  mesh.castShadow = true;
  return mesh;
}

/** Legacy mkBlob(): soft contact shadow under a ball. */
export function createBlob(library) {
  const { THREE } = library;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.4, R * 3.4), new THREE.MeshBasicMaterial({ map: library.textures.blob, transparent: true, depthWrite: false, fog: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  return blob;
}

/** Legacy setBlob(): position/scale/fade a contact shadow from floor height fz and ball height z. */
export function placeBlob(blob, worldX, floorZ, ballZ, worldZ, visible) {
  blob.visible = !!visible;
  if (!visible) return;
  const up = Math.max(0, Math.min(1, (ballZ - floorZ) / 110));
  blob.position.set(worldX, floorZ + 0.9, worldZ);
  blob.scale.setScalar(1 + up * 0.9);
  blob.material.opacity = 0.55 * (1 - up * 0.8);
}

/** Legacy makeAura(): hidden by default. Caller adds it to the scene. */
export function createAura(library) {
  const { THREE } = library;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.7, 24, 18), library.aura());
  mesh.visible = false;
  return mesh;
}

/** Legacy updateAura(). */
export function placeAura(mesh, type, position, visible, time) {
  mesh.visible = !!(visible && EFFECT_COLORS[type]);
  if (!mesh.visible) return;
  mesh.position.copy(position);
  displayColor(mesh.material.uniforms.col.value, EFFECT_COLORS[type]);
  mesh.material.uniforms.kind.value = EFFECT_KINDS.indexOf(type);
  mesh.scale.setScalar(1 + Math.sin(time * 5) * 0.1);
}

/** Ball trail: additive soft points that fade along the path (hard-edged dots in the toon style). */
export function createTrail(THREE, { toon = false } = {}) {
  const N = 26, positions = new Float32Array(N * 3), alphas = new Float32Array(N), geometry = new THREE.BufferGeometry();
  let length = 0;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('a', new THREE.BufferAttribute(alphas, 1));
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({ uniforms: { col: { value: displayColor(new THREE.Color(), 0xffffff) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: 'attribute float a;varying float va;void main(){va=a;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=a*30.*(300./-mv.z);gl_Position=projectionMatrix*mv;}', fragmentShader: toon ? 'uniform vec3 col;varying float va;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>.55)discard;gl_FragColor=vec4(col,va*.5);}' : 'uniform vec3 col;varying float va;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(col,(1.-d)*(1.-d)*va*.6);}' }));
  points.frustumCulled = false;
  return {
    points,
    get length() { return length; },
    update(p, moving, visible, color) {
      points.visible = !!visible;
      if (!visible) { length = 0; return; }
      displayColor(points.material.uniforms.col.value, color);
      if (moving) {
        if (length && Math.hypot(p.x - positions[0], p.y - positions[1], p.z - positions[2]) > 90) length = 0;
        positions.copyWithin(3, 0, (N - 1) * 3);
        positions[0] = p.x; positions[1] = p.y; positions[2] = p.z;
        length = Math.min(length + 1, N);
      } else length = Math.max(0, length - 1);
      for (let i = 0; i < N; i++) alphas[i] = i < length ? (1 - i / N) : 0;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.a.needsUpdate = true;
    },
  };
}

/** Confetti burst when the ball sinks. */
export function createConfetti(THREE, random) {
  const N = 90, positions = new Float32Array(N * 3), colors = new Float32Array(N * 3), velocity = new Float32Array(N * 3), geometry = new THREE.BufferGeometry();
  let remaining = 0;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('ccol', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({ uniforms: { op: { value: 1 } }, transparent: true, depthWrite: false, vertexShader: 'attribute vec3 ccol;varying vec3 vc;void main(){vc=ccol;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=11.*(300./-mv.z);gl_Position=projectionMatrix*mv;}', fragmentShader: 'uniform float op;varying vec3 vc;void main(){vec2 q=abs(gl_PointCoord-.5)*2.;if(max(q.x,q.y)>.85)discard;gl_FragColor=vec4(vc,op);}' }));
  points.frustumCulled = false;
  points.visible = false;
  const palette = [0xff7ac8, 0xffd23f, 0x7fe3ff, 0xb8f0a2, 0xc9a8ff, 0xffffff];
  return {
    points,
    get remaining() { return remaining; },
    burst(p) {
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        displayColor(c, palette[i % 6]);
        colors.set([c.r, c.g, c.b], i * 3);
        positions.set([p.x, p.y + 8, p.z], i * 3);
        const a = random() * 6.283, speed = 40 + random() * 110;
        velocity.set([Math.cos(a) * speed, 110 + random() * 170, Math.sin(a) * speed], i * 3);
      }
      geometry.attributes.ccol.needsUpdate = true;
      remaining = 2.4;
      points.visible = true;
    },
    update(dt) {
      if (remaining <= 0) { points.visible = false; return; }
      remaining -= dt;
      for (let i = 0; i < N; i++) {
        velocity[i * 3 + 1] -= 240 * dt; velocity[i * 3] *= 0.985; velocity[i * 3 + 2] *= 0.985;
        positions[i * 3] += velocity[i * 3] * dt; positions[i * 3 + 1] += velocity[i * 3 + 1] * dt; positions[i * 3 + 2] += velocity[i * 3 + 2] * dt;
      }
      points.material.uniforms.op.value = Math.max(0, Math.min(1, remaining / 0.8));
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

/** Aim guide: spread cone plus twelve power-coloured dots along the shot line. */
export function createAimGuide(THREE) {
  const coneGeometry = new THREE.BufferGeometry();
  coneGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const cone = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({ color: 0xffb95b, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  cone.frustumCulled = false;
  const dots = [];
  for (let i = 0; i < 12; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(2.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dot.visible = false;
    dots.push(dot);
  }
  return {
    cone, dots,
    hide() { dots.forEach(d => { d.visible = false; }); cone.visible = false; },
    /**
     * @param {{x:number,y:number,z:number}} bp Ball centre (world)
     * @param {{charge:number, angle:number, aimAngle:number, spread:number, reverse?:boolean}} aim
     *   angle is the swayed shot direction (legacy shotAngle), aimAngle the raw pointer aim (legacy aa).
     */
    show(bp, aim) {
      const L = 50 + aim.charge * 250, base = aim.aimAngle + (aim.reverse ? Math.PI : 0), sp = aim.spread, pos = coneGeometry.attributes.position;
      pos.setXYZ(0, bp.x, bp.y, bp.z);
      pos.setXYZ(1, bp.x + Math.cos(base - sp) * L, bp.y, bp.z + Math.sin(base - sp) * L);
      pos.setXYZ(2, bp.x + Math.cos(base + sp) * L, bp.y, bp.z + Math.sin(base + sp) * L);
      pos.needsUpdate = true;
      cone.visible = true;
      const color = new THREE.Color().setHSL((120 - aim.charge * 120) / 360, 0.85, 0.6);
      dots.forEach((d, i) => { const r = (i + 1) * L / 12; d.position.set(bp.x + Math.cos(aim.angle) * r, bp.y, bp.z + Math.sin(aim.angle) * r); d.material.color.copy(color); d.visible = true; });
    },
  };
}
