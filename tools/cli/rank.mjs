import { STARTER_COURSE_INDICES } from '../../src/shared/constants.js';
import { arenaSourceData } from '../../src/courses/arena-specs.js';

/** Historical ladder audit only. Fresh measured difficulty is tracked separately in B4. */
export function runRank(rules, ladder = arenaSourceData.ladder) {
  const errors = [];
  const lines = ['HISTORICAL COUNTS: unverified for current physics; not a fresh difficulty measurement'];
  if (!Array.isArray(rules) || !Array.isArray(ladder)) return { code: 1, lines: ['ERROR: rules and ladder must be arrays'] };
  if (ladder.length !== STARTER_COURSE_INDICES.length) errors.push('Ladder must contain all six starters');
  let previous = Infinity;
  ladder.forEach((row, slot) => {
    if (!Array.isArray(row) || row.length !== 3) { errors.push(`Invalid ladder row ${slot}`); return; }
    const [index, name, counts] = row;
    if (index !== STARTER_COURSE_INDICES[slot] || rules[index]?.name !== name || !rules[index]?.starter) errors.push(`Starter identity/order mismatch at slot ${slot}`);
    if (!Array.isArray(counts) || counts.length !== 6 || !counts.every(n => Number.isInteger(n) && n >= 60)) { errors.push(`Invalid recorded putt counts for ${name}`); return; }
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (total >= previous) errors.push(`${name} is not harder than the preceding map in recorded counts`);
    lines.push(`${slot + 1}. map ${index} ${name} | total ${total} | putts ${Math.min(...counts)}..${Math.max(...counts)}`);
    previous = total;
  });
  if (errors.length) return { code: 1, lines: [...lines, ...errors.map(error => `ERROR: ${error}`)] };
  return { code: 2, lines: [...lines, 'Historical structure matches. Current difficulty remains unverified; complete B4 before release.'] };
}
