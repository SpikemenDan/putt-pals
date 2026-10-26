/**
 * Stale-metadata detection.
 * Compares live course data (from the legacy adapter) with a recorded inventory
 * and reports every difference. Pure: plain data in, plain data out.
 */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const PUTT_FIELDS = ['tee', 'hole', 'par', 'penalty', 'limitSeconds', 'cupRadius'];

/**
 * @param {Array<object>} liveCourses  legacy raw courses (index, name, starter, putts)
 * @param {Array<object>} recordedCourses  inventory.courses
 * @returns {{ stale: boolean, differences: string[] }}
 */
export function detectStaleCourses(liveCourses, recordedCourses) {
  const differences = [];
  if (liveCourses.length !== recordedCourses.length) {
    differences.push(`course count: live ${liveCourses.length}, recorded ${recordedCourses.length}`);
  }
  const count = Math.min(liveCourses.length, recordedCourses.length);
  for (let i = 0; i < count; i++) {
    const live = liveCourses[i];
    const rec = recordedCourses[i];
    const label = `course ${i} (${rec.name})`;
    if (live.name !== rec.name) differences.push(`${label}: name is now "${live.name}"`);
    if (Boolean(live.starter) !== Boolean(rec.starter)) {
      differences.push(`${label}: starter flag is now ${Boolean(live.starter)}`);
    }
    const recPutts = rec.putts ?? [];
    if (live.putts.length !== recPutts.length) {
      differences.push(`${label}: putt count live ${live.putts.length}, recorded ${recPutts.length}`);
    }
    const puttCount = Math.min(live.putts.length, recPutts.length);
    for (let p = 0; p < puttCount; p++) {
      for (const field of PUTT_FIELDS) {
        if (!same(live.putts[p][field], recPutts[p][field])) {
          differences.push(
            `${label} putt ${p}: ${field} is now ${JSON.stringify(live.putts[p][field])}, recorded ${JSON.stringify(recPutts[p][field])}`,
          );
        }
      }
    }
  }
  return { stale: differences.length > 0, differences };
}

/**
 * @param {{htmlSha256: string, toolsSha256: string}} live
 * @param {{htmlSha256: string, toolsSha256: string}} recorded
 */
export function detectStaleHashes(live, recorded) {
  const differences = [];
  for (const key of ['htmlSha256', 'toolsSha256']) {
    if (live[key] !== recorded[key]) differences.push(`${key} changed since the inventory was recorded`);
  }
  return { stale: differences.length > 0, differences };
}
