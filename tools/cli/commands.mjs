export { runRank } from './rank.mjs';
import { solvePar } from './par-solver.mjs';
/**
 * CLI command logic. Every command returns { code, lines } and never prints,
 * so it can be tested without spawning a process.
 */

import { SimulationEngine } from '../../src/simulation/index.js';
import { FIXED_TIMESTEP, STARTER_COURSE_INDICES } from '../../src/shared/constants.js';
import { DEFAULT_WORLD, WORLD_IDS, isWorldId, worldGravity } from '../../src/shared/worlds.js';
import { buildCourseCatalog, detectStaleCourses, detectStaleHashes, generateArena, validateCourseDefinitions, createCourseDocument, validateCourseDocument } from '../../src/courses/index.js';

/** Simulation ticks per second, from the one fixed timestep (240 Hz). */
export const TICKS_PER_SECOND = Math.round(1 / FIXED_TIMESTEP);
/** Safety cap: 120 simulated seconds. */
export const MAX_TICKS = TICKS_PER_SECOND * 120;

const fail = message => ({ code: 1, lines: [`ERROR: ${message}`] });

export function runList(raw) {
  const catalog = Array.isArray(raw) ? buildCourseCatalog(raw)
    : { ...validateCourseDocument(raw), courses: raw?.courses };
  if (!catalog.valid) return { code: 1, lines: ['LIST FAILED', ...catalog.errors] };
  const lines = catalog.courses.map(
    c => `${String(c.index).padStart(2)}  ${c.id.padEnd(22)} ${c.starter ? 'starter' : '       '}  ${c.putts.length} putt${c.putts.length === 1 ? '' : 's'}`,
  );
  return { code: 0, lines };
}

/** Schema check plus stale-metadata check against the recorded inventory. */
export function runValidate({ raw, inventory, hashes, courseHashes }) {
  // Starters are checked against the maps actually supplied, so the 22-map legacy reference is valid on its own.
  const catalog = buildCourseCatalog(raw, STARTER_COURSE_INDICES.filter(index => index < raw.length));
  // The inventory records the legacy export only. Maps added after it (VIS-G placeholders from index 22) are not stale
  // metadata; every recorded map must still match exactly, and a missing legacy map still fails.
  const recorded = inventory.courses;
  const stale = detectStaleCourses(raw.slice(0, recorded.length), recorded);
  const added = Math.max(0, raw.length - recorded.length);
  const staleHashes = hashes ? detectStaleHashes(hashes, inventory) : { differences: [] };
  const problems = [...catalog.errors, ...stale.differences, ...staleHashes.differences,
    ...(courseHashes ? detectStaleHashes(courseHashes, inventory).differences.map(message => `Imported courses: ${message}`) : [])];
  if (problems.length) return { code: 1, lines: ['VALIDATE FAILED', ...problems.map(p => `  ${p}`)] };
  return {
    code: 0,
    lines: [`VALIDATE OK: ${catalog.courses.length} courses match the schema; the ${recorded.length} legacy courses match the recorded inventory`
      + (added ? ` (${added} added after the legacy export)` : '')],
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
    lines: [`${result.name} putt ${putt + 1}: ${outcome} after ${ticks} ticks (${round(ticks / TICKS_PER_SECOND)} s) at (${result.x}, ${result.y}, ${result.z}), ${result.strokes} stroke`],
  };
}

/**
 * SV1: shortest robust multi-stroke route for one putt (hole-in-one optional).
 * Exit 0 when a robust route within 6 strokes exists; 1 otherwise (never weakened to pass).
 */
export function runSolve(holes, mapArg, puttArg, flag, { world = DEFAULT_WORLD } = {}) {
  if (!isWorldId(world)) return fail(`unknown world "${world}"; use ${WORLD_IDS.join(', ')}`);
  if ([mapArg, puttArg].some(value => value == null || String(value).trim() === '')) return fail('solve requires map and putt');
  const map = Number(mapArg);
  const putt = Number(puttArg);
  if (!Number.isInteger(map) || map < 0 || map >= holes.length) return fail(`map must be an integer 0..${holes.length - 1}`);
  const count = holes[map].putts?.length ?? 1;
  if (!Number.isInteger(putt) || putt < 0 || putt >= count) return fail(`putt must be an integer 0..${count - 1} for map ${map}`);
  if (flag != null && flag !== '--full') return fail('only --full is supported after map and putt');
  const result = { world, ...solvePar(holes[map], putt, { full: flag === '--full', gravity: worldGravity(world) }) };
  return { code: result.status === 'route' ? 0 : 1, result, lines: [JSON.stringify({ map, putt, ...result })] };
}

