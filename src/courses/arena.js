import { arenaSourceData } from './arena-specs.js';
import { validateCourseGeometry } from './catalog.js';
import { validateCourse, validatePutt } from '../shared/courses.js';
import { slugify } from './legacy.js';

/** Transform up to six chamber-local specifications into independent world data. */
export function buildArenaGeometry(chambers) {
  if (!Array.isArray(chambers) || chambers.length < 1 || chambers.length > 6) throw new Error('Arena requires one to six chambers');
  const result = { w: structuredClone(arenaSourceData.perimeter), sand: [], ice: [], slime: [], pit: [], pd: [], tp: [], fan: [], tornado: [], putts: [] };
  chambers.forEach((chamber, index) => {
    if (!chamber || typeof chamber !== 'object') throw new Error(`Chamber ${index} must be an object`);
    for (const key of ['t', 'c']) {
      if (!Array.isArray(chamber[key]) || chamber[key].length !== 2 || !chamber[key].every(Number.isFinite)) throw new Error(`Chamber ${index} ${key} must be a finite point`);
    }
    const allowed = ['t', 'c', 'w', 'sand', 'ice', 'slime', 'pit', 'pd', 'tp', 'fan', 'tornado', 'cup', 'par', 'pen'];
    if (Object.keys(chamber).some(key => !allowed.includes(key))) throw new Error(`Chamber ${index} has unsupported fields`);
    const rules = validatePutt({ tee: chamber.t, hole: chamber.c, par: chamber.par ?? 2, penalty: chamber.pen ?? 3, cupRadius: chamber.cup });
    if (!rules.valid) throw new Error(`Chamber ${index}: ${rules.errors.join('; ')}`);
    // Reuse primitive tuple validation before applying coordinate offsets.
    const input = { tiles: [[0, 0, 228, 198]], w: [], sand: [], ice: [], slime: [], pit: [], q: [], pl: [], rp: [], pd: [], tp: [], fan: [], tornado: [], movers: [], ...chamber };
    const checked = validateCourseGeometry(input);
    if (!checked.valid) throw new Error(`Chamber ${index}: ${checked.errors.join('; ')}`);
    const [ox, oy] = arenaSourceData.cells[index];
    const rect = row => [ox + row[0], oy + row[1], row[2], row[3]];
    for (const key of ['w', 'sand', 'ice', 'slime', 'pit']) result[key].push(...input[key].map(rect));
    result.pd.push(...input.pd.map(r => [ox + r[0], oy + r[1]]));
    result.tp.push(...input.tp.map(r => [ox + r[0], oy + r[1], ox + r[2], oy + r[3], r[4] || 0]));
    result.fan.push(...input.fan.map(r => [ox + r[0], oy + r[1], r[2], r[3], r[4], r[5], r[6]]));
    result.tornado.push(...input.tornado.map(r => [ox + r[0], oy + r[1], r[2], r[3]]));
    result.putts.push({ tee: [ox + chamber.t[0], oy + chamber.t[1]], hole: [ox + chamber.c[0], oy + chamber.c[1]], cup: chamber.cup, par: chamber.par, pen: chamber.pen });
  });
  return result;
}

/** Preserve legacy arena defaults; recorded counts only determine existing rules. */
export function generateArena(name) {
  if (!Object.hasOwn(arenaSourceData.specs, name)) throw new Error(`Unknown arena: ${name}`);
  const [desc, chambers] = arenaSourceData.specs[name];
  const geometry = buildArenaGeometry(chambers);
  const ladder = arenaSourceData.ladder.find(row => row[1] === name);
  const total = ladder[2].reduce((sum, value) => sum + value, 0);
  const putts = geometry.putts.map((putt, index) => ({
    tee: putt.tee, hole: putt.hole,
    par: putt.par ?? (ladder[2][index] >= 600 ? 2 : ladder[2][index] >= 250 ? 3 : 4),
    pen: putt.pen ?? (total < 1500 ? 4 : 3),
    ...(putt.cup ? { cup: putt.cup } : {}),
  }));
  const course = { name, desc, tee: [80, 80], hole: [240, 80], tiles: [[40, 40, 720, 420]],
    q: [], pl: [], rp: [], movers: [], ...geometry, putts,
    limit: arenaSourceData.limits[name], par: putts.reduce((sum, putt) => sum + putt.par, 0) };
  const checked = validateCourseGeometry(course);
  const rules = { id: slugify(name), name, index: ladder[0], starter: true,
    putts: putts.map(putt => ({ tee: putt.tee, hole: putt.hole, par: putt.par, penalty: putt.pen, limitSeconds: course.limit, cupRadius: putt.cup ?? 15 })) };
  const errors = [...checked.errors, ...validateCourse(rules).errors];
  if (errors.length) throw new Error(`Invalid arena: ${errors.join('; ')}`);
  return course;
}

export const arenaNames = Object.freeze(Object.keys(arenaSourceData.specs));
