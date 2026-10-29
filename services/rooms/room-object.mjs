import { createCourseDocument } from '../../src/courses/document.js';
import { createRoomSession } from '../../src/session/index.js';
import {
  SERVER_ROOM_LIMITS, SERVER_ROOM_VERSION, ROOM_RULES_VERSION,
  authorizeRoomFrame, chooseRoomController, createRoomPolicy, decodeRoomFrame,
  encodeRoomFrame, validRoomCode, validRoomId,
} from '../../src/network/contracts/server-room.js';

const ROOM_SOCKET_PATH = /^\/api\/rooms\/([^/]+)\/socket$/;
const CONTEXT_FIELDS = [
  'mode', 'mapIndex', 'puttIndex', 'roundNumber', 'roundLimitSeconds', 'roundStartTime',
  'votingDeadline', 'votes', 'roster', 'players', 'completedMaps', 'totals', 'last',
];
const commandRate = { burst: SERVER_ROOM_LIMITS.commandBurst, perSecond: SERVER_ROOM_LIMITS.commandsPerSecond };
const presenceRate = { burst: SERVER_ROOM_LIMITS.presenceBurst, perSecond: SERVER_ROOM_LIMITS.presencePerSecond };
const pingRate = { burst: 5, perSecond: 1 };
// Bound retained input before asynchronous admission or command processing.
const incomingQueueFrames = 64;
const incomingQueueBytes = SERVER_ROOM_LIMITS.outgoingQueueBytes;
// Reserve enough wire space for six maximum-width scores and final-map summaries per seat.
const futureScoreReservePerSeat = 6 * 80 + 160;
const futureSnapshotReserveBytes = 512;

