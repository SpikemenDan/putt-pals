#!/usr/bin/env node
/** Replays explicit mechanic proof routes through SV1; writes only with --out. */
import fs from 'node:fs';
import { MECHANIC_PROOF_SHOTS } from '../../src/courses/mechanic-chambers.js';
export { MECHANIC_PROOF_SHOTS };
import { createMechanicChamberDocument } from './export-mechanic-chambers.mjs';
import { createParSolver, PAR_SOLVER_CONFIG } from './par-solver.mjs';
import { createDifficultyProvenance, hashSimulationSources } from './provenance.mjs';
import { toSimulationCourses } from '../../src/courses/document.js';
import { SimulationEngine } from '../../src/simulation/engine.js';
export function measureMechanics() {
  const document=createMechanicChamberDocument(),courses=toSimulationCourses(document),simulationSha256=hashSimulationSources();
  const results=[];
  for(const [kind,shot] of Object.entries(MECHANIC_PROOF_SHOTS)) {
    const map=document.courses.findIndex(c=>c.id==='g1g-'+kind),course=courses[map];
    const solver=createParSolver(course,0),engine=new SimulationEngine(course),p=engine.addPlayer('proof','Proof');
    const start={x:p.x,y:p.y,z:p.z};engine.dispose();
    const route=[{from:start,angle:shot.deg*Math.PI/180,power:shot.power,to:'cup'}];
    const verified=solver.verifyRoute(route),margin=solver.marginOf(route,start);
    const stripped=new SimulationEngine({...course,mechanics:[]}),ball=stripped.addPlayer('stripped','Stripped');stripped.launch('stripped',route[0].angle,shot.power);
    for(let t=0;t<PAR_SOLVER_CONFIG.trialTicks && ball.moving;t++)stripped.step();
    const strippedSunk=ball.mode==='sunk';stripped.dispose();
    if(!verified || margin<1 || strippedSunk)throw new Error(`${kind}: intended robust route or stripped comparison failed`);
    results.push({kind,map,putt:0,par:document.courses[map].putts[0].par,strokes:1,shot,verified,margin,strippedSunk,
      provenance:createDifficultyProvenance(document.courses[map],0)});
  }
  return {schemaVersion:1,method:'SV1 verification of explicit mechanic proof shots; nine perturbations; stripped counterfactual',simulationSha256,results};
}
if(process.argv[1] && import.meta.url === new URL(process.argv[1],'file:').href){
  const report=measureMechanics(),out=process.argv.indexOf('--out');
  if(out>=0){if(!process.argv[out+1])throw Error('--out requires a path');fs.writeFileSync(process.argv[out+1],JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
}
