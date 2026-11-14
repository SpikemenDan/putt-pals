const assert=require('node:assert/strict');
(async()=>{
  const {validateCourseMechanics,validCourseMechanic}=await import('../src/courses/mechanics.js');
  const {createMechanicChambers}=await import('../src/courses/mechanic-chambers.js');
  const {createMechanicChamberDocument}=await import('../tools/cli/export-mechanic-chambers.mjs');
  const {measureMechanics}=await import('../tools/cli/measure-mechanics.mjs');
  const {validateCourseDocument,parseCourseDocument,toSimulationCourses}=await import('../src/courses/document.js');
  const {checkGeometryIntegrity}=await import('../src/courses/integrity.js');
  const {courseMechanicForce,moveCourseSolids,applyCoursePortal}=await import('../src/simulation/course-mechanics.js');
  const {createPlayerState,applyShot}=await import('../src/shared/simulation.js');
  const {stepBall}=await import('../src/simulation/physics.js');
  const {TUNING}=await import('../src/shared/tuning.js');
  const THREE=await import('three');
  const {buildCourseMechanics}=await import('../src/render/course-mechanics.js');
  const {createWorldTransform}=await import('../src/render/transform.js');
  const chambers=createMechanicChambers();
  for(const c of Object.values(chambers))assert.deepEqual(validateCourseMechanics(c.mechanics),[]);
  const wedge=chambers.wedge.mechanics[0];
  for(const invalid of [{...wedge,extra:1},{...wedge,vertices:[[1,1],[2,2],[3,3]]},{...wedge,height:-1},{id:'bad',kind:'portal',a:[1,1,0],b:[1,1,0]},{id:'bad',kind:'fan',rect:[1,1,-1,4],direction:0}])assert.equal(validCourseMechanic(invalid),false);
  assert.ok(validateCourseMechanics([wedge,wedge]).length);
  assert.ok(validateCourseMechanics(Array(1)).length,'sparse mechanic arrays are invalid');
  assert.doesNotThrow(()=>checkGeometryIntegrity({geometry:{...chambers.wedge,mechanics:[null]}}),'integrity inspection tolerates invalid records for boundary reporting');
  assert.equal(validCourseMechanic({...wedge,vertices:Array(3)}),false,'sparse triangle data is invalid without throwing');
  assert.equal(validCourseMechanic({...wedge,vertices:[[1e200,0],[0,1],[1,0]]}),false,'coordinates must remain numerically safe for simulation/rendering');
  const document=createMechanicChamberDocument();assert.equal(validateCourseDocument(document).valid,true);
  const decoded=parseCourseDocument(JSON.stringify(document)),courses=toSimulationCourses(decoded);
  const {MAP_COUNT}=await import('../src/shared/map-count.js'),W=MAP_COUNT; // chambers are appended after the shipped maps (first chamber = wedge)
  assert.deepEqual(courses[W].mechanics,chambers.wedge.mechanics);
  courses[W].mechanics[0].vertices[0][0]=999;
  assert.equal(decoded.courses[W].geometry.mechanics[0].vertices[0][0],300,'adapters own their mechanics data');
  const invalidPortal=structuredClone(chambers.portal);invalidPortal.mechanics[0].b=[795,150,0];
  assert.ok(checkGeometryIntegrity({geometry:invalidPortal}).violations.length,'off-floor portal exit is rejected');
  const blockedPortal=structuredClone(chambers.portal);blockedPortal.w=[[590,170,20,30]];
  assert.ok(checkGeometryIntegrity({geometry:blockedPortal}).violations.length,'blocked portal exit is rejected');
  const report=measureMechanics();assert.equal(report.results.length,5);assert.ok(report.results.every(r=>r.verified&&r.margin>=1&&!r.strippedSunk&&r.strokes<=r.par));
  assert.deepEqual(report,require('./fixtures/course-mechanics/solutions.json'),'recorded proof evidence must reproduce under the current sources');
  // Absent mechanics and an empty list produce exactly the same baseline state.
  const run=list=>{const c={...chambers.wedge,mechanics:list},p=createPlayerState('baseline',0,{x:80,y:250,z:0});applyShot(p,0,.4);for(let t=0;t<2000&&p.moving;t++)stepBall(p,c,1/240,0);return p;};
  assert.deepEqual(run(undefined),run([]));
  const airborne={x:80,y:250,z:100,vx:2000,vy:0};const air=moveCourseSolids([wedge],airborne,.3,15,()=>0);
  assert.equal(air.hits.length,0);assert.equal(air.x,680,'airborne ball clears the wedge height');
  const fast={x:80,y:250,z:0,vx:2000,vy:0};assert.ok(moveCourseSolids([wedge],fast,.3,15,()=>0).hits.length,'fast grounded ball hits diagonal');
  const fan=chambers.fan.mechanics[0];
  assert.ok(courseMechanicForce([fan],{x:200,y:250,z:40},()=>20).x>0);
  assert.deepEqual(courseMechanicForce([fan],{x:200,y:250,z:200},()=>20),{x:0,y:0,z:0});
  const vortex=chambers.vortex.mechanics[0];
  const force=courseMechanicForce([vortex],{x:300,y:250,z:0},()=>0);
  assert.ok(Object.values(force).every(Number.isFinite));assert.ok(force.z>TUNING.gravity);
  const lifted=createPlayerState('lift',0,{x:300,y:250,z:0});lifted.moving=true;stepBall(lifted,chambers.vortex,1/240,0);assert.ok(lifted.z>0&&lifted.vz>0);
  const portal=chambers.portal.mechanics[0],p={x:200,y:250,z:10,vx:120,vy:0,vz:33};
  assert.equal(applyCoursePortal([portal],p,1/240,15,(x)=>x>400?50:0),portal.id);
  assert.ok(Math.abs(p.vx)<1e-8 && Math.abs(p.vy-120)<1e-8);assert.equal(p.z,60);assert.equal(p.vz,33);
  p.x=portal.b[0];p.y=portal.b[1];assert.equal(applyCoursePortal([portal],p,1/240,15,()=>50),null,'shared cooldown prevents pair bounce-back');
  const high={x:200,y:250,z:200,vx:120,vy:0,vz:0};assert.equal(applyCoursePortal([portal],high,1/240,15,()=>0),null,'portal respects entry height');
  const back={x:200,y:250,z:0,vx:-120,vy:0,vz:0};assert.equal(applyCoursePortal([portal],back,1/240,15,()=>0),null,'outward travel cannot enter the back of a portal');
  // Real Three.js geometry and resource ownership, without claiming WebGL pixels.
  for(const c of Object.values(chambers)) {
    const group=new THREE.Group(),solids=[];buildCourseMechanics({THREE,course:c,group,solids,transform:createWorldTransform()});
    assert.ok(group.children.length);let geometries=0,materials=0;
    group.traverse(o=>{if(o.geometry){geometries++;assert.ok(Object.values(o.geometry.attributes).every(a=>Array.from(a.array).every(Number.isFinite)));o.geometry.dispose();}if(o.material){materials++;o.material.dispose();}});
    assert.ok(geometries&&materials);assert.equal(solids.length,['wedge','bouncer'].includes(c.mechanics[0].kind)?1:0);
  }
  console.log('G1g integration: schema, owned roundtrip, clearance rejection, five robust/stripped proof shots, inactive parity, airborne solids/forces, vortex lift, portal height/cooldown and Three.js resources passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
