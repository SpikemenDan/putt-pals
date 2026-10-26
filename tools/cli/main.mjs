#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createCourseData, createCourseDocument } from '../../src/courses/index.js';
import fs from 'node:fs';
import { createDifficultyProvenance } from './provenance.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runList, runValidate, runShot, runSolve, runArena, runCheck, runRank, runExport, USAGE } from './commands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [, , command, ...args] = process.argv;

const liveHashes = () => Object.fromEntries(
  [['htmlSha256', 'putt-pals.html'], ['toolsSha256', 'tools.js']].map(([key, file]) =>
    [key, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]),
);

function finish({ code, lines }) {
  console.log(lines.join('\n'));
  process.exitCode = code;
}

if (!['list', 'validate', 'shot', 'solve', 'arena', 'check', 'rank', 'export'].includes(command)) {
  finish({ code: command ? 1 : 0, lines: command ? [`Unknown command: ${command}`, ...USAGE] : USAGE });
} else {
  const data = createCourseData();
  if (command === 'export') {
    finish(runExport());
  } else if (command === 'check') {
    finish(runCheck(data));
  } else if (command === 'rank') {
    finish(runRank(data.rules));
  } else if (command === 'arena') {
    finish(runArena(args.join(' ')));
  } else if (command === 'solve') {
    const output = runSolve(data.definitions, ...args);
    if (output.result) {
      const map = Number(args[0]);
      const putt = Number(args[1]);
      const course = createCourseDocument().courses[map];
      const provenance = createDifficultyProvenance(course, putt, { full: args[2] === '--full' });
      output.lines = [JSON.stringify({ schemaVersion: 1, map, putt, ...output.result, provenance })];
    }
    finish(output);
  } else if (command === 'shot') {
    finish(runShot(data.definitions, ...args));
  } else {
    const raw = data.rules;
    if (command === 'list') finish(runList(raw));
    else {
      const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
      finish(runValidate({ raw, inventory, hashes: liveHashes(), courseHashes: data.sourceHashes }));
    }
  }
}
