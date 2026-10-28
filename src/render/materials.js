/**
 * Procedural textures and shader materials shared by every course build.
 *
 * Two styles. 'toon' (the default, V1a #58) gives every surface one flat
 * palette colour on a cel-shaded Lambert material and flattens the effect
 * shaders into hard bands; course builds add ink outlines (outline.js).
 * 'legacy' keeps the legacy renderer's authored texture and effect recipes,
 * with explicit modern display-output conversion; it exists so the
 * historical r128 scene-parity suite keeps running.
 *
 * Browser objects are injected: `THREE`, `createCanvas()` for canvas
 * textures and `random()` for texture noise, so the module never touches
 * globals. The library owns everything it creates; `dispose()` releases all of it.
 */

import { createInkMaterial, createInkUniforms, INK_COLOR } from './outline.js';

export const SHADER_VERTEX = 'varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

export const EFFECT_COLORS = Object.freeze({ mag: 0x36cfff, steady: 0x73ffaa, rew: 0xffffff, rev: 0xbd72ff, zany: 0xff7d38 });
export const EFFECT_KINDS = Object.freeze(Object.keys(EFFECT_COLORS));
/** Player colours by colour index (legacy COLS); the canonical list lives in src/shared/constants.js. */
export { PLAYER_COLORS } from '../shared/constants.js';
/** Teleporter pair colours (legacy TPC). */
export const TELEPORTER_COLORS = Object.freeze([0xb44cff, 0xff9a2e, 0x3dff9a]);

