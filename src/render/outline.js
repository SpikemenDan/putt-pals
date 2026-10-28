/**
 * Ink outlines for the toon style (V1a #58): an inverted hull per solid mesh,
 * pushed out a fixed number of drawing-buffer pixels in screen space so every
 * outline has the same thickness at any distance.
 *
 * Closed meshes get a back-face hull on merged, smoothed normals (a box corner
 * extrudes along its diagonal, so the outline never splits at hard edges).
 * Flat open meshes (flag, water, ramps) get a planar hull: the same surface
 * with its border pushed away from its centre in screen space, drawn after
 * its owner and masked by the owner's stencil, so it only shows outside it
 * (needs a stencil buffer; the renderer asks for one).
 * Hulls are children of their mesh, so movers, fans, power blocks and balls
 * carry their outline with them; they never cast shadows or take raycasts.
 */

export const INK_COLOR = 'vec3(.04,.03,.06)';
/** Outline width and halftone cell, as a share of the drawing-buffer width (4 px and 6 px at 1280 px). */
export const INK_WIDTH = 4 / 1280;
export const DOT_CELL = 6 / 1280;

const INK_VERTEX = `uniform float ink;uniform vec2 res;
#ifdef INK_PLANAR
attribute float inkEdge;
#endif
#ifdef INK_LIFT
uniform float inkLift;
#endif
#ifdef INK_CUP
varying vec3 cupWorld;
#endif
void main(){
  vec4 view=modelViewMatrix*vec4(position,1.);
#ifdef INK_LIFT
  view.z+=inkLift;
#endif
  vec4 clip=projectionMatrix*view;
#ifdef INK_CUP
  cupWorld=(modelMatrix*vec4(position,1.)).xyz;
#endif
#ifdef INK_PLANAR
  vec4 c=projectionMatrix*modelViewMatrix*vec4(0.,0.,0.,1.);
  vec2 dir=(clip.xy/clip.w-c.xy/c.w)*res*inkEdge;
#else
  // Screen direction of the normal: project a point nudged along it, with the perspective divide.
  vec4 n=projectionMatrix*(view+vec4(normalize(normalMatrix*normal)*.01*max(1.,-view.z),0.));
  vec2 dir=(n.xy/n.w-clip.xy/clip.w)*res;
#endif
  float len=length(dir);
  if(len>1e-4&&clip.w>0.)clip.xy+=dir/len*ink*2./res*clip.w;
  gl_Position=clip;
}`;
const INK_FRAGMENT = `
#ifdef INK_CUP
varying vec3 cupWorld;uniform vec2 cupCenter;uniform float cupRadius;
#endif
void main(){
#ifdef INK_CUP
  if(distance(cupWorld.xz,cupCenter)<cupRadius)discard;
#endif
  gl_FragColor=vec4(${INK_COLOR},1.);
}`;

/**
 * Shared ink uniforms; the renderer keeps them in step with the drawing buffer.
 * @param {object} THREE
 */
export function createInkUniforms(THREE) {
  return { ink: { value: 4 }, res: { value: new THREE.Vector2(1280, 800) }, dot: { value: 6 } };
}

/** Sets outline width and halftone cell from the drawing-buffer size. */
export function sizeInk(uniforms, width, height) {
  if (!(width > 0 && height > 0)) return;
  uniforms.res.value.set(width, height);
  uniforms.ink.value = Math.max(2, width * INK_WIDTH);
  uniforms.dot.value = Math.max(4, width * DOT_CELL);
}

/**
 * @param {object} THREE
 * @param {ReturnType<typeof createInkUniforms>} uniforms Shared by reference
 * @param {object} [options]
 * @param {boolean} [options.planar=false] Flat open surface: extrude from the mesh centre
 * @param {boolean} [options.overlay=false] For translucent owners: drawn after them, so the owner hides the hull's inside
 * @param {{center: [number, number], radius: number}|null} [options.cup=null] Cup cutout (world x/z), as on the turf
 * @param {number} [options.lift=0] Moves the hull this far toward the camera (view units). A ball's back
 *   half can touch a wall it rests against; a small lift (a third of its radius) keeps the ring in front.
 */
export function createInkMaterial(THREE, uniforms, { planar = false, overlay = false, cup = null, lift = 0 } = {}) {
  const defines = {};
  const own = { ink: uniforms.ink, res: uniforms.res };
  if (planar) defines.INK_PLANAR = '';
  if (lift) { defines.INK_LIFT = ''; own.inkLift = { value: lift }; }
  if (cup) {
    defines.INK_CUP = '';
    own.cupCenter = { value: new THREE.Vector2(...cup.center) };
    own.cupRadius = { value: cup.radius };
  }
  const material = new THREE.ShaderMaterial({
    defines, uniforms: own, vertexShader: INK_VERTEX, fragmentShader: INK_FRAGMENT,
    side: planar ? THREE.DoubleSide : THREE.BackSide, fog: false,
    polygonOffset: planar, polygonOffsetFactor: planar ? 1 : 0, polygonOffsetUnits: planar ? 1 : 0,
    // Translucent owners and planar hulls draw after their owner (see addInk).
    transparent: overlay || planar,
  });
  if (planar) Object.assign(material, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc });
  material.userData.ink = true;
  return material;
}

