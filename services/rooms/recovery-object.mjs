import { RoomDurableObject as RoomCoordinator } from './room-object.mjs';
import { createRoomSession, SESSION_TIMING } from '../../src/session/index.js';
import { sessionNode } from '../../src/session/recovery.js';
import {
  CHECKPOINT_VERSION, ROOM_RULES_VERSION, SERVER_ROOM_LIMITS,
  decodeRoomCheckpoint, dueRoomDeadlines, validRoomCode, validRoomId,
} from '../../src/network/contracts/server-room.js';

const checkpointKey = 'room-checkpoint';
const sequenceBlock = 1024;
const catchupLimit = 64;

/** Durable adapter around the shared room coordinator. No physics is persisted. */
export class RoomDurableObject extends RoomCoordinator {
  constructor(ctx, env) {
    super(ctx, env);
    this.connections = new Map();
    this.effects = null;
    this.committed = null;
    this.eventTime = null;
    this.incompatible = false;
    this.scheduledAlarm = null;
    this.queuedUpgrades = 0;
    this.ready = ctx.blockConcurrencyWhile(() => this.load());
  }

  async load() {
    this.scheduledAlarm = await this.ctx.storage.getAlarm();
    for (const socket of this.ctx.getWebSockets()) {
      const a = socket.deserializeAttachment();
      if (!a || a.schema !== 1 || !validRoomCode(a.roomCode) || !Number.isSafeInteger(a.lastSeenAt) || a.lastSeenAt < 0
        || !Number.isSafeInteger(a.handshakeAt) || a.handshakeAt < 0 || typeof a.rejected !== 'boolean'
        || !(a.playerId === null && a.sessionId === null && a.connectionId === null
          || validRoomId(a.playerId) && validRoomId(a.sessionId) && validRoomId(a.connectionId))) {
        socket.close(1008, 'Invalid socket attachment');
        continue;
      }
      const connection = {
        socket, roomCode: a.roomCode, identity: null, connectionId: null,
        lastSeenAt: a.lastSeenAt, handshakeAt: a.handshakeAt,
        closed: false, rejected: a.rejected === true, handshakeTimer: null, livenessTimer: null,
      };
      this.connections.set(socket, connection);
      if (a.playerId === null) this.pending.add(connection);
    }
    const raw = await this.ctx.storage.get(checkpointKey);
    if (raw !== undefined) {
      const checkpoint = decodeRoomCheckpoint(raw);
      if (!checkpoint) {
        this.incompatible = true;
        for (const connection of this.connections.values()) this.reject(connection, 'checkpoint-incompatible');
        return;
      }
      this.committed = checkpoint;
      await this.restoreCheckpoint(checkpoint);
      if (this.incompatible) return;
    } else {
      for (const connection of this.connections.values()) {
        if (connection.socket.deserializeAttachment()?.playerId !== null) {
          this.reject(connection, 'session-expired', 1008, 'Session expired');
        }
      }
    }
    // A true process restart can lose sockets; hibernation retains them.
    if (this.runtime) {
      await this.catchUp();
    }
    if (this.runtime) {
      await this.transaction(() => this.disconnectLostBindings());
    }
  }

  async fetch(request) {
    await this.ready;
    if (this.incompatible) return new Response('Room checkpoint incompatible. Rejoin after operator review.', { status: 503 });
    if (this.pending.size + this.queuedUpgrades >= SERVER_ROOM_LIMITS.pendingHandshakes) {
      return Response.json({ error: 'room-full' }, { status: 503, headers: { 'retry-after': '1' } });
    }
    this.queuedUpgrades++;
    try {
      const response = await this.enqueue(() => super.fetch(request));
      return response ?? new Response('Room temporarily unavailable.', { status: 503 });
    } finally { this.queuedUpgrades--; }

  }

  acceptConnection(server, connection) {
    this.ctx.acceptWebSocket(server);
    connection.handshakeAt = Date.now();
    this.connections.set(server, connection);
    this.pending.add(connection);
    this.attach(connection);
  }

  attach(connection) {
    connection.socket.serializeAttachment({
      schema: 1, roomCode: connection.roomCode,
      sessionId: connection.identity?.sessionId ?? null,
      playerId: connection.identity?.playerId ?? null,
      connectionId: connection.connectionId,
      lastSeenAt: connection.lastSeenAt, handshakeAt: connection.handshakeAt,
      rejected: connection.rejected === true,
    });
  }

  enqueueMessage(connection, raw) {
    // Pre-queue validation/overflow rejection is independent of any in-flight commit.
    const effects = this.effects;
    this.effects = null;
    try { return super.enqueueMessage(connection, raw); }
    finally { this.effects = effects; }
  }

