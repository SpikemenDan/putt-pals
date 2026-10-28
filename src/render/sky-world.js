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

const DOME_RADIUS = 6000;
const HORIZON_RING = [3300, 4700];
const DECK_HEIGHT = [-1500, -1000];

// Display-sRGB colours written directly by the shader, like the other effect shaders (R2c #57).
const DOME_VERTEX = 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const DOME_FRAGMENT = `varying vec3 p;
uniform float time;
void main(){
  vec3 q=normalize(p);
  float y=q.y;
  vec3 c;
  if(y>=0.){
    float band=floor(clamp(y,0.,.999)*5.);
    c=band<1.?vec3(.86,.95,1.):band<2.?vec3(.6,.84,1.):band<3.?vec3(.38,.69,.98):band<4.?vec3(.27,.56,.95):vec3(.2,.46,.9);
  }else{
    float band=floor(clamp(-y,0.,.999)*3.);
    c=band<1.?vec3(.72,.89,1.):band<2.?vec3(.52,.78,1.):vec3(.4,.68,.97);
  }
  vec3 sd=normalize(vec3(.35,.65,.5));
  float d=dot(q,sd);
  float a=acos(clamp(d,-1.,1.));
  vec3 up=abs(sd.y)>.99?vec3(1.,0.,0.):vec3(0.,1.,0.);
  vec3 ex=normalize(cross(up,sd)),ey=cross(sd,ex);
  float ang=atan(dot(q,ey),dot(q,ex));
  float spin=ang*8./6.2831853+time*.01;
  float front=step(0.,d);
  float rays=step(.5,fract(spin))*step(.2,a)*(1.-step(.34,a));
  c=mix(c,vec3(1.,.95,.62),rays*.8*front);
  c=mix(c,vec3(1.,.9,.5),(1.-step(.2,a))*front*.85);
  c=mix(c,vec3(1.,.99,.86),1.-step(.08,a));
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

function makeCloud(rand, x, y, z, s) {
  const n = 5 + Math.floor(rand() * 3), mid = (n - 1) / 2, puffs = [];
  for (let k = 0; k < n; k++) {
    const o = (k - mid) / n;
    puffs.push({ x: (k - mid) * 0.85, y: (1 - Math.abs(o) * 1.4) * 0.34 + (k % 2) * 0.08, z: (rand() - 0.5) * 0.5, r: 0.5 + (1 - Math.abs(o) * 1.3) * 0.42 });
  }
  return { x, y, z, s, puffs };
}

export function createSkyWorld({ THREE }) {
  if (!THREE) throw new TypeError('THREE is required');
  const owned = [];
  const own = resource => { owned.push(resource); return resource; };

  const time = { value: 0 };
  const dome = new THREE.Mesh(
    own(new THREE.SphereGeometry(DOME_RADIUS, 48, 32)),
    own(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time }, vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT })),
  );
  dome.frustumCulled = false;

  const cloudMaterial = own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));

  // Horizon layer: big distant clouds that circle the camera, so they stay far away in every view.
  const rand = seeded(59);
  const ringClouds = [];
  for (let k = 0; k < 14; k++) {
    const angle = (k / 14) * Math.PI * 2 + rand() * 0.3, radius = HORIZON_RING[0] + rand() * (HORIZON_RING[1] - HORIZON_RING[0]);
    ringClouds.push(makeCloud(rand, Math.cos(angle) * radius, -250 + rand() * 900, Math.sin(angle) * radius, 320 + rand() * 280));
  }
  const horizon = new THREE.Group();
  horizon.add(new THREE.Mesh(own(buildCloudGeometry(THREE, ringClouds)), cloudMaterial));

  // Cloud deck far below the courses: gives the floating islands something to float above.
  const deckClouds = [];
  for (let k = 0; k < 10; k++) {
    deckClouds.push(makeCloud(rand, -1800 + rand() * 6600, DECK_HEIGHT[0] + rand() * (DECK_HEIGHT[1] - DECK_HEIGHT[0]), -2400 + rand() * 6000, 300 + rand() * 240));
  }
  const deck = new THREE.Mesh(own(buildCloudGeometry(THREE, deckClouds)), cloudMaterial);

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

  return {
    dome,
    group,
    /** Advance the sky to `t` seconds and re-centre the camera-following layers on `camera`. */
    update(t, camera) {
      time.value = t;
      dome.position.copy(camera);
      horizon.position.set(camera.x, 0, camera.z);
      horizon.rotation.y = t * 0.004;
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
