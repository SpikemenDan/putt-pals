/**
 * Curved ramps and multi-tier drops schema, validation and utilities (roadmap K1b, #98).
 *
 * Supports curved ramps with analytical height and banking profiles,
 * and multi-tier drops with declared drop edges and landing floors.
 */

import { SURFACE_TYPES } from './structures.js';
import {
  arcFraction,
  pointInCurvedRamp,
  curvedRampHeight,
  curvedRampBoundingRect,
} from '../simulation/physics.js';

export {
  arcFraction,
  pointInCurvedRamp,
  curvedRampHeight,
  curvedRampBoundingRect,
};

const object = v => v && typeof v === 'object' && !Array.isArray(v);
const finite = Number.isFinite;
const coordinate = n => finite(n) && Math.abs(n) <= 1000000;
const point2 = v => Array.isArray(v) && v.length === 2 && Array.from(v).every(coordinate);

export const CURVE_PROFILES = Object.freeze(['smooth', 'launch', 'linear']);

/**
 * Validates a single curved ramp record.
 *
 * @param {object} r
 * @returns {boolean}
 */
export function validCurvedRamp(r) {
  if (!object(r) || typeof r.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(r.id)) {
    return false;
  }
  if (!point2(r.center)) return false;
  if (!finite(r.innerRadius) || !finite(r.outerRadius) || r.innerRadius <= 0 || r.outerRadius <= r.innerRadius) {
    return false;
  }
  if (!finite(r.startAngleDeg) || !finite(r.endAngleDeg)) return false;
  const sweep = Math.abs(r.endAngleDeg - r.startAngleDeg);
  if (sweep <= 0 || sweep > 360) return false;
  if (!finite(r.zStart) || !finite(r.zEnd)) return false;

  if (r.curve !== undefined && !CURVE_PROFILES.includes(r.curve)) return false;
  if (r.bankAngleDeg !== undefined && (!finite(r.bankAngleDeg) || Math.abs(r.bankAngleDeg) > 85)) return false;
  if (r.surface !== undefined && !SURFACE_TYPES.includes(r.surface)) return false;
  if (r.thickness !== undefined && (!finite(r.thickness) || r.thickness <= 0 || r.thickness > 1000)) return false;

  return true;
}

/**
 * Validates an array of curved ramp records.
 *
 * @param {Array<object>} list
 * @returns {string[]} Error messages, empty if valid
 */
export function validateCurvedRamps(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 256) return ['curvedRamps must be an array of at most 256 records'];
  const errors = Array.from(list).flatMap((r, i) => validCurvedRamp(r) ? [] : [`curvedRamps[${i}] is invalid`]);
  if (new Set(list.map(r => r?.id)).size !== list.length) errors.push('curvedRamps ids must be unique');
  return errors;
}

/**
 * Validates a single multi-tier drop record.
 *
 * @param {object} drop
 * @returns {boolean}
 */
export function validTierDrop(drop) {
  if (!object(drop) || typeof drop.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(drop.id)) {
    return false;
  }
  if (!Array.isArray(drop.dropEdge) || drop.dropEdge.length !== 4 || !drop.dropEdge.every(coordinate)) {
    return false;
  }
  if (!Array.isArray(drop.landingFloor) || drop.landingFloor.length !== 5) {
    return false;
  }
  const [fx, fy, fw, fh, fz] = drop.landingFloor;
  if (!coordinate(fx) || !coordinate(fy) || !coordinate(fw) || !coordinate(fh) || !coordinate(fz) || fw <= 0 || fh <= 0) {
    return false;
  }
  if (!finite(drop.zFrom) || !finite(drop.zTo) || drop.zTo >= drop.zFrom) {
    return false;
  }
  if (drop.restitution !== undefined && (!finite(drop.restitution) || drop.restitution < 0 || drop.restitution > 1)) {
    return false;
  }
  return true;
}

/**
 * Validates an array of multi-tier drop records.
 *
 * @param {Array<object>} list
 * @returns {string[]} Error messages, empty if valid
 */
export function validateTierDrops(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 256) return ['drops must be an array of at most 256 records'];
  const errors = Array.from(list).flatMap((d, i) => validTierDrop(d) ? [] : [`drops[${i}] is invalid`]);
  if (new Set(list.map(d => d?.id)).size !== list.length) errors.push('drops ids must be unique');
  return errors;
}

/**
 * Checks whether point (x, y) is within the landing floor zone of a drop.
 *
 * @param {object} drop
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function pointInDropLanding(drop, x, y) {
  const [fx, fy, fw, fh] = drop.landingFloor;
  return x >= fx && x <= fx + fw && y >= fy && y <= fy + fh;
}
