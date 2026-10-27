/**
 * Game renderer: owns the WebGL renderer, scene, lights, sky, course build
 * and player actors, and draws one frame from plain snapshot data.
 *
 * It reads snapshots and never mutates simulation or session state. The
 * Three.js namespace and all browser objects are injected, and dispose()
 * releases every GPU resource the renderer created.
 */

import { BALL_RADIUS } from '../shared/constants.js';
import { movingRect, surfaceHeight } from '../simulation/physics.js';
import { createMaterialLibrary, PLAYER_COLORS } from './materials.js';
import { buildCourseScene, createLabel, disposeLabel } from './course-scene.js';
import { createAimGuide, createAura, createBall, createBlob, createConfetti, createTrail, placeAura, placeBlob } from './actors.js';
import { createWallFade } from './wall-fade.js';

const R = BALL_RADIUS;
/** Legacy canvas aspect: height is 0.625 of the width. */
export const VIEW_ASPECT = 1.6;
const MAX_PIXEL_RATIO = 2;

const defaultWebGLRenderer = (THREE, canvas) => new THREE.WebGLRenderer({ canvas, antialias: true });

/** Remote positions ease toward the latest snapshot and snap after a teleport (legacy dispOf). */
export function smoothRemotePosition(previous, target) {
  if (!previous || Math.hypot(target.x - previous.x, target.y - previous.y) > 200) return { x: target.x, y: target.y, z: target.z };
  return { x: previous.x + (target.x - previous.x) * 0.3, y: previous.y + (target.y - previous.y) * 0.3, z: previous.z + (target.z - previous.z) * 0.3 };
}

/**
 * @param {object} options
 * @param {object} options.THREE Three.js r128 namespace
 * @param {HTMLCanvasElement} options.canvas
 * @param {() => HTMLCanvasElement} [options.createCanvas] Defaults to document.createElement('canvas')
 * @param {() => number} [options.random=Math.random] Texture noise, fan particle phases and confetti
 * @param {number} [options.devicePixelRatio=1]
 * @param {(THREE: object, canvas: HTMLCanvasElement) => object} [options.createWebGLRenderer]
 */
