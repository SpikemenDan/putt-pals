/**
 * Sky world (V1b #59): the environment the toon courses float in.
 *
 * A banded comic sky dome with a sun disc, halo and rays; flat cel-shaded clouds (one merged mesh per
 * layer); and a few distant birds. Everything is decoration far from the playable area: the dome and
 * the horizon layer follow the camera, so nothing can pass between the camera and the course, and the
 * cloud deck sits well below the course. Materials ignore fog and lights, so they read the same in
 * every camera view. Deterministic: no random input.
 *
 * Browser objects and the Three.js namespace are injected. dispose() releases every resource created.
 */

import { displayColor } from './materials.js';
import { DEFAULT_PALETTE } from '../courses/palettes.js';

const DOME_RADIUS = 6000;
const HORIZON_RING = [3300, 4700];
/** Horizon clouds keep their near edge this far from the camera, and their far edge inside the camera's far plane. */
const RING_NEAR_EDGE = 1800, RING_CENTRE_MAX = 4700;
const DECK_HEIGHT = [-1700, -1250];

// Display-sRGB colours written directly by the shader, like the other effect shaders (R2c #57).
const DOME_VERTEX = 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const DOME_FRAGMENT = `varying vec3 p;
uniform float time;
uniform vec3 skyUp[5];
uniform vec3 skyDown[3];
uniform float sunAmount;
uniform float flash;
void main(){
  vec3 q=normalize(p);
  float y=q.y;
  vec3 c;
  if(y>=0.){
    c=skyUp[int(floor(clamp(y,0.,.999)*5.))];
  }else{
    c=skyDown[int(floor(clamp(-y,0.,.999)*3.))];
  }
  vec3 sd=normalize(vec3(.35,.65,.5));
  float d=dot(q,sd);
  float a=acos(clamp(d,-1.,1.));
  vec3 up=abs(sd.y)>.99?vec3(1.,0.,0.):vec3(0.,1.,0.);
  vec3 ex=normalize(cross(up,sd)),ey=cross(sd,ex);
  float ang=atan(dot(q,ey),dot(q,ex));
  float spin=ang*8./6.2831853+time*.01;
  float front=step(0.,d)*sunAmount;
  float rays=step(.5,fract(spin))*step(.2,a)*(1.-step(.34,a));
  c=mix(c,vec3(1.,.95,.62),rays*.8*front);
  c=mix(c,vec3(1.,.9,.5),(1.-step(.2,a))*front*.85);
  c=mix(c,vec3(1.,.99,.86),(1.-step(.08,a))*sunAmount);
  c=mix(c,vec3(.94,.96,1.),flash*.6);
  gl_FragColor=vec4(c,1.);
}`;

const CLOUD_TOP = 0xffffff;
const CLOUD_UNDER = 0xb3d3fb;
const BIRD_INK = 0x14102a;

/** Small deterministic generator (mulberry32) so the sky looks the same in every session. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Merge flat-based puffy clouds into one geometry with two flat colour bands (white top, pale blue
 * underside): a single draw call per layer.
 */
