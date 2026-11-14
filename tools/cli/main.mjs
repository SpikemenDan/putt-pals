#!/usr/bin/env node
import { createCourseData, createCourseDocument, parseCourseDocument, toSimulationCourses } from '../../src/courses/index.js';
import fs from 'node:fs';
import { createDifficultyProvenance } from './provenance.mjs';
import { parseCliArguments } from './arguments.mjs';
import { runConfig } from './config-report.mjs';
import { runChecks } from './checks.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runList, runValidate, runShot, runSolve, runArena, runCheck, runRank, runExport, USAGE } from './commands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readRoutes = file => (file === undefined ? undefined : JSON.parse(fs.readFileSync(file, 'utf8')));
function finish({ code, lines }) {
  console.log(lines.join('\n'));
  process.exitCode = code;
}

function main(argv) {
  // `config` takes its own options, so it bypasses the course-oriented argument parser.
  if (argv[0] === 'config') return finish(runConfig(argv.slice(1)));
  // `checks` takes its own options (--since, --json) and paths, so it bypasses the course-oriented argument parser.
  if (argv[0] === 'checks') return finish(runChecks(argv.slice(1)));
  const { command, args, courseFile, routesFile, world } = parseCliArguments(argv);
  if (!['list', 'validate', 'shot', 'solve', 'arena', 'check', 'rank', 'export'].includes(command)) {
    return finish({ code: command ? 1 : 0, lines: command ? [`Unknown command: ${command}`, ...USAGE] : USAGE });
  }
  if (command === 'arena') return finish(runArena(args.join(' ')));
  if (command === 'validate') {
    const data = createCourseData();
    const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
    return finish(runValidate({ raw: data.rules, inventory, courseHashes: data.sourceHashes }));
  }
  const document = courseFile === undefined ? createCourseDocument()
    : parseCourseDocument(fs.readFileSync(courseFile, 'utf8'));
  if (command === 'export') return finish(runExport(document));
  if (command === 'list') return finish(runList(document));
  if (command === 'rank') return finish(runRank(document.courses, readRoutes(routesFile)));
  if (command === 'check') return finish(runCheck(courseFile === undefined ? { ...createCourseData(), parRoutes: readRoutes(routesFile) } : { document, parRoutes: readRoutes(routesFile) }));

  const courses = toSimulationCourses(document);
  if (command === 'shot') return finish(runShot(courses, ...args));
  const output = runSolve(courses, args[0], args[1], args[2], world === undefined ? {} : { world });
  if (output.result) {
    const map = Number(args[0]);
    const putt = Number(args[1]);
    const provenance = createDifficultyProvenance(document.courses[map], putt, { full: args[2] === '--full', gravity: output.result.gravity });
    output.lines = [JSON.stringify({ schemaVersion: 2, map, putt, ...output.result, provenance })];
  }
  finish(output);
}
try { main(process.argv.slice(2)); }
catch (error) { finish({ code: 1, lines: [`ERROR: ${error.message}`] }); }
