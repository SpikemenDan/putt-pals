// VIS-W #164: per-world gravity. Expectations are independent literals and closed-form projectile physics, so a
// moved default or a broken injection path cannot pass by comparing a setting with itself.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const load = rel => import(pathToFileURL(path.join(root, rel)).href);
const FLAT = { tee: [0, 0], hole: [10000, 10000], tiles: [[-20000, -20000, 40000, 40000]], w: [] };

(async () => {
  const worlds = await load('src/shared/worlds.js');
  const { TUNING, createTuning } = await load('src/shared/tuning.js');
  const { SimulationEngine } = await load('src/simulation/index.js');
  const { solvePar, assertWorldGravity } = await load('tools/cli/par-solver.mjs');
  const commands = await load('tools/cli/commands.mjs');
  const { parseCliArguments } = await load('tools/cli/arguments.mjs');
  const preview = await load('src/devtools/world-preview.js');

  // Owner-accepted starting values (2026-11-11): Gaia 700, Ares 490, Luna 315 units/s^2.
  assert.deepEqual(worlds.WORLD_IDS, ['gaia', 'ares', 'luna']);
  assert.equal(worlds.DEFAULT_WORLD, 'gaia');
  assert.deepEqual(worlds.WORLD_IDS.map(id => worlds.worldGravity(id)), [700, 490, 315]);
  assert.equal(worlds.worldGravity(), 700, 'default world is Gaia');
  assert.deepEqual(worlds.WORLDS.map(w => w.precipitation), [true, false, false], 'rain/snow power-up only on Gaia');
  assert.throws(() => worlds.worldGravity('mars'), /Unknown world/);
  assert.equal(worlds.isWorldId('luna'), true);
  assert.equal(worlds.isWorldId('Luna'), false);
  assert.equal(worlds.worldGravity('ares', createTuning({ worlds: { ares: { gravity: 400 } } })), 400, 'gravity is read from the tuning given');
  assert.throws(() => createTuning({ worlds: { luna: { gravity: -1 } } }), /worlds\.luna\.gravity/);
  console.log('PASS: world catalog and validated per-world gravity defaults');

  // Engine default is Gaia's shipped gravity; an invalid value is refused.
  assert.equal(new SimulationEngine(FLAT).gravity, 700);
  assert.throws(() => new SimulationEngine(FLAT, 0, { gravity: NaN }), /gravity/);
  assert.throws(() => new SimulationEngine(FLAT, 0, { gravity: -5 }), /gravity/);

  // Chip In shot on flat ground: apex = 1 + v^2/2g (the launch lifts the ball 1 unit), airtime ~ 2v/g.
  const v = TUNING.powerups.chipLaunch;
  assert.equal(v, 300);
  const chip = gravity => {
    const engine = new SimulationEngine(FLAT, 0, gravity === undefined ? {} : { gravity });
    const player = engine.addPlayer('chip', 'Chip');
    player.armedPowerups = { chip: 1 };
    engine.launch('chip', 0, 0.2);
    let apex = 0, airtime = null;
    for (let tick = 1; tick <= 5000; tick++) {
      engine.step();
      apex = Math.max(apex, player.z);
      if (tick > 2 && player.z <= 0.5) { airtime = tick / 240; break; }
    }
    engine.dispose();
    return { apex, airtime };
  };
  const results = {};
  for (const [id, g] of [['gaia', 700], ['ares', 490], ['luna', 315]]) {
    const r = results[id] = chip(g);
    assert.ok(Math.abs(r.apex - (1 + (v * v) / (2 * g))) < 1.5, `${id}: apex ${r.apex} near ${(1 + (v * v) / (2 * g)).toFixed(2)}`);
    assert.ok(Math.abs(r.airtime - (2 * v) / g) < 0.02, `${id}: airtime ${r.airtime} near ${((2 * v) / g).toFixed(3)} s`);
  }
  assert.deepEqual(chip(), results.gaia, 'no gravity option behaves exactly like Gaia');
  assert.ok(results.luna.airtime > 2 * results.gaia.airtime, 'Luna chip stays up more than twice as long as on Gaia');
  console.log('PASS: chip shot apex and airtime follow each world\'s gravity');

  // Rolling friction does not depend on gravity (owner decision): a flat putt rolls the same distance on every world.
  const roll = gravity => {
    const engine = new SimulationEngine(FLAT, 0, { gravity });
    const player = engine.addPlayer('roll', 'Roll');
    engine.launch('roll', 0, 0.6);
    for (let i = 0; i < 12000 && player.moving; i++) engine.step();
    const x = player.x;
    engine.dispose();
    return x;
  };
  const gaiaRoll = roll(700);
  assert.ok(gaiaRoll > 50);
  assert.equal(roll(490), gaiaRoll);
  assert.equal(roll(315), gaiaRoll);
  console.log('PASS: flat rolls are identical across worlds');

  // Solver: solves at the requested gravity and records it; nonsense gravity is refused.
  const near = { tee: [0, 0], hole: [150, 0], tiles: [[-300, -300, 600, 600]], w: [] };
  const luna = solvePar(near, 0, { gravity: 315 });
  assert.equal(luna.gravity, 315);
  assert.equal(luna.status, 'route');
  assert.throws(() => assertWorldGravity(0), /gravity must be a finite number > 0/);
  assert.throws(() => assertWorldGravity('700'), /gravity must be a finite number > 0/);
  const cliOut = commands.runSolve([near], 0, 0, undefined, { world: 'ares' });
  assert.equal(cliOut.result.world, 'ares');
  assert.equal(cliOut.result.gravity, 490);
  assert.equal(commands.runSolve([near], 0, 0).result.gravity, 700, 'solve defaults to Gaia');
  assert.equal(commands.runSolve([near], 0, 0, undefined, { world: 'mars' }).code, 1);
  assert.equal(parseCliArguments(['solve', '0', '0', '--world', 'luna']).world, 'luna');
  assert.throws(() => parseCliArguments(['shot', '0', '0', '0', '1', '--world', 'luna']), /--world is supported by solve/);
  assert.throws(() => parseCliArguments(['solve', '0', '0', '--world']), /--world requires/);
  console.log('PASS: par solver and CLI solve per world');

  // Development world preview: staged, validated, stored per tab, never changes shipped values.
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, val) => store.set(k, val), removeItem: k => store.delete(k) };
  const p = preview.createWorldPreview({ storage });
  assert.equal(p.world, 'gaia');
  assert.equal(p.gravity, 700);
  assert.equal(p.active, false);
  p.setWorld('luna');
  assert.equal(p.gravity, 315);
  assert.equal(p.active, true);
  p.setGravity('luna', 280);
  assert.equal(p.gravity, 280);
  assert.equal(p.shipped('luna'), 315, 'shipped value untouched');
  assert.equal(worlds.worldGravity('luna'), 315);
  assert.throws(() => p.setGravity('luna', 9000), /Gravity must be/);
  assert.equal(p.gravity, 280, 'a rejected value changes nothing');
  const restored = preview.createWorldPreview({ storage });
  assert.equal(restored.world, 'luna');
  assert.equal(restored.gravity, 280, 'reload in the same tab keeps the staged preview');
  p.setGravity('luna', 315);
  assert.deepEqual(p.overrides, {}, 'setting the shipped value clears the override');
  assert.throws(() => p.importJson('{"version":1,"world":"mars","gravity":{}}'), /Unknown world/);
  assert.throws(() => p.importJson('{"version":1,"world":"ares","gravity":{"ares":-3}}'), /Gravity must be/);
  assert.equal(p.world, 'luna', 'a rejected import changes nothing');
  p.importJson(JSON.stringify({ version: 1, world: 'ares', gravity: { ares: 450 } }));
  assert.equal(p.gravity, 450);
  assert.equal(JSON.parse(p.exportJson()).gravity.ares, 450);
  p.reset();
  assert.equal(p.active, false);
  store.set(preview.WORLD_PREVIEW_STORAGE_KEY, '{"version":1,"world":"ares","gravity":{"ares":"heavy"}}');
  const cleaned = preview.createWorldPreview({ storage });
  assert.equal(cleaned.active, false, 'a bad stored preview is discarded');
  console.log('PASS: development world preview stages validated gravity without touching defaults');
})().catch(error => { console.error(error); process.exit(1); });
