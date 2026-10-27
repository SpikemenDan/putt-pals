/**
 * Explicit simulation-to-render coordinate transform.
 *
 * Simulation space keeps x/y as the ground plane and z as elevation (see
 * src/shared/coords.js). Three.js uses y as "up", so every renderer position
 * goes through this module instead of swapping axes inline.
 *
 * Two height conventions exist in the legacy renderer and both are preserved:
 * - surfaces and props sit at their elevation (height offset 0);
 * - ball centres sit one BALL_RADIUS above the simulated contact height.
 */

import { BALL_RADIUS } from '../shared/constants.js';
import { simToWorld, worldToSim } from '../shared/coords.js';

/**
 * @param {[number, number]} [origin=[0, 0]] Course offset in simulation x/y.
 *   The legacy game always builds a single map at [0, 0].
 */
export function createWorldTransform(origin = [0, 0]) {
  const o = [Number(origin[0]) || 0, Number(origin[1]) || 0];
  return Object.freeze({
    origin: Object.freeze([...o]),
    /** Ground/prop position in course-local space (origin applied by the course group). */
    local(simX, simY, height = 0) {
      const p = simToWorld(simX, simY, height, [0, 0], 0);
      return [p.x, p.y, p.z];
    },
    /** Ground/prop position in world space. */
    ground(simX, simY, height = 0) {
      const p = simToWorld(simX, simY, height, o, 0);
      return [p.x, p.y, p.z];
    },
    /** Ball centre in world space for a simulated ball at (x, y, z). */
    ball(simX, simY, simZ) {
      const p = simToWorld(simX, simY, simZ, o, BALL_RADIUS);
      return [p.x, p.y, p.z];
    },
    /** Inverse of ground(): world [x, y, z] back to simulation {x, y, z}. */
    toSim(worldX, worldY, worldZ, heightOffset = 0) {
      return worldToSim(worldX, worldY, worldZ, o, heightOffset);
    },
  });
}

/**
 * Resolves the geometry for one putt exactly like the legacy H(i):
 * putt fields override map fields through prototype inheritance, so shared
 * geometry arrays are read from the map definition without copying.
 *
 * @param {object} course Legacy-shaped course definition (src/courses definitions)
 * @param {number} [puttIndex=0]
 */
export function resolveRenderCourse(course, puttIndex = 0) {
  if (!course || typeof course !== 'object') throw new TypeError('A course definition is required');
  const putt = course.putts && course.putts[puttIndex];
  if (!putt) return course;
  return Object.assign(Object.create(course), putt);
}
