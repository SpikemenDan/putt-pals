const assert = require('node:assert/strict');
(async () => {
  const c = await import('../src/network/contracts/server-room.js');
  const {createServerRoomFixture,createServerCheckpointFixture,MockServerRoomBoundary} = await import('../src/network/contracts/server-room-mocks.js');
  let passed=0;
  async function test(name,fn) { await fn(); console.log('PASS '+name); passed++; }
  const copy=v=>structuredClone(v);
  const snapshot=createServerRoomFixture();
  const command=(type='START_VOTING', extra={}) => ({version:2,type:'command',sessionId:snapshot.sessionId,connectionId:'socket_p1',sequence:1,roundNumber:0,puttIndex:0,payload:{type,...extra}});
  const binding={playerId:'p1',connectionId:'socket_p1',lastSequence:0};
  await test('policy defaults and validated future deployment overrides',()=>{
    assert.deepEqual(c.createRoomPolicy(),{reconnectGraceMs:30000,controllerTransferDelayMs:0,emptyRoomTtlMs:900000});
    assert.equal(c.createRoomPolicy({reconnectGraceMs:60000}).reconnectGraceMs,60000);
    for(const overrides of [{reconnectGraceMs:0},{emptyRoomTtlMs:1},{controllerTransferDelayMs:30001},{unknown:true},{reconnectGraceMs:NaN}]) assert.throws(()=>c.createRoomPolicy(overrides));
    assert.ok(Object.isFrozen(c.createRoomPolicy()));
  });
  await test('server authority separate from controller and no active protocol change',async()=>{
    assert.equal((await import('../src/shared/constants.js')).PROTOCOL_VERSION,1);
    assert.equal(c.SERVER_ROOM_VERSION,2);assert.ok(c.validRoomSnapshot(snapshot));
    const invalid=copy(snapshot);invalid.session.context.hostId='p1';assert.equal(c.validRoomSnapshot(invalid),false);
    assert.equal(c.authorizeRoomFrame(command(),binding,snapshot,snapshot.serverTime),null);
    assert.equal(c.authorizeRoomFrame({...command(),connectionId:'socket_p2'},{...binding,playerId:'p2',connectionId:'socket_p2'},snapshot,snapshot.serverTime),'unauthorized');
  });
  await test('strict version, direction, byte and identity boundaries',()=>{
    assert.ok(c.decodeRoomFrame(JSON.stringify(command()),'client'));
    for(const m of [{...command(),version:1},{...command(),senderId:'p1'},{...command(),payload:{type:'START_VOTING',playerId:'p1'}},{...command(),payload:{type:'xstate.after'}},{...command(),sequence:0}]) assert.equal(c.decodeRoomFrame(JSON.stringify(m),'client'),null);
    assert.equal(c.decodeRoomFrame(JSON.stringify(command()),'server'),null);
    assert.equal(c.decodeRoomFrame('{','client'),null);assert.equal(c.decodeRoomFrame(new Uint8Array(1),'client'),null);
    assert.equal(c.decodeRoomFrame(' '.repeat(65537),'client'),null);
    const hello={version:2,type:'hello',roomCode:'friends',name:'x'.repeat(14),resume:null};
    assert.ok(c.validClientFrame(hello));assert.equal(c.validClientFrame({...hello,name:'x'.repeat(15)}),false);
    assert.equal(c.decodeRoomFrame(JSON.stringify({...hello,name:'😀'.repeat(20000)}),'client'),null);
    assert.equal(c.validRoomId('__proto__'),false);assert.equal(c.validRoomCode('A B!'),false);
  });
  await test('resume secret only in private handshake/welcome, never shared snapshot',()=>{
    const resume={sessionId:'session_fixture',playerId:'p1',token:'x'.repeat(43)};
    assert.ok(c.validClientFrame({version:2,type:'hello',roomCode:'friends',name:'A',resume}));
    assert.equal(c.validClientFrame({version:2,type:'hello',roomCode:'friends',name:'A',resume:{...resume,token:'short'}}),false);
    const welcome={version:2,type:'welcome',playerId:'p1',connectionId:'socket_p1',resumeToken:'x'.repeat(43),snapshot};
    assert.ok(c.decodeRoomFrame(c.encodeRoomFrame(welcome,'server'),'server'));
    const leaked=copy(snapshot);leaked.seats[0].token='secret';assert.equal(c.validRoomSnapshot(leaked),false);
    const leaked2=copy(snapshot);leaked2.session.context.players.p1.tokenHash='a'.repeat(64);assert.equal(c.validRoomSnapshot(leaked2),false);
  });
  await test('stale session, socket, round, sequence and disconnected sender rejected',()=>{
    for(const [patch,error] of [[{sessionId:'expired'},'session-expired'],[{connectionId:'old'},'stale-connection'],[{roundNumber:7},'stale-round'],[{puttIndex:2},'stale-round']]) assert.equal(c.authorizeRoomFrame({...command(),...patch},binding,snapshot,snapshot.serverTime),error);
    assert.equal(c.authorizeRoomFrame(command(),{...binding,lastSequence:1},snapshot,snapshot.serverTime),'sequence-rejected');
    const gone=copy(snapshot);gone.seats[0].connectedSince=null;gone.seats[0].resumeUntil=snapshot.serverTime+30000;gone.session.context.players.p1.connected=false;gone.controllerId='p2';
    assert.equal(c.authorizeRoomFrame(command(),binding,gone,snapshot.serverTime),'unauthorized');
    assert.equal(c.authorizeRoomFrame({...command('LEAVE_ROOM'),roundNumber:7},binding,snapshot,snapshot.serverTime),null);
  });
  await test('deterministic longest continuous connection succession; resumed creator has no privilege',()=>{
    const seats=[{playerId:'creator',joinOrder:1,connectedSince:null},{playerId:'oldest',joinOrder:2,connectedSince:10},{playerId:'newer',joinOrder:3,connectedSince:20}];
    assert.equal(c.chooseRoomController(seats),'oldest');
    seats[0].connectedSince=30;assert.equal(c.chooseRoomController(seats),'oldest');
    assert.equal(c.chooseRoomController(seats.map(s=>({...s,connectedSince:null}))),null);
    assert.equal(c.chooseRoomController([{...seats[2],connectedSince:10},seats[1]]),'oldest');
  });
  await test('snapshot membership, capacity, historical scores and credential exclusion',()=>{
    const invalid=copy(snapshot);invalid.seats.push(copy(invalid.seats[0]));assert.equal(c.validRoomSnapshot(invalid),false);
    const badPlayer=copy(snapshot);badPlayer.session.context.players.p1.id='impostor';assert.equal(c.validRoomSnapshot(badPlayer),false);
    const high=copy(snapshot);high.session.context.players.p1.strokes=150;high.session.context.players.p1.scores=[{score:150,timedOut:true,par:2,penalty:0}];assert.ok(c.validRoomSnapshot(high));
    const absent=copy(snapshot);absent.controllerId='no-player';assert.equal(c.validRoomSnapshot(absent),false);
    const injected=copy(snapshot);injected.session.context.votes={constructor:0};assert.equal(c.validRoomSnapshot(injected),false);
    const oversized=copy(snapshot);for(let i=3;i<=5;i++){oversized.seats.push({playerId:'p'+i,joinOrder:i,connectedSince:0,resumeUntil:null});oversized.session.context.players['p'+i]={...copy(snapshot.session.context.players.p1),id:'p'+i};}assert.equal(c.validRoomSnapshot(oversized),false);
  });
  await test('presence is finite and roster scoped, supports current effect messages',()=>{
    const p={x:0,y:1,z:2,mode:'play',strokes:1,effect:'mag'};
    const frame={...command(),type:'presence',payload:p};
    assert.equal(c.authorizeRoomFrame(frame,binding,snapshot,snapshot.serverTime),'unauthorized');
    const play=copy(snapshot);play.session.node='play.active.running';play.session.context.roster=['p1','p2'];assert.equal(c.authorizeRoomFrame(frame,binding,play,play.serverTime),null);
    for(const patch of [{x:Infinity},{x:1000001},{strokes:-1},{effect:'unknown'},{effect:'rev'},{fx:{id:1,t:'rev'}},{fx:{id:1,t:'mag'}},{fx:{id:1,t:'zany',playerId:'p2'}}]) assert.equal(c.validServerPresence({...p,...patch}),false);
  });
  await test('complete checkpoint differs from public snapshot and rejects incompatible versions',()=>{
    const cp=createServerCheckpointFixture();assert.ok(c.decodeRoomCheckpoint(JSON.stringify(cp)));
    assert.equal(c.decodeRoomCheckpoint(JSON.stringify(snapshot)),null);
    for(const patch of [{schemaVersion:2},{rulesVersion:'other'},{courseHash:'wrong'},{courseHash:'c'.repeat(64)},{savedAt:0},{nextJoinOrder:2},{token:'secret'}]) assert.equal(c.decodeRoomCheckpoint(JSON.stringify({...cp,...patch})),null);
    assert.equal(c.decodeRoomCheckpoint(' '.repeat(262145)),null);
    const leaked=copy(cp);leaked.identities[0].token='x'.repeat(43);assert.equal(c.validRoomCheckpoint(leaked),false);
  });
  await test('absolute deadlines cover lifecycle restore and deterministic catch-up',()=>{
    const cp=createServerCheckpointFixture();const t=cp.savedAt;
    cp.snapshot.session.node='select.timing';cp.snapshot.session.context.votingDeadline=t+15000;
    assert.equal(c.validRoomCheckpoint(cp),false);cp.deadlines.voteAt=t+15000;assert.ok(c.validRoomCheckpoint(cp));
    assert.deepEqual(c.dueRoomDeadlines(cp,t+14999),[]);assert.deepEqual(c.dueRoomDeadlines(cp,t+15000),[{kind:'voteAt',at:t+15000}]);
    cp.snapshot.session.node='play.starting';cp.snapshot.session.context.roundStartTime=t+2500;cp.deadlines.voteAt=null;cp.deadlines.startAt=t+2500;cp.deadlines.fallbackAt=t+126500;assert.ok(c.validRoomCheckpoint(cp));
    cp.snapshot.session.node='play.active.settling';cp.deadlines.startAt=null;cp.deadlines.minimumPlayAt=t+4000;assert.ok(c.validRoomCheckpoint(cp));
    cp.snapshot.session.node='play.active.running';cp.deadlines.minimumPlayAt=null;assert.ok(c.validRoomCheckpoint(cp));
    cp.snapshot.session.node='play.active.replaying';cp.snapshot.session.context.mode='putt_practice';cp.deadlines.fallbackAt=null;cp.deadlines.replayAt=t+8000;assert.ok(c.validRoomCheckpoint(cp));
    cp.snapshot.session.node='results';cp.deadlines.replayAt=null;assert.ok(c.validRoomCheckpoint(cp));
    cp.snapshot.seats[1].connectedSince=null;cp.snapshot.seats[1].resumeUntil=t+30000;cp.snapshot.session.context.players.p2.connected=false;cp.identities[1].connectionId=null;
    assert.deepEqual(c.dueRoomDeadlines(cp,t+30000),[{kind:'resumeUntil',at:t+30000,playerId:'p2'}]);
  });
  await test('mock binds socket identity, persists before ack and rejects replay after restore',async()=>{
    const events=[],writes=[];
    const mock=new MockServerRoomBoundary({reduce:(s,e)=>{events.push(e);return s;},persist:async cp=>writes.push(cp)});
    assert.deepEqual(await mock.receive(JSON.stringify({...command(),payload:{type:'START_VOTING',playerId:'p2'}}),'p1'),{error:'invalid-message'});
    assert.deepEqual(await mock.receive(JSON.stringify(command()),'p2'),{error:'stale-connection'});
    const result=await mock.receive(JSON.stringify(command()),'p1');assert.ok(result.ack);assert.equal(writes.length,1);assert.equal(events[0].playerId,'p1');
    const restored=new MockServerRoomBoundary({checkpoint:writes[0]});assert.deepEqual(await restored.receive(JSON.stringify(command()),'p1'),{error:'sequence-rejected'});
    const failed=new MockServerRoomBoundary({persist:async()=>{throw new Error('storage unavailable');}});
    await assert.rejects(failed.receive(JSON.stringify(command()),'p1'),/storage unavailable/);assert.equal(failed.checkpoint.snapshot.revision,1);assert.equal(failed.checkpoint.identities[0].lastSequence,0);
  });
  await test('concurrent mock commands serialize; failed persistence cannot consume a sequence',async()=>{
    let release; const barrier=new Promise(resolve=>{release=resolve;});let writes=0;
    const mock=new MockServerRoomBoundary({persist:async()=>{writes++;if(writes===1) await barrier;}});
    const first=mock.receive(JSON.stringify(command()),'p1');
    const second=mock.receive(JSON.stringify({...command(),sequence:2}),'p1');
    await Promise.resolve();await Promise.resolve();assert.equal(writes,1);assert.equal(mock.checkpoint.snapshot.revision,1);
    release();await Promise.all([first,second]);assert.equal(writes,2);assert.equal(mock.checkpoint.snapshot.revision,3);assert.equal(mock.checkpoint.identities[0].lastSequence,2);
  });
  await test('durable disconnect, delayed controller and empty retention invariants',()=>{
    const cp=createServerCheckpointFixture(createServerRoomFixture({policy:{controllerTransferDelayMs:10000}}));const t=cp.savedAt;
    cp.snapshot.seats[0].connectedSince=null;cp.snapshot.seats[0].resumeUntil=t+30000;cp.snapshot.session.context.players.p1.connected=false;cp.identities[0].connectionId=null;
    assert.equal(c.validRoomCheckpoint(cp),false);cp.deadlines.controllerAt=t+10000;assert.ok(c.validRoomCheckpoint(cp));
    const noDelay=copy(cp);noDelay.snapshot.policy.controllerTransferDelayMs=0;assert.equal(c.validRoomCheckpoint(noDelay),false);
    cp.snapshot.controllerId='p2';cp.deadlines.controllerAt=null;assert.ok(c.validRoomCheckpoint(cp));
    cp.snapshot.seats[1].connectedSince=null;cp.snapshot.seats[1].resumeUntil=t+30000;cp.snapshot.session.context.players.p2.connected=false;cp.identities[1].connectionId=null;cp.snapshot.controllerId=null;
    assert.equal(c.validRoomCheckpoint(cp),false);cp.deadlines.emptyAt=t+900000;assert.ok(c.validRoomCheckpoint(cp));
    assert.deepEqual(c.dueRoomDeadlines(cp,t+30000).map(d=>d.playerId),['p1','p2']);
    const live=copy(cp);live.snapshot.seats[1].connectedSince=t;live.snapshot.seats[1].resumeUntil=null;live.snapshot.session.context.players.p2.connected=true;live.snapshot.controllerId='p2';live.identities[1].connectionId='new_socket';assert.equal(c.validRoomCheckpoint(live),false);
  });
  await test('ephemeral presence has independent sequencing and cannot consume a durable command',async()=>{
    const state=createServerRoomFixture();state.session.node='play.active.running';state.session.context.roster=['p1','p2'];
    const cp=createServerCheckpointFixture(state);cp.deadlines.fallbackAt=state.session.context.roundStartTime+124000;
    const mock=new MockServerRoomBoundary({checkpoint:cp});
    const presence={...command(),type:'presence',sequence:99,payload:{x:0,y:0,z:0,mode:'play',strokes:1}};
    assert.ok((await mock.receive(JSON.stringify(presence),'p1')).presence);
    assert.deepEqual(await mock.receive(JSON.stringify(presence),'p1'),{error:'sequence-rejected'});
    assert.ok((await mock.receive(JSON.stringify(command('REPORT_SCORE',{strokes:1,timedOut:false})),'p1')).ack);
    assert.equal(mock.checkpoint.identities[0].lastSequence,1);
  });
  await test('server frames reject unknown errors, malformed ack and client impersonation',()=>{
    assert.ok(c.validServerFrame({version:2,type:'error',code:'room-full',retryAfterMs:null}));
    assert.equal(c.validServerFrame({version:2,type:'error',code:'secret exception trace',retryAfterMs:null}),false);
    assert.equal(c.validServerFrame({version:2,type:'ack',sessionId:'s',connectionId:'c',sequence:0,revision:1}),false);
    assert.equal(c.validClientFrame({version:2,type:'snapshot',snapshot}),false);
  });
  console.log(`${passed} server-room contract scenarios passed (no Cloudflare runtime or real network claim).`);
})().catch(error=>{console.error(error);process.exitCode=1;});
