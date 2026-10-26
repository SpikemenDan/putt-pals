#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCourseSnapshot } from '../../src/courses/index.js';
import { runList, runValidateSnapshot, runSnapshotParity, runShot, USAGE } from './commands.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const snapshotPath = path.join(root, 'src/courses/data/courses.snapshot.json');
const [, , command, ...args] = process.argv;

function finish({ code, lines }) {
  console.log(lines.join('\n'));
  process.exitCode = code;
}

function readSnapshot() {
  try {
    return fs.readFileSync(snapshotPath, 'utf8');
  } catch (error) {
    finish({ code: 1, lines: [`ERROR: cannot read ${path.relative(root, snapshotPath)}: ${error.message}`, '  run: node scripts/export-courses.cjs --write'] });
    return null;
  }
}

if (!['list', 'validate', 'shot'].includes(command)) {
  finish({ code: command ? 1 : 0, lines: command ? [`Unknown command: ${command}`, ...USAGE] : USAGE });
} else {
  const snapshotText = readSnapshot();
  if (snapshotText !== null) {
    try {
      if (command === 'validate') {
        const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
        const result = runValidateSnapshot({ snapshotText, inventory });
        if (result.code === 0 && args.includes('--live')) {
          const adapter = require('../legacy-adapter.cjs');
          const legacy = adapter.loadLegacy();
          const parity = runSnapshotParity({
            snapshotText,
            liveCourses: JSON.parse(JSON.stringify(legacy.HOLES)),
            liveCatalog: JSON.parse(JSON.stringify(adapter.legacyRawCourses(legacy))),
            liveHashes: adapter.sourceHashes(),
          });
          finish({ code: parity.code, lines: [...result.lines, ...parity.lines] });
        } else {
          finish(result);
        }
      } else {
        const loaded = parseCourseSnapshot(snapshotText);
        finish(command === 'list' ? runList(loaded.catalog) : runShot(loaded.courses, ...args));
      }
    } catch (error) {
      finish({ code: 1, lines: [`ERROR: ${error.message}`] });
    }
  }
}
