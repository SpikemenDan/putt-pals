import { courseDefinitions, courseRules, courseSourceHashes } from './definitions.js';
import { buildCourseCatalog } from './legacy.js';

// Tuple layouts consumed by both the renderer and simulation adapters.
const tupleLengths = { tiles: [4], w: [4], sand: [4], ice: [4], slime: [4], pit: [4],
  q: [2], pl: [5], rp: [7, 8], pd: [2], tp: [5], fan: [7], tornado: [4], movers: [8] };

/** Validate geometry at the data boundary before simulation consumers use it. */
export function validateCourseGeometry(course) {
  const errors = [];
  if (!course || typeof course !== 'object') return { valid: false, errors: ['Course geometry must be an object'] };
  for (const [key, lengths] of Object.entries(tupleLengths)) {
    const rows = course[key];
    if (!Array.isArray(rows)) { errors.push(`${key} must be an array`); continue; }
    rows.forEach((row, index) => {
      const label = `${key}[${index}]`;
      if (!Array.isArray(row) || !lengths.includes(row.length)) { errors.push(`${label} has invalid tuple length`); return; }
      if (!row.every((value, i) => key === 'rp' && i === 4 ? ['+x', '-x', '+y', '-y'].includes(value)
        : key === 'rp' && i === 7 ? value === 'launch' : Number.isFinite(value))) errors.push(`${label} has invalid values`);
      if (['tiles', 'w', 'sand', 'ice', 'slime', 'pit', 'pl', 'rp', 'fan', 'movers'].includes(key)
        && (!(row[2] > 0) || !(row[3] > 0))) errors.push(`${label} dimensions must be positive`);
      if (key === 'tornado' && !(row[2] > 0)) errors.push(`${label} radius must be positive`);
    });
  }
  if (!course.tiles?.length) errors.push('Course must have playable tiles');
  return { valid: errors.length === 0, errors };
}

/** Fresh owned data per caller; no file system, DOM or legacy source evaluation. */
export function createCourseData() {
  const definitions = structuredClone(courseDefinitions);
  const rules = structuredClone(courseRules);
  const catalog = buildCourseCatalog(rules);
  const errors = [...catalog.errors];
  if (definitions.length !== rules.length) errors.push('Geometry/rule course counts differ');
  definitions.forEach((course, index) => {
    errors.push(...validateCourseGeometry(course).errors.map(error => `Course ${index}: ${error}`));
    if (course.name !== rules[index]?.name) errors.push(`Course ${index}: geometry/rule names differ`);
  });
  if (errors.length) throw new Error(`Invalid course data:\n${errors.join('\n')}`);
  return { definitions, rules, catalog: catalog.courses, sourceHashes: { ...courseSourceHashes } };
}