  webSocketMessage(socket, raw) {
    const connection = this.connections.get(socket);
    if (!connection) { socket.close(1008, 'Unknown connection'); return; }
    return this.enqueueMessage(connection, raw);
  }

  webSocketClose(socket) { return this.closeSocket(socket); }
  webSocketError(socket) { return this.closeSocket(socket); }

  closeSocket(socket) {
    const connection = this.connections.get(socket);
    if (!connection || connection.cleanupQueued) return;
    connection.cleanupQueued = true;
    return this.enqueue(() => {
      super.disconnected(connection);
      this.connections.delete(socket);
    });
  }

  // All success frames are buffered until checkpoint + next alarm commit together.
  publish(connection, raw) {
    const publish = () => {
      if (!connection.closed && connection.socket.readyState === 1) connection.socket.send(raw);
    };
    if (this.effects) this.effects.push(publish);
    else publish();
  }

  closeConnection(connection, code, reason) {
    const close = () => connection.socket.close(code, reason);
    if (this.effects) this.effects.push(close);
    else close();
  }

  refreshLiveness(connection) {
    connection.lastSeenAt = Date.now();
    // Attachments carry ephemeral liveness through hibernation, without a checkpoint per ping.
    if (this.effects) this.effects.push(() => this.attach(connection));
    else this.attach(connection);
  }

  bind(connection, identity) {
    super.bind(connection, identity);
    if (this.effects) this.effects.push(() => this.attach(connection));
    else this.attach(connection);
  }

  setRoomTimer() { /* The transaction's durable alarm replaces volatile room timers. */ }

  makeSession(room, options) {
    const session = createRoomSession({ ...options, durable: true });
    session.subscribe(state => {
      if (sessionNode(state.state) === 'play.active.replaying') {
        room.replayAt ??= this.now(room) + SESSION_TIMING.replay;
      } else room.replayAt = null;
    });
    return session;
  }

  enqueue(operation) {
    const result = this.serial.then(async () => {
      await this.ready;
      if (this.incompatible) throw new Error('Incompatible room checkpoint');
      await this.catchUp();
      return this.transaction(() => {
        this.disconnectLostBindings();
        return operation();
      });
    });
    this.serial = result.catch(error => {
      // Never log checkpoint contents, socket attachments, hashes or frames.
      console.error('Room durable operation failed:', error?.name ?? 'Error');
      this.operationFailed(new Error('Durable room operation failed'));
    });
    return this.serial;
  }

  operationFailed() {
    for (const connection of this.connections.values()) {
      if (connection.rejected && connection.socket.readyState < 2) {
        connection.socket.close(1013, 'Room temporarily unavailable');
      } else this.reject(connection, 'service-unavailable', 1013, 'Room temporarily unavailable');
    }
  }

  disconnectLostBindings() {
    const room = this.runtime;
    if (!room) return;
    for (const identity of room.identities.values()) {
      if (room.seats.get(identity.playerId)?.connectedSince === null) continue;
      if (identity.socket && !identity.socket.closed && !identity.socket.rejected && identity.socket.socket.readyState === 1) continue;
      // A failed close transaction may already have removed its ephemeral socket map entry.
      const connection = { socket: { readyState: 3 }, identity, connectionId: identity.connectionId, closed: false };
      identity.socket = connection;
      super.disconnected(connection);
    }
  }

  async transaction(operation) {
    const effects = [];
    this.effects = effects;
    try {
      const result = await operation();
      await this.commit();
      this.effects = null;
      for (const effect of effects) effect();
      return result;
    } catch (error) {
      this.effects = null;
      if (this.runtime) {
        clearTimeout(this.runtime.presenceTimer);
        this.runtime.session.dispose();
      }
      this.runtime = null;
      if (this.committed) await this.restoreCheckpoint(this.committed);
      throw error;
    }
  }

