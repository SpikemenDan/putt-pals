import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { SERVER_ROOM_VERSION } from '../../src/network/contracts/server-room.js';
import { roomObjectName } from '../../services/rooms/room-name.mjs';
import { DEFAULT_RULES } from '../../src/shared/rules.js';

// These runtime tools are already pinned transitively by Wrangler in package-lock.json.
const bundled = await build({
  entryPoints: ['services/rooms/worker.mjs'], bundle: true, write: false,
  format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent',
});
const persistence = await mkdtemp(path.join(os.tmpdir(), 'putt-pals-n4d-'));
const options = {
  resourcePersistencePath: persistence,
  workers: [{ config: {
    name: 'recovery-test', compatibilityDate: '2026-10-28',
    manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundled.outputFiles[0].text } } },
    env: {
      ROOM_ENVIRONMENT: { type: 'text', value: 'development' },
      ROOM_LOCAL_DIAGNOSTICS: { type: 'text', value: 'true' },
      ROOMS: { type: 'durable-object', worker: 'recovery-test', exportName: 'RoomDurableObject' },
    },
    exports: { RoomDurableObject: { type: 'durable-object', storage: 'sqlite' } },
  } }],
  log: new Log(LogLevel.ERROR),
};
let mf = new Miniflare(options);
let code = null; // VIS-M3: the Worker picks it when the host creates the room
const clients = [];
function observe(socket) {
  socket.accept();
  const client = { socket, frames: [], waiters: [], snapshot: null, sequence: 0 };
  socket.addEventListener('message', event => {
    const frame = JSON.parse(event.data);
    if (frame.snapshot) client.snapshot = frame.snapshot;
    if (frame.type === 'welcome') Object.assign(client, { playerId: frame.playerId, connectionId: frame.connectionId, token: frame.resumeToken });
    const at = client.waiters.findIndex(waiter => waiter.test(frame));
    if (at < 0) client.frames.push(frame);
    else { const [waiter] = client.waiters.splice(at, 1); clearTimeout(waiter.timer); waiter.resolve(frame); }
  });
  clients.push(client);
  return client;
}
function next(client, test, timeout = 8000) {
  const at = client.frames.findIndex(test);
  if (at >= 0) return Promise.resolve(client.frames.splice(at, 1)[0]);
  return new Promise((resolve, reject) => {
    const waiter = { test, resolve, timer: setTimeout(() => {
      client.waiters = client.waiters.filter(w => w !== waiter);
      reject(new Error('Timed out waiting for reconstructed room frame'));
    }, timeout) };
    client.waiters.push(waiter);
  });
}
/** The first open creates the room (rules apply); later ones join it by code. */
async function open(resume = null, rules = null) {
  const create = code === null;
  const response = await mf.dispatchFetch(`http://localhost/api/rooms/${create ? '_new' : code}/socket`, { headers: { Upgrade: 'websocket' } });
  assert.equal(response.status, 101);
  const client = observe(response.webSocket);
  const welcome = next(client, frame => frame.type === 'welcome' || frame.type === 'error');
  client.socket.send(JSON.stringify({ version: SERVER_ROOM_VERSION, type: 'hello', intent: create ? 'create' : 'join', color: null, roomCode: create ? null : code, name: 'Player', resume, rules: create ? rules : null }));
  const frame = await welcome;
  assert.equal(frame.type, 'welcome', JSON.stringify(frame));
  if (create) code = frame.snapshot.roomCode;
  return client;
}
/** Sends one hello on a fresh socket and returns the first frame the room answers with. */
async function handshake(path, hello, headers = {}) {
  const response = await mf.dispatchFetch(`http://localhost${path}`, { headers: { Upgrade: 'websocket', ...headers } });
  assert.equal(response.status, 101);
  const client = observe(response.webSocket);
  const answer = next(client, frame => frame.type === 'welcome' || frame.type === 'error');
  client.socket.send(JSON.stringify({ version: SERVER_ROOM_VERSION, type: 'hello', color: null, name: 'Probe', resume: null, rules: null, ...hello }));
  const frame = await answer;
  client.socket.close();
  return frame;
}
async function command(client, payload, sequence = ++client.sequence) {
  const answer = next(client, frame => (frame.type === 'ack' && frame.sequence === sequence) || frame.type === 'error');
  client.socket.send(JSON.stringify({
    version: SERVER_ROOM_VERSION, type: 'command', sessionId: client.snapshot.sessionId,
    connectionId: client.connectionId, sequence,
    roundNumber: client.snapshot.session.context.roundNumber,
    puttIndex: client.snapshot.session.context.puttIndex, payload,
  }));
  return answer;
}
const evict = mode => mf.unsafeEvictDurableObject('recovery-test', 'RoomDurableObject', {
  name: roomObjectName('development', code), webSockets: mode,
});
try {
  // VIS-M3: a join never creates a room, and only the Worker's Create path can create one.
  assert.equal((await handshake('/api/rooms/nosuch1/socket', { intent: 'join', roomCode: 'nosuch1' })).code, 'room-not-found', 'joining an uncreated code fails clearly');
  assert.equal((await handshake('/api/rooms/nosuch1/socket', { intent: 'join', roomCode: 'nosuch1' }, { 'x-putt-room-create': '1' })).code, 'room-not-found', 'a client cannot forge the create marker');
  assert.equal((await handshake('/api/rooms/nosuch1/socket', { intent: 'create', roomCode: null })).code, 'invalid-message', 'a create hello on a join socket is refused');
  assert.equal((await handshake('/api/rooms/_new/socket', { intent: 'join', roomCode: 'nosuch1' })).code, 'invalid-message', 'a join hello on a create socket is refused');
  // VIS-U: the hello that creates the room fixes its Custom rules; joining players get the room's rules.
  const custom = { ...DEFAULT_RULES, lunaGravity: 60, shotPower: 120, holeTimer: 300 };
  const host = await open(null, custom);
  assert.match(code, /^[a-hj-km-np-z2-9]{8}$/, 'the Worker generated the party code');
  const guest = await open(null);
  assert.deepEqual(host.snapshot.session.context.rules, custom, 'the creating hello sets the room rules');
  assert.deepEqual(guest.snapshot.session.context.rules, custom, 'a joining player gets the room rules');
  assert.equal((await command(host, { type: 'START_VOTING' })).type, 'ack');
  assert.equal((await command(host, { type: 'CAST_VOTE', mapIndex: 0 })).type, 'ack');
  const deadline = host.snapshot.session.context.votingDeadline;
  const connectionId = host.connectionId;
  await evict('hibernate');
  const pong = next(host, frame => frame.type === 'pong' && frame.nonce === 'wake');
  host.socket.send(JSON.stringify({ version: SERVER_ROOM_VERSION, type: 'ping', nonce: 'wake', clientTime: 0 }));
  assert.equal((await pong).nonce, 'wake', 'same socket survives actual workerd eviction');
  assert.equal((await command(host, { type: 'CAST_VOTE', mapIndex: 0 }, 2)).code, 'sequence-rejected');
  assert.equal((await command(guest, { type: 'CAST_VOTE', mapIndex: 0 })).type, 'ack');
  const starting = await next(host, frame => frame.type === 'snapshot' && frame.snapshot.session.node === 'play.starting');
  const startAt = starting.snapshot.session.context.roundStartTime;
  assert.ok(startAt >= deadline - 15000);
  assert.equal(host.connectionId, connectionId);
  await evict('hibernate');
  const running = await next(host, frame => frame.type === 'snapshot' && frame.snapshot.session.node === 'play.active.running');
  assert.equal(running.snapshot.session.context.roundStartTime, startAt, 'durable alarm preserves original start through eviction');
  assert.deepEqual(running.snapshot.session.context.rules, custom, 'rules survive eviction');
  assert.equal(running.snapshot.session.context.roundLimitSeconds, 300, 'the room hole timer applies to the putt');
  assert.equal((await command(host, { type: 'REPORT_SCORE', strokes: 2, timedOut: false })).type, 'ack');
  const sessionId = host.snapshot.sessionId;
  await evict('close');
  const returning = await open({ sessionId, playerId: host.playerId, token: host.token });
  assert.equal(returning.snapshot.sessionId, sessionId);
  assert.equal(returning.snapshot.session.context.players[host.playerId].score, 2);
  assert.notEqual(returning.connectionId, connectionId);
  assert.equal(returning.snapshot.session.context.roundStartTime, startAt);
  assert.equal(returning.snapshot.seats.length, 2, 'socket-loss recovery preserves reserved guest');
  await mf.dispose();
  mf = new Miniflare(options);
  const restarted = await open({ sessionId, playerId: host.playerId, token: host.token });
  assert.equal(restarted.snapshot.sessionId, sessionId, 'new workerd process restores SQLite state');
  assert.equal(restarted.snapshot.session.context.players[host.playerId].score, 2);
  assert.equal(restarted.snapshot.seats.length, 2);
  console.log('PASS: local workerd hibernation preserves sockets, command dedup and absolute alarms; forced socket loss resumes durable scores and reservations.');
} finally {
  for (const client of clients) {
    for (const waiter of client.waiters) clearTimeout(waiter.timer);
    try { client.socket.close(); } catch {}
  }
  await mf.dispose();
  await rm(persistence, { recursive: true, force: true });
}