function buildCloudGeometry(THREE, clouds) {
  const template = new THREE.SphereGeometry(1, 10, 7);
  const tp = template.attributes.position, ti = template.index;
  const topColour = new THREE.Color(CLOUD_TOP), underColour = new THREE.Color(CLOUD_UNDER);
  const puffs = clouds.reduce((n, c) => n + c.puffs.length, 0);
  // Not indexed: every triangle carries one flat colour, so the underside is a hard cel band, not a gradient.
  const positions = new Float32Array(puffs * ti.count * 3), colours = new Float32Array(puffs * ti.count * 3);
  let v = 0;
  for (const cloud of clouds) {
    for (const puff of cloud.puffs) {
      const corner = k => {
        // Flat base: puffs are cut off at the cloud's own bottom plane.
        const ly = Math.max(puff.y + tp.getY(k) * puff.r * 0.8, -0.34);
        return [cloud.x + (puff.x + tp.getX(k) * puff.r) * cloud.s, cloud.y + ly * cloud.s, cloud.z + (puff.z + tp.getZ(k) * puff.r) * cloud.s, ly];
      };
      for (let k = 0; k < ti.count; k += 3) {
        const corners = [corner(ti.getX(k)), corner(ti.getX(k + 1)), corner(ti.getX(k + 2))];
        const col = (corners[0][3] + corners[1][3] + corners[2][3]) / 3 > -0.1 ? topColour : underColour;
        for (const c of corners) {
          positions.set(c.slice(0, 3), v * 3);
          colours.set([col.r, col.g, col.b], v * 3);
          v++;
        }
      }
    }
  }
  template.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/** Horizontal half-extent of a cloud in units of its scale: half the puff row plus the end puffs' radius. */
const halfExtent = cloud => (cloud.puffs.length - 1) / 2 * 0.9 + 1;

/**
 * One procedural cumulus: a row of puffs that arches toward a random peak, with uneven spacing,
 * a chance of a tall billow stacked on the highest puff and small wisps at the ends. Every choice comes
 * from `rand`, so a seed always gives the same sky.
 */
function generateCloud(rand, x, y, z, s) {
  const n = 4 + Math.floor(rand() * 6), mid = (n - 1) / 2, peak = (rand() - 0.5) * 0.8, squash = 0.7 + rand() * 0.6, puffs = [];
  let at = -mid * 0.85;
  for (let k = 0; k < n; k++) {
    const o = (k - mid) / n, arch = Math.max(0, 1 - Math.abs(o - peak * 0.3) * 1.5), end = k === 0 || k === n - 1;
    const r = end && rand() < 0.5 ? 0.3 + rand() * 0.15 : 0.4 + arch * 0.45 * (0.8 + rand() * 0.4);
    puffs.push({ x: at, y: arch * 0.34 * squash + (k % 2) * 0.08 * rand() * 2, z: (rand() - 0.5) * 0.6, r });
    at += 0.7 + rand() * 0.3;
  }
  if (rand() < 0.45) {
    const top = puffs.reduce((a, b) => (b.r > a.r ? b : a));
    puffs.push({ x: top.x + (rand() - 0.5) * 0.4, y: top.y + top.r * 0.75, z: top.z, r: top.r * (0.55 + rand() * 0.25) });
  }
  return { x, y, z, s, puffs };
}

/**
 * Lays out the two cloud layers for a set of cloud parameters.
 * @param {{seed: number, ring: number, deck: number, scale: number}} params
 */
function generateLayers(params) {
  const rand = seeded(params.seed);
  const ring = [];
  for (let k = 0; k < params.ring; k++) {
    const angle = (k / params.ring) * Math.PI * 2 + rand() * 0.3, cloud = generateCloud(rand, 0, -250 + rand() * 900, 0, (320 + rand() * 280) * params.scale);
    // Keep the whole cloud away from the camera and inside the far plane, whatever its size.
    const unit = halfExtent(cloud);
    cloud.s = Math.min(cloud.s, (RING_CENTRE_MAX - RING_NEAR_EDGE) / unit);
    const near = Math.max(HORIZON_RING[0], RING_NEAR_EDGE + unit * cloud.s), radius = near + rand() * Math.max(0, RING_CENTRE_MAX - near);
    cloud.x = Math.cos(angle) * radius;
    cloud.z = Math.sin(angle) * radius;
    ring.push(cloud);
  }
  // The deck sits well below the courses; its clouds are capped so none can rise toward them.
  const deck = [];
  for (let k = 0; k < params.deck; k++) {
    deck.push(generateCloud(rand, -1800 + rand() * 6600, DECK_HEIGHT[0] + rand() * (DECK_HEIGHT[1] - DECK_HEIGHT[0]), -2400 + rand() * 6000, (300 + rand() * 240) * Math.min(params.scale, 1.15)));
  }
  return { ring, deck };
}

export function createSkyWorld({ THREE }) {
  if (!THREE) throw new TypeError('THREE is required');
  const owned = [];
  const own = resource => { owned.push(resource); return resource; };

  const time = { value: 0 };
  // Band colours are raw display sRGB values, like every other effect shader (R2c #57).
  const skyUp = { value: Array.from({ length: 5 }, () => new THREE.Color()) };
  const skyDown = { value: Array.from({ length: 3 }, () => new THREE.Color()) };
  const sunAmount = { value: 1 };
  const flash = { value: 0 };
  const dome = new THREE.Mesh(
    own(new THREE.SphereGeometry(DOME_RADIUS, 48, 32)),
    own(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time, skyUp, skyDown, sunAmount, flash }, vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT })),
  );
  dome.frustumCulled = false;

  const cloudMaterial = own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  const cloudTint = new THREE.Color();

  // Horizon layer: big distant clouds that circle the camera, so they stay far away in every view.
  // Cloud deck: far below the courses, so the floating islands have something to float above.
  // Both are generated from the course's cloud parameters (setMood) and replaced when those change.
  const horizon = new THREE.Group();
  const ringMesh = new THREE.Mesh(new THREE.BufferGeometry(), cloudMaterial);
  horizon.add(ringMesh);
  const deck = new THREE.Mesh(new THREE.BufferGeometry(), cloudMaterial);
  let cloudKey = '', drift = 0.004;
  function setClouds(params) {
    const key = [params.seed, params.ring, params.deck, params.scale].join('|');
    drift = params.drift;
    if (key === cloudKey) return;
    cloudKey = key;
    const { ring, deck: deckClouds } = generateLayers(params);
    for (const [mesh, clouds] of [[ringMesh, ring], [deck, deckClouds]]) {
      const old = mesh.geometry;
      mesh.geometry = own(buildCloudGeometry(THREE, clouds));
      old.dispose();
      const at = owned.indexOf(old);
      if (at >= 0) owned.splice(at, 1);
    }
  }

  // Distant birds: flat gull silhouettes that turn to face the camera and flap as they circle.
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.04, 0, -0.55, 0.3, 0, -0.55, 0, 0, -0.55, 0.3, 0, -1.05, 0.1, 0, -0.55, 0, 0]), 3));
  own(wing);
  const birdMaterial = own(new THREE.MeshBasicMaterial({ color: BIRD_INK, side: THREE.DoubleSide, fog: false }));
  const birds = [];
  const flock = new THREE.Group();
  for (let k = 0; k < 7; k++) {
    const bird = new THREE.Group(), left = new THREE.Mesh(wing, birdMaterial), right = new THREE.Mesh(wing, birdMaterial);
    right.scale.x = -1;
    bird.add(left, right);
    bird.scale.setScalar(70 + (k % 3) * 22);
    flock.add(bird);
    birds.push({ bird, left, right, phase: k * 1.7, angle: k * 0.9, speed: 0.006 + (k % 4) * 0.0015, radius: 2300 + k * 230, height: 280 + (k % 3) * 170 });
  }

  const group = new THREE.Group();
  group.add(horizon, deck, flock);

  /**
   * Sets the sky colours from a palette's `sky` (band colours, sun strength, cloud tint). Plain colour
   * changes: no geometry or material is created, so a course swap costs nothing.
   */
  function setMood(sky) {
    sky.up.forEach((hex, k) => displayColor(skyUp.value[k], hex));
    sky.down.forEach((hex, k) => displayColor(skyDown.value[k], hex));
    sunAmount.value = sky.sun;
    setClouds(sky.clouds);
    cloudTint.set(sky.cloudTint); // a built-in material colour: Three.js converts it like the cloud vertex colours
    cloudMaterial.color.copy(cloudTint);
    flash.value = 0;
  }
  setMood(DEFAULT_PALETTE.sky);

  return {
    dome,
    group,
    setMood,
    /** Lightning flash strength 0..1: brightens the dome and the clouds for the moment. */
    setFlash(amount) {
      flash.value = amount;
      cloudMaterial.color.setRGB(Math.min(1, cloudTint.r + amount * (1 - cloudTint.r)), Math.min(1, cloudTint.g + amount * (1 - cloudTint.g)), Math.min(1, cloudTint.b + amount * (1 - cloudTint.b)));
    },
    /** Advance the sky to `t` seconds and re-centre the camera-following layers on `camera`. */
    update(t, camera) {
      time.value = t;
      dome.position.copy(camera);
      horizon.position.set(camera.x, 0, camera.z);
      horizon.rotation.y = t * drift;
      flock.position.set(camera.x, 0, camera.z);
      deck.position.y = Math.sin(t * 0.12) * 14;
      for (const b of birds) {
        const a = b.angle + t * b.speed, x = Math.cos(a) * b.radius, z = Math.sin(a) * b.radius;
        b.bird.position.set(x, b.height + Math.sin(t * 0.5 + b.phase) * 18, z);
        b.bird.rotation.y = Math.atan2(-x, -z);
        const flap = Math.sin(t * 4 + b.phase) * 0.55;
        b.left.rotation.z = flap;
        b.right.rotation.z = -flap;
      }
    },
    dispose() {
      for (const resource of owned) resource.dispose();
      owned.length = 0;
    },
  };
}
