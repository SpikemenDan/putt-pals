/**
 * Normalized course schemas and validation.
 * Supports both legacy tuple adapters and modern structured definitions.
 */

import {
  DEFAULT_CUP_RADIUS,
  MIN_CUP_RADIUS,
  MIN_TIMEOUT_SECONDS,
  MAX_TIMEOUT_SECONDS,
  STARTER_COURSE_INDICES,
} from './constants.js';

/**
 * Validates a single putt definition.
 *
 * @param {object} putt
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePutt(putt) {
  const errors = [];
  if (!putt || typeof putt !== 'object') {
    return { valid: false, errors: ['Putt definition must be an object'] };
  }

  if (!Array.isArray(putt.tee) || putt.tee.length !== 2 || !putt.tee.every(Number.isFinite)) {
    errors.push('Tee must be a [number, number] tuple');
  }

  if (!Array.isArray(putt.hole) || putt.hole.length !== 2 || !putt.hole.every(Number.isFinite)) {
    errors.push('Hole must be a [number, number] tuple');
  }

  if (!Number.isInteger(putt.par) || putt.par < 1 || putt.par > 10) {
    errors.push(`Par must be an integer between 1 and 10 (got ${putt.par})`);
  }

  if (!Number.isInteger(putt.penalty) || putt.penalty < 0 || putt.penalty > 10) {
    errors.push(`Penalty must be an integer between 0 and 10 (got ${putt.penalty})`);
  }

  if (putt.limitSeconds != null) {
    if (!Number.isFinite(putt.limitSeconds) || putt.limitSeconds < MIN_TIMEOUT_SECONDS || putt.limitSeconds > MAX_TIMEOUT_SECONDS) {
      errors.push(`limitSeconds must be between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS} (got ${putt.limitSeconds})`);
    }
  }

  if (putt.cupRadius != null) {
    if (!Number.isFinite(putt.cupRadius) || putt.cupRadius < MIN_CUP_RADIUS || putt.cupRadius > DEFAULT_CUP_RADIUS) {
      errors.push(`cupRadius must be between ${MIN_CUP_RADIUS} and ${DEFAULT_CUP_RADIUS} (got ${putt.cupRadius})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an entire course schema.
 *
 * @param {object} course
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCourse(course) {
  const errors = [];
  if (!course || typeof course !== 'object') {
    return { valid: false, errors: ['Course definition must be an object'] };
  }

  if (!course.id || typeof course.id !== 'string') {
    errors.push('Course must have a non-empty string id');
  }

  if (!course.name || typeof course.name !== 'string') {
    errors.push('Course must have a non-empty string name');
  }

  if (!Number.isInteger(course.index) || course.index < 0) {
    errors.push(`Course index must be a non-negative integer (got ${course.index})`);
  }

  if (!Array.isArray(course.putts) || course.putts.length === 0) {
    errors.push('Course must have a non-empty putts array');
  } else {
    course.putts.forEach((putt, idx) => {
      const res = validatePutt(putt);
      if (!res.valid) {
        errors.push(`Putt ${idx}: ${res.errors.join(', ')}`);
      }
    });
  }

  if (course.starter) {
    if (!STARTER_COURSE_INDICES.includes(course.index)) {
      errors.push(`Course index ${course.index} marked as starter but not in STARTER_COURSE_INDICES`);
    }
    if (course.putts?.length !== 6) {
      errors.push(`Starter courses must have exactly 6 putts (got ${course.putts?.length})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes a course limit value according to game rules.
 * Enforces: minimum 120s, maximum 600s, rejects non-numeric/sub-120 values.
 *
 * @param {number|undefined} limit
 * @param {number} fallback
 * @returns {number}
 */
export function normalizeLimit(limit, fallback = 120) {
  if (limit == null || !Number.isFinite(limit)) return fallback;
  if (limit < MIN_TIMEOUT_SECONDS) return fallback;
  if (limit > MAX_TIMEOUT_SECONDS) return fallback;
  return Math.round(limit);
}