  checkpoint() {
    const room = this.runtime;
    if (!room) return null;
    const snapshot = this.snapshot(room);
    const { node, context: c } = snapshot.session;
    return {
      schemaVersion: CHECKPOINT_VERSION, rulesVersion: ROOM_RULES_VERSION,
      courseHash: room.courseHash, savedAt: snapshot.serverTime, snapshot,
      identities: [...room.identities.values()].map(i => ({
        playerId: i.playerId, tokenHash: i.tokenHash, connectionId: i.connectionId, lastSequence: i.lastSequence,
      })),
      deadlines: {
        voteAt: node === 'select.timing' ? c.votingDeadline : null,
        startAt: node === 'play.starting' ? c.roundStartTime : null,
        minimumPlayAt: node === 'play.active.settling' ? c.roundStartTime + SESSION_TIMING.minimumPlay : null,
        fallbackAt: node.startsWith('play.') && c.mode !== 'putt_practice'
          ? c.roundStartTime + c.roundLimitSeconds * 1000 + SESSION_TIMING.fallback : null,
        replayAt: node === 'play.active.replaying' ? room.replayAt : null,
        controllerAt: room.controllerAt, emptyAt: room.emptyAt,
      },
      nextJoinOrder: room.nextJoinOrder,
      presenceSequence: room.presenceReserved ?? 0,
    };
  }

  nextAlarm(checkpoint = this.checkpoint()) {
    const values = checkpoint ? [
      ...Object.values(checkpoint.deadlines),
      ...checkpoint.snapshot.seats.map(seat => seat.resumeUntil),
    ].filter(at => at !== null) : [];
    for (const connection of this.connections.values()) {
      if (connection.closed || connection.rejected) continue;
      values.push(connection.identity
        ? connection.lastSeenAt + SERVER_ROOM_LIMITS.linkTimeoutMs
        : connection.handshakeAt + SERVER_ROOM_LIMITS.handshakeMs);
    }
    return values.length ? Math.min(...values) : null;
  }

  async commit() {
    const checkpoint = this.checkpoint();
    const raw = checkpoint === null ? null : JSON.stringify(checkpoint);
    if (raw !== null && !decodeRoomCheckpoint(raw)) throw new Error('Invalid generated checkpoint');
    const stable = c => c === null ? null : JSON.stringify({
      ...c, savedAt: 0, snapshot: { ...c.snapshot, serverTime: 0 },
    });
    const changed = stable(checkpoint) !== stable(this.committed);
    const wanted = this.nextAlarm(checkpoint);
    // Keep an earlier pending wake instead of writing a new alarm on every movement frame.
    // An early liveness wake simply rechecks current attachment timestamps and rearms.
    const at = wanted !== null && this.scheduledAlarm !== null
      && this.scheduledAlarm > Date.now() && this.scheduledAlarm <= wanted
      ? this.scheduledAlarm : wanted;
    if (!changed && at === this.scheduledAlarm) return;
    await this.ctx.storage.transaction(async tx => {
      if (changed) {
        if (raw === null) await tx.delete(checkpointKey);
        else await tx.put(checkpointKey, raw);
      }
      if (at === null) await tx.deleteAlarm();
      else await tx.setAlarm(at);
    });
    this.scheduledAlarm = at;
    if (changed) this.committed = checkpoint;
  }

  async restoreCheckpoint(checkpoint) {
    const s = checkpoint.snapshot;
    const first = Object.keys(s.session.context.players)[0];
    const room = await super.createRuntime(s.roomCode, s.session.context.players[first]?.name ?? 'Host');
    room.session.dispose();
    if (room.courseHash !== checkpoint.courseHash) {
      this.incompatible = true;
      room.session.dispose();
      for (const connection of this.connections.values()) this.reject(connection, 'checkpoint-incompatible');
      return;
    }
    Object.assign(room, {
      sessionId: s.sessionId, courseHash: s.courseHash, policy: s.policy, revision: s.revision,
      logicalTime: checkpoint.savedAt, seats: new Map(s.seats.map(seat => [seat.playerId, { ...seat }])),
      identities: new Map(), nextJoinOrder: checkpoint.nextJoinOrder,
      presenceSequence: checkpoint.presenceSequence, presenceReserved: checkpoint.presenceSequence,
      emptyAt: checkpoint.deadlines.emptyAt, controllerAt: checkpoint.deadlines.controllerAt,
      replayAt: checkpoint.deadlines.replayAt,
    });
    room.session = this.makeSession(room, {
      controllerId: s.controllerId, hostName: s.session.context.players[first]?.name ?? 'Host',
      serverOwned: true, restore: s.session,
      isReserved: id => {
        const seat = room.seats.get(id);
        return !!seat && seat.connectedSince === null && seat.resumeUntil !== null && seat.resumeUntil > this.now(room);
      },
      clock: { now: () => this.now(room), setTimeout, clearTimeout },
    });
    room.session.subscribe(() => {
      if (room.suppress > 0) room.dirty = true;
      else { room.revision++; this.broadcastSnapshot(room); }
    });
    for (const stored of checkpoint.identities) {
      const identity = await this.createIdentity(room, stored.playerId, s.session.context.players[stored.playerId].name);
      Object.assign(identity, stored);
      room.identities.set(identity.playerId, identity);
    }
    for (const connection of this.connections.values()) {
      connection.identity = null;
      connection.connectionId = null;
      const a = connection.socket.deserializeAttachment();
      if (a?.playerId === null && !connection.closed && !connection.rejected) this.pending.add(connection);
      const identity = room.identities.get(a?.playerId);
      if (a?.roomCode === room.roomCode && a?.sessionId === room.sessionId && identity && identity.connectionId === a.connectionId
        && room.seats.get(identity.playerId)?.connectedSince !== null && !identity.socket) {
        connection.identity = identity;
        connection.connectionId = identity.connectionId;
        identity.socket = connection;
      } else if (a?.playerId !== null) {
        connection.identity = null;
        this.reject(connection, 'session-expired', 1008, 'Stale socket binding');
      }
    }
    this.runtime = room;
  }

