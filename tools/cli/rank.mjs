import { STARTER_COURSE_INDICES } from '../../src/shared/constants.js';
import { assessDifficultyResult, createDifficultyProvenance } from './provenance.mjs';

/**
 * SV1 difficulty ranking from the measured par-route fixture (a report written by `npm run measure:par -- --out <file>`, passed as `rank --routes <file>`).
 * Putt difficulty = shortest robust route strokes + (1 - margin/maxMargin); map difficulty = sum.
 * Exit 0: every starter putt has a current, verified robust route. 2: fixture missing or stale
 * (re-measure with `npm run measure:par`). 1: structural error or a putt without a robust route.
 */
export function runRank(courses, parRoutes) {
  const lines = [];
  if (!Array.isArray(courses)) return { code: 1, lines: ['ERROR: courses must be an array'] };
  if (!parRoutes?.results) return { code: 2, lines: ['PAR ROUTES MISSING: run `npm run measure:par -- --out routes.json` then `rank --routes routes.json`'] };
  const byKey = new Map(parRoutes.results.map(entry => [`${entry.map}/${entry.putt}`, entry]));
  const errors = [];
  const stale = [];
  const rows = STARTER_COURSE_INDICES.map(index => {
    const course = courses[index];
    if (!course?.starter) { errors.push(`Starter index ${index} is not a starter course`); return null; }
    let difficulty = 0;
    let strokes = 0;
    course.putts.forEach((_putt, puttIndex) => {
      const entry = byKey.get(`${index}/${puttIndex}`);
      if (!entry) { errors.push(`${course.name} putt ${puttIndex + 1}: no measurement`); return; }
      const assessed = assessDifficultyResult(entry, createDifficultyProvenance(course, puttIndex, { full: entry.provenance?.searchMode === 'full' }));
      if (!assessed.current) stale.push(`${course.name} putt ${puttIndex + 1}: ${assessed.differences.join('; ')}`);
      if (entry.status !== 'route') { errors.push(`${course.name} putt ${puttIndex + 1}: no robust route within 6 strokes (${entry.status})`); return; }
      difficulty += entry.difficulty;
      strokes += entry.strokes;
    });
    return { index, name: course.name, difficulty: +difficulty.toFixed(3), strokes };
  }).filter(Boolean);
  [...rows].sort((a, b) => a.difficulty - b.difficulty).forEach((row, rank) => {
    lines.push(`${rank + 1}. map ${row.index} ${row.name} | difficulty ${row.difficulty} | route strokes ${row.strokes}`);
  });
  const shipped = rows.map(row => row.index);
  const measured = [...rows].sort((a, b) => a.difficulty - b.difficulty).map(row => row.index);
  lines.push(shipped.every((index, i) => index === measured[i]) ? 'Starter order matches measured difficulty.' : `NOTE: shipped starter order ${shipped.join(',')} differs from measured order ${measured.join(',')} (owner decision).`);
  if (errors.length) return { code: 1, lines: [...lines, ...errors.map(error => `ERROR: ${error}`)] };
  if (stale.length) return { code: 2, lines: [...lines, ...stale.map(line => `STALE: ${line}`), 'Re-measure with `npm run measure:par`.'] };
  return { code: 0, lines: [...lines, 'Measured par routes are current for every starter putt.'] };
}
