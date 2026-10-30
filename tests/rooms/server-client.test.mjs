import assert from 'node:assert/strict';
import { SimulatedClock } from 'xstate';
import { connectServerRoom, serverRoomUrl } from '../../src/network/server-room.js';
import { createServerRoomFixture } from '../../src/network/contracts/server-room-mocks.js';
import { SERVER_ROOM_VERSION } from '../../src/network/contracts/server-room.js';

class Socket extends EventTarget {
  static all = [];
  readyState = 0; bufferedAmount = 0; frames = [];
  constructor(url) { super(); this.url = url; Socket.all.push(this); }
  send(raw) { if (this.readyState !== 1) throw new Error('closed'); this.frames.push(JSON.parse(raw)); }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  receive(frame) { const e = new Event('message'); e.data = typeof frame === 'string' ? frame : JSON.stringify(frame); this.dispatchEvent(e); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
}
const welcome = (snapshot = createServerRoomFixture(), connectionId = 'socket_one') => ({
  version: SERVER_ROOM_VERSION, type: 'welcome', playerId: 'p1', connectionId, resumeToken: 'T'.repeat(43), snapshot,
});
function start(extra = {}) {
  const clock = new SimulatedClock();
  const promise = connectServerRoom({ roomCode: 'friends', name: 'Player', WebSocket: Socket,
    location: { href: 'http://localhost/' }, clock, expectedCourseHash: 'a'.repeat(64), random: () => 0.5, ...extra });
  const socket = Socket.all.at(-1);
  return { clock, promise, socket };
}
assert.equal(serverRoomUrl('friends', { location: { href: 'https://golf.example/' } }), 'wss://golf.example/api/rooms/friends/socket');
assert.equal(serverRoomUrl('friends', { location: { href: 'http://localhost:5173/' }, endpoint: 'http://127.0.0.1:8787' }), 'ws://127.0.0.1:8787/api/rooms/friends/socket');
for (const endpoint of ['http://golf.example', 'wss://evil.example', 'wss://x:y@golf.example', 'https://golf.example/?token=x']) {
  assert.throws(() => serverRoomUrl('friends', { location: { href: 'https://golf.example/' }, endpoint }), /invalid-endpoint/);
}
{
  const f = start(); f.socket.open();
  assert.equal(f.socket.frames[0].resume, null);
  f.socket.receive(welcome());
  const room = await f.promise;
  assert.equal(room.isController, true);
  assert.equal(room.send({ type: 'START_ROUND', puttIndex: 3 }), true, 'putt choice is retained in the payload');
  assert.equal(f.socket.frames.at(-1).payload.puttIndex, 3);
  assert.equal(room.send({ type: 'REPORT_SCORE', strokes: 1, timedOut: false, roundNumber: 9 }), false);
  assert.equal(room.send({ type: 'START_VOTING', playerId: 'forged' }), false);
  const s = createServerRoomFixture(); s.revision = 2; s.controllerId = 'p2';
  f.socket.receive({ version: 2, type: 'snapshot', snapshot: s });
  assert.equal(room.isController, false);
  f.socket.receive({ version: 2, type: 'snapshot', snapshot: createServerRoomFixture() });
  assert.equal(room.isController, false, 'stale snapshots cannot reclaim controls');
  const modified = room.snapshot; modified.players.p1.name = 'mutated';
  assert.equal(room.snapshot.players.p1.name, 'Controller');
  const statuses = []; room.onStatus(s => statuses.push(s.state));
  f.socket.close();
  assert.equal(room.connected, false);
  f.clock.increment(500);
  const next = Socket.all.at(-1); assert.notEqual(next, f.socket); next.open();
  assert.deepEqual(Object.keys(next.frames[0].resume).sort(), ['playerId', 'sessionId', 'token']);
  assert.equal(next.frames[0].resume.playerId, 'p1');
  s.revision = 3;
  next.receive(welcome(s, 'socket_two'));
  assert.equal(room.connected, true);
  assert.equal(room.isController, false);
  room.send({ type: 'CAST_VOTE', mapIndex: 0 });
  assert.equal(next.frames.at(-1).sequence, 1, 'new socket has its own command generation');
  assert.equal(next.frames.at(-1).connectionId, 'socket_two');
  assert.deepEqual(statuses, ['connected', 'reconnecting', 'connected']);
  room.close();
  assert.equal(next.frames.at(-1).payload.type, 'LEAVE_ROOM');
}
{
  const f = start(); f.socket.open(); f.socket.receive(welcome()); const room = await f.promise;
  const before = room.now(); f.clock.increment(15000);
  const ping = f.socket.frames.at(-1); assert.equal(ping.type, 'ping');
  f.socket.receive({ version: 2, type: 'pong', nonce: 'unknown', clientTime: 0, serverTime: 1 });
  assert.ok(room.now() >= before + 15000);
  f.socket.receive({ version: 2, type: 'pong', nonce: ping.nonce, clientTime: ping.clientTime, serverTime: before + 15000 });
  room.close({ leave: false });
  assert.ok(!f.socket.frames.some(frame => frame.type === 'command'), 'disposal preserves the resume seat');
}
{
  const f = start(); f.socket.open(); f.socket.receive(welcome()); const room = await f.promise;
  const seen = []; room.onPresence(p => seen.push(p));
  const s = createServerRoomFixture(); s.revision = 2; s.session.node = 'play.active.running'; s.session.context.roundNumber = 1;
  s.session.context.roster = ['p1', 'p2'];
  f.socket.receive({ version: 2, type: 'snapshot', snapshot: s });
  const frame = { version: 2, type: 'presence', sessionId: s.sessionId, roundNumber: 1, puttIndex: 0, sequence: 1,
    serverTime: s.serverTime, players: { p2: { x: 10, y: 12, z: 5, mode: 'play', strokes: 1 } } };
  f.socket.receive(frame); assert.equal(seen.at(-1).p2.x, 10);
  f.socket.receive({ ...frame, players: { p2: { ...frame.players.p2, x: 99 } } });
  assert.equal(seen.at(-1).p2.x, 10, 'duplicate presence rejected');
  f.socket.receive({ ...frame, sequence: 2, roundNumber: 0 });
  assert.equal(seen.at(-1).p2.x, 10, 'old-round presence rejected');
  s.revision = 3; s.session.context.roundNumber = 2; s.session.context.puttIndex = 1;
  f.socket.receive({ version: 2, type: 'snapshot', snapshot: s });
  assert.deepEqual(seen.at(-1), {}, 'new round drops old positions');
  room.close();
}
for (const failure of ['course', 'version', 'timeout', 'abort']) {
  const signal = new AbortController(); const f = start({ signal: signal.signal });
  const rejected = assert.rejects(f.promise, /course-incompatible|incompatible-version|connection-timeout|cancelled/);
  f.socket.open();
  if (failure === 'course') { const s = createServerRoomFixture(); s.courseHash = 'b'.repeat(64); f.socket.receive(welcome(s)); }
  if (failure === 'version') f.socket.receive({ version: 1, type: 'welcome' });
  if (failure === 'timeout') f.clock.increment(10000);
  if (failure === 'abort') { signal.abort(); f.socket.receive(welcome()); }
  await rejected;
  assert.equal(f.socket.readyState, 3);
}
{
  const f = start(); f.socket.open(); f.socket.receive(welcome()); const room = await f.promise;
  f.socket.close();
  f.clock.increment(30000);
  assert.equal(room.connected, false);
  const count = Socket.all.length; f.clock.increment(60000);
  assert.equal(Socket.all.length, count, 'retries stop at the grace boundary');
}
console.log('PASS: server client validation, authority, generations, retries, cancellation, heartbeat/clock, presence and compatibility (fake sockets).');
