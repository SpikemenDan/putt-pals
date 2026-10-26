/**
 * Course catalog built from legacy map data.
 * Pure: no DOM, no file access. Input is plain data produced by an adapter.
 */

import { validateCourse } from '../shared/courses.js';
import { STARTER_COURSE_INDICES } from '../shared/constants.js';

/** Turns a map name into a stable id, e.g. "Switchback Garden" -> "switchback-garden". */
export function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Maps one legacy course record to the shared course schema.
 *
 * @param {{index:number,name:string,putts:Array<object>}} raw
 * @param {boolean} starter
 */
export function normalizeLegacyCourse(raw, starter) {
  return {
    id: slugify(raw.name),
    name: raw.name,
    index: raw.index,
    starter: Boolean(starter),
    putts: (raw.putts ?? []).map(p => ({
      tee: Array.isArray(p.tee) ? [...p.tee] : p.tee,
      hole: Array.isArray(p.hole) ? [...p.hole] : p.hole,
      par: p.par,
      penalty: p.penalty,
      limitSeconds: p.limitSeconds,
      cupRadius: p.cupRadius,
    })),
  };
}

/**
 * Normalizes and validates every course, plus catalog-level rules
 * (index matches position, ids unique, every starter present).
 *
 * @param {Array<object>} rawCourses
 * @param {readonly number[]} starterIndices
 * @returns {{ valid: boolean, courses: object[], errors: string[] }}
 */
export function buildCourseCatalog(rawCourses, starterIndices = STARTER_COURSE_INDICES) {
  const errors = [];
  const courses = [];
  const ids = new Map();

  rawCourses.forEach((raw, position) => {
    const label = `Course ${position} (${raw?.name ?? 'unnamed'})`;
    if (!raw || raw.index !== position) {
      errors.push(`${label}: index ${raw?.index} does not match its position ${position}`);
    }
    const course = normalizeLegacyCourse(raw ?? {}, starterIndices.includes(position));
    const result = validateCourse(course);
    result.errors.forEach(message => errors.push(`${label}: ${message}`));
    if (ids.has(course.id)) {
      errors.push(`${label}: duplicate id "${course.id}" (also course ${ids.get(course.id)})`);
    }
    ids.set(course.id, position);
    courses.push(course);
  });

  starterIndices.forEach(index => {
    if (!courses[index]) errors.push(`Starter course ${index} is missing from the catalog`);
  });

  return { valid: errors.length === 0, courses, errors };
}
