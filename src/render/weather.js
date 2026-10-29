/**
 * Ambient weather and wind visuals for the toon style (V1c #60).
 *
 * Visual only: nothing here reads or writes simulation state. Snow and rain are camera-centred
 * volumes whose particles are moved entirely in the vertex shader from the shared clock, so the CPU
 * does no per-frame work for them and a course swap only flips which layer is visible. Lightning is a
 * pure function of time, so every player in a room sees the same flashes. Browser objects and the
 * Three.js namespace are injected. dispose() releases every resource created.
 */

import { displayColor } from './materials.js';

const SNOW_COUNT = 700;
const RAIN_COUNT = 520;
/** Particle volume around the camera (world units). */
const VOLUME = [1000, 700, 1000];

/** Fixed lightning cadence: at most one flash cluster per period, none in a quarter of the periods. */
export const LIGHTNING_PERIOD = 7;
const FLASH_LENGTH = 0.16;
const FLASH_ECHO = { delay: 0.24, strength: 0.7 };
/** Peak opacity of the full-screen lightning wash (a soft flash, not a white-out). */
const FLASH_WASH = 0.3;

function hash(n, salt) {
  let h = Math.imul((n | 0) ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pulse(x) {
  return x < 0 || x > FLASH_LENGTH ? 0 : 1 - x / FLASH_LENGTH;
}

/**
 * Lightning flash strength 0..1 at `t` seconds. Deterministic: the same time gives the same flash for
 * every viewer. One cluster (a pulse and a weaker echo) at most every 7 s, and none in about a quarter
 * of the periods, so the screen never flickers fast.
 */
export function lightningFlash(t) {
  if (!(t >= 0)) return 0;
  const period = Math.floor(t / LIGHTNING_PERIOD);
  if (hash(period, 1) < 0.25) return 0;
  const x = t - period * LIGHTNING_PERIOD - (1.5 + hash(period, 2) * 4);
  return Math.max(pulse(x), pulse(x - FLASH_ECHO.delay) * FLASH_ECHO.strength);
}

const VOLUME_VERTEX = `uniform float t;
uniform vec3 cam;
uniform vec3 volume;
uniform vec2 res;
uniform float fall;
uniform vec2 drift;
uniform float sway;
attribute vec4 seed;
attribute float tip;
varying float shade;
void main(){
  float speed=fall*(.8+seed.w*.4);
  vec3 pos=vec3(seed.x*volume.x+drift.x*t*(.8+seed.w*.4),seed.y*volume.y-speed*t,seed.z*volume.z+drift.y*t*(.8+seed.w*.4));
  pos.x+=sin(t*.7+seed.w*40.)*sway;
  pos.z+=cos(t*.5+seed.w*31.)*sway;
  vec3 rel=mod(pos,volume)-.5*volume;
  rel-=tip*normalize(vec3(drift.x,-speed,drift.y))*STREAK;
  vec4 mv=viewMatrix*vec4(cam+rel,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(projectionMatrix[1][1]*res.y*.5*(1.3+seed.w*1.3)/max(1.,-mv.z),2.,12.);
  shade=seed.w;
}`;
const SNOW_FRAGMENT = 'varying float shade;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(r>.72?vec3(.5,.68,.93):vec3(1.),1.);}';
const RAIN_FRAGMENT = 'varying float shade;uniform vec3 rainColor;void main(){gl_FragColor=vec4(rainColor,.85);}';

/** Seeded generator (mulberry32): the same weather layout in every session. */
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
 * @param {object} options
 * @param {object} options.THREE Three.js namespace
 * @param {{value: object}} options.resolution Drawing-buffer size uniform (ink `res`), shared by reference
 */
export function createWeather({ THREE, resolution }) {
  if (!THREE) throw new TypeError('THREE is required');
  const owned = [];
  const own = resource => { owned.push(resource); return resource; };
  const time = { value: 0 };
  const cam = { value: new THREE.Vector3() };
  const volume = { value: new THREE.Vector3(...VOLUME) };
  const rand = seeded(60);

  function seeds(count, streak) {
    const seed = new Float32Array(count * (streak ? 2 : 1) * 4), tip = new Float32Array(count * (streak ? 2 : 1));
    const position = new Float32Array(tip.length * 3);
    for (let i = 0; i < count; i++) {
      const s = [rand(), rand(), rand(), rand()];
      for (let k = 0; k < (streak ? 2 : 1); k++) {
        seed.set(s, (i * (streak ? 2 : 1) + k) * 4);
        tip[i * (streak ? 2 : 1) + k] = k;
      }
    }
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    geometry.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    return geometry;
  }

  const common = { t: time, cam, volume, res: resolution };
  const snow = new THREE.Points(seeds(SNOW_COUNT, false), own(new THREE.ShaderMaterial({
    uniforms: { ...common, fall: { value: 38 }, drift: { value: new THREE.Vector2(6, 2) }, sway: { value: 14 } },
    defines: { STREAK: '0.' },
    vertexShader: VOLUME_VERTEX,
    fragmentShader: SNOW_FRAGMENT,
  })));
  const rain = new THREE.LineSegments(seeds(RAIN_COUNT, true), own(new THREE.ShaderMaterial({
    uniforms: { ...common, fall: { value: 560 }, drift: { value: new THREE.Vector2(95, 40) }, sway: { value: 0 }, rainColor: { value: displayColor(new THREE.Color(), 0xcfe6ff) } },
    defines: { STREAK: '26.' },
    transparent: true,
    depthWrite: false,
    vertexShader: VOLUME_VERTEX,
    fragmentShader: RAIN_FRAGMENT,
  })));
  for (const layer of [snow, rain]) { layer.frustumCulled = false; layer.visible = false; }

  // Lightning also washes the whole view briefly, so the flash reads from the ball camera, where little sky shows.
  // One full-screen triangle in clip space, drawn last; at most one short, soft flash per 7 s.
  const flashAmount = { value: 0 };
  const overlay = new THREE.Mesh(
    own((() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)); return g; })()),
    own(new THREE.ShaderMaterial({
      uniforms: { amount: flashAmount },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: 'uniform float amount;void main(){gl_FragColor=vec4(.92,.95,1.,amount*FLASH_WASH);}',
      defines: { FLASH_WASH: String(FLASH_WASH) },
    })),
  );
  overlay.frustumCulled = false; overlay.renderOrder = 100; overlay.visible = false;

  const group = new THREE.Group();
  group.add(snow, rain, overlay);
  let kind = null;

  return {
    group,
    get kind() { return kind; },
    /** 'snow', 'storm' (rain and lightning) or null. */
    setKind(next) {
      kind = next || null;
      snow.visible = kind === 'snow';
      rain.visible = kind === 'storm';
    },
    /** Advances the weather to `t` seconds, centred on the camera. Returns the lightning flash strength (0 outside storms). */
    update(t, camera) {
      time.value = t;
      cam.value.copy(camera);
      const flash = kind === 'storm' ? lightningFlash(t) : 0;
      flashAmount.value = flash;
      overlay.visible = flash > 0;
      return flash;
    },
    dispose() {
      for (const resource of owned) resource.dispose();
      owned.length = 0;
      group.clear();
    },
  };
}