const SKY_VERTEX = 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const SKY_FRAGMENT = 'varying vec3 p;void main(){float y=p.y;vec3 hor=vec3(1.,.86,.9),up=vec3(.62,.78,1.),top=vec3(.78,.66,.98),low=vec3(.86,.74,.97);vec3 c=y>0.?mix(hor,mix(up,top,smoothstep(.35,1.,y)),smoothstep(0.,.45,y)):mix(hor,low,smoothstep(0.,-.6,y));vec3 sd=normalize(vec3(.35,.65,.5));float d=max(dot(p,sd),0.);c+=vec3(1.,.9,.7)*(pow(d,24.)*.45+pow(d,160.)*.6);c=mix(c,vec3(1.,.98,.9),smoothstep(.9985,.9992,d));gl_FragColor=vec4(c,1.);}';
const WATER_FRAGMENT = 'uniform float t;varying vec2 u;void main(){float w=sin(u.x*40.+t*2.)*.5+sin(u.y*30.-t*1.7)*.5+sin((u.x+u.y)*55.+t*3.)*.3;vec3 c=mix(vec3(.02,.12,.38),vec3(.1,.58,.9),.5+.25*w);c+=vec3(.6)*pow(max(w,0.),4.)*.35;gl_FragColor=vec4(c,.94);}';
const PAD_FRAGMENT = 'uniform float t;varying vec2 u;void main(){vec2 p=u-.5;float r=length(p)*2.;if(r>1.)discard;float a=.5+.5*sin(r*18.-t*6.);vec3 c=mix(vec3(1.,.82,.1),vec3(1.,.4,.8),r);gl_FragColor=vec4(c*(.6+a*.9),1.);}';
const PORTAL_FRAGMENT = 'uniform float t;uniform vec3 col;varying vec2 u;void main(){vec2 p=u-.5;float r=length(p)*2.;float an=atan(p.y,p.x);float s=.5+.5*sin(an*4.+r*14.-t*5.);gl_FragColor=vec4(col*(.4+s*1.1),smoothstep(1.,.85,r)*.95);}';
const POWER_BLOCK_FRAGMENT = `uniform float t;varying vec2 u;
void main(){vec2 p=abs(u-.5);float edge=smoothstep(.35,.48,max(p.x,p.y));float scan=pow(.5+.5*sin((u.x+u.y)*22.-t*5.),8.);vec3 c=mix(vec3(.12,.35,.45),vec3(.3,1.,.85),edge);c+=vec3(1.,.6,.12)*scan*.8;float diamond=1.-smoothstep(.12,.15,abs(u.x-.5)+abs(u.y-.5));gl_FragColor=vec4(c+diamond*vec3(1.,.85,.3),1.);}`;
const VORTEX_FRAGMENT = 'uniform float t;varying vec2 u;void main(){float bands=pow(.5+.5*sin(u.x*50.+u.y*35.-t*8.),3.);float fade=sin(u.y*3.14159);gl_FragColor=vec4(mix(vec3(.25,.55,.8),vec3(.8,.95,1.),bands),bands*fade*.3);}';
const HAZARD_FRAGMENT = 'uniform float t;varying vec2 u;void main(){float stripe=step(.5,fract((u.x+u.y)*8.-t*.25));vec3 c=mix(vec3(.08,.12,.15),vec3(1.,.25,.06),stripe);float edge=smoothstep(.35,.5,max(abs(u.x-.5),abs(u.y-.5)));gl_FragColor=vec4(c+edge*vec3(.8,.4,.15),1.);}';
// Toon variants: the same motion, posterized into flat bands, with ink where an edge needs one.
const WATER_TOON = 'uniform float t;varying vec2 u;void main(){float w=sin(u.x*40.+t*2.)*.5+sin(u.y*30.-t*1.7)*.5+sin((u.x+u.y)*55.+t*3.)*.3;vec3 c=w>.3?vec3(.16,.62,1.):w>-.3?vec3(.06,.38,.86):vec3(.03,.2,.6);if(w>.85)c=vec3(.92,.98,1.);gl_FragColor=vec4(c,.96);}';
const PAD_TOON = 'uniform float t;varying vec2 u;void main(){vec2 p=u-.5;float r=length(p)*2.;if(r>1.)discard;float a=step(.5,fract(r*2.865-t*.955));vec3 c=r<.55?vec3(1.,.82,.05):vec3(1.,.22,.62);gl_FragColor=vec4(c*mix(.7,1.,a),1.);}';
const PORTAL_TOON = 'uniform float t;uniform vec3 col;varying vec2 u;void main(){vec2 p=u-.5;float r=length(p)*2.;if(r>1.)discard;float an=atan(p.y,p.x);float s=step(.5,fract((an*4.+r*14.-t*5.)/6.2832));vec3 c=mix(col*.45,col,s);if(r<.2)c=vec3(1.);if(r>.9)c=' + INK_COLOR + ';gl_FragColor=vec4(c,1.);}';
const POWER_BLOCK_TOON = `uniform float t;varying vec2 u;
void main(){vec2 p=abs(u-.5);vec3 c=max(p.x,p.y)>.4?vec3(.2,1.,.8):vec3(.05,.42,.55);if(step(.82,.5+.5*sin((u.x+u.y)*22.-t*5.))>0.)c=vec3(1.,.55,.08);if(abs(u.x-.5)+abs(u.y-.5)<.15)c=vec3(1.,.88,.2);gl_FragColor=vec4(c,1.);}`;
const VORTEX_TOON = 'uniform float t;varying vec2 u;void main(){float bands=step(.6,.5+.5*sin(u.x*50.+u.y*35.-t*8.));float fade=step(.2,sin(u.y*3.14159));gl_FragColor=vec4(mix(vec3(.2,.5,.85),vec3(.85,.97,1.),bands),bands*fade*.32);}';
const HAZARD_TOON = 'uniform float t;varying vec2 u;void main(){float stripe=step(.5,fract((u.x+u.y)*8.-t*.25));vec3 c=mix(vec3(.08,.08,.1),vec3(1.,.2,.05),stripe);if(max(abs(u.x-.5),abs(u.y-.5))>.42)c=vec3(1.,.78,.1);gl_FragColor=vec4(c,1.);}';
const PARTICLE_TOON = 'void main(){float r=length(gl_PointCoord-.5)*2.;if(r>.8)discard;gl_FragColor=vec4(.75,.92,1.,.6);}';
const AURA_TOON = 'uniform float t;uniform vec3 col;uniform float kind;varying vec3 n;varying vec3 v;varying vec2 u;void main(){float rim=step(.55,1.-abs(dot(normalize(n),normalize(v))));float ring=step(.8,.5+.5*sin(u.y*(kind+2.)*20.-t*(3.+kind)));float a=rim*.55+ring*.35;if(a<.01)discard;gl_FragColor=vec4(col*(1.+ring),a);}';