export function createGameRenderer({ THREE, canvas, createCanvas, random = Math.random, devicePixelRatio = 1, createWebGLRenderer = defaultWebGLRenderer }) {
  if (!THREE) throw new TypeError('THREE is required');
  const makeCanvas = createCanvas || (() => canvas.ownerDocument.createElement('canvas'));
  const V = THREE.Vector3;

  const renderer = createWebGLRenderer(THREE, canvas);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO));

  const library = createMaterialLibrary({ THREE, createCanvas: makeCanvas, random, maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf0d8ee, 1800, 7000);
  const camera = new THREE.PerspectiveCamera(60, VIEW_ASPECT, 3, 8000);
  const owned = new Set();
  const own = resource => { owned.add(resource); return resource; };

  scene.add(new THREE.HemisphereLight(0xe2f0ff, 0xf2c9e8, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0cc, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 3.4;
  Object.assign(sun.shadow.camera, { left: -560, right: 560, top: 460, bottom: -460, near: 100, far: 2200 });
  scene.add(sun, sun.target);

  const sky = new THREE.Mesh(own(new THREE.SphereGeometry(6000, 24, 16)), library.skyMaterial);
  scene.add(sky);
  let environment = null;
  try {
    const generator = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), envGeometry = new THREE.SphereGeometry(50, 24, 16);
    envScene.add(new THREE.Mesh(envGeometry, library.skyMaterial));
    environment = own(generator.fromScene(envScene, 0).texture);
    generator.dispose();
    envGeometry.dispose();
  } catch {
    environment = null; // Same fallback as the legacy renderer when PMREM is unavailable.
  }

  const dreamBits = [];
  {
    const colors = [0xffc8e0, 0xc8e6ff, 0xd8ffd0, 0xfff0b8, 0xe0d0ff];
    for (let i = 0; i < 30; i++) {
      const a = i * 2.399, r = 1500 + (i % 7) * 330, color = colors[i % 5];
      const mesh = new THREE.Mesh(own(i % 3 ? new THREE.SphereGeometry(40 + (i % 5) * 26, 16, 12) : new THREE.TorusGeometry(60 + (i % 4) * 22, 16, 10, 24)), own(new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, emissive: color, emissiveIntensity: 0.18 })));
      mesh.position.set(1500 + Math.cos(a) * r, -20 + ((i * 97) % 560), 650 + Math.sin(a) * r);
      mesh.userData.y = mesh.position.y;
      mesh.userData.p = i;
      mesh.rotation.set(i, i * 0.7, 0);
      scene.add(mesh);
      dreamBits.push(mesh);
    }
  }
  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(14000, 14000)), own(new THREE.MeshStandardMaterial({ color: 0xd9c8f4, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(1500, -90, 650);
  ground.receiveShadow = true;
  scene.add(ground);

  const disposeObject = object => {
    object.geometry?.dispose();
    if (object.material) {
      const map = object.material.map;
      if (map && !library.isShared(map)) map.dispose();
      if (!library.isShared(object.material)) object.material.dispose();
    }
  };
  const ownedActors = [];
  const actor = object => { ownedActors.push(object); return object; };

  const localBall = actor(createBall(library, 0xffffff, 1, environment));
  scene.add(localBall);
  const localAura = actor(createAura(library));
  scene.add(localAura);
  const localBlob = actor(createBlob(library));
  scene.add(localBlob);
  const trail = createTrail(THREE);
  scene.add(actor(trail.points));
  const confetti = createConfetti(THREE, random);
  scene.add(actor(confetti.points));
  const aimGuide = createAimGuide(THREE);
  scene.add(actor(aimGuide.cone));
  for (const dot of aimGuide.dots) scene.add(actor(dot));

  const remotes = new Map();
  const updateWallFade = createWallFade(THREE);
  let build = null, lastMode = '', width = 0, disposed = false;

  function remoteActor(id) {
    let entry = remotes.get(id);
    if (!entry) {
      entry = { ball: createBall(library, 0xffffff, 0.7, environment), label: null, name: null, blob: createBlob(library), aura: null, shown: null };
      scene.add(entry.ball, entry.blob);
      remotes.set(id, entry);
    }
    return entry;
  }

  function disposeRemote(entry) {
    for (const object of [entry.ball, entry.blob, entry.aura]) if (object) { scene.remove(object); disposeObject(object); }
    if (entry.label) { scene.remove(entry.label); disposeLabel(entry.label); }
  }

  return {
    THREE,
    scene,
    camera,
    library,
    get course() { return build; },
    get localBall() { return localBall; },
    get remoteCount() { return remotes.size; },

    /** Legacy resize(): fixed 1.6 aspect from the container width; no-op when unchanged. */
    resize(containerWidth) {
      const w = Math.floor(containerWidth) || 800;
      if (w === width) return;
      width = w;
      renderer.setSize(w, Math.round(w * 0.625), false);
      camera.aspect = VIEW_ASPECT;
      camera.updateProjectionMatrix();
    },
    /** Legacy quality toggle. */
    setQuality(high, ratio = devicePixelRatio) {
      renderer.setPixelRatio(high ? Math.min(ratio || 1, MAX_PIXEL_RATIO) : 1);
      renderer.shadowMap.enabled = !!high;
      width = 0;
    },

    /**
     * Replaces the course scene. The previous build's resources are released first.
     * @param {object} course Legacy-shaped course definition (src/courses definitions)
     * @param {number} [puttIndex=0]
     */
    setCourse(course, puttIndex = 0) {
      if (disposed) throw new Error('Renderer has been disposed');
      build?.dispose();
      build = buildCourseScene({ library, course, puttIndex, environment });
      scene.add(build.group);
      return build;
    },

    /**
     * Updates actors/effects and draws one frame.
     *
     * @param {object} frame
     * @param {number} frame.now Milliseconds (animation clock)
     * @param {number} frame.dt Seconds since the previous frame
     * @param {number} [frame.hazardTime=0] Synchronized room seconds for moving hazards
     * @param {object|null} frame.local {x,y,z,vx,vy,moving,mode,color,effect,collected}
     * @param {object[]} [frame.remotes=[]] Players to show: {id,name,x,y,z,color,effect}
     * @param {object|null} [frame.aim=null] {charge,angle,aimAngle,spread,reverse} while charging
     * @param {object} frame.camera Pose from createCameraRig().update()
     */
    render({ now, dt, hazardTime = 0, local, remotes: shown = [], aim = null, camera: pose }) {
      if (disposed) throw new Error('Renderer has been disposed');
      const t = now / 1000;
      library.time.value = t;
      for (const m of dreamBits) { m.position.y = m.userData.y + Math.sin(t * 0.4 + m.userData.p) * 18; m.rotation.y += 0.002; }
      if (!build) { renderer.render(scene, camera); return; }
      const o = build.transform.origin, course = build.course;
      for (const flag of build.flags) {
        const a = flag.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(a.getX(i) * 0.2 + now * 0.004) * (a.getX(i) + 13) / 13 * 2);
        a.needsUpdate = true;
        flag.geometry.computeVertexNormals();
      }
      build.powerBlocks.forEach((block, k) => {
        block.mesh.visible = !(local?.collected?.[k]);
        block.mesh.rotation.y = t * 1.5 + k;
        block.mesh.position.y = surfaceHeight(course, ...block.at) + 18 + Math.sin(t * 3 + k) * 3;
      });
      for (const f of build.fans) {
        f.blades.rotation.z += dt * 14;
        const fa = f.fan;
        for (let i = 0; i < f.count; i++) {
          const ph = (f.phases[i] + t * 0.45) % 1;
          const sx = fa[0] + f.phases[(i * 7) % f.count] * fa[2], sy = fa[1] + f.phases[(i * 13) % f.count] * fa[3];
          f.positions[i * 3] = fa[4] ? fa[0] + (fa[4] > 0 ? ph : 1 - ph) * fa[2] : sx;
          f.positions[i * 3 + 1] = 6 + f.phases[(i * 5) % f.count] * 40;
          f.positions[i * 3 + 2] = fa[5] ? fa[1] + (fa[5] > 0 ? ph : 1 - ph) * fa[3] : sy;
        }
        f.geometry.attributes.position.needsUpdate = true;
      }

      const me = local || { x: 0, y: 0, z: 0, vx: 0, vy: 0, moving: false, mode: 'lobby', color: 0 };
      localBall.visible = me.mode === 'play' || me.mode === 'sunk';
      localBall.material.color.set(PLAYER_COLORS[me.color % 8]);
      localBall.position.set(me.x + o[0], me.z + R, me.y + o[1]);
      if (me.moving) { localBall.rotation.x += me.vy * dt / R; localBall.rotation.z -= me.vx * dt / R; }
      const floor = surfaceHeight(course, me.x, me.y);
      placeBlob(localBlob, me.x + o[0], isFinite(floor) ? floor : me.z, me.z, me.y + o[1], localBall.visible);

      for (const entry of remotes.values()) { entry.ball.visible = false; if (entry.label) entry.label.visible = false; if (entry.aura) entry.aura.visible = false; entry.blob.visible = false; }
      for (const p of shown) {
        const entry = remoteActor(p.id);
        const name = String(p.name).slice(0, 14);
        if (entry.name !== name) {
          if (entry.label) { scene.remove(entry.label); disposeLabel(entry.label); }
          entry.label = createLabel(library, name);
          scene.add(entry.label);
          entry.name = name;
        }
        const d = entry.shown = smoothRemotePosition(entry.shown, { x: +p.x || 0, y: +p.y || 0, z: +p.z || 0 });
        entry.ball.material.color.set(PLAYER_COLORS[(+p.color || 0) % 8]);
        entry.ball.position.set(d.x + o[0], d.z + R, d.y + o[1]);
        entry.label.position.set(d.x + o[0], d.z + 34, d.y + o[1]);
        entry.ball.visible = entry.label.visible = true;
        const remoteFloor = surfaceHeight(course, d.x, d.y);
        placeBlob(entry.blob, d.x + o[0], isFinite(remoteFloor) ? remoteFloor : d.z, d.z, d.y + o[1], true);
      }
      placeAura(localAura, me.effect, localBall.position, me.mode === 'play', t);
      for (const p of shown) {
        const entry = remotes.get(p.id);
        if (!entry.aura) { entry.aura = createAura(library); scene.add(entry.aura); }
        placeAura(entry.aura, p.effect, entry.ball.position, true, t);
      }
      trail.update(localBall.position, me.moving, localBall.visible && me.mode === 'play', PLAYER_COLORS[me.color % 8]);
      if (me.mode === 'sunk' && lastMode !== 'sunk') confetti.burst(localBall.position);
      lastMode = me.mode;
      confetti.update(dt);
      for (const { mesh, mover } of build.movers) {
        const r = movingRect(mover, hazardTime);
        mesh.position.x = r[0] + r[2] / 2;
        mesh.position.z = r[1] + r[3] / 2;
      }
      for (const { vortex: v, particles, count } of build.vortices) {
        const a = particles.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
          const f = (i / count + t * 0.27) % 1, r = 8 + f * v[2] * 0.6, ang = i * 2.399 + t * 5 * Math.sign(v[3]);
          a.setXYZ(i, v[0] + Math.cos(ang) * r, f * 150, v[1] + Math.sin(ang) * r);
        }
        a.needsUpdate = true;
      }
      aimGuide.hide();
      if (aim && me.mode === 'play' && !me.moving && aim.charge > 0.015) aimGuide.show(new V(me.x + o[0], me.z + R, me.y + o[1]), aim);

      if (pose.ball) localBall.position.set(...pose.ball);
      camera.position.set(...pose.position);
      camera.lookAt(new V(...pose.look));
      sky.position.copy(camera.position);
      sun.target.position.set(...pose.sunTarget);
      sun.position.set(pose.sunTarget[0] + 250, pose.sunTarget[1] + 700, pose.sunTarget[2] + 350);
      updateWallFade(build.wallFade, dt, camera.position, pose.fadeTarget ? new V(...pose.fadeTarget) : null);
      renderer.render(scene, camera);
    },

    /** Releases every geometry, material, texture and the WebGL context owner. Idempotent. */
    dispose() {
      if (disposed) return;
      disposed = true;
      build?.dispose();
      build = null;
      for (const entry of remotes.values()) disposeRemote(entry);
      remotes.clear();
      for (const object of ownedActors) { scene.remove(object); disposeObject(object); }
      for (const resource of owned) resource.dispose();
      owned.clear();
      library.dispose();
      renderer.dispose?.();
    },
  };
}
