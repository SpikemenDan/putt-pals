/**
 * `config`: traceability report for the configuration systems. For every DISPLAY and TUNING setting it prints the shipped
 * default, the allowed range, the units, how a change takes effect and which files read it. Consumers are derived from the
 * source (src/shared/config-meta.js), so nothing here is a hand-kept list that can go stale. A setting that nothing reads is
 * called out. With `--overrides <file>` it validates an exported display-overrides file (the same import the development panel
 * uses) and shows how it differs from the shipped defaults.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, CONFIG_DOMAINS, differences, RESTART } from '../../src/shared/config-meta.js';
import { DEFAULT_DISPLAY, DISPLAY_FIELDS } from '../../src/shared/display.js';
import { DEFAULT_TUNING, TUNING_FIELDS } from '../../src/shared/tuning.js';
import { createDisplayTuner } from '../../src/devtools/display-tuner.js';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));

/** Source files that may read a setting: the application, the Worker runtime and the tools. Tests are not consumers. */
export function readSources(root = defaultRoot) {
  const sources = {};
  for (const top of ['src', 'services', 'tools']) {
    const dir = path.join(root, top);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) if (/\.(?:js|mjs|jsx)$/.test(file)) sources[path.relative(root, file).split(path.sep).join('/')] = fs.readFileSync(file, 'utf8');
  }
  return sources;
}

const SPECS = { display: { fields: DISPLAY_FIELDS, defaults: DEFAULT_DISPLAY }, tuning: { fields: TUNING_FIELDS, defaults: DEFAULT_TUNING } };

/** @returns {{code: number, lines: string[], reports?: object}} */
export function runConfig(argv, root = defaultRoot) {
  let which = 'all', json = false, overridesFile;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--overrides') overridesFile = argv[++i];
    else if (['display', 'tuning', 'all'].includes(a)) which = a;
    else return { code: 1, lines: [`ERROR: unknown argument ${a}`, 'Usage: config [display|tuning|all] [--json] [--overrides <exported display overrides.json>]'] };
  }
  if (overridesFile === undefined && argv.includes('--overrides')) return { code: 1, lines: ['ERROR: --overrides requires a file'] };
  const sources = readSources(root);
  const domains = which === 'all' ? ['display', 'tuning'] : [which];
  let current;
  const lines = [];
  if (overridesFile) {
    const tuner = createDisplayTuner();
    try { tuner.importJson(fs.readFileSync(path.resolve(overridesFile), 'utf8')); } catch (error) { return { code: 1, lines: [`ERROR: ${error.message}`] }; }
    current = tuner.display;
  }
  const reports = {};
  for (const domain of domains) {
    const meta = CONFIG_DOMAINS[domain];
    const rows = buildReport({ domain, ...SPECS[domain], current: domain === 'display' ? current : undefined, sources });
    reports[domain] = rows;
    if (json) continue;
    lines.push(`${meta.label}: ${rows.length} settings. Defined in ${meta.file}, documented in ${meta.doc}.`, `  Change takes effect: ${RESTART[meta.restart]}.`);
    for (const r of rows) {
      lines.push(`  ${r.path} = ${r.default} (${r.min} to ${r.max}) ${r.units ?? '(units missing)'}`);
      lines.push(`      read by: ${r.consumers.length ? r.consumers.join(', ') : 'NOTHING (no source file reads this setting)'}`);
    }
    const dead = rows.filter(r => !r.consumers.length);
    lines.push(dead.length ? `  Not read by anything: ${dead.map(r => r.path).join(', ')}` : '  Every setting is read by at least one source file.', '');
    if (domain === 'display' && overridesFile) {
      const changed = differences(rows);
      lines.push(`Overrides in ${overridesFile} (temporary: they do not change the shipped defaults):`, ...(changed.length ? changed.map(r => `  ${r.path}: ${r.default} -> ${r.value} ${r.units ?? ''}`) : ['  none differ from the defaults']), '');
    }
  }
  return { code: 0, lines: json ? [JSON.stringify(reports, null, 2)] : lines, reports };
}
