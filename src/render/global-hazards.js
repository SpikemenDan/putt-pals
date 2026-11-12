/**
 * Global weather hazards on screen (G1f), drawn in the game's comic style: chunky outlined raindrops and snowflakes,
 * ink wind ribbons that flow over walls and part around the ball, a glossy wet sheen (rain) or an icy frost sheen (snow) on the floor, a thick outlined
 * lightning bolt with a star burst, outlined tornado and hurricane, and a wind arrow / placement ring for the targeting cue.
 * Presentation only: every position and phase comes from the same pure functions the simulation uses
 * (src/gameplay/global-hazards.js) and the hazard time passed in, so every player sees the same weather; nothing here reads or
 * writes simulation state. This is gameplay weather and stays separate from the ambient map weather (weather.js).
 *
 * Particles are camera-facing quads built in the vertex shader from a time uniform (no per-frame allocation) and kept few
 * and small so the weather never covers the screen. The layer is attached to the scene only while something is shown.
 */
import { TUNING } from '../shared/tuning.js';
import { surfaceHeight, WALL_HEIGHT } from '../simulation/physics.js';
import { courseBounds, globalHazardCenter, gustStrength, rayToWall } from '../gameplay/global-hazards.js';

const FADE = 0.8; // seconds to fade a hazard in and out
const RAIN_COUNT = 170, SNOW_COUNT = 110, WIND_COUNT = 10, BALL_LINES = 4;
const STEP = 5.5, RISE = 48, SINK = 95; // ribbon point spacing; how far ahead of a wall the air starts rising and how far behind it sinks back (world units)
const FOCUS_RADIUS = 230; // wind visuals are drawn within this distance of the player's ball (world units)
const CEILING = 170; // height particles fall from (world units)
const SLANT = 0.28; // rain and snow lean toward the screen bottom ("south") as they fall
const INK = 'vec3(0.05,0.04,0.09)'; // same dark as the toon ink outline

