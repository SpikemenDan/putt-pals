/**
 * Course wind zone schema and validation (Task W3, issue #106).
 *
 * Wind zones are 3D volumes that exert directional aerodynamic acceleration on the ball.
 * Features:
 * - Steady directional wind ([fx, fy, fz])
 * - Updrafts (positive fz)
 * - Gusting periodic wind synchronized with room hazard time
 * - Differential acceleration: stronger when airborne, reduced when on ground
 */

/**
 * Validates a single wind zone object.
 *
 * @param {any} wz
 * @returns {boolean}
 */
export function validCourseWindZone(wz) {
  if (!wz || typeof wz !== 'object') return false;
  if (typeof wz.id !== 'string' || wz.id.trim().length === 0) return false;

  if (!Array.isArray(wz.bounds) || wz.bounds.length !== 4) return false;
  const [x, y, w, h] = wz.bounds;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return false;
  if (w <= 0 || h <= 0) return false;

  if (!Array.isArray(wz.force) || (wz.force.length !== 2 && wz.force.length !== 3)) return false;
  for (const f of wz.force) {
    if (!Number.isFinite(f)) return false;
  }

  if (wz.minZ !== undefined && !Number.isFinite(wz.minZ)) return false;
  if (wz.maxZ !== undefined && !Number.isFinite(wz.maxZ)) return false;
  if (wz.minZ !== undefined && wz.maxZ !== undefined && wz.minZ >= wz.maxZ) return false;

  if (wz.gust !== undefined) {
    if (!wz.gust || typeof wz.gust !== 'object') return false;
    if (!Number.isFinite(wz.gust.period) || wz.gust.period <= 0) return false;
    if (!Number.isFinite(wz.gust.amplitude) || wz.gust.amplitude < 0) return false;
    if (wz.gust.phase !== undefined && !Number.isFinite(wz.gust.phase)) return false;
  }

  if (wz.groundMultiplier !== undefined && (!Number.isFinite(wz.groundMultiplier) || wz.groundMultiplier < 0)) return false;
  if (wz.airMultiplier !== undefined && (!Number.isFinite(wz.airMultiplier) || wz.airMultiplier < 0)) return false;

  return true;
}

/**
 * Validates a course's `wind` array.
 *
 * @param {any} wind
 * @returns {string[]} Error messages (empty if valid)
 */
export function validateCourseWind(wind) {
  if (wind === undefined || wind === null) return [];
  if (!Array.isArray(wind)) return ['course.wind must be an array of wind zone objects'];

  const errors = [];
  const ids = new Set();

  for (let i = 0; i < wind.length; i++) {
    const wz = wind[i];
    if (!validCourseWindZone(wz)) {
      errors.push(`course.wind[${i}] is malformed or invalid`);
      continue;
    }
    if (ids.has(wz.id)) {
      errors.push(`course.wind[${i}] has duplicate id '${wz.id}'`);
    } else {
      ids.add(wz.id);
    }
  }

  return errors;
}
