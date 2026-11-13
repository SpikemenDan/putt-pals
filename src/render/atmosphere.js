/**
 * World atmosphere for Ares and Luna (VIS-E #166): Ares wind and Luna dust and solar activity.
 *
 * Visual only (owner, 2026-11-03 and 2026-11-11): nothing here reads or writes simulation, session or gameplay state,
 * and no power-up or physics hook depends on it. Gaia has no layer here; its rain and snow come from the course palette
 * (weather.js) and from the Rain and Snow power-ups.
 *
 * Like weather.js, every particle is a camera-centred volume moved in the vertex shader, so the CPU only sets a few
 * uniforms per frame. Strength and density come from the live DISPLAY object (`environment.*`, docs/DISPLAY.md), so
 * the development panel changes them at once. Density uses the geometry draw range, so it never rebuilds buffers.
 * Gusts and solar flares are pure functions of the shared clock, so every player sees the same ones.
 *
 * - Ares: rust-coloured wind ribbons blowing one way across the course in rising and falling gusts, fine blown dust
 *   travelling with them, and a faint rust haze that thickens with each gust.
 * - Luna: pale dust motes floating in low gravity and twinkling, faint charged particles streaming down from the sun,
 *   and solar flares: every few seconds a pulse brightens those particles and washes the view gold from the top.
 */

import { isWorldId } from '../shared/worlds.js';
import { displayColor } from './materials.js';

/** Particle volume around the camera (world units). */
const VOLUME = [1800, 360, 1800];
/** Bottom of the particle band (world y): the band follows the camera across the course but stays at course level, so the scenery shows from the ball camera and from the overhead views alike. */
const BAND_FLOOR = -40;
/** Base counts at density 1; buffers hold MAX_DENSITY times as many. */
export const ATMOSPHERE_COUNTS = Object.freeze({ aresStreaks: 260, aresDust: 520, lunaDust: 600, lunaSolar: 160 });
const MAX_DENSITY = 2;
/** Ares wind heading in the horizontal plane (world x, z), normalised in the shader. */
const ARES_WIND = [1, 0.32];
/** Ares base wind speed at strength 1 (world units/s), before gusts. */
const ARES_SPEED = 380;
/** Solar particles fall from the sun's side of the sky (world x, y, z). */
const SOLAR_DIR = [-0.55, -0.5, 0.67];
const SOLAR_SPEED = 900;
export const SOLAR_PERIOD = 11;
const FLARE_RISE = 1.2, FLARE_DECAY = 3.2;
const WASH = { ares: 0.1, luna: 0.24 };

