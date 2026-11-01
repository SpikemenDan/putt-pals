/**
 * Camera-versus-solid resolution (CL2 #103). Plain arithmetic on world-space
 * [x, y, z] arrays (y up), no Three.js, so tests can check it against boxes.
 *
 * A solid is an axis-aligned box { min: [x, y, z], max: [x, y, z] }. A camera
 * that ends up inside one (plus a clearance for the near plane) is moved out
 * through the nearest side. It never moves down, so the camera cannot be pushed
 * under the course floor.
 */

/** Gap kept between the camera and a solid; larger than the camera's near plane (3). */
export const CAMERA_CLEARANCE = 4;

const MAX_PASSES = 4;

/** True when the point is inside the box grown by `margin` on every side. */
export function insideSolid(point, solid, margin = 0) {
  for (let axis = 0; axis < 3; axis++) {
    if (point[axis] <= solid.min[axis] - margin || point[axis] >= solid.max[axis] + margin) return false;
  }
  return true;
}

/**
 * Returns a position outside every solid, nearest to `point`. Returns `point` itself when nothing overlaps.
 * @param {number[]} point World camera position
 * @param {Array<{min: number[], max: number[]}>} solids
 * @param {number} [margin=CAMERA_CLEARANCE]
 */
export function resolveCameraPosition(point, solids, margin = CAMERA_CLEARANCE) {
  let out = point;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (const solid of solids) {
      if (!insideSolid(out, solid, margin)) continue;
      // Candidate exits: out through each side except the bottom.
      let axisBest = -1, valueBest = 0, costBest = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const high = solid.max[axis] + margin, low = solid.min[axis] - margin;
        const options = axis === 1 ? [[high, high - out[1]]] : [[high, high - out[axis]], [low, out[axis] - low]];
        for (const [value, cost] of options) if (cost < costBest) { costBest = cost; axisBest = axis; valueBest = value; }
      }
      if (out === point) out = [...point];
      out[axisBest] = valueBest;
      moved = true;
    }
    if (!moved) return out;
  }
  // Side exits kept bouncing between neighbouring solids: lift over the lot instead.
  const lifted = [...out];
  for (let lift = true; lift;) {
    lift = false;
    for (const solid of solids) if (insideSolid(lifted, solid, margin)) { lifted[1] = solid.max[1] + margin; lift = true; }
  }
  return lifted;
}
