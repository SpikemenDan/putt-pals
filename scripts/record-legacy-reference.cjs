// One-off recorder: captures what the legacy game (putt-pals.html via tools.js) produced, as plain fixtures, so the
// parity tests can compare against recorded data and the legacy files can be retired. Output:
// tests/fixtures/legacy-reference/data.json. Not needed after retirement; git history keeps this script and the sources.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { loadLegacy, legacyRawCourses, legacyStarters, sourceHashes } = require('../tools/legacy-adapter.cjs');

const root = path.resolve(__dirname, '..');
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const sha = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const plain = v => JSON.parse(JSON.stringify(v));

const A = loadLegacy();
const source = fs.readFileSync(path.join(root, 'tools.js'), 'utf8');
const marker = 'const[,,cmd,...args]=process.argv;';
const context = { require, __dirname: root, process, performance, console };
vm.createContext(context);
vm.runInContext(source.slice(0, source.indexOf(marker)) + '\nthis.ref={SPECS,MECH,arenaData,arenaLine};', context);
const { SPECS, MECH, arenaData, arenaLine } = context.ref;
const course = (name, desc, tee, hole, tiles, extra) => ({ name, desc, tee, hole, tiles, q: [], pl: [], rp: [], movers: [], ice: [], slime: [], pd: [], tp: [], fan: [], tornado: [], ...extra });

const arenas = {};
for (const name of Object.keys(SPECS)) {
  arenas[name] = {
    chambers: plain(SPECS[name][1]),
    geometry: plain(arenaData(plain(SPECS[name][1]))),
    course: plain(vm.runInNewContext(arenaLine(name).trim().replace(/,$/, ''), { course })),
  };
}
const out = {
  schemaVersion: 1,
  evidence: 'recorded from the legacy single-file game before its retirement; no later source reads these files',
  sources: sourceHashes(),
  starters: legacyStarters(),
  rules: plain(legacyRawCourses(A)),
  holesCanonicalSha256: sha(plain(A.HOLES)),
  holeCount: A.HOLES.length,
  arenas,
  mechanics: { chambers: plain(MECH), geometry: plain(arenaData(plain(MECH))) },
  power: A.POWER,
};
const target = path.join(root, 'tests/fixtures/legacy-reference/data.json');
fs.writeFileSync(target, JSON.stringify(out, null, 1) + '\n');
console.log('wrote', path.relative(root, target), fs.statSync(target).size, 'bytes');
