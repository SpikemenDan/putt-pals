// VIS-E #166: one Precipitation power-up shown per place (Rain, Snow, Dust Storm, Solar Wind; Lightning or Solar Bolt),
// and the Ares/Luna atmosphere, which is scenery only and never reaches physics.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

(async () => {
  const G = await import('../src/gameplay/index.js');
  const { courseWorld } = await import('../src/shared/worlds.js');
  const { GameModes } = await import('../src/shared/session.js');
  const { createCourseData } = await import('../src/courses/index.js');
  const { createPutt } = await import('../src/app/putt.js');
  const { SimulationEngine } = await import('../src/simulation/index.js');
  const { simulationSourceFiles } = await import('../tools/cli/provenance.mjs');
  const { createDisplay, DEFAULT_DISPLAY } = await import('../src/shared/display.js');
  const { aresGust, solarFlare, SOLAR_PERIOD, ATMOSPHERE_COUNTS } = await import('../src/render/atmosphere.js');
  const ids = pool => pool.map(e => e.id);

  // ---- one Precipitation power-up, shown per place (owner, 2026-11-12)
  const { definitions, rules } = createCourseData();
  const course = definitions[0];
  const frost = definitions.find(d => d.name === 'Frost Hollow');
  assert.deepEqual(G.coursePlace(course), { world: 'gaia', climate: 'warm' });
  assert.deepEqual(G.coursePlace(frost), { world: 'gaia', climate: 'cold' }, 'the snowy map is a cold biome');
  assert.deepEqual(G.coursePlace({ ...course, world: 'ares', climate: 'cold' }), { world: 'ares', climate: 'cold' });
  const names = place => [G.precipitationVariant(place).name, G.precipitationVariant(place).kind, G.lightningVariant(place).name];
  assert.deepEqual(names({ world: 'gaia', climate: 'warm' }), ['Rain', 'rain', 'Lightning']);
  assert.deepEqual(names({ world: 'gaia', climate: 'cold' }), ['Snow', 'snow', 'Lightning']);
  assert.deepEqual(names({ world: 'ares', climate: 'warm' }), ['Dust Storm', 'rain', 'Lightning'], 'Ares: dust storm with the wet effect; Martian dust lightning');
  assert.deepEqual(names({ world: 'ares', climate: 'cold' }), ['Dust Storm', 'rain', 'Lightning']);
  assert.deepEqual(names({ world: 'luna', climate: 'warm' }), ['Solar Wind', 'rain', 'Solar Bolt']);
  assert.throws(() => G.precipitationVariant({ world: 'mars' }), /Unknown world/);
  assert.throws(() => G.precipitationVariant({ world: 'gaia', climate: 'tepid' }), /Unknown climate/);
  assert.equal(G.hazardVariant('rain', { world: 'gaia', climate: 'cold' }).name, 'Rain', 'a record keeps its kind on Gaia');
  assert.equal(G.hazardVariant('snow', { world: 'luna' }).look, 'solar', 'off Gaia either weather record looks like the world');
  assert.equal(G.hazardVariant('tornado', { world: 'luna' }).name, 'Tornado', 'other hazards are unchanged');
  assert.equal(G.itemName('rain'), 'Precipitation'); assert.equal(G.itemName('snow'), 'Precipitation'); assert.equal(G.itemName('mag'), 'Hole Magnet');

  // Pools: one Precipitation entry on every world; solo and No Power-Ups still follow the catalog flags.
  const full = G.spawnPool();
  for (const world of ['gaia', 'ares', 'luna']) {
    const party = G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 3, place: { world, climate: 'warm' } });
    assert.deepEqual(ids(party.pool), ids(full).filter(id => id !== 'snow'), world + ' offers Precipitation (one entry) and every other power-up');
    assert.equal(party.place.world, world);
    assert.deepEqual(ids(G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 1, place: { world, climate: 'warm' } }).pool), ids(G.spawnPool({ solo: true })), world + ' solo pool is the self-only pool');
    assert.deepEqual(G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 3, powerups: false, place: { world, climate: 'warm' } }).pool, [], world + ' No Power-Ups is empty');
  }

  // Using the item: it becomes the place's weather and keeps the same effect kinds; Lightning stays Lightning.
  const puttAt = (place, inventory) => createPutt({
    definition: course, rule: rules[0].putts[0], puttIndex: 0, id: 'p1', name: 'P1', playing: true, timed: false,
    roundStartTime: 0, limitSeconds: 0, roomNow: () => 0, random: () => 0.5, now: () => 0, inventory,
    powerups: G.powerupPolicy({ mode: GameModes.STANDARD, rosterSize: 3, place }),
  });
  for (const [place, item, kind, toast] of [
    [{ world: 'gaia', climate: 'warm' }, 'rain', 'rain', /Rain wets/],
    [{ world: 'gaia', climate: 'cold' }, 'rain', 'snow', /Snow ices/],
    [{ world: 'gaia', climate: 'warm' }, 'snow', 'rain', /Rain wets/],
    [{ world: 'ares', climate: 'warm' }, 'rain', 'rain', /dust storm/],
    [{ world: 'luna', climate: 'warm' }, 'snow', 'rain', /solar wind/],
    [{ world: 'luna', climate: 'warm' }, 'lightning', 'lightning', /solar flare bolt/],
  ]) {
    const p = puttAt(place, [item, 'mag']);
    const out = p.useItem(0, 0);
    assert.equal(out.globalHazard?.kind, kind, `${item} on ${place.world}/${place.climate} activates ${kind}`);
    assert.ok(out.toasts.some(t => toast.test(t)), `${item} on ${place.world} names its weather: ${out.toasts}`);
    assert.deepEqual(p.player.inventory, [item, 'mag'], 'the slot is spent only when the room accepts it');
    assert.equal(p.consumeItem(kind), true, 'accepting the resolved kind spends the Precipitation item');
    assert.deepEqual(p.player.inventory, ['mag']);
    p.dispose();
  }

  // ---- atmosphere never touches physics
  const closure = simulationSourceFiles();
  for (const file of ['src/render/atmosphere.js', 'src/gameplay/world-weather.js', 'src/shared/display.js', 'src/shared/worlds.js']) {
    assert.ok(!closure.includes(file), file + ' is outside the simulation import closure (fingerprint unchanged)');
  }
  // The world tag and the environment display settings change nothing in a simulated shot (gravity is chosen by the app, not the course data).
  const shot = definition => {
    const engine = new SimulationEngine(definition, 0, { hazardTime: 0 });
    const player = engine.addPlayer('a', 'A', 0);
    engine.launch('a', 0.4, 0.7);
    const path = [];
    for (let i = 0; i < 2000 && player.moving && player.mode !== 'sunk'; i++) { engine.step(); path.push(player.x, player.y, player.z); }
    engine.dispose();
    return path;
  };
  const baseline = shot(course);
  for (const world of ['ares', 'luna']) assert.deepEqual(shot({ ...course, world }), baseline, world + ' scenery tag leaves the trajectory bit-identical');
  assert.equal(courseWorld({ ...course, world: 'ares' }), 'ares');
  assert.equal(courseWorld(course), 'gaia');
  assert.equal(courseWorld({ world: 'mars' }), 'gaia');

  // ---- deterministic gusts and flares
  for (let t = 0; t < 200; t += 0.37) {
    const g = aresGust(t), f = solarFlare(t);
    assert.ok(g >= 0.25 - 1e-9 && g <= 1 + 1e-9 && f >= 0 && f <= 1);
    assert.equal(aresGust(t), g); assert.equal(solarFlare(t), f);
  }
  const flaring = Array.from({ length: 20 }, (_, p) => Array.from({ length: 220 }, (_, k) => solarFlare(p * SOLAR_PERIOD + k * 0.05)).some(v => v > 0.9)).filter(Boolean).length;
  assert.ok(flaring >= 8 && flaring < 20, 'most solar periods carry one flare, some are quiet');

  // ---- renderer: scenery follows the course's world; density and strength come from DISPLAY.environment
  const THREE = await import('three');
  const { createGameRenderer, createGameView } = await import('../src/render/index.js');
  const dom = new JSDOM('<canvas></canvas>');
  const canvas = dom.window.document.querySelector('canvas');
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
  const backend = { capabilities: { getMaxAnisotropy: () => 4 }, shadowMap: {}, info: { memory: { geometries: 0, textures: 0 }, programs: [], render: { calls: 0, triangles: 0 } }, setSize() {}, setPixelRatio() {}, render() {}, dispose() {} };
  const display = structuredClone(DEFAULT_DISPLAY);
  const r = createGameRenderer({ THREE, canvas, random: () => 0.37, createWebGLRenderer: () => backend, display });
  const view = createGameView({ renderer: r });
  const local = Object.freeze({ x: course.tee[0], y: course.tee[1], z: 0, vx: 0, vy: 0, moving: false, mode: 'play', color: 0 });
  const frame = s => view.frame({ now: s * 1000, dt: 1 / 60, local });
  const C = ATMOSPHERE_COUNTS;

  view.setCourse(course, 0); frame(1);
  assert.equal(r.sceneryWorld, 'gaia');
  assert.deepEqual(r.atmosphere.drawn, { aresStreaks: 0, aresDust: 0, lunaDust: 0, lunaSolar: 0 }, 'Gaia draws no Ares or Luna scenery');
  view.setCourse({ ...course, world: 'ares' }, 0); frame(2);
  assert.equal(r.sceneryWorld, 'ares');
  assert.deepEqual(r.atmosphere.drawn, { aresStreaks: C.aresStreaks, aresDust: C.aresDust, lunaDust: 0, lunaSolar: 0 }, 'an Ares course blows wind');
  assert.ok(r.atmosphere.wash > 0, 'Ares adds its rust haze');
  display.environment.aresWindDensity = 2; frame(2.1);
  assert.equal(r.atmosphere.drawn.aresStreaks, C.aresStreaks * 2, 'density doubles the streaks live');
  display.environment.aresWind = 0; frame(2.2);
  assert.equal(r.atmosphere.drawn.aresStreaks, 0, 'strength 0 hides the wind');
  assert.equal(r.atmosphere.wash, 0);
  Object.assign(display.environment, DEFAULT_DISPLAY.environment);

  view.setCourse({ ...course, world: 'luna' }, 0);
  let maxFlare = 0, maxWash = 0;
  for (let t = 0; t < 4 * SOLAR_PERIOD; t += 0.1) { frame(t); maxFlare = Math.max(maxFlare, r.atmosphere.flare); maxWash = Math.max(maxWash, r.atmosphere.wash); }
  assert.deepEqual(r.atmosphere.drawn, { aresStreaks: 0, aresDust: 0, lunaDust: C.lunaDust, lunaSolar: C.lunaSolar }, 'a Luna course floats dust and sun particles');
  assert.ok(maxFlare > 0.9 && maxWash > 0.1, 'solar flares wash the view');
  display.environment.lunaSolar = 0;
  for (let t = 0; t < 2 * SOLAR_PERIOD; t += 0.1) { frame(t); assert.equal(r.atmosphere.wash, 0, 'solar strength 0 removes the flare wash'); }
  Object.assign(display.environment, DEFAULT_DISPLAY.environment);

  // Development preview: another world's scenery on this course; null returns to the course's own world.
  view.setCourse(course, 0);
  r.setSceneryWorld('luna'); frame(3);
  assert.equal(r.sceneryWorld, 'luna');
  assert.ok(r.atmosphere.drawn.lunaDust > 0);
  view.setCourse(definitions[1], 0);
  assert.equal(r.sceneryWorld, 'luna', 'the preview survives a course swap');
  r.setSceneryWorld(null); frame(3.1);
  assert.equal(r.sceneryWorld, 'gaia');
  assert.equal(r.atmosphere.drawn.lunaDust, 0);
  assert.throws(() => r.setSceneryWorld('mars'), /Unknown world/);

  // Gaia palette weather (snow, storm) is not drawn on another world.
  if (frost) {
    view.setCourse(frost, 0);
    const snowLayer = () => r.scene.children.flatMap(o => o.isGroup ? o.children : []).find(o => o.isPoints && o.material.fragmentShader?.includes('.68,.93'));
    assert.ok(snowLayer().visible, 'Frost Hollow snows on Gaia');
    r.setSceneryWorld('ares');
    assert.ok(!snowLayer().visible, 'no snow on Ares');
    r.setSceneryWorld(null);
    assert.ok(snowLayer().visible);
  }
  // Gameplay weather takes the world's look: the same Rain record is rust dust on Ares, gold streaks on Luna; Lightning is cyan on Luna.
  const hazardGroup = () => { let g = null; r.scene.traverse(o => { if (o.name === 'global-hazards') g = o; }); return g; };
  const shownColors = () => { const out = new Set(); hazardGroup().traverse(o => { if (o.visible && o.material?.uniforms?.uColor && o.material.uniforms.uFall) out.add(o.material.uniforms.uColor.value.getHex()); }); return out; };
  const rainRecord = { id: 'h1', kind: 'rain', owner: 'p1', startTime: 0, endTime: 30, seed: 7 };
  const hazardFrame = () => view.frame({ now: 5000, dt: 1 / 60, hazardTime: 5, local, globalHazards: [rainRecord] });
  view.setCourse(course, 0);
  for (const [world, color] of [[null, 0x4aa3ff], ['ares', 0xc9774e], ['luna', 0xffd35a]]) {
    r.setSceneryWorld(world); hazardFrame();
    const colors = shownColors();
    assert.ok(colors.has(color) && colors.size === 1, `${world || 'gaia'} draws its own precipitation look (${[...colors].map(c => c.toString(16))})`);
  }
  const boltColors = world => {
    r.setSceneryWorld(world);
    view.frame({ now: 6000, dt: 1 / 60, hazardTime: 5.1, local, globalHazards: [{ id: 'h2', kind: 'lightning', owner: 'p2', targetId: 'p1', startTime: 5, endTime: 7, seed: 3, at: { x: course.tee[0], y: course.tee[1], z: 0 } }] });
    const out = new Set(); hazardGroup().traverse(o => { if (o.material?.isMeshBasicMaterial) out.add(o.material.color.getHex()); });
    return out;
  };
  assert.ok(boltColors('gaia').has(0xfff36b) && !boltColors('gaia').has(0x9be8ff), 'Gaia lightning is yellow');
  assert.ok(boltColors('ares').has(0xfff36b), 'Ares lightning is the same as Gaia');
  assert.ok(boltColors('luna').has(0x9be8ff) && boltColors('luna').has(0xff9f1c), 'Luna draws a cyan Solar Bolt with an orange flare');
  r.setSceneryWorld(null);
  assert.doesNotThrow(() => createDisplay({ environment: { aresWind: 2, lunaDustDensity: 0 } }));
  assert.throws(() => createDisplay({ environment: { aresWind: 3 } }), /environment.aresWind/);
  r.dispose();
  console.log('VIS-E world environment: per-place weather variants, physics isolation, Ares/Luna scenery and display settings checks passed.');
})().catch(error => { console.error(error); process.exit(1); });