function hash(n, salt) {
  let h = Math.imul((n | 0) ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ares gust factor 0..1 at `t` seconds: a smooth swell between calm (about 0.25) and full gust, the same for every viewer. */
export function aresGust(t) {
  if (!(t >= 0)) return 0.25;
  const swell = 0.5 + 0.5 * Math.sin(t * 0.55) * Math.sin(t * 0.23 + 1.1);
  return 0.25 + 0.75 * swell * swell * (3 - 2 * swell);
}

/** Luna solar flare strength 0..1 at `t` seconds: at most one flare per SOLAR_PERIOD (none in about a third), rising then fading. */
export function solarFlare(t) {
  if (!(t >= 0)) return 0;
  const period = Math.floor(t / SOLAR_PERIOD);
  if (hash(period, 7) < 0.3) return 0;
  const x = t - period * SOLAR_PERIOD - (1 + hash(period, 8) * (SOLAR_PERIOD - FLARE_RISE - FLARE_DECAY - 2));
  if (x < 0 || x > FLARE_RISE + FLARE_DECAY) return 0;
  return x < FLARE_RISE ? x / FLARE_RISE : Math.pow(1 - (x - FLARE_RISE) / FLARE_DECAY, 2);
}

// Ribbon streaks: four vertices per streak (corner.x 0 = head, 1 = tail; corner.y = side), widened across the view.
const STREAK_VERTEX = `uniform float travel;
uniform vec3 cam;
uniform vec3 volume;
uniform float floorY;
uniform vec3 dir;
uniform float len;
uniform float width;
uniform float alphaScale;
attribute vec4 seed;
attribute vec2 corner;
varying float alpha;
void main(){
  vec3 d=normalize(dir);
  float sp=.7+seed.w*.6;
  vec3 pos=seed.xyz*volume+d*travel*sp;
  pos.y+=sin(travel*.003+seed.w*30.)*14.;
  vec3 rel=mod(pos,volume)-.5*volume;
  float l=len*(.6+seed.w*.8);
  vec3 at=vec3(cam.x+rel.x,floorY+rel.y+.5*volume.y,cam.z+rel.z);
  vec4 head=viewMatrix*vec4(at,1.);
  vec4 tail=viewMatrix*vec4(at-d*l,1.);
  vec2 along=tail.xy-head.xy;
  vec2 side=normalize(vec2(-along.y,along.x)+vec2(1e-5,0.));
  vec4 mv=mix(head,tail,corner.x);
  mv.xy+=side*corner.y*width*max(1.,-head.z/260.)*(1.-corner.x*.7); // wider far away, so streaks still read from the overhead views
  gl_Position=projectionMatrix*mv;
  vec3 e=abs(rel)/volume;
  alpha=alphaScale*(1.-smoothstep(.28,.5,max(e.x,max(e.y*.8,e.z))))*(1.-corner.x);
}`;
const STREAK_FRAGMENT = 'uniform vec3 color;varying float alpha;void main(){gl_FragColor=vec4(color,alpha);}';

// Point motes: drift with the wind (Ares) or float and twinkle (Luna).
const MOTE_VERTEX = `uniform float travel;
uniform float t;
uniform vec3 cam;
uniform vec3 volume;
uniform float floorY;
uniform vec3 dir;
uniform vec2 res;
uniform float bob;
uniform float size;
uniform float alphaScale;
uniform float twinkle;
attribute vec4 seed;
varying float alpha;
void main(){
  vec3 pos=seed.xyz*volume+normalize(dir)*travel*(.6+seed.w*.8);
  pos.x+=sin(t*.31+seed.w*40.)*bob;
  pos.y+=sin(t*.22+seed.w*23.)*bob*1.6+t*3.*(seed.w-.45);
  pos.z+=cos(t*.27+seed.w*17.)*bob;
  vec3 rel=mod(pos,volume)-.5*volume;
  vec4 mv=viewMatrix*vec4(cam.x+rel.x,floorY+rel.y+.5*volume.y,cam.z+rel.z,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(projectionMatrix[1][1]*res.y*.5*size*(.7+seed.w*.9)/max(1.,-mv.z),1.5,9.);
  vec3 e=abs(rel)/volume;
  alpha=alphaScale*(1.-smoothstep(.3,.5,max(e.x,max(e.y*.8,e.z))))*(1.-twinkle*.6*(.5+.5*sin(t*2.3+seed.w*61.)));
}`;
const MOTE_FRAGMENT = 'uniform vec3 color;varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(color,alpha*(1.-r*r));}';

/** Seeded generator (mulberry32): the same layout in every session. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const clampDensity = d => Math.max(0, Math.min(MAX_DENSITY, Number.isFinite(d) ? d : 1));

/**
 * @param {object} options
 * @param {object} options.THREE Three.js namespace
 * @param {{value: object}} options.resolution Drawing-buffer size uniform (ink `res`), shared by reference
 */
export function createAtmosphere({ THREE, resolution }) {
  if (!THREE) throw new TypeError('THREE is required');
  const owned = [];
  const own = resource => { owned.push(resource); return resource; };
  const rand = seeded(166);
  const cam = { value: new THREE.Vector3() };
  const volume = { value: new THREE.Vector3(...VOLUME) };
  const floorY = { value: BAND_FLOOR };
  const time = { value: 0 };

  function streakGeometry(count) {
    const seed = new Float32Array(count * 16), corner = new Float32Array(count * 8), index = [];
    for (let i = 0; i < count; i++) {
      const s = [rand(), rand(), rand(), rand()];
      for (let k = 0; k < 4; k++) { seed.set(s, (i * 4 + k) * 4); corner.set([k >> 1, k & 1 ? 1 : -1], (i * 4 + k) * 2); }
      const v = i * 4;
      index.push(v, v + 1, v + 3, v, v + 3, v + 2);
    }
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    geometry.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    geometry.setIndex(index);
    return geometry;
  }
  function moteGeometry(count) {
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seed[i] = rand();
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    return geometry;
  }
  const blend = { transparent: true, depthWrite: false };
  function streaks(count, color, dir, len, width) {
    const uniforms = { travel: { value: 0 }, cam, volume, floorY, dir: { value: new THREE.Vector3(...dir) }, len: { value: len }, width: { value: width }, alphaScale: { value: 0 }, color: { value: displayColor(new THREE.Color(), color) } };
    const mesh = new THREE.Mesh(streakGeometry(count * MAX_DENSITY), own(new THREE.ShaderMaterial({ uniforms, vertexShader: STREAK_VERTEX, fragmentShader: STREAK_FRAGMENT, side: THREE.DoubleSide, ...blend })));
    return { mesh, uniforms, count, perItem: 6 };
  }
  function motes(count, color, dir, bob, size, twinkle) {
    const uniforms = { travel: { value: 0 }, t: time, cam, volume, floorY, dir: { value: new THREE.Vector3(...dir) }, res: resolution, bob: { value: bob }, size: { value: size }, alphaScale: { value: 0 }, twinkle: { value: twinkle }, color: { value: displayColor(new THREE.Color(), color) } };
    const mesh = new THREE.Points(moteGeometry(count * MAX_DENSITY), own(new THREE.ShaderMaterial({ uniforms, vertexShader: MOTE_VERTEX, fragmentShader: MOTE_FRAGMENT, ...blend })));
    return { mesh, uniforms, count, perItem: 1 };
  }

  const ares = {
    streaks: streaks(ATMOSPHERE_COUNTS.aresStreaks, 0xf2b48a, [ARES_WIND[0], 0, ARES_WIND[1]], 110, 2.2),
    dust: motes(ATMOSPHERE_COUNTS.aresDust, 0xc9774e, [ARES_WIND[0], 0.04, ARES_WIND[1]], 10, 2.4, 0),
  };
  const luna = {
    dust: motes(ATMOSPHERE_COUNTS.lunaDust, 0xe9e7f2, [0.2, 0.05, 0.1], 22, 2.2, 1),
    solar: streaks(ATMOSPHERE_COUNTS.lunaSolar, 0xffe39a, SOLAR_DIR, 160, 1.4),
  };
  const layers = [ares.streaks, ares.dust, luna.dust, luna.solar];
  for (const layer of layers) { layer.mesh.frustumCulled = false; layer.mesh.visible = false; layer.mesh.renderOrder = 5; }

  // Screen wash: Ares rust haze (heavier low on the screen), Luna solar flare (from the top). Drawn last, never blocks input.
  const wash = { amount: { value: 0 }, color: { value: displayColor(new THREE.Color(), 0xd9784a) }, fromTop: { value: 0 } };
  const overlay = new THREE.Mesh(
    own((() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)); return g; })()),
    own(new THREE.ShaderMaterial({
      uniforms: wash,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: 'varying float v;void main(){v=position.y*.5+.5;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: 'uniform float amount;uniform vec3 color;uniform float fromTop;varying float v;void main(){float g=mix(1.-v*.7,.25+v*.75,fromTop);gl_FragColor=vec4(color,amount*clamp(g,0.,1.));}',
    })),
  );
  overlay.frustumCulled = false; overlay.renderOrder = 99; overlay.visible = false;

  const group = new THREE.Group();
  group.add(...layers.map(layer => layer.mesh), overlay);
  let world = null, lastT = null, aresTravel = 0, lunaTravel = 0, solarTravel = 0;
  const state = { world: null, gust: 0, flare: 0, wash: 0, drawn: { aresStreaks: 0, aresDust: 0, lunaDust: 0, lunaSolar: 0 } };

  function show(layer, on, strength, density, alpha) {
    const n = on && strength > 0 ? Math.round(layer.count * clampDensity(density)) : 0;
    layer.mesh.visible = n > 0;
    layer.mesh.geometry.setDrawRange(0, n * layer.perItem);
    layer.uniforms.alphaScale.value = alpha;
    return n;
  }

  return {
    group,
    get world() { return world; },
    /** Read-only numbers for tests and the dev preview: current world, gust, flare, wash and drawn counts. */
    get state() { return { ...state, drawn: { ...state.drawn } }; },
    /** 'ares', 'luna', or null/'gaia' for none. */
    setWorld(next) {
      world = isWorldId(next) && next !== 'gaia' ? next : null;
      state.world = world;
      if (!world) { for (const layer of layers) layer.mesh.visible = false; overlay.visible = false; }
    },
    /**
     * Advances the atmosphere to `t` seconds around the camera.
     * @param {number} t shared clock (seconds)
     * @param {{x: number, y: number, z: number}} camera world position
     * @param {{aresWind: number, aresWindDensity: number, lunaDust: number, lunaDustDensity: number, lunaSolar: number}} env DISPLAY.environment
     */
    update(t, camera, env) {
      const dt = lastT === null ? 0 : Math.max(0, Math.min(0.25, t - lastT));
      lastT = t;
      time.value = t;
      cam.value.copy(camera);
      const isAres = world === 'ares', isLuna = world === 'luna';
      const gust = isAres ? aresGust(t) : 0, flare = isLuna ? solarFlare(t) : 0;
      // Travel is integrated, so a slider change or a gust changes speed without the particles jumping.
      aresTravel += dt * ARES_SPEED * env.aresWind * (0.45 + 0.9 * gust);
      lunaTravel += dt * 6 * Math.min(1, env.lunaDust);
      solarTravel += dt * SOLAR_SPEED * (0.5 + flare);
      ares.streaks.uniforms.travel.value = ares.dust.uniforms.travel.value = aresTravel;
      ares.streaks.uniforms.len.value = 70 + 110 * gust;
      luna.dust.uniforms.travel.value = lunaTravel;
      luna.solar.uniforms.travel.value = solarTravel;
      state.drawn.aresStreaks = show(ares.streaks, isAres, env.aresWind, env.aresWindDensity, Math.min(1, env.aresWind * (0.25 + 0.55 * gust)));
      state.drawn.aresDust = show(ares.dust, isAres, env.aresWind, env.aresWindDensity, Math.min(1, env.aresWind * (0.35 + 0.4 * gust)));
      state.drawn.lunaDust = show(luna.dust, isLuna, env.lunaDust, env.lunaDustDensity, Math.min(1, env.lunaDust * 0.75));
      state.drawn.lunaSolar = show(luna.solar, isLuna, env.lunaSolar, env.lunaDustDensity, Math.min(1, env.lunaSolar * (0.12 + 0.75 * flare)));
      const washAmount = isAres ? WASH.ares * env.aresWind * (0.5 + 0.5 * gust) : isLuna ? WASH.luna * env.lunaSolar * flare : 0;
      wash.amount.value = Math.min(0.6, washAmount);
      if (isAres) { displayColor(wash.color.value, 0xd9784a); wash.fromTop.value = 0; }
      if (isLuna) { displayColor(wash.color.value, 0xfff0c2); wash.fromTop.value = 1; }
      overlay.visible = wash.amount.value > 0.001;
      Object.assign(state, { gust, flare, wash: wash.amount.value });
    },
    dispose() {
      for (const resource of owned) resource.dispose();
      owned.length = 0;
      group.clear();
    },
  };
}
