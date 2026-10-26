#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runList, runValidate, runShot, USAGE } from './commands.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [, , command, ...args] = process.argv;

function finish({ code, lines }) {
  console.log(lines.join('\n'));
  process.exitCode = code;
}

if (!['list', 'validate', 'shot'].includes(command)) {
  finish({ code: command ? 1 : 0, lines: command ? [`Unknown command: ${command}`, ...USAGE] : USAGE });
} else {
  const adapter = require('../legacy-adapter.cjs');
  const legacy = adapter.loadLegacy();
  if (command === 'shot') {
    finish(runShot(legacy.HOLES, ...args));
  } else {
    const raw = adapter.legacyRawCourses(legacy);
    if (command === 'list') finish(runList(raw));
    else {
      const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/source-inventory.json'), 'utf8'));
      finish(runValidate({ raw, inventory, hashes: adapter.sourceHashes() }));
    }
  }
}
