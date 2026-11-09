const assert = require('node:assert/strict');
const evidence = require('./fixtures/cup-capture/par-route-gaps.json');
(async () => {
  const { createCourseData } = await import('../src/courses/index.js');
  const { createParSolver } = await import('../tools/cli/par-solver.mjs');
  const { hashSimulationSources } = await import('../tools/cli/provenance.mjs');
  const { resolvePuttCourse } = await import('../src/simulation/engine.js');
  assert.equal(evidence.simulationSha256, hashSimulationSources(), 'route evidence must match current physics');
  assert.deepEqual(evidence.results.map(r => [r.map,r.putt]), [[19,0],[19,2]]);
  const { definitions, rules } = createCourseData();
  for (const result of evidence.results) {
    assert.equal(result.status, 'route');
    assert.equal(result.strokes, 2);
    assert.ok(result.strokes <= result.par && result.par >= 2 && result.par <= 6);
    assert.ok(result.strokes <= rules[result.map].putts[result.putt].par, 'route also meets the shipped par');
    const solver = createParSolver(definitions[result.map], result.putt, {full:true});
    const course = resolvePuttCourse(definitions[result.map], result.putt);
    const start = {x:course.tee[0],y:course.tee[1],z:0};
    let from = start;
    const route = result.route.map(shot => {
      const to = shot.to === 'cup' ? 'cup' : {x:shot.to[0],y:shot.to[1]};
      const step = {from,angle:shot.deg*Math.PI/180,power:shot.power,to}; from=to;
      return step;
    });
    assert.ok(solver.verifyRoute(route), `${result.map}/${result.putt}: replayed route and nine finishing perturbations must sink`);
    assert.ok(solver.marginOf(route,start) >= 1, 'every perturbed first-shot landing must permit a finishing route');
  }
  console.log('PASS: Grand Finale 19/0 and 19/2 have independently replayed robust two-stroke routes within par.');
})().catch(error => {console.error(error);process.exitCode=1;});