function nodeFor(value) {
  if (typeof value === 'string') return value;
  const childName = child => typeof child === 'string' ? child : Object.keys(child)[0];
  const [top, child] = Object.entries(value)[0] || [];
  if (top === 'select') return `select.${childName(child)}`;
  if (top === 'play') {
    const stage = childName(child);
    return stage === 'active' ? `play.active.${childName(child[stage])}` : `play.${stage}`;
  }
  return top;
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function digestHex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function createCourseHash() {
  return digestHex(JSON.stringify(createCourseDocument()));
}

function randomId() {
  const id = crypto.randomUUID();
  if (!validRoomId(id)) throw new Error('Runtime generated an invalid room identity');
  return id;
}

function randomToken() {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function tokenMatches(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string' || expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return difference === 0;
}

function readPolicy(env) {
  if (env.ROOM_POLICY === undefined) return createRoomPolicy();
  let overrides;
  try {
    overrides = JSON.parse(env.ROOM_POLICY);
  } catch {
    throw new Error('ROOM_POLICY must be valid JSON');
  }
  return createRoomPolicy(overrides);
}

function consume(bucket, limit, now) {
  const current = Math.max(bucket.at, now);
  const elapsed = (current - bucket.at) / 1000;
  bucket.tokens = Math.min(limit.burst, bucket.tokens + elapsed * limit.perSecond);
  bucket.at = current;
  if (bucket.tokens < 1) return false;
  bucket.tokens--;
  return true;
}

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export class RoomDurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.pending = new Set();
    this.runtime = null;
    this.serial = Promise.resolve();
    this.queuedFrames = 0;
    this.queuedBytes = 0;
  }

  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/__local/identity' && request.method === 'GET'
      && this.env.ROOM_ENVIRONMENT === 'development' && this.env.ROOM_LOCAL_DIAGNOSTICS === 'true') {
      return Response.json({ id: this.ctx.id.toString() }, {
        headers: { 'cache-control': 'no-store' },
      });
    }

    const route = ROOM_SOCKET_PATH.exec(url.pathname);
    if (!route || !validRoomCode(route[1])) return new Response('Not found.', { status: 404 });
    if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required.', { status: 426 });
    }
    if (!this.originAllowed(request, url)) return new Response('Origin not allowed.', { status: 403 });
    if (this.pending.size >= SERVER_ROOM_LIMITS.pendingHandshakes) {
      return Response.json({ error: 'room-full' }, { status: 503, headers: { 'retry-after': '1' } });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connection = {
      socket: server, roomCode: route[1], identity: null, connectionId: null,
      closed: false, lastSeenAt: Date.now(), handshakeTimer: null, livenessTimer: null,
    };
    server.accept();
    this.pending.add(connection);
    server.addEventListener('message', event => {
      this.enqueueMessage(connection, event.data);
    });
    const disconnect = () => {
      if (connection.cleanupQueued) return;
      connection.cleanupQueued = true;
      this.enqueue(() => this.disconnected(connection));
    };
    server.addEventListener('close', disconnect);
    server.addEventListener('error', disconnect);
    connection.handshakeTimer = setTimeout(() => {
      this.enqueue(() => {
        if (!connection.identity) this.reject(connection, 'invalid-message', 1008, 'Handshake timeout');
      });
    }, SERVER_ROOM_LIMITS.handshakeMs);

    return new Response(null, { status: 101, webSocket: client });
  }

  originAllowed(request, url) {
    const origin = request.headers.get('origin');
    const configured = this.env.ROOM_ALLOWED_ORIGINS;
    if (configured !== undefined) {
      return typeof origin === 'string' && configured.split(',').map(value => value.trim()).includes(origin);
    }
    if (this.env.ROOM_ENVIRONMENT !== 'development' || !isLoopback(url.hostname)) return false;
    if (origin === null) return true;
    try {
      return new URL(origin).origin === origin && origin === url.origin;
    } catch {
      return false;
    }
  }

  enqueueMessage(connection, raw) {
    if (connection.closed || connection.rejected) return;
    if (typeof raw !== 'string') return this.reject(connection, 'invalid-message', 1003, 'Text frames required');
    // Check UTF-16 length first to avoid allocating an encoding for oversized input.
    if (raw.length > SERVER_ROOM_LIMITS.messageBytes) {
      return this.reject(connection, 'invalid-message', 1009, 'Frame too large');
    }
    const bytes = new TextEncoder().encode(raw).byteLength;
    if (bytes > SERVER_ROOM_LIMITS.messageBytes) {
      return this.reject(connection, 'invalid-message', 1009, 'Frame too large');
    }
    if (this.queuedFrames >= incomingQueueFrames || this.queuedBytes + bytes > incomingQueueBytes) {
      return this.reject(connection, 'rate-limited', 1013, 'Room input queue is full');
    }
    this.queuedFrames++;
    this.queuedBytes += bytes;
    return this.enqueue(async () => {
      try {
        if (!connection.closed && !connection.rejected) await this.receive(connection, raw);
      } finally {
        this.queuedFrames--;
        this.queuedBytes -= bytes;
      }
    });
  }

  enqueue(operation) {
    const result = this.serial.then(operation);
    this.serial = result.catch(error => this.operationFailed(error));
    return this.serial;
  }

  operationFailed(error) {
    console.error('Room protocol operation failed', error);
    for (const connection of this.pending) this.reject(connection, 'service-unavailable', 1013, 'Room temporarily unavailable');
    if (this.runtime) {
      for (const identity of this.runtime.identities.values()) {
        if (identity.socket) this.reject(identity.socket, 'service-unavailable', 1013, 'Room temporarily unavailable');
      }
    }
  }

  async receive(connection, raw) {
    if (connection.closed) return;
    if (typeof raw !== 'string') return this.reject(connection, 'invalid-message', 1003, 'Text frames required');
    if (raw.length > SERVER_ROOM_LIMITS.messageBytes || new TextEncoder().encode(raw).byteLength > SERVER_ROOM_LIMITS.messageBytes) {
      return this.reject(connection, 'invalid-message', 1009, 'Frame too large');
    }
    const frame = decodeRoomFrame(raw, 'client');
    if (!frame) {
      let incompatible = false;
      try {
        const parsed = JSON.parse(raw);
        incompatible = parsed && typeof parsed === 'object' && parsed.version !== SERVER_ROOM_VERSION;
      } catch {}
      return this.reject(connection, incompatible ? 'incompatible-version' : 'invalid-message', 1008, 'Invalid room frame');
    }
    if (!connection.identity) {
      if (frame.type !== 'hello') return this.reject(connection, 'invalid-message', 1008, 'Hello required');
      return this.admit(connection, frame);
    }
    if (frame.type === 'hello') return this.reject(connection, 'invalid-message', 1008, 'Already admitted');

    const identity = connection.identity;
    const room = this.runtime;
    if (!room || room.sessionId !== identity.sessionId) return this.reject(connection, 'session-expired', 1008, 'Session expired');
    if (frame.type === 'ping') {
      if (!consume(identity.pingBucket, pingRate, Date.now())) {
        return this.send(connection, { version: SERVER_ROOM_VERSION, type: 'error', code: 'rate-limited', retryAfterMs: 1000 });
      }
      connection.lastSeenAt = Date.now();
      this.refreshLiveness(connection);
      return this.send(connection, {
        version: SERVER_ROOM_VERSION, type: 'pong', nonce: frame.nonce,
        clientTime: frame.clientTime, serverTime: this.now(room),
      });
    }
    connection.lastSeenAt = Date.now();
    this.refreshLiveness(connection);
    if (frame.type === 'command') return this.command(room, connection, identity, frame);
    return this.presence(room, connection, identity, frame);
  }

  async admit(connection, hello) {
    if (hello.roomCode !== connection.roomCode) return this.reject(connection, 'invalid-message', 1008, 'Room code mismatch');
    let room = this.runtime;
    if (hello.resume === null && room === null) {
      room = await this.createRuntime(connection.roomCode, hello.name.trim());
      const token = randomToken();
      const identity = await this.createIdentity(room, room.initialPlayerId, hello.name.trim(), token);
      const now = this.now(room);
      room.seats.set(identity.playerId, { playerId: identity.playerId, joinOrder: room.nextJoinOrder++, connectedSince: now, resumeUntil: null });
      room.identities.set(identity.playerId, identity);
      if (!this.hasSnapshotCapacity(room)) {
        room.session.dispose();
        return this.reject(connection, 'history-full', 1008, 'Room history is full');
      }
      room.revision = 1;
      this.runtime = room;
      this.bind(connection, identity);
      this.clearHandshake(connection);
      this.sendWelcome(connection, room, identity, token);
      this.broadcastSnapshot(room, connection);
      this.setRoomTimer(room);
      return;
    }
    if (!room) return this.reject(connection, 'session-expired', 1008, 'Session expired');

    let identity;
    let token;
    let seat;
    if (hello.resume !== null) {
      const resume = hello.resume;
      identity = room.identities.get(resume.playerId);
      seat = room.seats.get(resume.playerId);
      const tokenHash = await digestHex(resume.token);
      if (resume.sessionId !== room.sessionId || !identity || !seat || !tokenMatches(identity.tokenHash, tokenHash)) {
        return this.reject(connection, 'session-expired', 1008, 'Session expired');
      }
      if (identity.socket || seat.connectedSince !== null) return this.reject(connection, 'identity-rejected', 1008, 'Identity is already connected');
      if (seat.resumeUntil === null || seat.resumeUntil <= this.now(room)) return this.reject(connection, 'session-expired', 1008, 'Resume grace expired');
      token = resume.token;
    } else {
      if (room.seats.size >= SERVER_ROOM_LIMITS.members) return this.reject(connection, 'room-full', 1008, 'Room is full');
      if (Object.keys(room.session.getSnapshot().players).length >= SERVER_ROOM_LIMITS.history) {
        return this.reject(connection, 'history-full', 1008, 'Room history is full');
      }
      const playerId = randomId();
      if (!this.hasSnapshotCapacity(room, { playerId, name: hello.name.trim() })) {
        return this.reject(connection, 'history-full', 1008, 'Room history is full');
      }
      token = randomToken();
      identity = await this.createIdentity(room, playerId, hello.name.trim(), token);
      seat = { playerId, joinOrder: room.nextJoinOrder, connectedSince: this.now(room), resumeUntil: null };
    }

    room.suppress++;
    room.dirty = false;
    if (hello.resume !== null) {
      seat.connectedSince = this.now(room);
      seat.resumeUntil = null;
      identity.connectionId = randomId();
      identity.lastSequence = 0;
      identity.lastPresenceSequence = 0;
      identity.commandBucket = { tokens: commandRate.burst, at: Date.now() };
      identity.presenceBucket = { tokens: presenceRate.burst, at: Date.now() };
      identity.pingBucket = { tokens: pingRate.burst, at: Date.now() };
      if (!room.session.send({ type: 'JOIN_ROOM', playerId: identity.playerId, name: identity.name })) {
        seat.connectedSince = null;
        seat.resumeUntil = this.now(room) + room.policy.reconnectGraceMs;
        room.suppress--;
        return this.reject(connection, 'service-unavailable', 1013, 'Room resume failed');
      }
    } else {
      room.seats.set(identity.playerId, seat);
      if (!room.session.send({ type: 'JOIN_ROOM', playerId: identity.playerId, name: identity.name })) {
        room.seats.delete(identity.playerId);
        room.suppress--;
        return this.reject(connection, 'room-full', 1008, 'Room does not admit new players');
      }
      room.identities.set(identity.playerId, identity);
      room.nextJoinOrder++;
    }
    room.emptyAt = null;
    if (room.session.getSnapshot().controllerId === null) room.session.setController(identity.playerId);
    if (room.session.getSnapshot().controllerId === identity.playerId) room.controllerAt = null;
    room.dirty = true;
    room.suppress--;
    this.flushChanges(room);
    this.bind(connection, identity);
    this.clearHandshake(connection);
    this.sendWelcome(connection, room, identity, token);
    this.broadcastSnapshot(room, connection);
    this.setRoomTimer(room);
  }

  async createRuntime(roomCode, name) {
    const courseHash = await createCourseHash();
    const sessionId = randomId();
    const playerId = randomId();
    const policy = readPolicy(this.env);
    const room = {
      roomCode, sessionId, courseHash, policy, session: null,
      identities: new Map(), seats: new Map(), nextJoinOrder: 1,
      revision: 0, presenceSequence: 0, pendingPresence: new Map(), presenceTimer: null,
      emptyAt: null, controllerAt: null, roomTimer: null, suppress: 0, dirty: false,
      logicalTime: Date.now(),
    };
    room.session = createRoomSession({
      controllerId: playerId, hostName: name, serverOwned: true, isReserved: id => {
        const seat = room.seats.get(id);
        return !!seat && seat.connectedSince === null && seat.resumeUntil !== null && seat.resumeUntil > this.now(room);
      },
      clock: { now: () => this.now(room), setTimeout, clearTimeout },
    });
    room.initialPlayerId = playerId;
    room.suppress++;
    room.session.subscribe(() => {
      if (room.suppress > 0) room.dirty = true;
      else {
        room.revision++;
        this.broadcastSnapshot(room);
      }
    });
    room.suppress--;
    room.dirty = false;
    return room;
  }

  async createIdentity(room, playerId, name, token = randomToken()) {
    const tokenHash = await digestHex(token);
    return {
      playerId, name, tokenHash,
      sessionId: room.sessionId, connectionId: randomId(), socket: null,
      lastSequence: 0, lastPresenceSequence: 0,
      commandBucket: { tokens: commandRate.burst, at: Date.now() },
      presenceBucket: { tokens: presenceRate.burst, at: Date.now() },
      pingBucket: { tokens: pingRate.burst, at: Date.now() },
    };
  }

  bind(connection, identity) {
    connection.identity = identity;
    connection.connectionId = identity.connectionId;
    identity.socket = connection;
    connection.lastSeenAt = Date.now();
    this.refreshLiveness(connection);
  }

  clearHandshake(connection) {
    this.pending.delete(connection);
    clearTimeout(connection.handshakeTimer);
    connection.handshakeTimer = null;
  }

  refreshLiveness(connection) {
    clearTimeout(connection.livenessTimer);
    connection.livenessTimer = setTimeout(() => {
      this.enqueue(() => {
        if (connection.identity && Date.now() - connection.lastSeenAt >= SERVER_ROOM_LIMITS.linkTimeoutMs) {
          connection.socket.close(1001, 'Heartbeat expired');
        }
      });
    }, SERVER_ROOM_LIMITS.linkTimeoutMs);
  }

  sendWelcome(connection, room, identity, resumeToken) {
    this.send(connection, {
      version: SERVER_ROOM_VERSION, type: 'welcome',
      playerId: identity.playerId, connectionId: identity.connectionId,
      resumeToken, snapshot: this.snapshot(room),
    });
  }

  snapshot(room) {
    const state = room.session.getSnapshot();
    const context = Object.fromEntries(CONTEXT_FIELDS.map(field => [field, state[field]]));
    const snapshot = {
      roomCode: room.roomCode, sessionId: room.sessionId, rulesVersion: ROOM_RULES_VERSION,
      courseHash: room.courseHash, revision: room.revision, serverTime: this.now(room),
      controllerId: state.controllerId, policy: room.policy,
      seats: [...room.seats.values()].sort((a, b) => a.joinOrder - b.joinOrder).map(seat => ({ ...seat })),
      session: { node: nodeFor(state.state), context },
    };
    return snapshot;
  }

  hasSnapshotCapacity(room, candidate = null) {
    const snapshot = this.snapshot(room);
    if (candidate) {
      snapshot.seats.push({
        playerId: candidate.playerId, joinOrder: room.nextJoinOrder,
        connectedSince: snapshot.serverTime, resumeUntil: null,
      });
      snapshot.session.context.players[candidate.playerId] = {
        id: candidate.playerId, name: candidate.name, connected: true,
        strokes: 0, done: false, timedOut: false, score: null, scores: [],
      };
    }
    const frame = encodeRoomFrame({ version: SERVER_ROOM_VERSION, type: 'snapshot', snapshot }, 'server');
    if (frame === null) return false;
    const seats = room.seats.size + Number(candidate !== null);
    const reservedBytes = seats * futureScoreReservePerSeat + futureSnapshotReserveBytes;
    return new TextEncoder().encode(frame).byteLength + reservedBytes <= SERVER_ROOM_LIMITS.messageBytes;
  }

  send(connection, frame) {
    if (connection.closed || connection.socket.readyState !== 1) return false;
    const raw = encodeRoomFrame(frame, 'server');
    if (raw === null) throw new Error('Attempted to send an invalid server room frame');
    const bytes = new TextEncoder().encode(raw).byteLength;
    if ((connection.socket.bufferedAmount || 0) + bytes > SERVER_ROOM_LIMITS.outgoingQueueBytes) {
      this.reject(connection, 'service-unavailable', 1013, 'Client is too slow');
      return false;
    }
    connection.socket.send(raw);
    return true;
  }

  reject(connection, code, closeCode = 1008, reason = 'Room protocol rejected') {
    if (connection.closed || connection.rejected) return;
    connection.rejected = true;
    if (this.pending.has(connection)) this.pending.delete(connection);
    try {
      if (connection.socket.readyState === 1) {
        const raw = encodeRoomFrame({ version: SERVER_ROOM_VERSION, type: 'error', code, retryAfterMs: null }, 'server');
        const bytes = raw === null ? 0 : new TextEncoder().encode(raw).byteLength;
        if (raw !== null && (connection.socket.bufferedAmount || 0) + bytes <= SERVER_ROOM_LIMITS.outgoingQueueBytes) {
          connection.socket.send(raw);
        }
      }
      if (connection.socket.readyState < 2) connection.socket.close(closeCode, reason);
    } catch (error) {
      console.error('Failed to close rejected room connection', error);
      if (connection.socket.readyState < 2) connection.socket.close(1011, 'Room error');
    }
  }

  flushChanges(room, broadcast = true) {
    if (room.suppress > 0 || !room.dirty) return;
    room.dirty = false;
    room.revision++;
    if (broadcast) this.broadcastSnapshot(room);
  }

  broadcastSnapshot(room, except = null) {
    let frame;
    try {
      frame = { version: SERVER_ROOM_VERSION, type: 'snapshot', snapshot: this.snapshot(room) };
      const raw = encodeRoomFrame(frame, 'server');
      if (raw === null) throw new Error('Room snapshot failed contract validation');
      frame = raw;
    } catch (error) {
      console.error('Room snapshot validation failed', error);
      for (const identity of room.identities.values()) {
        if (identity.socket && identity.socket !== except) this.reject(identity.socket, 'service-unavailable', 1013, 'Room state unavailable');
      }
      return;
    }
    const bytes = new TextEncoder().encode(frame).byteLength;
    for (const identity of room.identities.values()) {
      const connection = identity.socket;
      if (!connection || connection === except || connection.closed || connection.socket.readyState !== 1) continue;
      if ((connection.socket.bufferedAmount || 0) + bytes > SERVER_ROOM_LIMITS.outgoingQueueBytes) {
        this.reject(connection, 'service-unavailable', 1013, 'Client is too slow');
      } else {
        connection.socket.send(frame);
      }
    }
  }

  command(room, connection, identity, frame) {
    const now = this.now(room);
    if (!consume(identity.commandBucket, commandRate, now)) {
      this.send(connection, { version: SERVER_ROOM_VERSION, type: 'error', code: 'rate-limited', retryAfterMs: 1000 });
      return;
    }
    const binding = { playerId: identity.playerId, connectionId: identity.connectionId, lastSequence: identity.lastSequence };
    const reason = authorizeRoomFrame(frame, binding, this.snapshot(room), now);
    if (reason) {
      this.send(connection, { version: SERVER_ROOM_VERSION, type: 'error', code: reason, retryAfterMs: null });
      if (reason === 'session-expired') this.reject(connection, reason, 1008, 'Session expired');
      return;
    }
    if (['START_VOTING', 'CAST_VOTE'].includes(frame.payload.type) && !this.hasSnapshotCapacity(room)) {
      this.send(connection, { version: SERVER_ROOM_VERSION, type: 'error', code: 'history-full', retryAfterMs: null });
      return;
    }

    identity.lastSequence = frame.sequence;
    room.suppress++;
    const payload = frame.payload;
    const event = {
      type: payload.type, playerId: identity.playerId,
      roundNumber: frame.roundNumber, puttIndex: frame.puttIndex, ...payload,
    };
    const changed = room.session.send(event);
    if (!changed) room.dirty = true;
    if (payload.type === 'LEAVE_ROOM') {
      room.seats.delete(identity.playerId);
      room.identities.delete(identity.playerId);
      identity.socket = null;
      room.pendingPresence.delete(identity.playerId);
      if (room.session.getSnapshot().controllerId === identity.playerId) {
        room.controllerAt = null;
        room.session.setController(chooseRoomController([...room.seats.values()]));
      }
      if (![...room.seats.values()].some(seat => seat.connectedSince !== null)) this.setEmptyDeadline(room);
      this.abandonIfUnoccupied(room, this.now(room));
    }
    room.suppress--;
    this.flushChanges(room);
    this.send(connection, {
      version: SERVER_ROOM_VERSION, type: 'ack', sessionId: identity.sessionId,
      connectionId: identity.connectionId, sequence: frame.sequence, revision: room.revision,
    });
    if (payload.type === 'LEAVE_ROOM') {
      connection.socket.close(1000, 'Left room');
    }
    this.setRoomTimer(room);
  }

  presence(room, connection, identity, frame) {
    const now = this.now(room);
    if (!consume(identity.presenceBucket, presenceRate, now)) {
      this.send(connection, { version: SERVER_ROOM_VERSION, type: 'error', code: 'rate-limited', retryAfterMs: 1000 });
      return;
    }
    const binding = { playerId: identity.playerId, connectionId: identity.connectionId, lastSequence: identity.lastPresenceSequence };
    const reason = authorizeRoomFrame(frame, binding, this.snapshot(room), now);
    if (reason) {
      this.send(connection, { version: SERVER_ROOM_VERSION, type: 'error', code: reason, retryAfterMs: null });
      if (reason === 'session-expired') this.reject(connection, reason, 1008, 'Session expired');
      return;
    }
    identity.lastPresenceSequence = frame.sequence;
    room.pendingPresence.set(identity.playerId, {
      payload: frame.payload, roundNumber: frame.roundNumber, puttIndex: frame.puttIndex,
    });
    if (room.presenceTimer === null) {
      room.presenceTimer = setTimeout(() => this.enqueue(() => this.flushPresence(room)), SERVER_ROOM_LIMITS.presenceIntervalMs);
    }
  }

  flushPresence(room) {
    room.presenceTimer = null;
    if (this.runtime !== room || room.pendingPresence.size === 0) return;
    const state = room.session.getSnapshot();
    const players = Object.fromEntries([...room.pendingPresence]
      .filter(([id, pending]) => room.seats.get(id)?.connectedSince !== null
        && pending.roundNumber === state.roundNumber && pending.puttIndex === state.puttIndex)
      .map(([id, pending]) => [id, pending.payload]));
    room.pendingPresence.clear();
    if (!Object.keys(players).length) return;
    room.presenceSequence++;
    const frame = {
      version: SERVER_ROOM_VERSION, type: 'presence', sessionId: room.sessionId,
      roundNumber: state.roundNumber, puttIndex: state.puttIndex,
      sequence: room.presenceSequence, serverTime: this.now(room), players,
    };
    const raw = encodeRoomFrame(frame, 'server');
    if (raw === null) throw new Error('Coalesced presence failed contract validation');
    const bytes = new TextEncoder().encode(raw).byteLength;
    for (const identity of room.identities.values()) {
      const connection = identity.socket;
      if (!connection || connection.closed || connection.socket.readyState !== 1) continue;
      if ((connection.socket.bufferedAmount || 0) + bytes > SERVER_ROOM_LIMITS.outgoingQueueBytes) {
        this.reject(connection, 'service-unavailable', 1013, 'Client is too slow');
      } else {
        connection.socket.send(raw);
      }
    }
  }

  disconnected(connection) {
    if (connection.closed) return;
    connection.closed = true;
    this.clearHandshake(connection);
    clearTimeout(connection.livenessTimer);
    const identity = connection.identity;
    const room = this.runtime;
    if (!room || !identity || room.identities.get(identity.playerId) !== identity
      || identity.socket !== connection || identity.connectionId !== connection.connectionId) return;

    const now = this.now(room);
    const seat = room.seats.get(identity.playerId);
    if (!seat) return;
    room.suppress++;
    room.dirty = false;
    identity.socket = null;
    identity.connectionId = null;
    seat.connectedSince = null;
    seat.resumeUntil = now + room.policy.reconnectGraceMs;
    room.session.send({ type: 'LEAVE_ROOM', playerId: identity.playerId });
    if (room.session.getSnapshot().controllerId === identity.playerId) {
      if (room.policy.controllerTransferDelayMs > 0) {
        room.controllerAt = now + room.policy.controllerTransferDelayMs;
      } else {
        room.session.setController(chooseRoomController([...room.seats.values()]));
      }
    }
    this.setEmptyDeadline(room);
    room.dirty = true;
    room.suppress--;
    this.flushChanges(room);
    this.setRoomTimer(room);
  }

  setEmptyDeadline(room) {
    if ([...room.seats.values()].some(seat => seat.connectedSince !== null)) room.emptyAt = null;
    else room.emptyAt ??= this.now(room) + room.policy.emptyRoomTtlMs;
  }

  setRoomTimer(room) {
    clearTimeout(room.roomTimer);
    room.roomTimer = null;
    if (this.runtime !== room) return;
    const deadlines = [
      ...[...room.seats.values()].map(seat => seat.resumeUntil),
      room.controllerAt, room.emptyAt,
    ].filter(value => value !== null);
    if (deadlines.length === 0) return;
    const next = Math.min(...deadlines);
    room.roomTimer = setTimeout(() => this.enqueue(() => this.reconcileDeadlines(room)), Math.max(0, next - this.now(room)));
  }

  reconcileDeadlines(room) {
    if (this.runtime !== room) return;
    const now = this.now(room);
    room.suppress++;
    room.dirty = false;
    for (const seat of [...room.seats.values()].filter(item => item.resumeUntil !== null && item.resumeUntil <= now)) {
      room.seats.delete(seat.playerId);
      room.identities.delete(seat.playerId);
      room.pendingPresence.delete(seat.playerId);
      room.session.expirePlayer(seat.playerId);
      if (room.session.getSnapshot().controllerId === seat.playerId) {
        room.controllerAt = null;
        room.session.setController(chooseRoomController([...room.seats.values()]));
      }
      room.dirty = true;
    }
    if (room.controllerAt !== null && room.controllerAt <= now) {
      room.controllerAt = null;
      room.session.setController(chooseRoomController([...room.seats.values()]));
      room.dirty = true;
    }
    this.abandonIfUnoccupied(room, now);
    const expired = room.emptyAt !== null && room.emptyAt <= now
      && ![...room.seats.values()].some(seat => seat.connectedSince !== null);
    if (expired) {
      room.suppress--;
      clearTimeout(room.presenceTimer);
      clearTimeout(room.roomTimer);
      room.session.dispose();
      this.runtime = null;
      return;
    }
    room.suppress--;
    this.flushChanges(room);
    this.setRoomTimer(room);
  }

  abandonIfUnoccupied(room, now) {
    const state = room.session.getSnapshot();
    if (!nodeFor(state.state).startsWith('play.')) return;
    const eligible = state.roster.some(id => {
      const seat = room.seats.get(id);
      return seat && (seat.connectedSince !== null || (seat.resumeUntil !== null && seat.resumeUntil > now));
    });
    if (!eligible && room.session.abandonRoom()) room.dirty = true;
  }

  now(room) {
    const wallClock = Date.now();
    if (!Number.isSafeInteger(wallClock) || wallClock < 0) throw new Error('Invalid server clock');
    room.logicalTime = Math.max(room.logicalTime, wallClock);
    return room.logicalTime;
  }
}
