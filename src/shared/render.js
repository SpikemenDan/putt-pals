/**
 * Render snapshot contracts and camera definitions.
 * Provides the interface between the simulation/session layer and Three.js 3D rendering.
 */

export const CameraModes = Object.freeze({
  BALL: 'ball', // Follows the player's ball
  HOLE: 'hole', // Looks from tee towards the hole / flag
  WORLD: 'world', // Overview of the entire course / map
  FREE_ROAM: 'free_roam', // Spectator free-flying camera
});

/**
 * Creates an immutable render snapshot for a frame.
 *
 * @param {object} params
 * @param {number} params.timestamp
 * @param {object} params.localPlayer
 * @param {object[]} params.remotePlayers
 * @param {object} params.course
 * @param {number} params.puttIndex
 * @param {string} params.cameraMode
 * @param {object} [params.effects]
 * @returns {object} RenderSnapshot
 */
export function createRenderSnapshot({
  timestamp,
  localPlayer,
  remotePlayers = [],
  course,
  puttIndex = 0,
  cameraMode = CameraModes.BALL,
  effects = [],
}) {
  return {
    timestamp,
    cameraMode,
    puttIndex,
    courseId: course?.id ?? null,
    localPlayer: localPlayer ? { ...localPlayer } : null,
    remotePlayers: remotePlayers.map(p => ({ ...p })),
    effects: [...effects],
  };
}

/**
 * Wall fading raycast sightline test contract.
 * Checks whether an obstruction intersects the sightline between camera and ball.
 *
 * @param {[number, number, number]} cameraPos [x, y, z] in Three.js world coordinates
 * @param {[number, number, number]} ballPos [x, y, z] in Three.js world coordinates
 * @param {Array<{ min: [number, number, number], max: [number, number, number] }>} boundingBoxes
 * @returns {boolean[]} Array indicating whether each bounding box obstructs the sightline
 */
export function checkSightlineObstructions(cameraPos, ballPos, boundingBoxes) {
  // Ray segment from camera to ball
  const [cx, cy, cz] = cameraPos;
  const [bx, by, bz] = ballPos;

  const dx = bx - cx;
  const dy = by - cy;
  const dz = bz - cz;
  const dist = Math.hypot(dx, dy, dz);

  if (dist < 1e-6) return boundingBoxes.map(() => false);

  const dir = [dx / dist, dy / dist, dz / dist];

  return boundingBoxes.map(box => {
    // Simple AABB ray intersection test
    let tmin = (box.min[0] - cx) / (dir[0] || 1e-12);
    let tmax = (box.max[0] - cx) / (dir[0] || 1e-12);
    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

    let tymin = (box.min[1] - cy) / (dir[1] || 1e-12);
    let tymax = (box.max[1] - cy) / (dir[1] || 1e-12);
    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

    if (tmin > tymax || tymin > tmax) return false;
    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    let tzmin = (box.min[2] - cz) / (dir[2] || 1e-12);
    let tzmax = (box.max[2] - cz) / (dir[2] || 1e-12);
    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

    if (tmin > tzmax || tzmin > tmax) return false;
    if (tzmin > tmin) tmin = tzmin;
    if (tzmax < tmax) tmax = tzmax;

    // Must intersect within the segment between camera and ball (0 < t < dist)
    return tmax > 0 && tmin < dist;
  });
}
