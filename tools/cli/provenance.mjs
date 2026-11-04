import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAR_SOLVER_CONFIG } from './par-solver.mjs';
import { TUNING } from '../../src/shared/tuning.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw new Error('Fingerprint input must be finite JSON data');
};
export const hashJson = value => digest(JSON.stringify(canonical(value)));

const IMPORT_PATTERN = /^\s*(?:import|export)\b[^'"]*?['"](\.{1,2}\/[^'"]+)['"]/gm;

/**
 * Source fingerprint of everything the simulation can execute: `src/simulation` plus the
 * files it reaches through relative imports. Unrelated shared contracts (session, protocol,
 * transport) are excluded so network and UI work never invalidates recorded difficulty.
 */
export function simulationSourceFiles() {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
    }
  };
  fs.readdirSync(path.join(root, 'src/simulation'))
    .filter(name => /\.(?:js|mjs)$/.test(name)).sort()
    .forEach(name => visit(`src/simulation/${name}`));
  return [...seen].sort();
}

export function hashSimulationSources() {
  return hashJson(simulationSourceFiles().map(file => [file, digest(fs.readFileSync(path.join(root, file)))]));
}

export function createDifficultyProvenance(course, puttIndex, { full = false, simulationHash = hashSimulationSources(), configuration = PAR_SOLVER_CONFIG, gravity = TUNING.gravity } = {}) {
  const putt = course?.putts?.[puttIndex];
  if (!course?.id || !putt?.id) throw new Error('A normalized course and valid putt index are required');
  return { version: 2, courseId: course.id, puttId: putt.id, gravity,
    courseSha256: hashJson(course), simulationSha256: simulationHash,
    configurationSha256: hashJson({ parameters: configuration, solverSha256: digest(fs.readFileSync(path.join(root, 'tools/cli/par-solver.mjs'))) }), searchMode: full ? 'full' : 'fast' };
}

/** Boundary check for a persisted par-route result; fast searches never establish the thorough grid. */
export function assessDifficultyResult(record, current) {
  const differences = [];
  if (!record || record.schemaVersion !== 2 || !record.provenance || typeof record.provenance !== 'object') {
    return { current: false, complete: false, differences: ['Unsupported or missing par-route provenance'] };
  }
  const provenance = record.provenance;
  if (provenance.version !== 2) differences.push('Unsupported provenance version');
  for (const key of ['courseId', 'puttId']) if (typeof provenance[key] !== 'string' || !provenance[key]) differences.push(`Invalid ${key}`);
  for (const key of ['version', 'courseId', 'puttId', 'gravity', 'courseSha256', 'simulationSha256', 'configurationSha256', 'searchMode']) {
    if (provenance[key] !== current?.[key]) differences.push(`${key} differs from current input`);
  }
  for (const key of ['courseSha256', 'simulationSha256', 'configurationSha256']) {
    if (typeof provenance[key] !== 'string' || !/^[a-f0-9]{64}$/.test(provenance[key])) differences.push(`${key} is not a SHA-256 digest`);
  }
  if (!['fast', 'full'].includes(provenance.searchMode)) differences.push('Invalid search mode');
  if (!['route', 'none', 'budget'].includes(record.status)) differences.push('Invalid status');
  if (record.status === 'route') {
    const okRoute = Array.isArray(record.route) && record.route.length === record.strokes && record.strokes >= 1 && record.strokes <= PAR_SOLVER_CONFIG.maxStrokes
      && record.route.every(s => Number.isFinite(s.deg) && Number.isFinite(s.power) && s.power > 0 && s.power <= 1);
    if (!okRoute) differences.push('Invalid robust route');
    if (record.par !== Math.max(PAR_SOLVER_CONFIG.minPar, record.strokes)) differences.push('Par does not follow the shortest robust route');
  }
  return { current: differences.length === 0, complete: differences.length === 0 && provenance.searchMode === 'full', differences };
}
