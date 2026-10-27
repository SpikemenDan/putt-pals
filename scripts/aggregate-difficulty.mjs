// B4 difficulty aggregation. Usage: node scripts/aggregate-difficulty.mjs <sweep-dir> [measured-commit]
// <sweep-dir>/legacy/map-M.log  = output of `node tools.js solve M --full` (plus an `exit=N` line)
// <sweep-dir>/cli/map-M-putt-P.json = output of `node tools/cli/main.mjs solve M P --full`
// Writes tests/fixtures/difficulty-b4.json. Exits 1 if any putt is missing or the two solvers disagree.
// Measures nothing itself and never edits course data, par, penalties or the recorded ladder.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) { console.error('usage: node scripts/aggregate-difficulty.mjs <sweep-dir> [measured-commit]'); process.exit(1); }
const B4 = path.resolve(process.argv[2]);
const head = execSync('git rev-parse HEAD', { cwd: repo }).toString().trim();
const { arenaSourceData } = await import(path.join(repo, 'src/courses/arena-specs.js'));
const { createCourseData } = await import(path.join(repo, 'src/courses/index.js'));
const { SOLVER_CONFIG } = await import(path.join(repo, 'tools/cli/solver.mjs'));

const sha = file => createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex');
const parFromHits = h => (h >= 600 ? 2 : h >= 250 ? 3 : 4);
const penFromTotal = t => (t < 1500 ? 4 : 3);
const rules = createCourseData().rules;
const errors = [];

const maps = arenaSourceData.ladder.map(([index, name, historical], slot) => {
  const log = fs.readFileSync(`${B4}/legacy/map-${index}.log`, 'utf8');
  if (!/^exit=0\b/m.test(log)) errors.push(`legacy map ${index} did not exit 0`);
  const specChambers = arenaSourceData.specs[name][1];
  const putts = historical.map((historicalHits, putt) => {
    const re = new RegExp(`putt ${putt + 1}: (\\d+) hole-in-one shots, robust: (.+?) \\((\\d+\\.\\d)s\\)`);
    const m = log.match(re);
    if (!m) { errors.push(`legacy map ${index} putt ${putt + 1} missing`); return null; }
    const legacy = { hits: +m[1], best: m[2] === 'NONE' ? null : JSON.parse(m[2]), seconds: +m[3] };
    const cli = JSON.parse(fs.readFileSync(`${B4}/cli/map-${index}-putt-${putt}.json`, 'utf8'));
    if (cli.map !== index || cli.putt !== putt || cli.provenance?.searchMode !== 'full') errors.push(`cli record ${index}/${putt} malformed`);
    if (cli.hits !== legacy.hits || JSON.stringify(cli.best) !== JSON.stringify(legacy.best)) {
      errors.push(`legacy/cli disagree on ${index}/${putt}: ${legacy.hits} ${JSON.stringify(legacy.best)} vs ${cli.hits} ${JSON.stringify(cli.best)}`);
    }
    const rule = rules[index].putts[putt];
    const chamber = specChambers[putt];
    return {
      putt, puttId: cli.provenance.puttId,
      hits: legacy.hits, best: legacy.best,
      historicalHits, deltaHits: legacy.hits - historicalHits,
      par: { current: rule.par, source: chamber.par === undefined ? 'derived' : 'spec', fromHistoricalCount: parFromHits(historicalHits), fromFreshCount: parFromHits(legacy.hits) },
      penalty: { current: rule.penalty, source: chamber.pen === undefined ? 'derived' : 'spec' },
      provenance: cli.provenance,
      legacySeconds: legacy.seconds,
    };
  });
  const hits = putts.map(p => p?.hits ?? 0);
  const total = hits.reduce((a, b) => a + b, 0);
  const historicalTotal = historical.reduce((a, b) => a + b, 0);
  return { slot: slot + 1, map: index, name, total, historicalTotal, deltaTotal: total - historicalTotal,
    minPuttHits: Math.min(...hits), maxPuttHits: Math.max(...hits),
    penaltyFromFreshTotal: penFromTotal(total), penaltyFromHistoricalTotal: penFromTotal(historicalTotal), putts };
});

const ladderFindings = [];
maps.forEach((m, i) => {
  if (i > 0 && m.total >= maps[i - 1].total) ladderFindings.push(`${m.name} (total ${m.total}) is not harder than ${maps[i - 1].name} (total ${maps[i - 1].total})`);
  m.putts.forEach(p => { if (p && p.hits < 60) ladderFindings.push(`${m.name} putt ${p.putt + 1} has ${p.hits} hits, below the 60-hit minimum`); });
  m.putts.forEach(p => { if (p && !p.best) ladderFindings.push(`${m.name} putt ${p.putt + 1} has no robust solution`); });
});

const fixture = {
  schemaVersion: 1,
  task: 'B4 #4: exhaustive starter difficulty under corrected launch physics',
  mode: 'full: complete half-degree x power grid, every hit counted; robust shot is the first robust grid point',
  measuredAt: process.env.B4_MEASURED_AT ?? new Date().toISOString().slice(0, 10),
  measuredAtCommit: process.argv[3] ?? head,
  aggregatedAtCommit: head,
  sources: { htmlSha256: sha('putt-pals.html'), toolsSha256: sha('tools.js'),
    simulationSha256: maps[0].putts[0].provenance.simulationSha256,
    configurationSha256: maps[0].putts[0].provenance.configurationSha256 },
  solverConfig: SOLVER_CONFIG,
  agreement: 'Legacy tools.js solve --full and tools/cli solve --full produced identical hit counts and robust shots on every putt.',
  ladderFindings,
  maps,
};
if (!errors.length) fs.writeFileSync(path.join(repo, 'tests/fixtures/difficulty-b4.json'), JSON.stringify(fixture, null, 2) + '\n');
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'AGGREGATE_OK');
console.log(ladderFindings.length ? `LADDER FINDINGS:\n${ladderFindings.join('\n')}` : 'LADDER_OK');
for (const m of maps) console.log(`${m.slot}. ${m.name}: total ${m.total} (hist ${m.historicalTotal}, ${m.deltaTotal >= 0 ? '+' : ''}${m.deltaTotal}) putts ${m.putts.map(p => p.hits).join(',')} | pen fresh ${m.penaltyFromFreshTotal} hist ${m.penaltyFromHistoricalTotal}`);
process.exit(errors.length ? 1 : 0);
