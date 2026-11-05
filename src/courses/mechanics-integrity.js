import { validCourseMechanic, distanceToMechanicSolid } from './mechanics.js';
import { rectCovered, pointRectDistance, overlapArea } from './geometry.js';
import { TUNING } from '../shared/tuning.js';
import { BALL_RADIUS } from '../shared/constants.js';

/** Conservative footprint/exit checks for optional G1g course records. */
export function checkMechanicIntegrity(g, putts, floorAt) {
  const errors=[], cfg=TUNING.courseMechanics, walls=g.w || [];
  const add=(i,reason)=>errors.push({elements:[`mechanics[${i}]`],message:reason});
  const clear=(p,r)=>rectCovered([p[0]-r,p[1]-r,r*2,r*2],g.tiles || []) && !(g.pit || []).some(rect=>pointRectDistance(p,rect)<r) && walls.every(rect=>pointRectDistance(p,rect)>=r);
  (Array.isArray(g.mechanics) ? g.mechanics : []).forEach((m,i)=>{
    if(!validCourseMechanic(m))return;
    if(m.kind==='portal') {
      for(const p of [m.a,m.b]) {
        const offset=cfg.portalRadius+BALL_RADIUS+cfg.portalClearance;
        const exit=[p[0]+Math.cos(p[2])*offset,p[1]+Math.sin(p[2])*offset];
        if(!clear(p,cfg.portalRadius+BALL_RADIUS) || !clear(exit,BALL_RADIUS)) add(i,'portal entry or outward exit lacks floor/wall clearance');
        const samples=[p,exit,[exit[0]-BALL_RADIUS,exit[1]],[exit[0]+BALL_RADIUS,exit[1]],[exit[0],exit[1]-BALL_RADIUS],[exit[0],exit[1]+BALL_RADIUS]].map(p=>floorAt(...p));
        if(Math.max(...samples)-Math.min(...samples)>1) add(i,'portal entry and exit must have level supported footprints');
      }
    }
    if(!['wedge','bouncer'].includes(m.kind))return;
    const vertices=m.kind==='wedge'?m.vertices:[m.a,m.b];
    const xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]);
    const box=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
    // A one-unit thickness also checks axis-aligned bouncer rails.
    const footprint=[box[0]-.5,box[1]-.5,Math.max(1,box[2])+1,Math.max(1,box[3])+1];
    if(!rectCovered(footprint,g.tiles || []) || (g.pit || []).some(p=>overlapArea(footprint,p)>0))add(i,'solid bounding footprint must be entirely on playable ground');
    if(walls.some(w=>overlapArea(footprint,w)>.5))add(i,'solid bounding footprint intersects a wall');
    const heights=vertices.map(p=>floorAt(...p));
    if(Math.max(...heights)-Math.min(...heights)>1)add(i,'solid must stand on level ground');
    for(const [j,p] of putts.entries()) for(const key of ['tee','hole']) {
      if(!Array.isArray(p?.[key]) || p[key].length!==2 || !p[key].every(Number.isFinite))continue;
      if(distanceToMechanicSolid(p[key],m)<(key==='tee'?BALL_RADIUS*2:(p.cupRadius || 15)+BALL_RADIUS))add(i,`${key} for putt ${j} lacks solid clearance`);
    }
  });
  const solids=(Array.isArray(g.mechanics) ? g.mechanics : []).filter(m=>validCourseMechanic(m) && ['wedge','bouncer'].includes(m.kind));
  // Portal exits must also be clear of the new solids, not just legacy walls.
  (Array.isArray(g.mechanics) ? g.mechanics : []).forEach((m,i)=>{if(!validCourseMechanic(m) || m.kind!=='portal')return;
    for(const p of [m.a,m.b]) {
      const offset=cfg.portalRadius+BALL_RADIUS+cfg.portalClearance,exit=[p[0]+Math.cos(p[2])*offset,p[1]+Math.sin(p[2])*offset];
      for(const solid of solids) if(distanceToMechanicSolid(exit,solid)<BALL_RADIUS)add(i,'portal exit intersects a mechanic solid');
    }
  });
  // Conservative solid bounds prevent interpenetrating authored props.
  const bounds=m=>{const v=m.vertices || [m.a,m.b],xs=v.map(p=>p[0]),ys=v.map(p=>p[1]);return [Math.min(...xs)-.5,Math.min(...ys)-.5,Math.max(1,Math.max(...xs)-Math.min(...xs))+1,Math.max(1,Math.max(...ys)-Math.min(...ys))+1];};
  for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++)if(overlapArea(bounds(solids[i]),bounds(solids[j]))>.5)errors.push({elements:[solids[i].id,solids[j].id],message:'mechanic solid bounding footprints overlap'});
  return errors;
}