/**
 * Wind streaks for a fan: flat speed lines drawn as a horizontal and a vertical tapered ribbon, so they
 * read from a top view and from a side view. The caller moves the heads; this fills the ribbon geometry.
 */
export function createWindStreaks({ THREE, count, color }) {
  const positions = new Float32Array(count * 8 * 3);
  const index = [];
  for (let i = 0; i < count; i++) {
    const v = i * 8;
    // Two ribbons per streak: tail pair then head pair, horizontal (0..3) and vertical (4..7).
    index.push(v, v + 1, v + 3, v, v + 3, v + 2, v + 4, v + 5, v + 7, v + 4, v + 7, v + 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  const HEAD = 0.15;
  return {
    mesh,
    geometry,
    /**
     * Places streak heads and blows them along (dirX, dirZ).
     * @param {Float32Array} heads x, y, z per streak (course-local)
     * @param {number} dirX wind direction x (-1, 0 or 1)
     * @param {number} dirZ wind direction z (-1, 0 or 1)
     * @param {Float32Array|number[]} lengths streak lengths
     * @param {number} width ribbon width at the tail
     */
    write(heads, dirX, dirZ, lengths, width) {
      const norm = Math.hypot(dirX, dirZ) || 1, dx = dirX / norm, dz = dirZ / norm;
      for (let i = 0; i < count; i++) {
        const hx = heads[i * 3], hy = heads[i * 3 + 1], hz = heads[i * 3 + 2], len = lengths[i];
        const tx = hx - dx * len, tz = hz - dz * len, px = -dz * width / 2, pz = dx * width / 2, hw = HEAD;
        positions.set([
          tx - px, hy, tz - pz, tx + px, hy, tz + pz, hx - px * hw, hy, hz - pz * hw, hx + px * hw, hy, hz + pz * hw,
          tx, hy - width / 2, tz, tx, hy + width / 2, tz, hx, hy - width / 2 * hw, hz, hx, hy + width / 2 * hw, hz,
        ], i * 24);
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}
