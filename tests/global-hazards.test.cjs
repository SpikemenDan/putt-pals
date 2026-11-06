const assert = require('node:assert/strict');
(async () => {
  const H = await import('../src/gameplay/global-hazards.js');
  const { TUNING } = await import('../src/shared/tuning.js');
  const { stepBall } = await import('../src/simulation/physics.js');
  const { createPlayerState, applyShot } = await import('../src/shared/simulation.js');
  const context = { owner: 'p1', roundNumber: 1, map: 0, putt: 0, now: 0, sequence: 1, seed: 123 };
  const make = kind => H.createGlobalHazard([], { kind, ...(kind === 'wind' ? { direction: Math.PI / 2 } : {}), ...(kind === 'lightning' ? { targetId: 'p2' } : {}), ...(['tornado', 'hurricane'].includes(kind) ? { x: 40, y: -30 } : {}) }, context)[0];
  for (const command of [{kind:'wind',direction:NaN},{kind:'wind',direction:4},{kind:'lightning',targetId:''},{kind:'rain',extra:1},{kind:'unknown'},{kind:'tornado'},{kind:'tornado',x:1},{kind:'hurricane',x:NaN,y:1},{kind:'hurricane',x:1,y:2e6}]) assert.equal(H.validGlobalHazardCommand(command), false);
  const rain = make('rain'), snow = make('snow');
  assert.deepEqual(H.createGlobalHazard([rain], {kind:'snow'}, {...context,sequence:2}).map(h=>h.kind), ['snow']);
  for (const now of [-1, rain.endTime]) assert.deepEqual(H.activeGlobalHazards([rain], {...context,now}), []);
  assert.equal(H.activeGlobalHazards([rain], {...context,now:0}).length, 1);
  assert.deepEqual(H.activeGlobalHazards([rain], {...context,putt:1,now:1}), []);
  const bounds = [-500,-500,500,500];
  for (const kind of ['tornado','hurricane']) {
    const record = make(kind), center = H.globalHazardCenter(record, 1, bounds);
    assert.deepEqual(center, H.globalHazardCenter(structuredClone(record), 1, bounds));
    const force = H.evaluateGlobalHazards([record], 1, {x:center.x+10,y:center.y}, bounds);
    assert.ok(kind === 'tornado' ? force.ax > 0 && force.az > 0 : force.ax < 0 && force.az === 0);
    assert.ok(Object.values(H.evaluateGlobalHazards([record], 1, center, bounds)).every(Number.isFinite));
  }
  // placed: starts at the chosen spot, wanders at most the roam radius, stays in the putt even when placed outside it
  const placed = make('hurricane');
  assert.deepEqual(H.globalHazardCenter(placed, 0, bounds), {x:40,y:-30});
  const inset = TUNING.globalHazards.roamInset * 1000;
  for (let t = 0; t < placed.endTime; t += 0.7) { const c = H.globalHazardCenter(placed, t, bounds); assert.ok(Math.hypot(c.x - 40, c.y + 30) <= TUNING.globalHazards.roamRadius * 3, 'stays near where it was placed'); }
  const outside = H.globalHazardCenter({...placed,x:-9000,y:9000}, 3, bounds);
  assert.ok(outside.x >= -500 + inset - 1e-9 && outside.y <= 500 - inset + 1e-9, 'a spot outside the putt is pulled inside its bounds');
  // the gust rises and falls over its own, longer lifetime
  const gust = make('wind');
  assert.equal(gust.endTime, TUNING.globalHazards.windDurationSeconds);
  assert.equal(H.gustStrength(gust, -1), 0); assert.equal(H.gustStrength(gust, gust.endTime), 0);
  assert.ok(Math.abs(H.gustStrength(gust, gust.endTime / 2) - 1) < 1e-12 && H.gustStrength(gust, 1) < H.gustStrength(gust, 5));
  // walls never block the wind's push, but a ball held against one can rest and be played
  const walled = {w:[[100,-200,12,400]]}, peak = gust.endTime / 2, east = {...gust,direction:0};
  assert.equal(H.rayToWall(walled,0,0,1,0,500),100); assert.equal(H.rayToWall(walled,0,0,1,0,50),Infinity);
  assert.equal(H.rayToWall(walled,0,300,1,0,500),Infinity); assert.equal(H.rayToWall(walled,105,0,1,0,500),0);
  assert.equal(H.hazardHoldsBall([east],peak,{x:117,y:0},bounds,walled),true,'right behind a wall the ball is still blown');
  assert.equal(H.hazardHoldsBall([east],peak,{x:96,y:0},bounds,walled),false,'a ball pinned against a wall can rest');
  assert.equal(H.hazardHoldsBall([east],0.2,{x:200,y:0},bounds,walled),false,'too weak to move a ball yet');
  assert.equal(H.hazardHoldsBall([make('rain')],1,{x:200,y:0},bounds,walled),false,'rain does not move a ball');
  const strike = make('lightning');
  assert.equal(H.lightningImpulse(strike,'p1'), null);
  assert.deepEqual(H.lightningImpulse(strike,'p2'), H.lightningImpulse(structuredClone(strike),'p2'));
  const { createPutt } = await import('../src/app/putt.js');
  let roomTime = 0;
  const options = {definition:{tiles:[[-100,-100,1200,600]],tee:[0,0],hole:[1000,0],w:[],cup:15},rule:{par:3,penalty:2},puttIndex:0,id:'p2',name:'Target',playing:true,timed:false,roundStartTime:0,limitSeconds:0,roomNow:()=>roomTime,now:()=>0};
  const target = createPutt(options);
  assert.equal(target.setGlobalHazards([strike]).length,1);
  const velocity = [target.player.vx,target.player.vy];
  assert.equal(target.setGlobalHazards(structuredClone([strike])).length,0,'snapshot replay does not strike twice');
  assert.deepEqual([target.player.vx,target.player.vy],velocity);
  const opponent = createPutt({...options,id:'p3'});
  assert.equal(opponent.setGlobalHazards([strike]).length,0,'only the selected opponent receives Lightning');
  roomTime=1000;
  const reconnect = createPutt(options);
  assert.equal(reconnect.setGlobalHazards([strike]).length,0,'reconnecting after the delivery window does not replay a missed strike');
  target.dispose(); opponent.dispose(); reconnect.dispose();
  const course = {hole:[5000,5000],tee:[0,0],tiles:[[-6000,-6000,12000,12000]],w:[],cup:15};
  const tornado = make('tornado'), center = H.globalHazardCenter(tornado,1,bounds);
  const lifted = createPlayerState('Lift',0,{x:center.x,y:center.y,z:0});
  lifted.globalHazards=[tornado]; lifted.globalHazardBounds=bounds; lifted.moving=true;
  stepBall(lifted,course,1/240,1);
  assert.ok(lifted.z > 0 && lifted.vz > 0,'Tornado overcomes gravity and lifts a grounded ball');
  const roll = hazards => {
    const p = createPlayerState('Probe',0,{x:0,y:0,z:0});
    if (hazards !== undefined) p.globalHazards = hazards;
    p.globalHazardBounds = bounds; applyShot(p,0,1,200);
    for(let i=0;i<400 && p.moving;i++) stepBall(p,course,1/240,1);
    return [p.x,p.y,p.vx,p.vy];
  };
  const baseline = roll();
  assert.deepEqual(roll([]), baseline, 'inactive hazards preserve exact trajectories');
  assert.ok(roll([rain])[0] > baseline[0], 'Rain extends the roll');
  assert.ok(roll([snow])[0] > roll([rain])[0], 'Snow is ice-like, slipperier than Rain');
  assert.ok(roll([make('wind')])[1] > baseline[1], 'selected Wind direction moves the ball south');
  const { bindRoomSession } = await import('../src/network/session.js');
  let receive;
  const state = {phase:'play',hostId:'p1',mode:'tournament',powerups:true,roundNumber:1,mapIndex:0,puttIndex:0,roundStartTime:0,roster:['p1','p2'],players:{p1:{connected:true},p2:{connected:true}}};
  const bridge = bindRoomSession({isHost:true,peerId:'p1',now:()=>1000,localNow:()=>1000,send(){},subscribe(fn){receive=fn;return ()=>{};}},
    {getSnapshot:()=>state,send(){},subscribe:()=>()=>{}}, {clock:{setTimeout:()=>1,clearTimeout(){}}});
  receive({type:'command',senderId:'p2',payload:{type:'JOIN_ROOM',name:'Guest'}});
  receive({type:'command',senderId:'p2',payload:{type:'ACTIVATE_HAZARD',kind:'wind',direction:0}});
  assert.equal(bridge.globalHazards().length,1,'verified guest activation passes the command envelope boundary');
  assert.equal(bridge.globalHazards()[0].owner,'p2');
  state.powerups=false;
  receive({type:'command',senderId:'p2',payload:{type:'ACTIVATE_HAZARD',kind:'rain'}});
  assert.deepEqual(bridge.globalHazards(),[],'No Power-Ups rejects activations and clears active records');
  bridge();
  console.log('Global hazards: validation, expiry, scope, weather, deterministic vortices, targeting, inactive parity and directional forces passed.');
})().catch(error => { console.error(error); process.exitCode=1; });
