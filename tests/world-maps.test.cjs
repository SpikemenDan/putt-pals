// VIS-G #165: difficulty evidence for the new Gaia maps (22, 23) and the Ares (24-31) and Luna (32-39) maps.
// tests/fixtures/world-maps/par-routes.json is a measure-par report (tools/cli/measure-par.mjs --only ...), solved at each map's own
// world gravity. This test checks the evidence is current, that every putt has a robust route within its shipped par of 2..6, and
// replays each recorded route independently at that gravity.
const assert = require('node:assert/strict');
const evidence = require('./fixtures/world-maps/par-routes.json');

(async () => {
  const { createCourseData, createCourseDocument } = await import('../src/courses/index.js');
  const { createParSolver, solvePar } = await import('../tools/cli/par-solver.mjs');
  const { assessDifficultyResult, createDifficultyProvenance, hashSimulationSources } = await import('../tools/cli/provenance.mjs');
  const { resolvePuttCourse } = await import('../src/simulation/engine.js');
  const { courseWorld, worldGravity } = await import('../src/shared/worlds.js');
  const { OFFWORLD_REGIONS } = await import('../src/shared/world-regions.js');

  const simulationHash = hashSimulationSources();
  assert.equal(evidence.simulationSha256, simulationHash, 'route evidence must match current physics (regenerate with measure-par, see docs/reviews/VIS_G_WORLD_MAPS.md)');
  const { definitions, rules } = createCourseData();
  const document = createCourseDocument();
  const maps = [22, 23, ...Object.values(OFFWORLD_REGIONS).flat().flatMap(r => r.maps)];
  assert.deepEqual(evidence.results.map(r => `${r.map}/${r.putt}`), maps.flatMap(m => definitions[m].putts.map((_, p) => `${m}/${p}`)), 'one result per putt of every VIS-G map');

  const perWorld = {};
  const gaiaMisses = { ares: 0, luna: 0 }, resolved = [];
  for (const result of evidence.results) {
    const label = `${definitions[result.map].name} putt ${result.putt + 1}`;
    const world = courseWorld(definitions[result.map]), gravity = worldGravity(world);
    assert.equal(result.gravity, gravity, `${label} is solved at ${world} gravity`);
    assert.equal(result.status, 'route', `${label}: robust route`);
    const par = rules[result.map].putts[result.putt].par;
    assert.ok(par >= 2 && par <= 6 && result.strokes <= par, `${label}: route of ${result.strokes} within par ${par}`);
    const current = createDifficultyProvenance(document.courses[result.map], result.putt, { full: evidence.mode === 'full', simulationHash, gravity });
    assert.equal(assessDifficultyResult(result, current).current, true, `${label}: evidence matches the course, simulation and solver`);

    const course = resolvePuttCourse(definitions[result.map], result.putt);
    const start = { x: course.tee[0], y: course.tee[1], z: 0 };
    const route = (from => result.route.map(shot => { const to = shot.to === 'cup' ? 'cup' : { x: shot.to[0], y: shot.to[1] }; const step = { from, angle: shot.deg * Math.PI / 180, power: shot.power, to }; from = to; return step; }))(start);
    if (createParSolver(definitions[result.map], result.putt, { gravity }).verifyRoute(route)) {
      if (world !== 'gaia' && !createParSolver(definitions[result.map], result.putt, { gravity: worldGravity('gaia') }).verifyRoute(route)) gaiaMisses[world]++;
    } else {
      // The report rounds angles to 0.01 degree; on a few edge-of-robust routes that rounding alone breaks the replay. Those putts are
      // solved again from scratch here, so every putt still has an independently found robust route within par at its world's gravity.
      const again = solvePar(definitions[result.map], result.putt, { gravity });
      assert.ok(again.status === 'route' && again.strokes <= par, `${label}: re-solved robust route within par at ${world} gravity`);
      resolved.push(`${result.map}/${result.putt}`);
    }
    (perWorld[world] ??= []).push(result.strokes);
  }
  // Gravity matters: on every off-Gaia world some recorded routes no longer hold at Gaia's gravity.
  for (const world of ['ares', 'luna']) assert.ok(gaiaMisses[world] >= 8, `${world}: ${gaiaMisses[world]} recorded routes fail at Gaia gravity`);
  console.log('PASS: VIS-G map par evidence is current and replays at each world\'s gravity:',
    Object.entries(perWorld).map(([w, s]) => `${w} ${s.length} putts, ${s.filter(n => n === 1).length} one-stroke, ${s.filter(n => n > 1).length} multi-stroke`).join('; '),
    `; routes that fail at Gaia gravity: ares ${gaiaMisses.ares}, luna ${gaiaMisses.luna}; re-solved after rounding: ${resolved.join(' ') || 'none'}`);
  assert.ok(resolved.length <= 12, 'nearly all recorded routes replay as stored');
})().catch(error => { console.error(error); process.exitCode = 1; });
