#!/usr/bin/env node
/**
 * Measures the par-route fixture report (pass --out) for every putt of every
 * course, in parallel worker threads. Usage:
 *   node tools/cli/measure-par.mjs [--out <file>] [--jobs <n>] [--full] [--only map/putt,...]
 * Deterministic: results depend only on the courses, the simulation sources and the solver config.
 * Each course is solved at its own world's gravity (VIS-G: Ares and Luna maps), recorded per result.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createCourseDocument, toSimulationCourses } from '../../src/courses/index.js';
import { TUNING } from '../../src/shared/tuning.js';
import { courseWorld, worldGravity } from '../../src/shared/worlds.js';
import { solvePar, PAR_SOLVER_CONFIG } from './par-solver.mjs';
import { createDifficultyProvenance, hashSimulationSources } from './provenance.mjs';

const here = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(here), '../..');

if (!isMainThread) {
  const document = createCourseDocument();
  const courses = toSimulationCourses(document);
  parentPort.on('message', ({ map, putt, full }) => {
    const started = Date.now();
    const result = solvePar(courses[map], putt, { full, gravity: worldGravity(courseWorld(courses[map])) });
    parentPort.postMessage({ map, putt, seconds: +((Date.now() - started) / 1000).toFixed(1), result });
  });
} else {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const full = args.includes('--full');
  const out = option('--out') ?? path.join(os.tmpdir(), 'par-routes.json');
  const jobs = Math.max(1, Number(option('--jobs')) || Math.max(1, os.cpus().length - 2));
  const only = option('--only')?.split(',');
  const document = createCourseDocument();
  const tasks = document.courses.flatMap((course, map) => course.putts.map((_, putt) => ({ map, putt, full })))
    .filter(task => !only || only.includes(`${task.map}/${task.putt}`));
  const results = [];
  const queue = [...tasks];
  const simulationHash = hashSimulationSources();
  let running = 0;
  const finishAll = () => {
    results.sort((a, b) => a.map - b.map || a.putt - b.putt);
    const fixture = {
      schemaVersion: 2,
      task: 'SV1: shortest robust route within par 2..6 per putt (hole-in-one optional)',
      mode: full ? 'full' : 'fast',
      gravity: TUNING.gravity,
      simulationSha256: simulationHash,
      solverConfig: PAR_SOLVER_CONFIG,
      results: results.map(({ map, putt, result }) => ({
        schemaVersion: 2, map, putt, name: document.courses[map].name, ...result,
        provenance: createDifficultyProvenance(document.courses[map], putt, { full, simulationHash, gravity: result.gravity }),
      })),
    };
    fs.writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
    const counts = { route: 0, none: 0, budget: 0 };
    for (const r of fixture.results) counts[r.status]++;
    console.log(`wrote ${out}: ${JSON.stringify(counts)}`);
    process.exit(0);
  };
  const next = () => {
    if (!queue.length) { if (!running) finishAll(); return; }
    const task = queue.shift();
    running++;
    const worker = new Worker(here, { workerData: {} });
    worker.once('message', message => {
      results.push(message);
      const r = message.result;
      console.log(`${message.map}/${message.putt} ${r.status} strokes=${r.strokes ?? '-'} par=${r.par ?? '-'} trials=${r.trials} ${message.seconds}s`);
      running--;
      worker.terminate();
      next();
    });
    worker.once('error', error => { console.error(error); process.exit(1); });
    worker.postMessage(task);
  };
  for (let i = 0; i < jobs; i++) next();
}
