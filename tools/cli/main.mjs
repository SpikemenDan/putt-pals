#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createCourseData, createCourseDocument, parseCourseDocument, toSimulationCourses } from '../../src/courses/index.js';
import fs from 'node:fs';
import { createDifficultyProvenance } from './provenance.mjs';
import { parseCliArguments } from './arguments.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runList, runValidate, runShot, runSolve, runArena, runCheck, runRank, runExport, USAGE } from './commands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const liveHashes = () => Object.fromEntries(
  [['htmlSha256', 'putt-pals.html'], ['toolsSha256', 'tools.js']].map(([key, file]) =>
    [key, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]),
);
function finish({ code, lines }) {
  console.log(lines.join('\n'));
  process.exitCode = code;
}

function main(argv) {
  const { command, args, courseFile } = parseCliArguments(argv);
  if (!['list', 'validate', 'shot', 'solve', 'arena', 'check', 'rank', 'export'].includes(command)) {
    return finish({ code: command ? 1 : 0, lines: command ? [`Unknown command: ${command}`, ...USAGE] : USAGE });
  }
  if (command === 'arena') return finish(runArena(args.join(' ')));
  if (command === 'validate') {
    const data = createCourseData();
    const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
    return finish(runValidate({ raw: data.rules, inventory, hashes: liveHashes(), courseHashes: data.sourceHashes }));
  }
  const document = courseFile === undefined ? createCourseDocument()
    : parseCourseDocument(fs.readFileSync(courseFile, 'utf8'));
  if (command === 'export') return finish(runExport(document));
  if (command === 'list') return finish(runList(document));
  if (command === 'rank') return finish(runRank(document.courses));
  if (command === 'check') return finish(runCheck(courseFile === undefined ? createCourseData() : { document }));

  const courses = toSimulationCourses(document);
  if (command === 'shot') return finish(runShot(courses, ...args));
  const output = runSolve(courses, ...args);
  if (output.result) {
    const map = Number(args[0]);
    const putt = Number(args[1]);
    const provenance = createDifficultyProvenance(document.courses[map], putt, { full: args[2] === '--full' });
    output.lines = [JSON.stringify({ schemaVersion: 1, map, putt, ...output.result, provenance })];
  }
  finish(output);
}
try { main(process.argv.slice(2)); }
catch (error) { finish({ code: 1, lines: [`ERROR: ${error.message}`] }); }
