import { validateCourseGeometry } from './catalog.js';
import { buildCourseCatalog } from './legacy.js';
import { checkGeometryIntegrity, formatIntegrityViolation } from './integrity.js';
import { MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, DEFAULT_PENALTY, MIN_CUP_RADIUS, DEFAULT_CUP_RADIUS } from '../shared/constants.js';

const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const contains = (rect, p) => Array.isArray(rect) && rect.length >= 4 && rect.every(Number.isFinite)
  && p[0] >= rect[0] && p[0] <= rect[0] + rect[2] && p[1] >= rect[1] && p[1] <= rect[1] + rect[3];
const validLimit = limit => Number.isFinite(limit) && limit >= MIN_TIMEOUT_SECONDS && limit <= MAX_TIMEOUT_SECONDS;

/** Pure positional checks shared by legacy migration and normalized documents. */
export function validatePuttPositions(geometry, putt) {
  const errors = [];
  for (const field of ['tee', 'hole']) {
    const p = putt?.[field];
    if (!point(p)) { errors.push(`invalid ${field}`); continue; }
    if (!Array.isArray(geometry?.tiles) || !geometry.tiles.some(rect => contains(rect, p))
      || (Array.isArray(geometry.pit) && geometry.pit.some(rect => contains(rect, p)))) errors.push(`${field} is outside playable ground`);
  }
  return errors;
}

/** Check both representations at the migration boundary, without evaluating legacy source. */
export function validateCourseDefinitions(definitions, rules) {
  const errors = [];
  if (!Array.isArray(definitions) || !Array.isArray(rules)) return { valid: false, errors: ['Definitions and rules must be arrays'] };
  for (let index = 0; index < Math.max(definitions.length, rules.length); index++) {
    if (!definitions[index] || !rules[index]) errors.push(`Missing course definition or rules at index ${index}`);
  }
  let catalog;
  try { catalog = buildCourseCatalog(rules); }
  catch { return { valid: false, errors: ['Malformed course rules'] }; }
  errors.push(...catalog.errors);
  if (definitions.length !== rules.length) errors.push('Geometry/rule course counts differ');
  definitions.forEach((course, index) => {
    const label = `Course ${index}`;
    errors.push(...validateCourseGeometry(course).errors.map(error => `${label}: ${error}`));
    const rule = rules[index];
    if (!course || !rule || !Array.isArray(rule.putts)) return;
    if (course.name !== rule.name) errors.push(`${label}: geometry/rule names differ`);
    const putts = course.putts == null ? [course] : course.putts;
    if (!Array.isArray(putts) || !putts.length) { errors.push(`${label}: invalid putts`); return; }
    if (putts.length !== rule.putts.length) errors.push(`${label}: geometry/rule putt counts differ`);
    const integrityPutts = [];
    putts.forEach((putt, pi) => {
      if (!putt || typeof putt !== 'object') { errors.push(`${label} putt ${pi}: invalid definition`); return; }
      const active = { ...course, ...putt, tee: putt.tee, hole: putt.hole };
      errors.push(...validatePuttPositions(course, active).map(error => `${label} putt ${pi}: ${error}`));
      const par = putt.par || course.par || 4;
      const penalty = course.putts && Number.isInteger(putt.pen) && putt.pen > 0 ? putt.pen : DEFAULT_PENALTY;
      const limitSeconds = validLimit(putt.limit) ? putt.limit : validLimit(course.limit) ? course.limit : Math.min(300, MIN_TIMEOUT_SECONDS * Math.max(1, par / 2));
      const cupRadius = Number.isFinite(active.cup) ? Math.max(MIN_CUP_RADIUS, Math.min(DEFAULT_CUP_RADIUS, active.cup)) : DEFAULT_CUP_RADIUS;
      const resolved = { tee: active.tee, hole: active.hole, par, penalty, limitSeconds, cupRadius };
      integrityPutts[pi] = { tee: active.tee, hole: active.hole, cupRadius };
      for (const [field, value] of Object.entries(resolved)) {
        if (JSON.stringify(value) !== JSON.stringify(rule.putts[pi]?.[field])) errors.push(`${label} putt ${pi}: ${field} differs between geometry and rules`);
      }
    });
    // CL1: interpenetration and clearance rules (shape errors above are reported first).
    if (!validateCourseGeometry(course).errors.length) {
      const integrity = checkGeometryIntegrity({ name: course.name, index, geometry: course, putts: integrityPutts });
      errors.push(...integrity.violations.map(v => `${label}: ${formatIntegrityViolation(v)}`));
    }
    if (rule.starter && course.par !== rule.putts.reduce((sum, p) => sum + p.par, 0)) errors.push(`${label}: map par differs from putt total`);
  });
  return { valid: errors.length === 0, errors };
}
