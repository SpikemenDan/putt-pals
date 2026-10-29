import { createCourseData, validateCourseGeometry } from './catalog.js';
import { validatePuttPositions } from './validation.js';
import { checkGeometryIntegrity, formatIntegrityViolation } from './integrity.js';
import { validateCourse } from '../shared/courses.js';
import { STARTER_COURSE_INDICES } from '../shared/constants.js';

export const COURSE_SCHEMA_VERSION = 1;
const geometryKeys = ['tiles', 'w', 'sand', 'ice', 'slime', 'pit', 'q', 'pl', 'rp', 'pd', 'tp', 'fan', 'tornado', 'movers'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** Versioned plain data for course files and future browser consumers. */
export function createCourseDocument() {
  const data = createCourseData();
  const document = { schemaVersion: COURSE_SCHEMA_VERSION, courses: data.catalog.map((course, index) => ({
    ...course,
    description: data.definitions[index].desc ?? '',
    geometry: Object.fromEntries(geometryKeys.map(key => [key, structuredClone(data.definitions[index][key])])),
    putts: course.putts.map((putt, pi) => ({ ...putt, id: `${course.id}-putt-${pi + 1}`, index: pi })),
  })) };
  const checked = validateCourseDocument(document);
  if (!checked.valid) throw new Error(`Invalid course export:\n${checked.errors.join('\n')}`);
  return document;
}

/** Validate untrusted documents before adapters consume them. IDs persist in saved data. */
export function validateCourseDocument(document) {
  if (!record(document)) return { valid: false, errors: ['Course document must be an object'] };
  const errors = [];
  if (document.schemaVersion !== COURSE_SCHEMA_VERSION) errors.push('Unsupported course schema version');
  if (!Array.isArray(document.courses) || !document.courses.length) return { valid: false, errors: [...errors, 'Courses must be a nonempty array'] };
  for (const index of STARTER_COURSE_INDICES) {
    if (document.courses[index]?.starter !== true) errors.push(`Missing starter course at index ${index}`);
  }
  const ids = new Set();
  Array.from(document.courses).forEach((course, index) => {
    if (!record(course)) { errors.push(`Course ${index} must be an object`); return; }
    if (course.index !== index) errors.push(`Course ${index}: index does not match position`);
    if (!validId(course.id) || ids.has(course.id)) errors.push(`Course ${index}: invalid or duplicate id`);
    ids.add(course.id);
    if (typeof course.starter !== 'boolean') errors.push(`Course ${index}: starter must be boolean`);
    if (typeof course.description !== 'string') errors.push(`Course ${index}: description must be text`);
    try { errors.push(...validateCourse(course).errors.map(error => `Course ${index}: ${error}`)); }
    catch { errors.push(`Course ${index}: malformed rule values`); }
    const shape = validateCourseGeometry(course.geometry).errors;
    errors.push(...shape.map(error => `Course ${index}: ${error}`));
    if (!shape.length && Array.isArray(course.putts)) {
      const putts = Array.from(course.putts).filter(record).map(p => ({ tee: p.tee, hole: p.hole, cupRadius: p.cupRadius }));
      const integrity = checkGeometryIntegrity({ id: validId(course.id) ? course.id : undefined, name: course.name, index, geometry: course.geometry, putts });
      errors.push(...integrity.violations.map(v => `Course ${index}: ${formatIntegrityViolation(v)}`));
    }
    if (Array.isArray(course.putts)) Array.from(course.putts).forEach((putt, pi) => {
      if (!record(putt)) { errors.push(`Course ${index} putt ${pi} must be an object`); return; }
      errors.push(...validatePuttPositions(course.geometry, putt).map(error => `Course ${index} putt ${pi}: ${error}`));
      if (!validId(putt.id) || ids.has(putt.id)) errors.push(`Course ${index} putt ${pi}: invalid or duplicate id`);
      ids.add(putt.id);
      if (putt.index !== pi) errors.push(`Course ${index} putt ${pi}: index does not match position`);
      if (!Number.isFinite(putt.limitSeconds) || !Number.isFinite(putt.cupRadius)) errors.push(`Course ${index} putt ${pi}: explicit timer and cup radius required`);
    });
  });
  return { valid: errors.length === 0, errors };
}

/** Parse JSON at a file/network boundary; malformed or future versions fail explicitly. */
export function parseCourseDocument(json) {
  const document = JSON.parse(json);
  const checked = validateCourseDocument(document);
  if (!checked.valid) throw new Error(`Invalid course document:\n${checked.errors.join('\n')}`);
  return document;
}

/** Fresh simulation-owned geometry, with normalized rule names understood by the engine. */
export function toSimulationCourses(document) {
  const checked = validateCourseDocument(document);
  if (!checked.valid) throw new Error(`Invalid course document:\n${checked.errors.join('\n')}`);
  return document.courses.map(course => ({ ...structuredClone(course.geometry), id: course.id,
    name: course.name, desc: course.description, putts: structuredClone(course.putts) }));
}
