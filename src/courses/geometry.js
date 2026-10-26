/**
 * Course geometry snapshot: validation, loading and freezing.
 * Pure: no DOM, no file access. The snapshot is plain JSON generated from the
 * legacy game data by scripts/export-courses.cjs, so consumers (CLI, solver,
 * future renderer) can read course geometry without executing legacy source.
 *
 * Field names deliberately stay in the legacy shape the simulation engine already
 * consumes (tiles, w, sand, ice, ...). Renaming them belongs to a later,
 * separately reviewed step.
 */

import { buildCourseCatalog } from './legacy.js';

export const COURSE_SNAPSHOT_VERSION = 1;

/** Geometry lists whose entries are [x, y, width, height] rectangles. */
const RECT_FIELDS = ['tiles', 'w', 'sand', 'ice', 'slime', 'pit'];

/** Geometry lists whose entries are fixed-length numeric tuples: field -> [minLength, maxLength]. */
const TUPLE_FIELDS = {
  q: [2, 2],
  pd: [2, 2],
  tp: [5, 5],
  pl: [5, 5],
  tornado: [4, 4],
  fan: [7, 7],
  movers: [8, 8],
};

/** Ramps are [x, y, width, height, direction, startHeight, endHeight, 'launch'?], as read by rampHeight(). */
function validateRamp(ramp, label, errors) {
  const [x, y, w, h, dir, z0, z1, kind] = Array.isArray(ramp) ? ramp : [];
  const ok =
    Array.isArray(ramp) && ramp.length >= 7 && ramp.length <= 8 &&
    [x, y, w, h, z0, z1].every(Number.isFinite) && w > 0 && h > 0 &&
    typeof dir === 'string' && /^[+-][xy]$/.test(dir) &&
    (kind === undefined || kind === 'launch');
  if (!ok) errors.push(`${label} must be [x, y, width, height, "+x"|"-x"|"+y"|"-y", startHeight, endHeight, "launch"?]`);
}

const isNumberList = value => Array.isArray(value) && value.every(Number.isFinite);

function insideAnyTile(tiles, [x, y]) {
  return tiles.some(([tx, ty, tw, th]) => x >= tx && x <= tx + tw && y >= ty && y <= ty + th);
}

/**
 * Checks one course's geometry. Returns every problem found, not just the first.
 *
 * @param {object} course legacy-shaped course record (name, tiles, w, putts, ...)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGeometry(course) {
  const errors = [];
  if (!course || typeof course !== 'object') {
    return { valid: false, errors: ['Course geometry must be an object'] };
  }

  for (const field of RECT_FIELDS) {
    const list = course[field];
    if (!Array.isArray(list)) {
      errors.push(`${field} must be an array`);
      continue;
    }
    list.forEach((rect, i) => {
      if (!isNumberList(rect) || rect.length !== 4) errors.push(`${field}[${i}] must be [x, y, width, height]`);
      else if (!(rect[2] > 0 && rect[3] > 0)) errors.push(`${field}[${i}] must have a positive width and height`);
    });
  }

  for (const [field, [min, max]] of Object.entries(TUPLE_FIELDS)) {
    const list = course[field];
    if (!Array.isArray(list)) {
      errors.push(`${field} must be an array`);
      continue;
    }
    list.forEach((tuple, i) => {
      if (!isNumberList(tuple) || tuple.length < min || tuple.length > max) {
        errors.push(`${field}[${i}] must be ${min === max ? min : `${min} or ${max}`} finite numbers`);
      }
    });
  }

  if (!Array.isArray(course.rp)) errors.push('rp must be an array');
  else course.rp.forEach((ramp, i) => validateRamp(ramp, `rp[${i}]`, errors));

  if (Array.isArray(course.tiles) && course.tiles.length === 0) errors.push('tiles must contain at least one tile');

  // Every tee and cup must sit on playable ground. Skipped when tiles are unusable (already reported).
  const tilesOk = Array.isArray(course.tiles) && course.tiles.length > 0 && course.tiles.every(t => isNumberList(t) && t.length === 4);
  if (tilesOk) {
    // Single-putt maps keep tee/hole on the course itself; multi-putt maps also list one per putt.
    const spots = [['', course], ...(course.putts ?? []).map((putt, i) => [`putts[${i}].`, putt])];
    for (const [prefix, spot] of spots) {
      for (const key of ['tee', 'hole']) {
        if (!isNumberList(spot[key]) || spot[key].length !== 2) errors.push(`${prefix}${key} must be [x, y]`);
        else if (!insideAnyTile(course.tiles, spot[key])) errors.push(`${prefix}${key} ${JSON.stringify(spot[key])} is outside every tile`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Recursively freezes arrays and plain objects so consumers cannot mutate shared geometry. */
function deepFreezeArrays(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreezeArrays);
    Object.freeze(value);
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreezeArrays);
  }
  return value;
}

/**
 * Validates a parsed snapshot and returns engine-ready courses.
 * Throws one Error listing every problem, so a bad file never half-loads.
 *
 * Arrays are frozen. The course objects themselves stay extensible because
 * SimulationEngine builds each putt with Object.create(course) and assigns
 * tee/hole/par on the child, which would throw on a frozen prototype.
 *
 * @param {object} snapshot parsed JSON from src/courses/data/courses.snapshot.json
 * @returns {{ courses: object[], catalog: object[], source: object }}
 */
export function loadCourseSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Course snapshot must be an object');
  if (snapshot.schemaVersion !== COURSE_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported course snapshot version ${snapshot.schemaVersion}; expected ${COURSE_SNAPSHOT_VERSION}`);
  }
  if (!Array.isArray(snapshot.courses) || !Array.isArray(snapshot.catalog)) {
    throw new Error('Course snapshot needs "courses" and "catalog" arrays');
  }
  if (snapshot.courses.length !== snapshot.catalog.length) {
    errors.push(`courses (${snapshot.courses.length}) and catalog (${snapshot.catalog.length}) differ in length`);
  }

  snapshot.courses.forEach((course, i) => {
    const label = `Course ${i} (${course?.name ?? 'unnamed'})`;
    validateGeometry(course).errors.forEach(message => errors.push(`${label}: ${message}`));
    if (snapshot.catalog[i] && course?.name !== snapshot.catalog[i].name) {
      errors.push(`${label}: name differs from catalog entry "${snapshot.catalog[i].name}"`);
    }
  });

  errors.push(...buildCourseCatalog(snapshot.catalog).errors);

  if (errors.length) throw new Error(`Invalid course snapshot:\n  ${errors.join('\n  ')}`);

  snapshot.courses.forEach(course => Object.values(course).forEach(deepFreezeArrays));
  snapshot.catalog.forEach(deepFreezeArrays);
  return { courses: snapshot.courses, catalog: snapshot.catalog, source: snapshot.source };
}

/** Parses snapshot JSON text and loads it. */
export function parseCourseSnapshot(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Course snapshot is not valid JSON: ${error.message}`);
  }
  return loadCourseSnapshot(parsed);
}
