import assert from 'node:assert/strict';
import { RoomDurableObject } from '../../services/rooms/recovery-object.mjs';
import { decodeRoomCheckpoint, SERVER_ROOM_VERSION, SERVER_ROOM_LIMITS } from '../../src/network/contracts/server-room.js';

let now = 1_700_000_000_000;
const realNow = Date.now;
Date.now = () => now;
class Storage {
  data = new Map();
  at = null;
  fail = false;
  writes = 0;
  alarmWrites = 0;
  async getAlarm() { return this.at; }
  async get(key) { return this.data.get(key); }
  async setAlarm(at) { this.at = at; }
  async deleteAlarm() { this.at = null; }
  async transaction(fn) {
    const draft = new Map(this.data);
    let alarm = this.at;
    await fn({
      put: async (key, value) => { if (this.fail) throw new Error('Injected write failure'); draft.set(key, value); this.writes++; },
      delete: async key => { if (this.fail) throw new Error('Injected write failure'); draft.delete(key); },
      setAlarm: async at => { this.alarmWrites++; if (this.fail) throw new Error('Injected alarm failure'); alarm = at; },
      deleteAlarm: async () => { if (this.fail) throw new Error('Injected alarm failure'); alarm = null; },
    });
    this.data = draft; this.at = alarm;
  }
}
function context(storage = new Storage(), sockets = []) {
  return { storage, sockets,
    blockConcurrencyWhile: fn => fn(),
    getWebSockets: () => sockets.filter(socket => socket.readyState === 1),
    acceptWebSocket: socket => sockets.push(socket),
  };
}
function socket(ctx) {
  return {
    readyState: 1, bufferedAmount: 0, frames: [], attachment: null,
    send(raw) {
      const frame = JSON.parse(raw);
      if (['welcome', 'snapshot', 'ack'].includes(frame.type)) {
        const cp = decodeRoomCheckpoint(ctx.storage.data.get('room-checkpoint'));
        assert.ok(cp, 'success frame must follow a valid storage commit');
        const revision = frame.type === 'ack' ? frame.revision : frame.snapshot.revision;
        assert.ok(cp.snapshot.revision >= revision, 'success publication cannot lead durable revision');
      }
      this.frames.push(frame);
    },
    close(code, reason) { this.readyState = 3; this.closeCode = code; this.reason = reason; },
    serializeAttachment(a) { this.attachment = structuredClone(a); },
    deserializeAttachment() { return structuredClone(this.attachment); },
  };
}
const env = { ROOM_ENVIRONMENT: 'development' };
async function fresh(ctx, roomCode = 'recover1', resume = null) {
  const room = new RoomDurableObject(ctx, ctx.env ?? env);
  await room.ready;
  const ws = socket(ctx);
  const conn = { socket: ws, roomCode, identity: null, connectionId: null, closed: false, lastSeenAt: now, handshakeTimer: null, livenessTimer: null };
  room.acceptConnection(ws, conn);
  await room.webSocketMessage(ws, JSON.stringify({ version: SERVER_ROOM_VERSION, type: 'hello', roomCode, name: 'Player', resume }));
  return { room, ws, welcome: ws.frames.find(frame => frame.type === 'welcome') };
}
async function join(room, ctx, resume = null) {
  const ws = socket(ctx);
  const conn = { socket: ws, roomCode: 'recover1', identity: null, connectionId: null, closed: false, lastSeenAt: now, handshakeTimer: null, livenessTimer: null };
  room.acceptConnection(ws, conn);
  await room.webSocketMessage(ws, JSON.stringify({ version: SERVER_ROOM_VERSION, type: 'hello', roomCode: 'recover1', name: 'Guest', resume }));
  return ws;
}
async function command(room, ws, payload, sequence) {
  const cp = room.checkpoint();
  await room.webSocketMessage(ws, JSON.stringify({
    version: SERVER_ROOM_VERSION, type: 'command', sessionId: cp.snapshot.sessionId,
    connectionId: ws.attachment.connectionId, sequence,
    roundNumber: cp.snapshot.session.context.roundNumber, puttIndex: cp.snapshot.session.context.puttIndex, payload,
  }));
}
try {
  const ctx = context();
  let { room, ws, welcome } = await fresh(ctx);
  assert.ok(welcome);
  room.queuedUpgrades = SERVER_ROOM_LIMITS.pendingHandshakes;
  assert.equal((await room.fetch(new Request('http://localhost/api/rooms/recover1/socket'))).status, 503, 'upgrade waiters are bounded before entering the serial queue');
  room.queuedUpgrades = 0;
  const guest = await join(room, ctx);
  const guestWelcome = guest.frames.find(frame => frame.type === 'welcome');
  await command(room, ws, { type: 'START_VOTING' }, 1);
  await command(room, ws, { type: 'CAST_VOTE', mapIndex: 0 }, 2);
  const votingAt = room.checkpoint().deadlines.voteAt;
  now += 5000;
  room = new RoomDurableObject(ctx, ctx.env ?? env); await room.ready;
  assert.equal(room.checkpoint().deadlines.voteAt, votingAt);
  assert.equal(room.runtime.identities.get(welcome.playerId).socket.socket, ws, 'hibernation retains the existing socket');
  await command(room, ws, { type: 'CAST_VOTE', mapIndex: 0 }, 2);
  assert.equal(ws.frames.at(-1).code, 'sequence-rejected');
  await command(room, guest, { type: 'CAST_VOTE', mapIndex: 0 }, 1);
  assert.equal(room.checkpoint().snapshot.session.node, 'play.starting');
  const startAt = room.checkpoint().deadlines.startAt;
  now = startAt;
  await room.alarm();
  assert.equal(room.checkpoint().snapshot.session.node, 'play.active.settling');
  room = new RoomDurableObject(ctx, ctx.env ?? env); await room.ready;
  assert.equal(room.checkpoint().snapshot.session.node, 'play.active.settling');
  now += 1500; await room.alarm();
  assert.equal(room.checkpoint().snapshot.session.node, 'play.active.running');
  await command(room, ws, { type: 'REPORT_SCORE', strokes: 2, timedOut: false }, 3);
  const round = room.checkpoint().snapshot.session.context.roundNumber;
  room = new RoomDurableObject(ctx, ctx.env ?? env); await room.ready;
  await command(room, ws, { type: 'REPORT_SCORE', strokes: 2, timedOut: false }, 3);
  assert.equal(ws.frames.at(-1).code, 'sequence-rejected');
  assert.equal(room.checkpoint().snapshot.session.context.roundNumber, round);
  assert.equal(room.checkpoint().snapshot.session.context.players[welcome.playerId].score, 2);
  guest.readyState = 3;
  await room.webSocketClose(guest);
  const grace = room.checkpoint().snapshot.seats.find(seat => seat.playerId === guestWelcome.playerId).resumeUntil;
  const resumed = await join(room, ctx, { sessionId: guestWelcome.snapshot.sessionId, playerId: guestWelcome.playerId, token: guestWelcome.resumeToken });
  assert.ok(resumed.frames.some(frame => frame.type === 'welcome'));
  assert.equal(room.checkpoint().snapshot.seats.length, 2);
  assert.ok(grace > now);
  const before = ctx.storage.data.get('room-checkpoint');
  ctx.storage.fail = true;
  const oldError = console.error; console.error = () => {};
  try { await command(room, resumed, { type: 'REPORT_SCORE', strokes: 3, timedOut: false }, 1); }
  finally { console.error = oldError; }
  assert.equal(ctx.storage.data.get('room-checkpoint'), before, 'failed commit retains previous durable state');
  assert.ok(!resumed.frames.some(frame => frame.type === 'ack' && frame.sequence === 1), 'failed command cannot be acknowledged');
  ctx.storage.fail = false;
  const cp = decodeRoomCheckpoint(before);
  // Lose all sockets as in a true process restart, with the same durable state.
  const restartCtx = context(ctx.storage);
  room = new RoomDurableObject(restartCtx, env); await room.ready;
  const restored = room.checkpoint();
  assert.equal(restored.snapshot.sessionId, cp.snapshot.sessionId);
  assert.ok(restored.snapshot.seats.every(seat => seat.connectedSince === null && seat.resumeUntil > now));
  assert.equal(restored.snapshot.controllerId, null);
  const returning = await join(room, restartCtx, { sessionId: welcome.snapshot.sessionId, playerId: welcome.playerId, token: welcome.resumeToken });
  assert.ok(returning.frames.some(frame => frame.type === 'welcome'));
  assert.equal(room.checkpoint().snapshot.controllerId, welcome.playerId);
  assert.equal(room.checkpoint().snapshot.session.context.players[welcome.playerId].score, 2);
  const presenceBefore = ctx.storage.writes;
  room.runtime.pendingPresence.set(welcome.playerId, { payload: { x: 1, y: 2, z: 3, mode: 'play', strokes: 2 }, roundNumber: round, puttIndex: 0 });
  await room.enqueue(() => room.flushPresence(room.runtime));
  const reserved = room.checkpoint().presenceSequence;
  assert.ok(reserved >= 1024);
  assert.ok(ctx.storage.writes > presenceBefore);
  room = new RoomDurableObject(restartCtx, env); await room.ready;
  assert.equal(room.runtime.presenceSequence, reserved, 'reconstruction skips unused presence numbers');
  const writesBeforeMovement = restartCtx.storage.writes;
  const alarmsBeforeMovement = restartCtx.storage.alarmWrites;
  for (let i = 0; i < 20; i++) {
    now++;
    await room.enqueue(() => room.refreshLiveness(room.connections.get(returning)));
  }
  assert.equal(restartCtx.storage.writes, writesBeforeMovement, 'healthy liveness never checkpoints every physics frame');
  assert.equal(restartCtx.storage.alarmWrites, alarmsBeforeMovement, 'healthy traffic does not rewrite its alarm every frame');
  const incompatible = new Storage();
  incompatible.data.set('room-checkpoint', JSON.stringify({ ...cp, schemaVersion: 999 }));
  const bad = new RoomDurableObject(context(incompatible), env); await bad.ready;
  assert.equal(bad.incompatible, true);
  assert.ok(incompatible.data.has('room-checkpoint'), 'incompatible state is never silently erased');
  for (const r of [room, bad]) { if (r.runtime) { clearTimeout(r.runtime.presenceTimer); r.runtime.session.dispose(); } }

  // Explicit leave revokes identity, while a dropped guest reserves capacity.
  {
    const c = context();
    const h = await fresh(c);
    const g1 = await join(h.room, c), g2 = await join(h.room, c), g3 = await join(h.room, c);
    for (let i = 0; i < 4; i++) await join(h.room, c); // host + 7 guests fill all eight seats
    const gWelcome = g1.frames.find(f => f.type === 'welcome');
    const duplicate = await join(h.room, c, { sessionId: gWelcome.snapshot.sessionId, playerId: gWelcome.playerId, token: gWelcome.resumeToken });
    assert.equal(duplicate.frames.at(-1).code, 'identity-rejected');
    g1.readyState = 3; await h.room.webSocketClose(g1);
    const full = await join(h.room, c);
    assert.equal(full.frames.at(-1).code, 'room-full', 'reserved seat counts against capacity');
    const forged = await join(h.room, c, { sessionId: gWelcome.snapshot.sessionId, playerId: gWelcome.playerId, token: 'A'.repeat(43) });
    assert.equal(forged.frames.at(-1).code, 'session-expired');
    await command(h.room, h.ws, { type: 'LEAVE_ROOM' }, 1);
    assert.ok(h.ws.frames.some(f => f.type === 'ack' && f.sequence === 1), 'leave ack precedes close');
    assert.equal(h.room.checkpoint().snapshot.controllerId, g2.attachment.playerId);
    const revoked = await join(h.room, c, { sessionId: h.welcome.snapshot.sessionId, playerId: h.welcome.playerId, token: h.welcome.resumeToken });
    assert.equal(revoked.frames.at(-1).code, 'session-expired');
    for (const client of [g2, g3]) client.readyState = 3;
  }
  // Policy overrides are retained in the room; grace expiry and empty retention are durable.
  {
    const c = context();
    c.env = { ...env, ROOM_POLICY: JSON.stringify({ reconnectGraceMs: 1000, controllerTransferDelayMs: 500, emptyRoomTtlMs: 1000 }) };
    const h = await fresh(c);
    const g = await join(h.room, c);
    h.ws.readyState = 3; await h.room.webSocketClose(h.ws);
    assert.equal(h.room.checkpoint().snapshot.controllerId, h.welcome.playerId, 'configured delay holds controls');
    now += 500; await h.room.alarm();
    assert.equal(h.room.checkpoint().snapshot.controllerId, g.attachment.playerId);
    now += 500; await h.room.alarm();
    assert.equal(h.room.checkpoint().snapshot.seats.length, 1);
    const expired = await join(h.room, c, { sessionId: h.welcome.snapshot.sessionId, playerId: h.welcome.playerId, token: h.welcome.resumeToken });
    assert.equal(expired.frames.at(-1).code, 'session-expired');
    g.readyState = 3; await h.room.webSocketClose(g);
    now += 1000; await h.room.alarm(); await h.room.alarm();
    assert.equal(h.room.runtime, null);
    assert.equal(c.storage.data.has('room-checkpoint'), false);
    const newRoom = await fresh(c);
    assert.notEqual(newRoom.welcome.snapshot.sessionId, h.welcome.snapshot.sessionId, 'expired room code creates a distinct session');
  }
  // Delayed alarms catch up against their original timestamp, once per round.
  {
    const c = context();
    const h = await fresh(c);
    await command(h.room, h.ws, { type: 'START_VOTING' }, 1);
    await command(h.room, h.ws, { type: 'CAST_VOTE', mapIndex: 0 }, 2);
    const fallback = h.room.checkpoint().deadlines.fallbackAt;
    now = fallback;
    h.ws.attachment.lastSeenAt = now;
    const reconstructed = new RoomDurableObject(c, env); await reconstructed.ready;
    const cpAfter = reconstructed.checkpoint();
    assert.equal(cpAfter.snapshot.session.context.puttIndex, 1);
    assert.equal(cpAfter.snapshot.session.context.roundStartTime, fallback + 2500, 'catch-up does not restart timers from constructor time');
    assert.equal(cpAfter.snapshot.session.context.players[h.welcome.playerId].scores.length, 1);
    await reconstructed.alarm(); await reconstructed.alarm();
    assert.equal(reconstructed.checkpoint().snapshot.session.context.players[h.welcome.playerId].scores.length, 1);
  }
  // An expired reservation is removed before a fallback at the same timestamp.
  {
    const c = context();
    const h = await fresh(c);
    const g = await join(h.room, c);
    await command(h.room, h.ws, { type: 'START_VOTING' }, 1);
    await command(h.room, h.ws, { type: 'CAST_VOTE', mapIndex: 0 }, 2);
    await command(h.room, g, { type: 'CAST_VOTE', mapIndex: 0 }, 1);
    const fallback = h.room.checkpoint().deadlines.fallbackAt;
    now = fallback - 30000;
    for (const ws of [h.ws, g]) { ws.attachment.lastSeenAt = now; h.room.connections.get(ws).lastSeenAt = now; }
    await h.room.alarm();
    await command(h.room, h.ws, { type: 'REPORT_SCORE', strokes: 2, timedOut: false }, 3);
    g.readyState = 3; await h.room.webSocketClose(g);
    now = fallback;
    h.room.connections.get(h.ws).lastSeenAt = now;
    await h.room.alarm();
    const state = h.room.checkpoint().snapshot.session.context;
    assert.equal(state.puttIndex, 1);
    assert.equal(state.players[g.attachment.playerId].scores.length, 0, 'expired player is not given a fabricated timeout score');
    assert.equal(state.players[h.welcome.playerId].scores.length, 1);
  }
  // A failed close callback can be reconciled without requiring another object restart.
  {
    const c = context(); const h = await fresh(c); const g = await join(h.room, c);
    c.storage.fail = true; h.ws.readyState = 3;
    const oldError = console.error; console.error = () => {};
    try { await h.room.webSocketClose(h.ws); } finally { console.error = oldError; }
    c.storage.fail = false;
    await h.room.enqueue(() => {});
    assert.ok(h.room.checkpoint().snapshot.seats.every(seat => seat.connectedSince === null), 'failed cleanup does not leave permanently live phantom seats');
  }
  // Admission cannot leak a welcome when storage is unavailable.
  {
    const c = context(); c.storage.fail = true;
    const oldError = console.error; console.error = () => {};
    let admission;
    try { admission = await fresh(c); } finally { console.error = oldError; }
    assert.equal(admission.welcome, undefined);
    assert.equal(admission.ws.frames.at(-1).code, 'service-unavailable');
    assert.equal(c.storage.data.has('room-checkpoint'), false);
  }

  console.log('PASS: checkpoint-before-publication, hibernation bindings, durable sequence replay, resume, failed writes, socket-loss reconstruction, presence reservation and incompatible state.');
} finally { Date.now = realNow; }
