/** Contract fixtures/test double only. No WebSocket, durable storage or game-rule implementation. */
import { authorizeRoomFrame, createRoomPolicy, decodeRoomCheckpoint, decodeRoomFrame, encodeRoomFrame, SERVER_ROOM_VERSION, CHECKPOINT_VERSION, ROOM_RULES_VERSION } from './server-room.js';

export function createServerRoomFixture({ now = 1700000000000, policy = {} } = {}) {
  const player = (id,name) => ({id,name,connected:true,strokes:0,done:false,timedOut:false,score:null,scores:[]});
  return {
    roomCode:'friends', sessionId:'session_fixture', rulesVersion:ROOM_RULES_VERSION, courseHash:'a'.repeat(64), revision:1, serverTime:now, controllerId:'p1', policy:createRoomPolicy(policy),
    seats:[{playerId:'p1',joinOrder:1,connectedSince:now,resumeUntil:null},{playerId:'p2',joinOrder:2,connectedSince:now,resumeUntil:null}],
    session:{node:'lobby',context:{ mode:'standard',mapIndex:0,puttIndex:0,roundNumber:0,roundLimitSeconds:120,roundStartTime:0,votingDeadline:0,
      votes:{},roster:[],players:{p1:player('p1','Controller'),p2:player('p2','Guest')},completedMaps:[],totals:{},last:null }},
  };
}
export function createServerCheckpointFixture(snapshot = createServerRoomFixture()) {
  return {
    schemaVersion:CHECKPOINT_VERSION, rulesVersion:ROOM_RULES_VERSION, courseHash:'a'.repeat(64), savedAt:snapshot.serverTime,
    snapshot:structuredClone(snapshot),
    identities:snapshot.seats.map(s => ({playerId:s.playerId,tokenHash:'b'.repeat(64),connectionId:'socket_'+s.playerId,lastSequence:0})),
    deadlines:{voteAt:null,startAt:null,minimumPlayAt:null,fallbackAt:null,replayAt:null,controllerAt:null,emptyAt:null},
    nextJoinOrder:3,presenceSequence:0,
  };
}
/**
 * Consumer test double: admission is pre-established by fixture identities. A reducer must be
 * supplied by tests that need domain transitions. It does not fake successful gameplay/recovery.
 */
export class MockServerRoomBoundary {
  constructor({checkpoint = createServerCheckpointFixture(), now = () => checkpoint.savedAt, reduce = snapshot => snapshot, persist = async () => {}} = {}) {
    const accepted=decodeRoomCheckpoint(JSON.stringify(checkpoint));
    if (!accepted) throw new Error('Invalid mock checkpoint');
    this.pending=Promise.resolve(); this.presenceSequences=new Map();
    this.checkpoint=accepted; this.now=now; this.reduce=reduce; this.persist=persist;
  }
  receive(raw, socketPlayerId) {
    const result=this.pending.then(() => this.receiveSerial(raw,socketPlayerId));
    this.pending=result.catch(() => {});
    return result;
  }
  async receiveSerial(raw, socketPlayerId) {
    const frame=decodeRoomFrame(raw,'client');
    const identity=this.checkpoint.identities.find(i => i.playerId === socketPlayerId);
    if (!identity) return {error:'unauthorized'};
    const error=authorizeRoomFrame(frame,{playerId:identity.playerId,connectionId:identity.connectionId,lastSequence:frame?.type === 'presence' ? (this.presenceSequences.get(identity.connectionId) ?? 0) : identity.lastSequence},this.checkpoint.snapshot,this.now());
    if (error) return {error};
    if (frame.type === 'presence') { this.presenceSequences.set(identity.connectionId,frame.sequence); return {presence:structuredClone(frame.payload)}; } // Ephemeral; command sequence is independent.
    const draft=structuredClone(this.checkpoint);
    draft.snapshot=this.reduce(draft.snapshot,{...structuredClone(frame.payload),playerId:identity.playerId});
    const committedAt=this.now();
    draft.snapshot.revision++; draft.snapshot.serverTime=committedAt; draft.savedAt=committedAt;
    draft.identities.find(i => i.playerId===identity.playerId).lastSequence=frame.sequence;
    const valid=decodeRoomCheckpoint(JSON.stringify(draft));
    if (!valid) throw new Error('Reducer must return a valid checkpoint state');
    await this.persist(structuredClone(valid)); // No success/ack if durability fails.
    this.checkpoint=valid;
    return {ack:encodeRoomFrame({version:SERVER_ROOM_VERSION,type:'ack',sessionId:draft.snapshot.sessionId,connectionId:frame.connectionId,sequence:frame.sequence,revision:draft.snapshot.revision},'server')};
  }
}
