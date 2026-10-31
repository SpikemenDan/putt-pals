import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { SERVER_ROOM_VERSION } from '../../src/network/contracts/server-room.js';
import { roomObjectName } from '../../services/rooms/room-name.mjs';

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
const code = 'hibernate1';
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
async function open(resume = null) {
  const response = await mf.dispatchFetch(`http://localhost/api/rooms/${code}/socket`, { headers: { Upgrade: 'websocket' } });
  assert.equal(response.status, 101);
  const client = observe(response.webSocket);
  const welcome = next(client, frame => frame.type === 'welcome' || frame.type === 'error');
  client.socket.send(JSON.stringify({ version: SERVER_ROOM_VERSION, type: 'hello', roomCode: code, name: 'Player', resume }));
  const frame = await welcome;
  assert.equal(frame.type, 'welcome', JSON.stringify(frame));
  return client;
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
  const host = await open();
  const guest = await open();
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
