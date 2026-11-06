/**
 * Multi-cup course schema and 10-cup rack layout generator (Task GM2a, issue #185).
 *
 * Supports:
 * - Multi-cup course definitions (`course.cups`)
 * - Per-cup identification, position (x, y, z), radius, active state, and team assignment
 * - 10-cup triangular rack generation (4-3-2-1 formation)
 * - Active cup resolution for simulation and elimination physics
 */

import { DEFAULT_CUP_RADIUS, MIN_CUP_RADIUS } from '../shared/constants.js';

/**
 * Validates a single cup specification.
 *
 * @param {any} cup
 * @returns {boolean}
 */
export function validCourseCup(cup) {
  if (!cup || typeof cup !== 'object') return false;
  if (typeof cup.id !== 'string' || cup.id.trim().length === 0) return false;
  if (!Number.isFinite(cup.x) || !Number.isFinite(cup.y)) return false;
  if (cup.z !== undefined && !Number.isFinite(cup.z)) return false;
  if (cup.radius !== undefined && (!Number.isFinite(cup.radius) || cup.radius <= 0)) return false;
  if (cup.active !== undefined && typeof cup.active !== 'boolean') return false;
  if (cup.team !== undefined && typeof cup.team !== 'string' && typeof cup.team !== 'number') return false;
  if (cup.rackIndex !== undefined && (!Number.isInteger(cup.rackIndex) || cup.rackIndex < 0 || cup.rackIndex > 9)) return false;
  return true;
}

/**
 * Validates a course's `cups` array.
 *
 * @param {any} cups
 * @returns {string[]} Validation errors (empty if valid)
 */
export function validateCourseCups(cups) {
  if (cups === undefined || cups === null) return [];
  if (!Array.isArray(cups)) return ['course.cups must be an array of cup objects'];

  const errors = [];
  const ids = new Set();

  for (let i = 0; i < cups.length; i++) {
    const c = cups[i];
    if (!validCourseCup(c)) {
      errors.push(`course.cups[${i}] is malformed or invalid`);
      continue;
    }
    if (ids.has(c.id)) {
      errors.push(`course.cups[${i}] has duplicate id '${c.id}'`);
    } else {
      ids.add(c.id);
    }
  }

  // Check overlapping cups (centers closer than 2 units)
  for (let i = 0; i < cups.length; i++) {
    for (let j = i + 1; j < cups.length; j++) {
      const c1 = cups[i];
      const c2 = cups[j];
      if (validCourseCup(c1) && validCourseCup(c2)) {
        const d = Math.hypot(c1.x - c2.x, c1.y - c2.y);
        if (d < 2) {
          errors.push(`course.cups[${i}] ('${c1.id}') and cups[${j}] ('${c2.id}') overlap at exact same location`);
        }
      }
    }
  }

  return errors;
}

/**
 * Returns active cups from a course, or an empty array if course has no cups.
 *
 * @param {object} course
 * @returns {Array<object>}
 */
export function resolveActiveCups(course) {
  if (!course?.cups || !Array.isArray(course.cups)) return [];
  return course.cups.filter(c => c.active !== false);
}

/**
 * Generates a 10-cup triangular rack layout (4-3-2-1 formation).
 *
 * @param {object} options
 * @param {string} [options.idPrefix='cup'] Prefix for cup IDs
 * @param {[number, number]} [options.apex=[0, 0]] Position of the front apex cup (Row 1)
 * @param {[number, number]} [options.direction=[1, 0]] Direction vector pointing from apex towards back row (Row 4)
 * @param {number} [options.spacing=34] Center-to-center distance between neighbouring cups
 * @param {number} [options.z=0] Surface elevation of the cups
 * @param {string|number} [options.team=undefined] Optional team identifier
 * @param {number} [options.radius=DEFAULT_CUP_RADIUS] Cup radius
 * @returns {Array<object>} Array of 10 cup objects
 */
export function create10CupRack({
  idPrefix = 'cup',
  apex = [0, 0],
  direction = [1, 0],
  spacing = 34,
  z = 0,
  team = undefined,
  radius = DEFAULT_CUP_RADIUS,
} = {}) {
  const norm = Math.hypot(direction[0], direction[1]) || 1;
  const dx = direction[0] / norm;
  const dy = direction[1] / norm;
  // Perpendicular vector to the right of direction
  const px = -dy;
  const py = dx;

  // Equilateral triangle row height
  const rowHeight = spacing * (Math.sqrt(3) / 2);

  // Row offsets from apex:
  // Row 0: 1 cup (apex)
  // Row 1: 2 cups
  // Row 2: 3 cups
  // Row 3: 4 cups
  const rackLayout = [
    // Row 0 (apex)
    [{ r: 0, c: 0 }],
    // Row 1 (2 cups)
    [{ r: 1, c: -0.5 }, { r: 1, c: 0.5 }],
    // Row 2 (3 cups)
    [{ r: 2, c: -1.0 }, { r: 2, c: 0.0 }, { r: 2, c: 1.0 }],
    // Row 3 (4 cups)
    [{ r: 3, c: -1.5 }, { r: 3, c: -0.5 }, { r: 3, c: 0.5 }, { r: 3, c: 1.5 }],
  ];

  const cups = [];
  let index = 0;

  for (const row of rackLayout) {
    for (const pos of row) {
      const cx = apex[0] + dx * (pos.r * rowHeight) + px * (pos.c * spacing);
      const cy = apex[1] + dy * (pos.r * rowHeight) + py * (pos.c * spacing);
      cups.push({
        id: `${idPrefix}-${index}`,
        rackIndex: index,
        x: +cx.toFixed(3),
        y: +cy.toFixed(3),
        z,
        radius,
        active: true,
        ...(team !== undefined ? { team } : {}),
      });
      index++;
    }
  }

  return cups;
}
