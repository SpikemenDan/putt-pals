/**
 * Volumetric 3D course structures schema and validation (task K0).
 *
 * Defines multiple walkable surfaces at different elevations over the same
 * (x, y) footprint, vertical walls with explicit base/height, ceilings that
 * block lofted balls, and 3D ramps.
 */

const object = v => v && typeof v === 'object' && !Array.isArray(v);
const finite = Number.isFinite;
const coordinate = n => finite(n) && Math.abs(n) <= 1000000;
const rect = v => Array.isArray(v) && v.length === 4 && Array.from(v).every(coordinate) && v[2] > 0 && v[3] > 0;

export const STRUCTURE_KINDS = Object.freeze(['surface', 'wall', 'ceiling', 'ramp']);
export const SURFACE_TYPES = Object.freeze(['turf', 'ice', 'sand', 'slime']);
export const RAMP_DIRECTIONS = Object.freeze(['+x', '-x', '+y', '-y']);

export function validCourseStructure(s) {
  if (!object(s) || !STRUCTURE_KINDS.includes(s.kind) || typeof s.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(s.id)) {
    return false;
  }
  if (!rect(s.rect)) return false;

  if (s.kind === 'surface') {
    if (!finite(s.z)) return false;
    if (s.thickness !== undefined && (!finite(s.thickness) || s.thickness <= 0 || s.thickness > 1000)) return false;
    if (s.surface !== undefined && !SURFACE_TYPES.includes(s.surface)) return false;
    if (s.ceiling !== undefined && typeof s.ceiling !== 'boolean') return false;
    return true;
  }

  if (s.kind === 'wall') {
    if (!finite(s.base) || !finite(s.height) || s.height <= 0 || s.height > 1000) return false;
    return true;
  }

  if (s.kind === 'ceiling') {
    if (!finite(s.z)) return false;
    if (s.thickness !== undefined && (!finite(s.thickness) || s.thickness <= 0 || s.thickness > 1000)) return false;
    if (s.restitution !== undefined && (!finite(s.restitution) || s.restitution < 0 || s.restitution > 1)) return false;
    return true;
  }

  if (s.kind === 'ramp') {
    if (!RAMP_DIRECTIONS.includes(s.direction)) return false;
    if (!finite(s.zStart) || !finite(s.zEnd)) return false;
    if (s.thickness !== undefined && (!finite(s.thickness) || s.thickness <= 0 || s.thickness > 1000)) return false;
    return true;
  }

  return false;
}

export function validateCourseStructures(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 256) return ['structures must be an array of at most 256 records'];
  const errors = Array.from(list).flatMap((s, i) => validCourseStructure(s) ? [] : [`structures[${i}] is invalid`]);
  if (new Set(list.map(s => s?.id)).size !== list.length) errors.push('structures ids must be unique');
  return errors;
}
