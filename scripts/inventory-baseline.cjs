// Legacy-only inventory adapter. Replace source/VM loading with imports in M1.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'putt-pals.html'), 'utf8');
const tools = fs.readFileSync(path.join(root, 'tools.js'), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const embedded = name => {
  const marker = `<script>/* ${name} (inlined) */`;
  assert.equal(html.split(marker).length, 2, `unique ${name} marker`);
  const start = html.indexOf(marker) + marker.length;
  const end = html.indexOf('</script>', start);
  assert.ok(end > start);
  return html.slice(start, end);
};
const three = embedded('three.js');
const peer = embedded('peerjs');
const threeContext = {};
vm.runInNewContext(three, threeContext);
const packageExpressions = [...peer.matchAll(/JSON\.parse\(('(?:\\.|[^'\\])*')\)/g)];
const peerPackage = packageExpressions
  .map(match => vm.runInNewContext(`JSON.parse(${match[1]})`))
  .find(value => value.name === 'peerjs');
assert.ok(peerPackage, 'embedded PeerJS package metadata');
assert.ok(three.includes('SPDX-License-Identifier: MIT'));

const cliBoundary = 'const[,,cmd,...args]=process.argv;';
assert.equal(tools.split(cliBoundary).length, 2, 'unique legacy CLI boundary');
const context = { require, __dirname: root, process, performance, console };
vm.createContext(context);
vm.runInContext(tools.slice(0, tools.indexOf(cliBoundary)) + '\nthis.A=load();', context);
const A = context.A;
const startersMatch = html.match(/const STARTERS=\[([\d,\s]+)\]/);
assert.ok(startersMatch);
const starters = startersMatch[1].split(',').map(Number);
const solverBaseline = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/solver-baseline.json'), 'utf8'));
assert.equal(solverBaseline.htmlSha256, hash(html), 'solver fixture must match current game');
assert.equal(solverBaseline.toolsSha256, hash(tools), 'solver fixture must match current tooling');

const snapshot = player => Object.fromEntries(
  ['x', 'y', 'z', 'vx', 'vy', 'vz', 'str', 'mode', 'moving', 'over']
    .map(key => [key, player[key] ?? null]),
);
const references = starters.map(map => {
  const solution = solverBaseline.results.find(row => row.map === map && row.putt === 0);
  assert.ok(solution?.best);
  A.setPI(0);
  const player = A.fresh('baseline', 0);
  A.setMe(player);
  player.h = map;
  const course = A.H();
  [player.x, player.y] = course.tee;
  player.z = A.surf(course, ...course.tee);
  A.launch(solution.best.deg * Math.PI / 180, solution.best.power);
  const samples = [{ tick: 0, ...snapshot(player) }];
  let tick = 0;
  while (tick < 4800 && player.moving && player.mode !== 'sunk') {
    A.step();
    tick++;
    if (tick % 240 === 0) samples.push({ tick, ...snapshot(player) });
  }
  if (samples.at(-1).tick !== tick) samples.push({ tick, ...snapshot(player) });
  assert.equal(player.mode, 'sunk', `${solution.name} representative shot`);
  assert.equal(player.str, 1);
  assert.ok(!player.over);
  return { map, putt: 0, shot: solution.best, samples };
});

const inventory = {
  schemaVersion: 1,
  evidence: 'source metadata and headless simulation; no real-browser execution',
  htmlSha256: hash(html),
  toolsSha256: hash(tools),
  libraries: [
    {
      name: 'three', version: `0.${threeContext.THREE.REVISION}.0`,
      revision: threeContext.THREE.REVISION,
      license: 'MIT', evidence: 'runtime THREE.REVISION and embedded SPDX header',
      bytes: Buffer.byteLength(three), sha256: hash(three),
      upstreamByteIdentityVerified: false,
    },
    {
      name: peerPackage.name, version: peerPackage.version,
      license: peerPackage.license, evidence: 'package metadata embedded in bundle',
      bytes: Buffer.byteLength(peer), sha256: hash(peer),
      upstreamByteIdentityVerified: false,
    },
  ],
  starters,
  constants: Object.fromEntries(['R', 'CUP', 'CUP_MIN', 'K_TURF', 'POWER'].map(key => [key, A[key]])),
  courses: A.HOLES.map((course, index) => ({
    index, name: course.name, starter: starters.includes(index),
    puttCount: A.NP(index), par: course.par, limitSeconds: course.limit ?? null,
    geometryCounts: Object.fromEntries(
      ['tiles', 'w', 'sand', 'ice', 'slime', 'pit', 'pl', 'rp', 'pd', 'tp', 'fan', 'tornado', 'movers', 'q']
        .map(key => [key, course[key]?.length ?? 0]),
    ),
    putts: Array.from({ length: A.NP(index) }, (_, putt) => {
      A.setPI(putt);
      const player = A.fresh('inventory', 0);
      player.h = index;
      A.setMe(player);
      const active = A.H();
      return {
        index: putt, tee: active.tee, hole: active.hole,
        par: A.parOf(index, putt), penalty: A.penOf(index, putt),
        limitSeconds: A.limitOf(index, putt) / 1000, cupRadius: A.cupOf(active),
      };
    }),
  })),
  simulationReferences: {
    timestepSeconds: 1 / 240,
    conditions: 'Centered release, no power-ups, headless hazard time frozen at zero; samples every 240 ticks and on completion. Floating-point samples are reference evidence, not a cross-platform bitwise guarantee.',
    shots: references,
  },
};
const destination = path.join(root, 'tests/fixtures/source-inventory.json');
const serialized = JSON.stringify(inventory, null, 2) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(destination, 'utf8'), serialized, 'inventory is stale; review before regenerating');
  console.log('INVENTORY_OK: source hashes, two library versions, 22 courses and six simulation traces match');
} else if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  console.log(`Wrote ${path.relative(root, destination)}`);
} else {
  console.log('Usage: node scripts/inventory-baseline.cjs --write | --check');
}