const fade = (h, t) => Math.max(0, Math.min(1, (t - h.startTime) / FADE, (h.endTime - t) / FADE));
const hazardActive = (h, t) => t >= h.startTime && t < h.endTime;
const EYE = 12; // calm middle drawn in the Hurricane (world units)
/** Small seeded random source for repeatable particle layouts and bolts. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUAD_VERTEX = `
  attribute vec3 seed; attribute vec2 corner;
  uniform float uTime, uFall, uHeight, uSize, uStretch, uSlant, uSway; uniform vec4 uBox;
  varying vec2 vUv; varying float vSeed;
  void main() {
    float h = fract(seed.y - uTime * uFall / uHeight);
    vec3 p = vec3(uBox.x + seed.x * uBox.z, h * uHeight, uBox.y + seed.z * uBox.w);
    p.z += (1.0 - h) * uHeight * uSlant;
    p.x += sin(uTime * 1.3 + seed.z * 40.0) * uSway;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = normalize(vec3(0.0, 1.0, -uSlant));
    p += right * corner.x * uSize + up * (corner.y * 0.5 + 0.5) * uSize * uStretch;
    vUv = corner; vSeed = seed.x;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }`;
const DROP_FRAGMENT = `
  uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying float vSeed;
  void main() {
    float y = vUv.y * 0.5 + 0.5, x = abs(vUv.x);
    float w = y < 0.2 ? sqrt(max(0.0, 1.0 - pow((0.2 - y) / 0.2, 2.0))) : (1.0 - y) * 1.25;
    if (x > w) discard;
    vec3 c = x > w - 0.42 ? ${INK} : mix(uColor, vec3(1.0), step(0.55, vUv.x + 0.0) * 0.5 * step(0.2, y));
    gl_FragColor = vec4(c, uAlpha);
  }`;
const FLAKE_FRAGMENT = `
  uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying float vSeed;
  void main() {
    vec2 q = vUv * 0.5 + vec2(0.0, -0.5) * 0.0; float r = length(vUv);
    float arm = min(abs(vUv.x), abs(vUv.y)); float cross = min(abs(vUv.x), abs(vUv.y)) < 0.16 ? 1.0 : 0.0;
    float d = r - 0.62; float spark = cross > 0.5 ? r - 0.98 : 9.0;
    float m = min(d, spark);
    if (m > 0.2) discard;
    gl_FragColor = vec4(m > 0.0 ? ${INK} : uColor, uAlpha);
  }`;
const RIBBON_VERTEX = `
  attribute vec3 tangent; attribute float edge, width, alpha;
  varying float vEdge, vAlpha;
  void main() {
    vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
    vec2 n = (viewMatrix * vec4(tangent, 0.0)).xy;
    float l = length(n);
    n = l > 0.0001 ? vec2(-n.y, n.x) / l : vec2(0.0, 1.0);
    mv.xy += n * edge * width; // always faces the camera, so the stroke keeps its shape wherever the path bends
    vEdge = edge; vAlpha = alpha;
    gl_Position = projectionMatrix * mv;
  }`;
const RIBBON_FRAGMENT = `
  uniform float uAlpha; varying float vEdge, vAlpha;
  void main() {
    bool ink = abs(vEdge) > 0.62; // a white brush stroke with a thin ink edge
    gl_FragColor = vec4(ink ? ${INK} : vec3(1.0), (ink ? 0.2 : 0.36) * vAlpha * uAlpha);
  }`;
const CUE_VERTEX = `attribute vec2 corner; varying vec2 vUv; void main() { vUv = corner; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const CUE_FRAGMENT = `
  uniform float uAspect, uTime; varying vec2 vUv;
  float wave(float x) { return 0.06 * sin(x * 3.2 - uTime * 3.0) * (1.0 - smoothstep(0.1, 0.55, x)); } // the tail ripples, the head stays on the aim line
  float dash(vec2 p, vec2 c, float h) { vec2 q = p - c; q.x -= clamp(q.x, -h, h); return length(q) - 0.012; }
  // A wind-drawn arrow: one rippling tail with a small curl off its side, swept-back curved barbs meeting in a point, and two speed dashes.
  void main() {
    vec2 p = vec2(vUv.x, vUv.y * uAspect);
    float d = p.x < 0.62 ? abs(p.y - wave(p.x)) - (0.008 + 0.032 * smoothstep(-1.0, 0.5, p.x)) : 9.0;
    float a = abs(p.y);
    if (a < 0.3) d = min(d, abs(p.x - (1.0 - 1.1 * a - 1.6 * a * a)) - (0.012 + 0.09 * (1.0 - a / 0.3)));
    vec2 c = vec2(-0.1, wave(-0.1) + 0.11), q = p - c;
    float phi = atan(q.x, -q.y); if (phi < 0.0) phi += 6.2831853;
    float r = length(q), R0 = 0.11, b = R0 * 0.78 / 9.42478;
    for (int n = 0; n < 2; n++) {
      float th = phi + 6.2831853 * float(n);
      if (th <= 9.42478) d = min(d, abs(r - (R0 - b * th)) - (0.026 - 0.014 * th / 9.42478));
    }
    d = min(d, min(dash(p, vec2(-0.55, -0.2), 0.13), dash(p, vec2(0.02, -0.24), 0.09)));
    float edge = 1.0 - smoothstep(-0.01, 0.0, d);
    if (edge <= 0.0) discard;
    float along = smoothstep(-1.0, 0.7, p.x);
    gl_FragColor = vec4(mix(vec3(0.68, 0.97, 0.9), vec3(1.0), along), edge * mix(0.3, 0.92, along)); // fades out toward the tail like a gust
  }`;
const SHEEN_VERTEX = `varying vec2 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHEEN_FRAGMENT = `
  uniform float uTime, uAlpha, uSnow; uniform vec3 uColor; varying vec2 vWorld;
  void main() {
    float band = sin((vWorld.x + vWorld.y) * 0.035 - uTime * 0.8);
    float gloss = smoothstep(0.55, 0.95, band) * (uSnow > 0.5 ? 0.35 : 0.8);
    float sp = 0.0;
    if (uSnow > 0.5) { vec2 g = floor(vWorld * 0.12); float r = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453); vec2 cell = fract(vWorld * 0.12) - 0.5; sp = step(0.82, r) * step(length(cell), 0.16) * (0.5 + 0.5 * sin(uTime * 3.0 + r * 40.0)); }
    float a = uAlpha * (0.16 + gloss * 0.34 + sp * 0.45);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), gloss * 0.8 + sp), a);
  }`;

export function createGlobalHazardLayer({ THREE, scene }) {
  const group = new THREE.Group();
  group.name = 'global-hazards';
  const owned = [];
  const own = r => { owned.push(r); return r; };
  const layers = {}; // 'rain' | 'snow' | 'wind' -> { object, update(h, ctx) }
  const dynamic = new Map(); // key -> { root, tick, owned }
  let sheen = null; // { key, meshes, material }

  /** Box of the course in world units: [x, z, width, depth]; the corner mapping is read from the transform so no axis assumption is made. */
  function worldBox(transform, bounds) {
    const pts = [[bounds.x, bounds.y], [bounds.x + bounds.w, bounds.y], [bounds.x, bounds.y + bounds.h], [bounds.x + bounds.w, bounds.y + bounds.h]].map(([x, y]) => transform.ground(x, y, 0));
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[2]);
    const x0 = Math.min(...xs), z0 = Math.min(...zs);
    return [x0, z0, Math.max(...xs) - x0, Math.max(...zs) - z0];
  }

  /** n camera-facing quads with a seed per quad and a corner per vertex. */
  function quads(n, seedOf) {
    const seed = new Float32Array(n * 12), corner = new Float32Array(n * 8), pos = new Float32Array(n * 12), index = new Uint16Array(n * 6);
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < n; i++) {
      const s = seedOf(i);
      for (let j = 0; j < 4; j++) { seed.set(s, (i * 4 + j) * 3); corner.set(C[j], (i * 4 + j) * 2); }
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    return g;
  }
  const meshOf = (geometry, material) => { const m = new THREE.Mesh(geometry, material); m.frustumCulled = false; return m; };

  function precipitation(kind) {
    const rain = kind === 'rain', n = rain ? RAIN_COUNT : SNOW_COUNT, rand = seededRandom(rain ? 11 : 23);
    const material = own(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX, fragmentShader: rain ? DROP_FRAGMENT : FLAKE_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uFall: { value: rain ? 420 : 34 }, uHeight: { value: CEILING }, uSize: { value: rain ? 1.9 : 2.6 }, uStretch: { value: rain ? 7 : 1 }, uSlant: { value: rain ? SLANT : SLANT * 0.6 },
        uSway: { value: rain ? 0 : 5 }, uBox: { value: new THREE.Vector4() }, uColor: { value: new THREE.Color(rain ? 0x4aa3ff : 0xffffff) }, uAlpha: { value: 0 },
      },
    }));
    const object = meshOf(quads(n, () => [rand(), rand(), rand()]), material);
    return { object, update(h, ctx) { material.uniforms.uTime.value = ctx.t; material.uniforms.uBox.value.set(...ctx.box); material.uniforms.uAlpha.value = 0.92 * fade(h, ctx.hazardTime); } };
  }

  const ramp = (edge0, edge1, x) => { const u = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return u * u * (3 - 2 * u); };

  /**
   * Wind as ink ribbons. Each ribbon is a stroke sliding along a fixed flow path, so it bends with the air instead of a picture being
   * tilted: the path runs at ball height, rises ahead of a wall, crosses its top and sinks slowly in its lee (visual only:
   * walls never block the push on the ball). Some strokes end in a rolling curl. Short strokes part around the local ball like air around an obstacle. Everything flows through the area around the player's ball; this is presentation only, so each client
   * centres it on its own ball. Vertices are written into one pooled mesh each frame.
   */
  function windRibbons() {
    const P = 24, lines = WIND_COUNT + BALL_LINES, rand = seededRandom(37), seeds = Array.from({ length: WIND_COUNT }, () => [rand(), rand(), rand()]);
    const count = lines * P * 2, position = new Float32Array(count * 3), tangent = new Float32Array(count * 3), edge = new Float32Array(count), width = new Float32Array(count), alpha = new Float32Array(count);
    const index = new Uint16Array(lines * (P - 1) * 6);
    for (let l = 0, n = 0; l < lines; l++) for (let k = 0; k < P; k++) {
      const v = (l * P + k) * 2; edge[v] = -1; edge[v + 1] = 1;
      if (k < P - 1) { index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], n); n += 6; }
    }
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('tangent', new THREE.BufferAttribute(tangent, 3));
    geometry.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
    geometry.setAttribute('width', new THREE.BufferAttribute(width, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    const material = own(new THREE.ShaderMaterial({ vertexShader: RIBBON_VERTEX, fragmentShader: RIBBON_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uAlpha: { value: 0 } } }));
    const object = meshOf(geometry, material);
    object.renderOrder = 5;
    const pts = new Float64Array(P * 3);
    /** Writes `pts` as ribbon `l`: thin at both ends, widest just behind the head, fading toward the tail. */
    function write(l, thick, fade) {
      for (let k = 0; k < P; k++) {
        const a = Math.max(0, k - 1) * 3, b = Math.min(P - 1, k + 1) * 3, u = k / (P - 1), w = thick * Math.pow(Math.sin(Math.PI * Math.pow(1 - u, 1.7)), 0.7), o = 1 - u * u;
        for (let e = 0; e < 2; e++) {
          const v = (l * P + k) * 2 + e;
          position.set([pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]], v * 3);
          tangent.set([pts[b] - pts[a], pts[b + 1] - pts[a + 1], pts[b + 2] - pts[a + 2]], v * 3);
          width[v] = w; alpha[v] = fade * o;
        }
      }
    }
    return {
      object,
      update(h, ctx) {
        const { course, transform, focus, ball } = ctx, dir = windDirection(h.direction, ctx), g = gustStrength(h, ctx.hazardTime);
        const dx = Math.cos(h.direction), dy = Math.sin(h.direction), span = FOCUS_RADIUS * 2, over = WALL_HEIGHT + 12;
        // The distance travelled is the integral of the speed (base + gust), so a slowing gust never pulls the strokes backwards.
        const tau = Math.max(0, ctx.hazardTime - h.startTime), T = h.endTime - h.startTime;
        const phase = 110 * tau + 420 * (tau / 2 - T / (4 * Math.PI) * Math.sin(2 * Math.PI * tau / T));
        const flow = (out, k, lane, along, base, wob) => {
          const side = lane + Math.sin(along * 0.02 + wob) * 7;
          const x = focus[0] + dx * along - dy * side, y = focus[1] + dy * along + dx * side;
          const ahead = rayToWall(course, x, y, dx, dy, RISE), behind = rayToWall(course, x, y, -dx, -dy, SINK);
          const lift = over * Math.max(ahead === Infinity ? 0 : 1 - ramp(0, RISE, ahead), behind === Infinity ? 0 : 1 - ramp(0, SINK, behind));
          const w = transform.ground(x, y, Math.max(0, surfaceHeight(course, x, y)) + base + lift + Math.sin(along * 0.03 + wob * 2) * 2.5);
          out[k * 3] = w[0]; out[k * 3 + 1] = w[1]; out[k * 3 + 2] = w[2];
        };
        seeds.forEach((sd, i) => {
          const f = (sd[0] + phase / span) % 1, head = (f - 0.5) * span, lane = (sd[2] - 0.5) * span * 0.9, base = 6 + sd[1] * 14, wob = sd[2] * 6.28;
          const curl = i % 3 === 0 ? 12 : 0;
          for (let k = curl; k < P; k++) flow(pts, k, lane, head - (k - curl) * STEP, base, wob);
          if (curl) { // a rolling curl: a spiral standing on the path at the head of the stroke
            const hx = pts[curl * 3], hy = pts[curl * 3 + 1], hz = pts[curl * 3 + 2], R = 10;
            for (let k = 0; k < curl; k++) {
              const q = (curl - k) / curl, th = q * Math.PI * 2.3, r = R * (1 - 0.65 * q);
              pts[k * 3] = hx + dir.x * Math.sin(th) * r; pts[k * 3 + 1] = hy + R - Math.cos(th) * r; pts[k * 3 + 2] = hz + dir.z * Math.sin(th) * r;
            }
          }
          write(i, 1.3, ramp(0, 0.1, f) * (1 - ramp(0.9, 1, f)));
        });
        const atBall = ball && Number.isFinite(ball.x);
        for (let j = 0; j < BALL_LINES; j++) { // air parting around the ball: the strokes bow out as they pass it and close up behind
          const l = WIND_COUNT + j, side = j % 2 ? 1 : -1, row = j >> 1, u = (ctx.t * 1.25 + j / BALL_LINES) % 1, head = -26 + u * 78;
          if (atBall) for (let k = 0; k < P; k++) {
            const along = head - k * 2.4, off = side * (3 + row * 3.5 + 9 * Math.exp(-(along * along) / 130));
            const w = transform.ground(ball.x + dx * along - dy * off, ball.y + dy * along + dx * off, (ball.z || 0) + 3 + row * 3.5);
            pts[k * 3] = w[0]; pts[k * 3 + 1] = w[1]; pts[k * 3 + 2] = w[2];
          }
          write(l, 0.7, atBall ? Math.sin(Math.PI * u) * 0.6 : 0);
        }
        for (const name of ['position', 'tangent', 'width', 'alpha']) geometry.attributes[name].needsUpdate = true;
        material.uniforms.uAlpha.value = Math.min(1, Math.sqrt(g) * 1.2);
      },
    };
  }
  function windDirection(angle, ctx) {
    const [x0, y0] = ctx.center, a = ctx.transform.ground(x0 + Math.cos(angle), y0 + Math.sin(angle), 0), b = ctx.transform.ground(x0, y0, 0);
    return new THREE.Vector3(a[0] - b[0], 0, a[2] - b[2]).normalize();
  }

  /** Wet (rain) or frosted (snow) sheen over every floor tile. Rebuilt when the course changes. */
  function sheenFor(kind, course, transform, hazardTime, h) {
    const key = course.tiles;
    if (!sheen || sheen.key !== key) {
      if (sheen) { for (const m of sheen.meshes) group.remove(m); }
      const material = own(new THREE.ShaderMaterial({
        vertexShader: SHEEN_VERTEX, fragmentShader: SHEEN_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
        uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uSnow: { value: 0 }, uColor: { value: new THREE.Color(0x9fd2ff) } },
      }));
      const meshes = [];
      for (const [x, y, w, hh] of course.tiles || []) {
        const a = transform.ground(x, y, 0), b = transform.ground(x + w, y + hh, 0);
        const geometry = own(new THREE.PlaneGeometry(Math.abs(b[0] - a[0]), Math.abs(b[2] - a[2])));
        geometry.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geometry, material);
        m.position.set((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.35, (a[2] + b[2]) / 2); m.renderOrder = 2;
        group.add(m); meshes.push(m);
      }
      sheen = { key, meshes, material };
    }
    const u = sheen.material.uniforms;
    u.uTime.value = hazardTime; u.uSnow.value = kind === 'snow' ? 1 : 0; u.uAlpha.value = fade(h, hazardTime);
    u.uColor.value.setHex(kind === 'snow' ? 0xcfeeff : 0x9fd2ff);
    for (const m of sheen.meshes) m.visible = true;
  }

  const solid = (color, opacity, side = THREE.DoubleSide) => own(new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, side }));
  const ink = () => own(new THREE.MeshBasicMaterial({ color: 0x0d0a17, depthWrite: false, side: THREE.DoubleSide }));

  /** Tornado: stacked tilted rings that widen upward, each with a dark comic outline, and its reach marked on the ground. */
  function tornadoMesh() {
    const root = new THREE.Group(), rings = [], reach = TUNING.globalHazards.vortexRange;
    for (let i = 0; i < 7; i++) {
      const u = i / 6, r = 7 + 30 * u * u + 8 * u, tube = 3 + 2 * u;
      const pivot = new THREE.Group();
      const outline = new THREE.Mesh(own(new THREE.TorusGeometry(r, tube + 1.6, 6, 24)), ink());
      const ring = new THREE.Mesh(own(new THREE.TorusGeometry(r, tube, 6, 24)), solid(i % 2 ? 0xdfe5f0 : 0x9aa4bd, 1));
      outline.renderOrder = 3; ring.renderOrder = 4;
      pivot.add(outline, ring); pivot.rotation.x = Math.PI / 2; pivot.position.y = 8 + u * 95; pivot.userData = { u, i };
      rings.push(pivot); root.add(pivot);
    }
    const cap = new THREE.Mesh(own(new THREE.RingGeometry(reach - 2.5, reach, 56)), solid(0x0d0a17, 0.55)); cap.rotation.x = -Math.PI / 2; cap.position.y = 0.8; root.add(cap);
    const dash = new THREE.Mesh(own(new THREE.RingGeometry(reach - 1.2, reach - 0.2, 56)), solid(0xdfe5f0, 0.6)); dash.rotation.x = -Math.PI / 2; dash.position.y = 0.85; root.add(dash);
    return { root, tick: (t, k) => rings.forEach(p => { const { u, i } = p.userData; p.rotation.z = t * (3 - 1.5 * u) + i; p.position.x = Math.sin(t * 2 + i) * (2 + 4 * u); p.position.z = Math.cos(t * 2 + i) * (2 + 4 * u); p.scale.setScalar(0.4 + 0.6 * k); }) };
  }

  /** Hurricane: broad outlined spiral arms turning around a calm eye, low over the course. */
  function hurricaneMesh() {
    const root = new THREE.Group(), arms = [], reach = TUNING.globalHazards.vortexRange, eye = EYE;
    for (let i = 0; i < 5; i++) {
      const inner = eye + (reach - eye) * (i / 5), outer = eye + (reach - eye) * ((i + 0.6) / 5), len = Math.PI * (1.2 + 0.1 * i);
      const pivot = new THREE.Group(), y = 3 + i * 4;
      const out = new THREE.Mesh(own(new THREE.RingGeometry(Math.max(0.1, inner - 1.8), outer + 1.8, 40, 1, -0.06, len + 0.12)), ink());
      const arm = new THREE.Mesh(own(new THREE.RingGeometry(inner, outer, 40, 1, 0, len)), solid(i % 2 ? 0xf2f6ff : 0x8fa0f0, 0.95));
      out.renderOrder = 3; arm.renderOrder = 4; arm.position.y = 0.2;
      pivot.add(out, arm); pivot.rotation.x = -Math.PI / 2; pivot.position.y = y; pivot.userData = { i };
      arms.push(pivot); root.add(pivot);
    }
    const eyeRing = new THREE.Mesh(own(new THREE.RingGeometry(eye - 2, eye, 32)), solid(0xffffff, 0.95)); eyeRing.rotation.x = -Math.PI / 2; eyeRing.position.y = 1; root.add(eyeRing);
    const cap = new THREE.Mesh(own(new THREE.RingGeometry(reach - 2.5, reach, 56)), solid(0x0d0a17, 0.55)); cap.rotation.x = -Math.PI / 2; cap.position.y = 0.8; root.add(cap);
    return { root, tick: (t, k) => arms.forEach(a => { a.rotation.z = -t * (1.6 - 0.2 * a.userData.i); a.scale.setScalar(0.5 + 0.5 * k); }) };
  }

  /** Ribbon along a polyline, as two crossed vertical strips so it shows from any camera angle. */
  function ribbon(points, width, material) {
    const verts = [], index = [];
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const base = verts.length / 3;
      points.forEach((p, i) => { const w = width * (1 - 0.6 * (i / (points.length - 1))); verts.push(p.x - dx * w, p.y, p.z - dz * w, p.x + dx * w, p.y, p.z + dz * w); });
      for (let i = 0; i < points.length - 1; i++) { const a = base + i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(index);
    return new THREE.Mesh(g, material);
  }

  /** Lightning: a thick yellow zigzag bolt with a dark outline and a star burst where it lands; seeded, so every client draws the same one. */
  function boltMesh(h, tip) {
    const rand = seededRandom(h.seed ^ 0x9e3779b9), pts = [], steps = 7;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, j = i === 0 || i === steps ? 0 : 1, side = i % 2 ? 1 : -1;
      pts.push(new THREE.Vector3(tip.x + side * (6 + rand() * 12) * j, 210 * (1 - u) + tip.y * u, tip.z + (rand() - 0.5) * 12 * j));
    }
    const outline = ribbon(pts, 6.5, ink()), core = ribbon(pts, 3.8, solid(0xfff36b, 1));
    outline.renderOrder = 6; core.renderOrder = 7;
    const star = new THREE.Shape();
    for (let i = 0; i < 16; i++) { const r = i % 2 ? 11 : 26, a = (i / 16) * Math.PI * 2; star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    const burstOut = new THREE.Mesh(own(new THREE.ShapeGeometry(star)), ink()), burst = new THREE.Mesh(own(new THREE.ShapeGeometry(star)), solid(0xfff36b, 1));
    burst.scale.setScalar(0.8); burstOut.scale.setScalar(1);
    for (const m of [burstOut, burst]) { m.rotation.x = -Math.PI / 2; m.position.set(tip.x, tip.y + 1.2, tip.z); }
    burstOut.renderOrder = 6; burst.renderOrder = 7;
    const root = new THREE.Group(); root.add(outline, core, burstOut, burst);
    return { root, tick: (t, k) => { const pop = 0.75 + 0.25 * Math.sin(t * 40); burst.scale.setScalar(0.8 * pop); burstOut.scale.setScalar(pop); root.visible = k > 0.05 && Math.sin(t * 60) > -0.8; } };
  }

  /** Targeting cue: a flat arrow showing the direction the wind will blow, or a ring (Lightning target / Tornado and Hurricane reach). */
  const cue = (() => {
    const root = new THREE.Group(), half = 16, across = 11; // half length along the flow, half width across it (world units)
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute([-across, 0, -half, across, 0, -half, across, 0, half, -across, 0, half], 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, -1, 1, 1, 1, 1, -1], 2)); // x along the flow (tail to head), y across
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const cueMat = own(new THREE.ShaderMaterial({ vertexShader: CUE_VERTEX, fragmentShader: CUE_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uAspect: { value: across / half }, uTime: { value: 0 } } }));
    // the quad's corner.x runs along world z, so rotating the group about y turns the whole gust toward the chosen direction
    const gust = new THREE.Mesh(g, cueMat); gust.renderOrder = 9; gust.position.z = half; // tail starts at the ball
    const arrowGroup = new THREE.Group(); arrowGroup.add(gust);
    const ringGeo = own(new THREE.RingGeometry(0.9, 1, 48)), ring = new THREE.Mesh(ringGeo, solid(0xfff36b, 0.95)); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 8;
    root.add(arrowGroup, ring); root.visible = false;
    return { root, arrowGroup, ring, material: cueMat };
  })();
  group.add(cue.root);

  function ensure(kind) {
    if (layers[kind]) return layers[kind];
    const layer = kind === 'rain' || kind === 'snow' ? precipitation(kind) : windRibbons();
    group.add(layer.object);
    layers[kind] = layer;
    return layer;
  }

  return {
    group,
    /**
     * @param {object[]} list Hazards in force (simulation descriptors; a Lightning also carries `at: {x, y, z}`, the struck ball in simulation coordinates)
     * @param {{kind:string, from:{x:number,y:number}, x:number, y:number}|null} targeting Cue while the player chooses a direction or spot
     * @param {number} hazardTime Seconds since the round started
     * @param {{ground:(x:number,y:number,h:number)=>number[]}} transform
     * @param {object} course
     * @param {number} t Animation clock, seconds
     * @param {{x:number,y:number,z:number}|null} [ball] The local ball (the wind flows around it)
     */
    update(list, targeting, hazardTime, transform, course, t, ball = null) {
      const limits = courseBounds(course) || [0, 0, 800, 500], bounds = { x: limits[0], y: limits[1], w: limits[2] - limits[0], h: limits[3] - limits[1] };
      const box = worldBox(transform, bounds), center = [bounds.x + bounds.w / 2, bounds.y + bounds.h / 2];
      const focus = ball && Number.isFinite(ball.x) ? [ball.x, ball.y] : center;
      const ctx = { t, hazardTime, box, center, focus, transform, bounds, course, ball };
      const shown = new Set();
      for (const l of Object.values(layers)) l.object.visible = false;
      if (sheen) for (const m of sheen.meshes) m.visible = false;
      for (const h of list || []) {
        if (!hazardActive(h, hazardTime)) continue;
        const k = fade(h, hazardTime);
        if (h.kind === 'rain' || h.kind === 'snow') sheenFor(h.kind, course, transform, hazardTime, h);
        if (h.kind === 'rain' || h.kind === 'snow' || h.kind === 'wind') {
          const layer = ensure(h.kind); layer.object.visible = true; layer.update(h, ctx);
          continue;
        }
        const key = `${h.id}:${h.kind}`;
        shown.add(key);
        let entry = dynamic.get(key);
        if (!entry) {
          const before = owned.length;
          if (h.kind === 'lightning') {
            if (!h.at) continue;
            const g = transform.ground(h.at.x, h.at.y, h.at.z);
            entry = boltMesh(h, { x: g[0], y: g[1], z: g[2] });
          } else entry = h.kind === 'tornado' ? tornadoMesh() : hurricaneMesh();
          entry.owned = owned.splice(before); // released with the mesh when the hazard ends
          group.add(entry.root); dynamic.set(key, entry);
        }
        if (h.kind !== 'lightning') {
          const c = globalHazardCenter(h, hazardTime, limits);
          if (c) { const g = transform.ground(c.x, c.y, Math.max(0, surfaceHeight(course, c.x, c.y))); entry.root.position.set(g[0], g[1], g[2]); }
        }
        entry.tick(t, h.kind === 'lightning' ? k : Math.max(0.15, k));
      }
      for (const [key, entry] of [...dynamic]) if (!shown.has(key)) { group.remove(entry.root); dynamic.delete(key); for (const r of entry.owned) r.dispose?.(); }
      cue.root.visible = false;
      if (targeting) {
        const floor = surfaceHeight(course, targeting.from.x, targeting.from.y), from = transform.ground(targeting.from.x, targeting.from.y, floor);
        if (targeting.kind === 'wind') {
          const a = Math.atan2(targeting.y - targeting.from.y, targeting.x - targeting.from.x);
          if (Number.isFinite(a) && Math.hypot(targeting.x - targeting.from.x, targeting.y - targeting.from.y) > 1) {
            const d = windDirection(a, ctx);
            cue.root.visible = true; cue.ring.visible = false; cue.arrowGroup.visible = true; cue.material.uniforms.uTime.value = t;
            cue.arrowGroup.position.set(from[0], from[1] + 2, from[2]); cue.arrowGroup.rotation.set(0, Math.atan2(d.x, d.z), 0);
          }
        } else {
          const c = globalHazardCenter({ kind: targeting.kind, seed: 1, startTime: 0, endTime: 1, x: targeting.x, y: targeting.y }, 0, limits);
          if (c) {
            const g = transform.ground(c.x, c.y, Math.max(0, surfaceHeight(course, c.x, c.y)));
            cue.root.visible = true; cue.arrowGroup.visible = false; cue.ring.visible = true; cue.ring.scale.setScalar(TUNING.globalHazards.vortexRange); cue.ring.position.set(g[0], g[1] + 1.5, g[2]);
          }
        }
      }
      const any = Object.values(layers).some(l => l.object.visible) || dynamic.size > 0 || cue.root.visible || !!sheen?.meshes.some(m => m.visible);
      if (any && !group.parent) scene.add(group);
      else if (!any && group.parent) scene.remove(group);
    },
    /** Names of the layers and dynamic meshes currently shown, for tests. */
    shown: () => [...Object.entries(layers).filter(([, l]) => l.object.visible).map(([k]) => k), ...[...dynamic.keys()].map(k => k.split(':').pop())],
    dispose() { for (const r of owned) r.dispose?.(); for (const entry of dynamic.values()) for (const r of entry.owned) r.dispose?.(); owned.length = 0; dynamic.clear(); sheen = null; scene.remove(group); },
  };
}
