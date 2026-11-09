/**
 * Transport tubes schema, validation and utilities (roadmap K1c, #99).
 *
 * Supports enclosed tubes that carry and fling the ball between islands
 * or course areas with deterministic 3D path traversal and exit launch velocity.
 */

import { pathLength, samplePath } from '../simulation/physics.js';

export { pathLength, samplePath };

const object = v => v && typeof v === 'object' && !Array.isArray(v);
const finite = Number.isFinite;
const coordinate = n => finite(n) && Math.abs(n) <= 1000000;
const point3 = v => Array.isArray(v) && v.length === 3 && Array.from(v).every(coordinate);

/**
 * Validates a single course tube record.
 *
 * @param {object} tube
 * @returns {boolean}
 */
export function validCourseTube(tube) {
  if (!object(tube) || typeof tube.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(tube.id)) {
    return false;
  }
  if (!point3(tube.entry)) return false;
  if (!point3(tube.exit)) return false;
  if (!point3(tube.exitVelocity)) return false;

  if (!Array.isArray(tube.path) || tube.path.length < 2) return false;
  for (const pt of tube.path) {
    if (!point3(pt)) return false;
  }

  // Path endpoints should closely match entry and exit positions
  const startPt = tube.path[0];
  const endPt = tube.path[tube.path.length - 1];
  if (Math.hypot(startPt[0] - tube.entry[0], startPt[1] - tube.entry[1], startPt[2] - tube.entry[2]) > 5) {
    return false;
  }
  if (Math.hypot(endPt[0] - tube.exit[0], endPt[1] - tube.exit[1], endPt[2] - tube.exit[2]) > 5) {
    return false;
  }

  if (tube.radius !== undefined && (!finite(tube.radius) || tube.radius <= 0 || tube.radius > 200)) {
    return false;
  }
  if (tube.entryRadius !== undefined && (!finite(tube.entryRadius) || tube.entryRadius <= 0 || tube.entryRadius > 200)) {
    return false;
  }
  if (tube.speed !== undefined && (!finite(tube.speed) || tube.speed <= 0 || tube.speed > 5000)) {
    return false;
  }
  if (tube.oneWay !== undefined && typeof tube.oneWay !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Validates an array of course tube records.
 *
 * @param {Array<object>} list
 * @returns {string[]} Error messages, empty if valid
 */
export function validateCourseTubes(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 64) return ['tubes must be an array of at most 64 records'];
  const errors = Array.from(list).flatMap((t, i) => validCourseTube(t) ? [] : [`tubes[${i}] is invalid`]);
  if (new Set(list.map(t => t?.id)).size !== list.length) errors.push('tubes ids must be unique');
  return errors;
}