/**
 * Merges vertices by position and gives each one the normalized sum of the distinct
 * face normals around it. Only position, normal and index are kept.
 * @param {object} THREE
 * @param {object} geometry BufferGeometry, indexed or not
 */
export function smoothHullGeometry(THREE, geometry) {
  const pos = geometry.attributes.position, index = geometry.index;
  const count = index ? index.count : pos.count;
  const ids = new Map(), positions = [], sums = [], seen = [], indices = [];
  const vertex = i => {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = Math.round(x * 1000) + ',' + Math.round(y * 1000) + ',' + Math.round(z * 1000);
    let id = ids.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      ids.set(key, id);
      positions.push(x, y, z);
      sums.push(0, 0, 0);
      seen.push(new Set());
    }
    return id;
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let k = 0; k + 2 < count; k += 3) {
    const tri = [k, k + 1, k + 2].map(i => (index ? index.getX(i) : i));
    a.fromBufferAttribute(pos, tri[0]); b.fromBufferAttribute(pos, tri[1]); c.fromBufferAttribute(pos, tri[2]);
    const n = c.sub(b).cross(a.sub(b));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    const ids3 = tri.map(vertex);
    if (ids3[0] === ids3[1] || ids3[1] === ids3[2] || ids3[0] === ids3[2]) continue;
    indices.push(...ids3);
    const key = Math.round(n.x * 100) + ',' + Math.round(n.y * 100) + ',' + Math.round(n.z * 100);
    for (const id of ids3) {
      if (seen[id].has(key)) continue;
      seen[id].add(key);
      sums[id * 3] += n.x; sums[id * 3 + 1] += n.y; sums[id * 3 + 2] += n.z;
    }
  }
  for (let i = 0; i < sums.length; i += 3) {
    const l = Math.hypot(sums[i], sums[i + 1], sums[i + 2]) || 1;
    sums[i] /= l; sums[i + 1] /= l; sums[i + 2] /= l;
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hull.setAttribute('normal', new THREE.Float32BufferAttribute(sums, 3));
  hull.setIndex(indices);
  return hull;
}

/**
 * Marks the outline of a flat mesh: 1 on vertices at the edge of its rest-pose bounding box
 * (across its two widest axes), 0 inside. Only edge vertices are pushed out, so a waving flag
 * that folds over itself keeps its ink at the border.
 */
function markEdges(THREE, geometry) {
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const size = [max.x - min.x, max.y - min.y, max.z - min.z];
  const thin = size.indexOf(Math.min(...size));
  const lo = [min.x, min.y, min.z], hi = [max.x, max.y, max.z];
  const edge = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    edge[i] = [0, 1, 2].some(k => k !== thin && (Math.abs(v[k] - lo[k]) < 1e-3 || Math.abs(v[k] - hi[k]) < 1e-3)) ? 1 : 0;
  }
  geometry.setAttribute('inkEdge', new THREE.BufferAttribute(edge, 1));
}

/**
 * Adds an ink hull as a child of `mesh` and records it as `mesh.userData.ink`.
 * A planar hull shares the mesh's geometry when that is centred on the mesh origin
 * (so an animated flag keeps its outline); otherwise it gets a re-centred copy.
 * @returns {object} The hull mesh
 */
export function addInk(THREE, mesh, material, { planar = false, centred = false } = {}) {
  let geometry, offset = null;
  if (!planar) geometry = smoothHullGeometry(THREE, mesh.geometry);
  else if (centred) geometry = mesh.geometry;
  else {
    geometry = mesh.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position') geometry.deleteAttribute(name);
    geometry.computeBoundingBox();
    offset = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-offset.x, -offset.y, -offset.z);
  }
  if (planar) {
    markEdges(THREE, geometry);
    // The owner marks its pixels; its hull draws only around them, never over its own folds.
    Object.assign(mesh.material, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  }
  const hull = new THREE.Mesh(geometry, material);
  if (offset) hull.position.copy(offset);
  hull.castShadow = hull.receiveShadow = false;
  hull.userData.inkHull = true;
  if (material.transparent) hull.renderOrder = mesh.renderOrder + 1;
  mesh.add(hull);
  mesh.userData.ink = hull;
  return hull;
}
