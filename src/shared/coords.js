/**
 * Coordinate transformations between simulation space and Three.js render space.
 *
 * Simulation Space:
 * - X: horizontal axis across the green
 * - Y: depth/horizontal axis along the green
 * - Z: vertical height (elevation, ramps, vertical drops)
 *
 * Three.js World Space:
 * - X: horizontal axis (same as simulation X + course origin X)
 * - Y: vertical height (elevation + BALL_RADIUS, Three.js Y is UP)
 * - Z: horizontal depth (simulation Y + course origin Y)
 */

import { BALL_RADIUS } from './constants.js';

/**
 * Converts a simulation 3D vector to Three.js world space coordinates.
 * @param {number} simX Simulation X
 * @param {number} simY Simulation Y (ground plane depth)
 * @param {number} simZ Simulation Z (vertical height)
 * @param {[number, number]} [origin=[0, 0]] Course horizontal origin offset [originX, originY]
 * @param {number} [heightOffset=BALL_RADIUS] Vertical offset for ball center (defaults to BALL_RADIUS)
 * @returns {{ x: number, y: number, z: number }}
 */
export function simToWorld(simX, simY, simZ, origin = [0, 0], heightOffset = BALL_RADIUS) {
  return {
    x: simX + origin[0],
    y: simZ + heightOffset,
    z: simY + origin[1],
  };
}

/**
 * Converts Three.js world coordinates back to simulation space.
 * @param {number} worldX Three.js world X
 * @param {number} worldY Three.js world Y (vertical height)
 * @param {number} worldZ Three.js world Z (ground plane depth)
 * @param {[number, number]} [origin=[0, 0]] Course horizontal origin offset [originX, originY]
 * @param {number} [heightOffset=BALL_RADIUS] Vertical offset for ball center
 * @returns {{ x: number, y: number, z: number }}
 */
export function worldToSim(worldX, worldY, worldZ, origin = [0, 0], heightOffset = BALL_RADIUS) {
  return {
    x: worldX - origin[0],
    y: worldZ - origin[1],
    z: worldY - heightOffset,
  };
}

/**
 * Converts a simulation 2D position [x, y] to Three.js ground coordinates [worldX, worldZ].
 * @param {[number, number]} simPos [simX, simY]
 * @param {[number, number]} [origin=[0, 0]]
 * @returns {[number, number]} [worldX, worldZ]
 */
export function simToWorldGround([simX, simY], origin = [0, 0]) {
  return [simX + origin[0], simY + origin[1]];
}