  async flushPresence(room) {
    if (this.runtime !== room) return;
    if (room.presenceSequence + 1 > (room.presenceReserved ?? 0)) {
      room.presenceReserved = room.presenceSequence + sequenceBlock;
      // Reserve before publication, even though movement itself is ephemeral.
      await this.commit();
    }
    super.flushPresence(room);
  }

  now(room) {
    const now = this.eventTime ?? Date.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid server clock');
    room.logicalTime = Math.max(room.logicalTime, now);
    return room.logicalTime;
  }

  async catchUp() {
    const wallNow = Date.now();
    for (let step = 0; this.runtime && step < catchupLimit; step++) {
      this.eventTime = this.runtime.logicalTime;
      const checkpoint = this.checkpoint();
      const due = dueRoomDeadlines(checkpoint, wallNow)[0];
      if (!due) { this.eventTime = null; return; }
      this.eventTime = due.at;
      try {
        await this.transaction(() => this.applyDeadline(due));
      } finally { this.eventTime = null; }
    }
    if (this.runtime) {
      this.eventTime = this.runtime.logicalTime;
      const remains = dueRoomDeadlines(this.checkpoint(), wallNow).length > 0;
      this.eventTime = null;
      if (remains) throw new Error('Catch-up batch incomplete; retry before admitting commands');
    }
  }

  applyDeadline(due) {
    const room = this.runtime;
    if (!room) return;
    room.suppress++;
    room.dirty = false;
    if (due.kind === 'resumeUntil') {
      room.seats.delete(due.playerId);
      room.identities.delete(due.playerId);
      room.pendingPresence.delete(due.playerId);
      room.session.expirePlayer(due.playerId);
      if (room.session.getSnapshot().controllerId === due.playerId) {
        room.controllerAt = null;
        this.electController(room);
      }
    } else if (due.kind === 'emptyAt') {
      room.session.dispose();
      clearTimeout(room.presenceTimer);
      this.runtime = null;
    } else if (due.kind === 'controllerAt') {
      room.controllerAt = null;
      this.electController(room);
    } else {
      room.session.advanceDeadline(due.kind, room.session.getSnapshot().roundNumber, due.at);
    }
    if (this.runtime === room) {
      this.abandonIfUnoccupied(room, this.now(room));
      room.dirty = true;
      room.suppress--;
      this.flushChanges(room);
    }
  }

  electController(room) {
    const live = [...room.seats.values()].filter(seat => seat.connectedSince !== null)
      .sort((a, b) => a.connectedSince - b.connectedSince || a.joinOrder - b.joinOrder);
    room.session.setController(live[0]?.playerId ?? null);
  }

  // Alarm failures propagate so Cloudflare can retry; message failures send a bounded error.
  async alarm() {
    await this.ready;
    const result = this.serial.then(async () => {
      if (this.incompatible) return;
      this.scheduledAlarm = null;
      await this.catchUp();
      await this.transaction(() => {
        this.disconnectLostBindings();
        const now = Date.now();
        for (const connection of this.connections.values()) {
          if (connection.closed || connection.rejected) continue;
          const deadline = connection.identity
            ? connection.lastSeenAt + SERVER_ROOM_LIMITS.linkTimeoutMs
            : connection.handshakeAt + SERVER_ROOM_LIMITS.handshakeMs;
          if (deadline > now) continue;
          if (connection.identity) {
            super.disconnected(connection);
            this.closeConnection(connection, 1001, 'Heartbeat expired');
          } else this.reject(connection, 'invalid-message', 1008, 'Handshake timeout');
          this.connections.delete(connection.socket);
        }
      });
    });
    this.serial = result.catch(() => this.operationFailed());
    return result;
  }
}
