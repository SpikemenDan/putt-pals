// Adapter instrumentation with fake storage/sockets and an injected epoch; not Cloudflare billing telemetry.
import assert from 'node:assert/strict';
import { RoomDurableObject } from '../../services/rooms/recovery-object.mjs';
import { SERVER_ROOM_LIMITS } from '../../src/network/contracts/server-room.js';

let now = 1700000000000;
const originalNow = Date.now;
Date.now = () => now;
const metrics = { inputs: 0, inputBytes: 0, outputs: 0, outputBytes: 0, maxSnapshotBytes: 0, maxCheckpointBytes: 0, checkpointWrites: 0, alarmWrites: 0 };
const bytes = raw => new TextEncoder().encode(raw).byteLength;
const data = new Map(); let alarm = null;
const storage = {
  get: async key => data.get(key), getAlarm: async () => alarm,
  transaction: async fn => fn({
    put: async (key, value) => { data.set(key, value); metrics.checkpointWrites++; metrics.maxCheckpointBytes = Math.max(metrics.maxCheckpointBytes, bytes(typeof value === 'string' ? value : JSON.stringify(value))); },
    delete: async key => data.delete(key),
    setAlarm: async at => { alarm = at; metrics.alarmWrites++; },
    deleteAlarm: async () => { alarm = null; },
  }),
};
const sockets = [];
const ctx = { storage, blockConcurrencyWhile: fn => fn(), getWebSockets: () => sockets.filter(s => s.readyState === 1), acceptWebSocket: ws => sockets.push(ws) };
const room = new RoomDurableObject(ctx, { ROOM_ENVIRONMENT: 'development' });
const clients = [];
async function receive(ws, frame) {
  const raw = JSON.stringify(frame); metrics.inputs++; metrics.inputBytes += bytes(raw);
  await room.webSocketMessage(ws, raw);
}
async function command(ws, payload) {
  const s = room.checkpoint().snapshot;
  await receive(ws, { version: 2, type: 'command', sessionId: s.sessionId, connectionId: ws.attachment.connectionId,
    sequence: ++ws.sequence, roundNumber: s.session.context.roundNumber, puttIndex: s.session.context.puttIndex, payload });
  assert.equal(ws.frames.at(-1).type, 'ack');
}
try {
  await room.ready;
  for (let i = 0; i < 4; i++) {
    const ws = { readyState: 1, bufferedAmount: 0, sequence: 0, presenceSequence: 0, frames: [],
      send(raw) { const f = JSON.parse(raw); this.frames.push(f); metrics.outputs++; metrics.outputBytes += bytes(raw); if (f.snapshot) metrics.maxSnapshotBytes = Math.max(metrics.maxSnapshotBytes, bytes(JSON.stringify(f.snapshot))); },
      close() { this.readyState = 3; }, serializeAttachment(a) { this.attachment = structuredClone(a); }, deserializeAttachment() { return this.attachment; } };
    room.acceptConnection(ws, { socket: ws, roomCode: 'traffic', identity: null, connectionId: null, closed: false, lastSeenAt: now, handshakeTimer: null, livenessTimer: null });
    await receive(ws, { version: 2, type: 'hello', roomCode: 'traffic', name: `Player ${i + 1}`, resume: null });
    assert.equal(ws.frames[0].type, 'welcome'); clients.push(ws);
  }
  await command(clients[0], { type: 'SET_MODE', mode: 'tournament_3' });
  await command(clients[0], { type: 'START_VOTING' });
  for (const ws of clients) await command(ws, { type: 'CAST_VOTE', mapIndex: 0 });
  now = room.checkpoint().snapshot.session.context.roundStartTime;
  await room.alarm();
  const before = metrics.checkpointWrites;
  for (let tick = 0; tick < 14; tick++) {
    now += 70;
    for (const ws of clients) {
      const s = room.checkpoint().snapshot;
      await receive(ws, { version: 2, type: 'presence', sessionId: s.sessionId, connectionId: ws.attachment.connectionId,
        sequence: ++ws.presenceSequence, roundNumber: s.session.context.roundNumber, puttIndex: s.session.context.puttIndex,
        payload: { x: tick, y: 10, z: 0, mode: 'play', strokes: 0 } });
    }
    clearTimeout(room.runtime.presenceTimer);
    await room.enqueue(() => room.flushPresence(room.runtime));
  }
  metrics.movementCheckpointWrites = metrics.checkpointWrites - before;
  assert.ok(metrics.movementCheckpointWrites <= 1, 'only the initial sequence reservation may persist during movement');
  for (let map = 0; map < 3; map++) {
    for (let putt = 0; putt < 6; putt++) {
      const s = room.checkpoint().snapshot.session.context;
      now = Math.max(now, s.roundStartTime + 1500); await room.alarm();
      for (const ws of clients) await command(ws, { type: 'REPORT_SCORE', strokes: 2, timedOut: false });
      assert.equal(room.checkpoint().snapshot.session.context.puttIndex, putt === 5 ? 5 : putt + 1);
    }
    assert.equal(room.checkpoint().snapshot.session.node, 'results');
    if (map < 2) {
      await command(clients[0], { type: 'RETURN_TO_LOBBY' });
      for (const ws of clients) await command(ws, { type: 'CAST_VOTE', mapIndex: 0 });
    }
  }
  assert.ok(metrics.maxSnapshotBytes < SERVER_ROOM_LIMITS.messageBytes);
  assert.ok(metrics.maxCheckpointBytes < SERVER_ROOM_LIMITS.checkpointBytes);
  for (const ws of clients) await command(ws, { type: 'LEAVE_ROOM' });
  now += 900001; await room.alarm();
  assert.equal(room.runtime, null, 'empty-room alarm releases the domain state');
  assert.equal(data.has('room-checkpoint'), false);
  console.log('N4F_TRAFFIC', JSON.stringify({ ...metrics, movementInputs: 56, movementSampleMs: 980, movementInputsPerSecond: 56 / 0.98, simulatedSeriesSeconds: (now - 1700000000000 - 900001) / 1000, scope: 'fake storage/socket adapter instrumentation; no deployed billing measurement' }));
} finally { clearTimeout(room.runtime?.presenceTimer); room.runtime?.session.dispose(); Date.now = originalNow; }