/** Emit validated data; never patch the legacy HTML. */
export function runArena(name) {
  try {
    const course = generateArena(name);
    return { code: 0, result: course, lines: [JSON.stringify(course, null, 2)] };
  } catch (error) { return fail(error.message); }
}

/** Par range enforced by the CLI (owner rule). The shared validator still allows 1..10 until the integration owner changes the contract. */
export const PAR_RANGE = Object.freeze({ min: 2, max: 6 });

function parProblems(entries, parRoutes) {
  const problems = [];
  const byKey = new Map((parRoutes?.results ?? []).map(entry => [`${entry.map}/${entry.putt}`, entry]));
  for (const { map, putt, name, par } of entries) {
    const label = `${name} putt ${putt + 1}`;
    if (!Number.isInteger(par) || par < PAR_RANGE.min || par > PAR_RANGE.max) problems.push(`${label}: par ${par} must be an integer ${PAR_RANGE.min}..${PAR_RANGE.max}`);
    const measured = byKey.get(`${map}/${putt}`);
    if (!measured) continue;
    if (measured.status !== 'route') problems.push(`${label}: no robust route within ${PAR_RANGE.max} strokes found (${measured.status})`);
    else if (Number.isInteger(par) && par < measured.strokes) problems.push(`${label}: par ${par} is below the shortest robust route of ${measured.strokes} strokes`);
  }
  return problems;
}

/** Geometry, playable positions and resolved-rule parity for all imported maps, plus par range and par-route consistency. */
export function runCheck({ definitions, rules, document, parRoutes }) {
  const result = document ? validateCourseDocument(document) : validateCourseDefinitions(definitions, rules);
  const count = document ? document.courses?.length : definitions?.length;
  const courses = document ? document.courses : rules;
  const entries = (Array.isArray(courses) ? courses : []).flatMap((course, map) => (Array.isArray(course?.putts) ? course.putts : []).map((putt, index) => ({ map, putt: index, name: course.name ?? course.id, par: putt.par })));
  const problems = [...(result.valid ? [] : result.errors), ...parProblems(entries, parRoutes)];
  return problems.length
    ? { code: 1, lines: ['CHECK FAILED', ...problems.map(error => `  ${error}`)] }
    : { code: 0, lines: [`CHECK OK: ${count} courses; geometry, playable tee/cup positions, resolved rules and par ${PAR_RANGE.min}..${PAR_RANGE.max} agree${parRoutes ? ' with the measured par routes' : ''}`] };
}

export function runExport(document = createCourseDocument()) {
  const checked = validateCourseDocument(document);
  if (!checked.valid) return { code: 1, lines: ['EXPORT FAILED', ...checked.errors] };
  return { code: 0, lines: [JSON.stringify(document, null, 2)] };
}

export const USAGE = [
  'Usage: node tools/cli/main.mjs <command> [--courses <file.json>]',
  '  --courses is supported by list, check, export, shot and solve',
  '  list                          list all courses',
  '  export                        print versioned course JSON with persistent course/putt IDs',
  '  check [--routes <file>]       validate geometry, rules and par 2..6; with a measure-par report also require a robust route within par',
  '  rank                          rank [--routes <file>]        rank starters by measured par-route difficulty from a measure-par report (exit 2: no/stale report)',
  '  config [display|tuning|all] [--json] [--overrides <file>]  settings with defaults, units, restart rule and the files that read them',
  '  checks [--since <ref>] [--json] [paths...]  recommend which verification commands to run for the changed paths, and why',
  '  arena <name>                  print generated arena JSON; quote names containing spaces',
  '  validate                      schema + stale-metadata check (exit 1 on any problem)',
  '  solve <map> <putt> [--full] [--world <id>]  shortest robust route within par 2..6 (putt is 0-based; --full = finer waypoint grid, larger budget; --world gaia|ares|luna solves at that world gravity, default gaia)',
  '  shot <map> <putt> <deg> <pwr> run one headless shot (putt is 0-based, power 0..1)',
];
