export { runRank } from './rank.mjs';
import { solveCourse } from './solver.mjs';
/**
 * CLI command logic. Every command returns { code, lines } and never prints,
 * so it can be tested without spawning a process.
 */

import { SimulationEngine } from '../../src/simulation/index.js';
import { buildCourseCatalog, detectStaleCourses, detectStaleHashes, generateArena, validateCourseDefinitions, createCourseDocument } from '../../src/courses/index.js';

/** Safety cap: 120 simulated seconds at 240 Hz. */
export const MAX_TICKS = 240 * 120;

const fail = message => ({ code: 1, lines: [`ERROR: ${message}`] });

export function runList(raw) {
  const catalog = buildCourseCatalog(raw);
  if (!catalog.valid) return { code: 1, lines: ['LIST FAILED', ...catalog.errors] };
  const lines = catalog.courses.map(
    c => `${String(c.index).padStart(2)}  ${c.id.padEnd(22)} ${c.starter ? 'starter' : '       '}  ${c.putts.length} putt${c.putts.length === 1 ? '' : 's'}`,
  );
  return { code: 0, lines };
}

/** Schema check plus stale-metadata check against the recorded inventory. */
export function runValidate({ raw, inventory, hashes, courseHashes }) {
  const catalog = buildCourseCatalog(raw);
  const stale = detectStaleCourses(raw, inventory.courses);
  const staleHashes = detectStaleHashes(hashes, inventory);
  const problems = [...catalog.errors, ...stale.differences, ...staleHashes.differences,
    ...(courseHashes ? detectStaleHashes(courseHashes, inventory).differences.map(message => `Imported courses: ${message}`) : [])];
  if (problems.length) return { code: 1, lines: ['VALIDATE FAILED', ...problems.map(p => `  ${p}`)] };
  return {
    code: 0,
    lines: [`VALIDATE OK: ${catalog.courses.length} courses match the schema and the recorded inventory`],
  };
}

/**
 * Runs one shot headlessly through the shared SimulationEngine.
 * Hazard time is frozen at zero, the same condition the recorded reference traces use.
 */
export function runShot(holes, mapArg, puttArg, degArg, powerArg) {
  if ([mapArg, puttArg, degArg, powerArg].some(value => value == null || String(value).trim() === '')) return fail('shot requires map, putt, deg and power');
  const map = Number(mapArg);
  const putt = Number(puttArg);
  const deg = Number(degArg);
  const power = Number(powerArg);
  if (!Number.isInteger(map) || map < 0 || map >= holes.length) return fail(`map must be an integer 0..${holes.length - 1}`);
  const puttCount = holes[map].putts ? holes[map].putts.length : 1;
  if (!Number.isInteger(putt) || putt < 0 || putt >= puttCount) return fail(`putt must be an integer 0..${puttCount - 1} for map ${map}`);
  if (!Number.isFinite(deg)) return fail('deg must be a number (0 = +x, increasing toward +y)');
  if (!Number.isFinite(power) || power <= 0 || power > 1) return fail('power must be a number above 0 and at most 1');

  const engine = new SimulationEngine(holes[map], putt, { hazardTime: 0 });
  const player = engine.addPlayer('cli', 'CLI', 0);
  engine.launch('cli', (deg * Math.PI) / 180, power);
  let ticks = 0;
  while (player.moving && player.mode !== 'sunk' && ticks < MAX_TICKS) {
    engine.step();
    ticks++;
  }
  const outcome = player.mode === 'sunk' ? 'SUNK' : player.moving ? 'TIMED OUT (still moving)' : 'AT REST';
  const round = n => Math.round(n * 100) / 100;
  const result = { map, name: holes[map].name, putt, deg, power, ticks, mode: player.mode, outcome, strokes: player.strokes, x: round(player.x), y: round(player.y), z: round(player.z) };
  engine.dispose();
  return {
    code: 0,
    result,
    lines: [`${result.name} putt ${putt + 1}: ${outcome} after ${ticks} ticks (${round(ticks / 240)} s) at (${result.x}, ${result.y}, ${result.z}), ${result.strokes} stroke`],
  };
}

/** Search the legacy shot grid with imported courses and the shared simulation. */
export function runSolve(holes, mapArg, puttArg, flag) {
  if ([mapArg, puttArg].some(value => value == null || String(value).trim() === '')) return fail('solve requires map and putt');
  const map = Number(mapArg);
  const putt = Number(puttArg);
  if (!Number.isInteger(map) || map < 0 || map >= holes.length) return fail(`map must be an integer 0..${holes.length - 1}`);
  const count = holes[map].putts?.length ?? 1;
  if (!Number.isInteger(putt) || putt < 0 || putt >= count) return fail(`putt must be an integer 0..${count - 1} for map ${map}`);
  if (flag != null && flag !== '--full') return fail('only --full is supported after map and putt');
  const result = solveCourse(holes[map], putt, { full: flag === '--full' });
  return { code: result.best ? 0 : 1, result, lines: [JSON.stringify({ map, putt, ...result })] };
}

/** Emit validated data; never patch the legacy HTML. */
export function runArena(name) {
  try {
    const course = generateArena(name);
    return { code: 0, result: course, lines: [JSON.stringify(course, null, 2)] };
  } catch (error) { return fail(error.message); }
}

/** Geometry, playable positions and resolved-rule parity for all imported maps. */
export function runCheck({ definitions, rules }) {
  const result = validateCourseDefinitions(definitions, rules);
  return result.valid
    ? { code: 0, lines: [`CHECK OK: ${definitions.length} courses; geometry, playable tee/cup positions and resolved rules agree`] }
    : { code: 1, lines: ['CHECK FAILED', ...result.errors.map(error => `  ${error}`)] };
}

export function runExport() {
  return { code: 0, lines: [JSON.stringify(createCourseDocument(), null, 2)] };
}

export const USAGE = [
  'Usage: node tools/cli/main.mjs <command>',
  '  list                          list all courses',
  '  export                        print versioned course JSON with persistent course/putt IDs',
  '  check                         validate imported geometry, playable positions and rules',
  '  rank                          audit historical ladder (exit 2: current difficulty unverified)',
  '  arena <name>                  print generated arena JSON; quote names containing spaces',
  '  validate                      schema + stale-metadata check (exit 1 on any problem)',
  '  solve <map> <putt> [--full]  search robust shots (putt is 0-based; --full counts the entire grid)',
  '  shot <map> <putt> <deg> <pwr> run one headless shot (putt is 0-based, power 0..1)',
];