/**
 * Flat comic palette for the toon style, one colour per surface role (sRGB hex).
 * Per-map palettes come later (V1c #60).
 */
export const TOON_PALETTE = Object.freeze({
  turf: 0x2fbf5b, tile: 0x8a2be2, wall: 0xff3d6e, platform: 0xffa726, ramp: 0xffd640,
  sand: 0xffcf73, ice: 0x8be8ff, slime: 0xc4f53a,
  padRing: 0xffc21a, fanRing: 0x4a5272, fanBlade: 0xeef1ff,
  cupSleeve: 0x16241e, cupRim: 0xffffff, pole: 0xffffff, flag: 0xff2e88,
});

/**
 * Cel shading: the light level (brightest lit channel over brightest base channel) picks one of
 * three flat bands, so cast shadows stay; the two darker bands get halftone dots.
 */
const TOON_PATCH = `{
  float toonBase=max(max(diffuseColor.r,diffuseColor.g),max(diffuseColor.b,1e-3));
  float toonLit=max(max(outgoingLight.r,outgoingLight.g),outgoingLight.b)/toonBase;
  float toonBand=toonLit>1.7?1.:toonLit>1.1?.62:.36;
  outgoingLight=diffuseColor.rgb*toonBand;
  if(toonBand<1.){
    float dotRadius=(toonBand<.5?.62:.4)*toonDot*.5;
    vec2 cell=mod(gl_FragCoord.xy,toonDot)-.5*toonDot;
    outgoingLight*=1.-.45*(1.-smoothstep(dotRadius-.6,dotRadius+.6,length(cell)));
  }
}
#include <opaque_fragment>`;

const PARTICLE_VERTEX = 'uniform float t;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(1000./max(1.,-p.z),1.,7.);}';
const PARTICLE_FRAGMENT = 'void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.7,.9,1.,(1.-r)*.65);}';
const AURA_VERTEX = 'varying vec3 n;varying vec3 v;varying vec2 u;void main(){u=uv;vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}';
const AURA_FRAGMENT = 'uniform float t;uniform vec3 col;uniform float kind;varying vec3 n;varying vec3 v;varying vec2 u;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.);float ring=pow(.5+.5*sin(u.y*(kind+2.)*20.-t*(3.+kind)),10.);float a=clamp(rim*.65+ring*.4,0.,.85);gl_FragColor=vec4(col*(1.+ring),a);}';

function noise(g, size, count, alpha, random) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = 'rgba(' + (random() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (alpha * random()) + ')';
    g.fillRect(random() * size, random() * size, 2, 2);
  }
}

/**
 * @param {object} options
 * @param {object} options.THREE Three.js namespace
 * @param {() => HTMLCanvasElement} options.createCanvas
 * @param {() => number} [options.random=Math.random] Texture noise source
 * @param {number} [options.maxAnisotropy=1]
 * @param {'toon'|'legacy'} [options.style='toon'] 'legacy' only for historical parity checks
 */
