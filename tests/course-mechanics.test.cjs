const assert = require('node:assert/strict');
(async () => {
  const { sweepCircleSegment, reflectMechanicVelocity, portalExit } = await import('../src/simulation/course-mechanics.js');
  const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} versus ${b}`);
  // A 1000-unit step cannot pass through a thin vertical face.
  const face = sweepCircleSegment({x:0,y:0},{x:1000,y:0},5,{x:100,y:-50},{x:100,y:50});
  near(face.t,0.095); near(face.normal.x,-1); near(face.normal.y,0);
  assert.equal(sweepCircleSegment({x:0,y:60},{x:200,y:0},5,{x:100,y:-50},{x:100,y:50}),null,'finite face does not behave as an infinite wall');
  const end = sweepCircleSegment({x:0,y:53},{x:200,y:0},5,{x:100,y:-50},{x:100,y:50});
  near(end.t,0.48); near(end.normal.x,-0.8); near(end.normal.y,0.6);
  const overlap = sweepCircleSegment({x:100,y:0},{x:1,y:0},5,{x:100,y:0},{x:100,y:0});
  assert.ok(Object.values(overlap.normal).every(Number.isFinite)); near(overlap.t,0);
  // A 45-degree face turns an eastward shot south; a kick strengthens that bank.
  const n={x:-Math.SQRT1_2,y:Math.SQRT1_2};
  const bank=reflectMechanicVelocity({x:100,y:0},n,1);
  near(bank.x,0);near(bank.y,100);
  const boost=reflectMechanicVelocity({x:100,y:0},n,1,50);
  assert.ok(Math.hypot(boost.x,boost.y)>100);
  assert.deepEqual(reflectMechanicVelocity({x:-10,y:0},{x:-1,y:0},1,50),{x:-10,y:0},'a separating ball gets no repeated kick');
  // Enter a west-facing portal eastward; emerge from a south-facing one southward.
  const exit=portalExit({x:120,y:0},{angle:Math.PI},{x:200,y:300,angle:Math.PI/2},25);
  near(exit.x,200);near(exit.y,325);near(exit.vx,0);near(exit.vy,120);
  console.log('Course mechanics math: swept faces/end caps, no tunneling, finite overlaps, diagonal banks, bouncer impulse and oriented portal speed preservation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
