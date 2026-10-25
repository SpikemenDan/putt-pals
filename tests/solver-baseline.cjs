// Temporary legacy harness; replace VM loading with module imports in M1.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools.js'), 'utf8');
const marker = 'const[,,cmd,...args]=process.argv;';
assert.equal(source.split(marker).length, 2, 'CLI boundary must be unique');
const context = { require, __dirname: root, process, performance, console };
vm.createContext(context);
vm.runInContext(source.slice(0, source.indexOf(marker)) + '\nthis.testAPI={load,solve};', context);
const { load, solve } = context.testAPI;
const A = load();
for (const angle of [0, Math.PI / 2, -Math.PI / 3]) {
  for (const power of [0.3, 0.65, 1]) {
    const player = A.fresh('test', 0);
    Object.assign(player, { x: 11, y: 22, z: 3, mt: 8 });
    A.setMe(player);
    A.launch(angle, power);
    assert.ok(Math.abs(player.vx - Math.cos(angle) * power * A.POWER) < 1e-10);
    assert.ok(Math.abs(player.vy - Math.sin(angle) * power * A.POWER) < 1e-10);
    assert.equal(player.str, 1);
    assert.equal(player.moving, true);
    assert.equal(player.mt, 0);
    assert.deepEqual(Array.from(player.prev), [11, 22, 3]);
  }
}
console.log('PASS: real launch initialization at 9 angle/power combinations');
// A small fake world verifies the solver calls the launch API for every trial.
let launches = 0;
let player;
const fake = {
  setPI() {}, fresh: A.fresh, setMe(p) { player = p; },
  H: () => ({ tee: [0, 0] }), surf: () => 0,
  launch(angle, power) {
    launches++;
    A.setMe(player);
    A.launch(angle, power);
  },
  step() { player.mode = 'sunk'; player.moving = false; },
};
assert.ok(solve(fake, 0, 0, false).best);
assert.equal(launches, 10, 'one candidate and all nine robustness trials must launch');
console.log('PASS: solver delegates candidate and robustness trials to gameplay launch');
const results = [];
for (const map of [0, 8, 20, 21, 5, 19]) {
  for (let putt = 0; putt < A.NP(map); putt++) {
    const started = performance.now();
    const result = solve(A, map, putt, false);
    const row = { map, name: A.HOLES[map].name, putt, best: result.best };
    results.push(row);
    console.log(`${row.name} putt ${putt + 1}: ${JSON.stringify(row.best)} (${((performance.now() - started) / 1000).toFixed(1)}s)`);
  }
}
const baseline = {
  mode: 'fast: first robust shot, not exhaustive difficulty counts',
  htmlSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'putt-pals.html'))).digest('hex'),
  toolsSha256: createHash('sha256').update(source).digest('hex'),
  power: A.POWER,
  robustness: { angleRadians: [-0.007, 0, 0.007], additivePower: [-0.025, 0, 0.025] },
  results,
};
fs.mkdirSync(path.join(__dirname, 'fixtures'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'fixtures/solver-baseline.json'), JSON.stringify(baseline, null, 2) + '\n');
assert.ok(results.every(row => row.best), 'every starter putt must have a robust shot');
console.log(`PASS: ${results.length}/${results.length} starter putts have robust shots at POWER=${A.POWER}`);