export function createMaterialLibrary({ THREE, createCanvas, random = Math.random, maxAnisotropy = 1, style = 'toon' }) {
  if (!THREE) throw new TypeError('THREE is required');
  if (typeof createCanvas !== 'function') throw new TypeError('createCanvas() is required');
  if (style !== 'toon' && style !== 'legacy') throw new TypeError(`unknown render style '${style}'`);
  const toon = style === 'toon';
  const owned = new Set();
  const own = resource => { owned.add(resource); return resource; };
  /** Shared animation time uniform (seconds); every animated shader reads it. */
  const time = { value: 0 };

  function canvasTexture(size, paint, srgb, track = true) {
    const canvas = createCanvas();
    canvas.width = canvas.height = size;
    paint(canvas.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = maxAnisotropy;
    if (srgb) {
      if (Number(THREE.REVISION) >= 152) texture.colorSpace = THREE.SRGBColorSpace;
      else texture.encoding = THREE.sRGBEncoding;
    }
    return track ? own(texture) : texture;
  }

  // The toon style paints no surface patterns: only the soft particle and contact-shadow sprites.
  const surfaceTextures = toon ? {} : {
    turf: canvasTexture(256, (g, s) => { g.fillStyle = '#8fdca4'; g.fillRect(0, 0, s, s); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.14)' : 'rgba(90,60,150,.05)'; g.fillRect(0, i * s / 8, s, s / 8); } noise(g, s, 4500, 0.16, random); }, true),
    brick: canvasTexture(256, (g, s) => { g.fillStyle = '#ecc3aa'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(150,90,110,.45)'; g.lineWidth = 5; for (let r = 0; r < 4; r++) { const y = r * 64; g.strokeRect(-2, y, s + 4, 64); for (let c = 0; c < 3; c++) { const x = (r % 2) * 43 + c * 86; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } } noise(g, s, 3000, 0.2, random); }, true),
    plat: canvasTexture(256, (g, s) => { g.fillStyle = '#cbeec6'; g.fillRect(0, 0, s, s); g.strokeStyle = '#ff4fb8'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.7)'; g.strokeRect(20, 20, s - 40, s - 40); noise(g, s, 2500, 0.15, random); }, true),
    ramp: canvasTexture(256, (g, s) => { g.fillStyle = '#e4f0bc'; g.fillRect(0, 0, s, s); g.fillStyle = '#f6eeb8'; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 32, 0); g.lineTo(i * 64 + 96, s); g.lineTo(i * 64 + 64, s); g.fill(); } noise(g, s, 2000, 0.15, random); }, true),
    sand: canvasTexture(256, (g, s) => { g.fillStyle = '#fcefc4'; g.fillRect(0, 0, s, s); noise(g, s, 6000, 0.45, random); }, true),
    ice: canvasTexture(256, (g, s) => { g.fillStyle = '#d8f3ff'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(i * 40 - 20, 0); g.lineTo(i * 40 + 60, s); g.stroke(); } noise(g, s, 1500, 0.12, random); }, true),
    slime: canvasTexture(256, (g, s) => { g.fillStyle = '#b8f0a2'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(60,150,40,.45)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc((i * 83) % s, (i * 61) % s, 10 + (i % 4) * 5, 0, 7); g.fill(); } noise(g, s, 2500, 0.2, random); }, true),
    ball: canvasTexture(128, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(0,0,0,.3)'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.beginPath(); g.arc(x * 16 + 8 + (y % 2) * 8, y * 16 + 8, 5, 0, 7); g.fill(); } }, true),
  };
  const textures = Object.freeze({
    ...surfaceTextures,
    soft: canvasTexture(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, true),
    blob: canvasTexture(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(70,40,110,.7)'); r.addColorStop(0.6, 'rgba(70,40,110,.25)'); r.addColorStop(1, 'rgba(70,40,110,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, true),
  });
  const sharedTextures = new Set(Object.values(textures));

  // Custom shaders must opt into the same display conversion as built-in materials.
  const fx = toon
    ? { water: WATER_TOON, pad: PAD_TOON, portal: PORTAL_TOON, powerBlock: POWER_BLOCK_TOON, vortex: VORTEX_TOON, hazard: HAZARD_TOON, particle: PARTICLE_TOON, aura: AURA_TOON }
    : { water: WATER_FRAGMENT, pad: PAD_FRAGMENT, portal: PORTAL_FRAGMENT, powerBlock: POWER_BLOCK_FRAGMENT, vortex: VORTEX_FRAGMENT, hazard: HAZARD_FRAGMENT, particle: PARTICLE_FRAGMENT, aura: AURA_FRAGMENT };
  const skyMaterial = own(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT }));
  const water = own(new THREE.ShaderMaterial({ transparent: true, uniforms: { t: time }, vertexShader: SHADER_VERTEX, fragmentShader: fx.water }));
  const pad = own(new THREE.ShaderMaterial({ uniforms: { t: time }, vertexShader: SHADER_VERTEX, fragmentShader: fx.pad }));
  water.userData.shared = pad.userData.shared = true;

  /** Outline width, resolution and halftone cell, shared by every ink and toon material. */
  const inkUniforms = createInkUniforms(THREE);
  const ink = toon ? Object.freeze({
    solid: own(createInkMaterial(THREE, inkUniforms)),
    planar: own(createInkMaterial(THREE, inkUniforms, { planar: true })),
    overlay: own(createInkMaterial(THREE, inkUniforms, { overlay: true })),
  }) : null;
  const sharedMaterials = new Set([water, pad, skyMaterial, ...Object.values(ink || {})]);
  const toonCompile = shader => {
    shader.uniforms.toonDot = inkUniforms.dot;
    shader.fragmentShader = 'uniform float toonDot;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', TOON_PATCH);
  };
  const toonKey = () => 'toon-v1';

  return {
    THREE,
    style,
    time,
    textures,
    inkUniforms,
    /** Shared ink materials (toon style only): `solid` back-face hull, `planar` flat surfaces, `overlay` translucent owners. */
    ink,
    skyMaterial,
    water,
    pad,
    createCanvas,
    random,
    /** True for textures the library owns and course builds must not dispose. */
    isShared(resource) { return sharedTextures.has(resource) || sharedMaterials.has(resource); },
    /** A canvas texture owned by the caller (labels, course-only textures). */
    canvasTexture(size, paint, srgb) { return canvasTexture(size, paint, srgb, false); },
    /** Legacy pm(): textured standard material with its own repeat-scaled texture clone. */
    patterned(texture, repeatX, repeatY, overrides) {
      const map = texture.clone();
      map.needsUpdate = true;
      map.repeat.set(repeatX, repeatY);
      return new THREE.MeshStandardMaterial(Object.assign({ map, bumpMap: map, bumpScale: 0.5, roughness: 0.55, metalness: 0.05 }, overrides || {}));
    },
    /**
     * Toon style: one flat colour, cel-shaded. Takes the legacy material overrides but keeps only
     * what matters to a flat surface (transparency for wall fade, side, opacity).
     * @param {number} color sRGB hex
     */
    toon(color, overrides = {}) {
      const material = new THREE.MeshLambertMaterial({ color });
      for (const key of ['transparent', 'side', 'opacity']) if (key in overrides) material[key] = overrides[key];
      material.userData.toon = true;
      material.onBeforeCompile = toonCompile;
      material.customProgramCacheKey = toonKey;
      return material;
    },
    portal(color) {
      return new THREE.ShaderMaterial({ transparent: true, uniforms: { t: time, col: { value: displayColor(new THREE.Color(), color) } }, vertexShader: SHADER_VERTEX, fragmentShader: fx.portal });
    },
    powerBlock() { return new THREE.ShaderMaterial({ uniforms: { t: time }, vertexShader: SHADER_VERTEX, fragmentShader: fx.powerBlock }); },
    vortex() { return new THREE.ShaderMaterial({ uniforms: { t: time }, vertexShader: SHADER_VERTEX, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fragmentShader: fx.vortex }); },
    hazard() { return new THREE.ShaderMaterial({ uniforms: { t: time }, vertexShader: SHADER_VERTEX, fragmentShader: fx.hazard }); },
    vortexParticles() { return new THREE.ShaderMaterial({ uniforms: { t: time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: PARTICLE_VERTEX, fragmentShader: fx.particle }); },
    aura() { return new THREE.ShaderMaterial({ uniforms: { t: time, col: { value: displayColor(new THREE.Color(), 0xffffff) }, kind: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: AURA_VERTEX, fragmentShader: fx.aura }); },
    dispose() {
      for (const resource of owned) resource.dispose();
      owned.clear();
    },
  };
}

/**
 * Effect shaders write display (sRGB) values straight to gl_FragColor, as on r128,
 * so they take no tone-mapping or colour-space chunks. Their colour uniforms and
 * attributes hold raw sRGB components too: setRGB() stores them unconverted, where
 * r152+ set()/setHex() would linearise them.
 */
export function displayColor(target, color) {
  const hex = typeof color === 'number' ? color : new target.constructor(color).getHex();
  return target.setRGB((hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255);
}
