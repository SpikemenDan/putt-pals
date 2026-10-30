import {
  SERVER_ROOM_VERSION, SERVER_ROOM_LIMITS, decodeRoomFrame, encodeRoomFrame,
  validRoomCode, validRoomId, validRoomSecret, validServerCommand,
} from './contracts/server-room.js';
import { createCourseDocument } from '../courses/document.js';
import { sessionValue } from '../session/recovery.js';

const fatalErrors = new Set(['incompatible-version', 'checkpoint-incompatible', 'session-expired', 'identity-rejected', 'room-full', 'history-full', 'invalid-message', 'course-incompatible']);
export const validServerIdentity = identity => !!identity && validRoomId(identity.sessionId)
  && validRoomId(identity.playerId) && validRoomSecret(identity.token);
const loopback = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

export async function browserCourseHash(crypto = globalThis.crypto) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(createCourseDocument())));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function serverRoomUrl(roomCode, { endpoint, location = globalThis.location } = {}) {
  if (!validRoomCode(roomCode)) throw new Error('invalid-message');
  const page = new URL(location?.href ?? 'http://localhost/');
  const target = new URL(endpoint ?? page.origin, page);
  if (target.username || target.password || target.search || target.hash) throw new Error('invalid-endpoint');
  if (target.protocol === 'http:') target.protocol = 'ws:';
  if (target.protocol === 'https:') target.protocol = 'wss:';
  if (!['ws:', 'wss:'].includes(target.protocol)
    || (target.protocol === 'ws:' && (!loopback(page.hostname) || !loopback(target.hostname)))
    || (target.host !== page.host && !(loopback(page.hostname) && loopback(target.hostname)))) throw new Error('invalid-endpoint');
  target.pathname = `/api/rooms/${roomCode}/socket`;
  return target.href;
}

/** Server-room v2 transport. No host election, physics actor, signaling or ICE. */
export async function connectServerRoom({ roomCode, name, resume = null, endpoint, location,
  clock = { now: () => performance.now(), setTimeout, clearTimeout },
  WebSocket = globalThis.WebSocket, random = Math.random, signal,
  expectedCourseHash, crypto = globalThis.crypto,
} = {}) {
  const url = serverRoomUrl(roomCode, { endpoint, location });
  if (typeof WebSocket !== 'function') throw new Error('no-websocket');
  if (resume !== null && !validServerIdentity(resume)) throw new Error('session-expired');
  const courseHash = expectedCourseHash ?? await browserCourseHash(crypto);
  if (signal?.aborted) throw new Error('cancelled');
  let identity = resume ? { sessionId: resume.sessionId, playerId: resume.playerId, token: resume.token } : null;
  if (encodeRoomFrame({ version: SERVER_ROOM_VERSION, type: 'hello', roomCode, name, resume: identity }, 'client') === null) throw new Error('invalid-message');
  let localId = null, connectionId = null, snapshot = null, wireSnapshot = null;
  let socket = null, generation = 0, closed = false, connected = false, established = false;
  let commandSequence = 0, presenceSequence = 0, serverPresenceSequence = -1, revision = -1;
  let retryTimer = null, handshakeTimer = null, heartbeatTimer = null, expiryTimer = null;
  let until = null, attempt = 0, lastHeard = 0, lastTime = 0, offset = 0, sampled = false, bestRtt = Infinity, nonce = 0;
  const pings = new Map(), listeners = { snapshot: new Set(), presence: new Set(), status: new Set() };
  let positions = {}, currentStatus = { state: 'connecting', reason: null };
  let resolveInitial, rejectInitial;
  const initial = new Promise((resolve, reject) => { resolveInitial = resolve; rejectInitial = reject; });
  const emit = (type, value) => { for (const listener of [...listeners[type]]) listener(structuredClone(value)); };
  const status = (state, reason = null) => { currentStatus = { state, reason }; emit('status', currentStatus); };
  const clear = () => {
    for (const timer of [retryTimer, handshakeTimer, heartbeatTimer, expiryTimer]) if (timer !== null) clock.clearTimeout(timer);
    retryTimer = handshakeTimer = heartbeatTimer = expiryTimer = null;
    pings.clear();
  };
  const now = () => { lastTime = Math.max(lastTime, clock.now() + offset); return lastTime; };
  const sync = (serverTime, localTime, rtt = null) => {
    const next = serverTime - localTime;
    if (!sampled) { offset = next; sampled = true; }
    else if (rtt !== null && rtt <= bestRtt) { offset += (next - offset) * 0.2; bestRtt = rtt; }
  };
  const end = (reason, explicit = false) => {
    if (closed) return;
    if (explicit && connected) send({ type: 'LEAVE_ROOM' });
    closed = true; connected = false; generation++; clear();
    signal?.removeEventListener('abort', abort);
    if (socket && socket.readyState < 2) socket.close(1000, explicit ? 'Left room' : 'Client disposed');
    status(explicit ? 'closed' : 'disconnected', reason);
    if (!established) rejectInitial(new Error(reason ?? 'cancelled'));
    for (const set of Object.values(listeners)) set.clear();
  };
  const abort = () => end('cancelled');
  signal?.addEventListener('abort', abort, { once: true });
  const sendFrame = frame => {
    if (closed || !socket || socket.readyState !== 1) return false;
    const raw = encodeRoomFrame(frame, 'client');
    if (raw === null) return false;
    if ((socket.bufferedAmount || 0) + new TextEncoder().encode(raw).byteLength > SERVER_ROOM_LIMITS.outgoingQueueBytes) {
      lost('service-unavailable'); return false;
    }
    try { socket.send(raw); return true; } catch { lost('service-unavailable'); return false; }
  };
  function send(event) {
    if (!connected || !wireSnapshot || !event || typeof event !== 'object') return false;
    const { roundNumber, ...payload } = event;
    const c = wireSnapshot.session.context;
    if (['REPORT_SCORE', 'UPDATE_STROKES'].includes(event.type)) {
      if (event.puttIndex !== undefined && event.puttIndex !== c.puttIndex) return false;
      delete payload.puttIndex;
    }
    if ((roundNumber !== undefined && roundNumber !== c.roundNumber) || !validServerCommand(payload)) return false;
    const sequence = commandSequence + 1;
    const ok = sendFrame({ version: SERVER_ROOM_VERSION, type: 'command', sessionId: identity.sessionId,
      connectionId, sequence, roundNumber: c.roundNumber, puttIndex: c.puttIndex, payload });
    if (ok) commandSequence = sequence;
    return ok;
  }
  const apply = s => {
    if (s.roomCode !== roomCode || s.courseHash !== courseHash) { end('course-incompatible'); return false; }
    if (wireSnapshot && s.sessionId !== wireSnapshot.sessionId) { end('session-expired'); return false; }
    if (s.revision <= revision) return false;
    if (wireSnapshot && (s.session.context.roundNumber !== wireSnapshot.session.context.roundNumber
      || s.session.context.puttIndex !== wireSnapshot.session.context.puttIndex)) {
      positions = {}; serverPresenceSequence = -1; emit('presence', positions);
    }
    revision = s.revision; wireSnapshot = s;
    sync(s.serverTime, clock.now());
    snapshot = { ...structuredClone(s.session.context), controllerId: s.controllerId,
      state: sessionValue(s.session.node), phase: s.session.node.split('.')[0] };
    positions = Object.fromEntries(Object.entries(positions).filter(([id]) => s.session.context.players[id]?.connected && s.session.context.roster.includes(id)));
    emit('snapshot', snapshot);
    emit('presence', positions);
    return true;
  };
  const beat = () => {
    heartbeatTimer = clock.setTimeout(() => {
      heartbeatTimer = null;
      if (!connected || closed) return;
      if (clock.now() - lastHeard >= SERVER_ROOM_LIMITS.linkTimeoutMs) { lost('connection-timeout'); return; }
      const clientTime = clock.now(), id = `p${++nonce}`;
      pings.set(id, clientTime);
      while (pings.size > 4) pings.delete(pings.keys().next().value);
      sendFrame({ version: SERVER_ROOM_VERSION, type: 'ping', nonce: id, clientTime });
      beat();
    }, SERVER_ROOM_LIMITS.pingIntervalMs);
  };
  function lost(reason) {
    if (closed || (!connected && retryTimer !== null)) return;
    connected = false; generation++; clear();
    if (socket && socket.readyState < 2) socket.close();
    if (!established) { end(reason ?? 'service-unavailable'); return; }
    until ??= clock.now() + (wireSnapshot?.policy.reconnectGraceMs ?? 30000);
    if (clock.now() >= until) { end('session-expired'); return; }
    status('reconnecting', reason);
    const delay = Math.min(5000, 500 * 2 ** Math.min(attempt++, 4)) * (0.8 + random() * 0.4);
    expiryTimer = clock.setTimeout(() => end('session-expired'), Math.max(0, until - clock.now()));
    retryTimer = clock.setTimeout(() => { retryTimer = null; connect(); }, Math.min(delay, until - clock.now()));
  }
  function connect() {
    if (closed) return;
    const id = ++generation;
    let next;
    try { next = new WebSocket(url); } catch { lost('service-unavailable'); return; }
    socket = next;
    handshakeTimer = clock.setTimeout(() => { if (id === generation) lost('connection-timeout'); }, SERVER_ROOM_LIMITS.handshakeMs);
    next.addEventListener('open', () => {
      if (closed || id !== generation) { next.close(); return; }
      sendFrame({ version: SERVER_ROOM_VERSION, type: 'hello', roomCode, name, resume: identity });
    });
    next.addEventListener('message', event => {
      if (closed || id !== generation) return;
      const frame = decodeRoomFrame(event.data, 'server');
      if (!frame) { end('incompatible-version'); return; }
      lastHeard = clock.now();
      if (frame.type === 'error') {
        if (fatalErrors.has(frame.code)) end(frame.code);
        else if (frame.code === 'service-unavailable') lost(frame.code);
        else status(connected ? 'connected' : 'reconnecting', frame.code);
        return;
      }
      if (frame.type === 'welcome') {
        if (connected || frame.snapshot.roomCode !== roomCode
          || (identity && (frame.playerId !== identity.playerId || frame.snapshot.sessionId !== identity.sessionId))) { end('identity-rejected'); return; }
        localId = frame.playerId; connectionId = frame.connectionId;
        identity = { sessionId: frame.snapshot.sessionId, playerId: localId, token: frame.resumeToken };
        commandSequence = presenceSequence = 0; revision = -1;
        if (!apply(frame.snapshot)) return;
        connected = true; established = true; until = null; attempt = 0; clear(); beat();
        status('connected'); resolveInitial(room); return;
      }
      if (!connected) { end('invalid-message'); return; }
      if (frame.type === 'snapshot') { apply(frame.snapshot); return; }
      if (frame.type === 'presence') {
        const c = wireSnapshot.session.context;
        if (frame.sessionId !== identity.sessionId || frame.roundNumber !== c.roundNumber || frame.puttIndex !== c.puttIndex
          || frame.sequence <= serverPresenceSequence) return;
        serverPresenceSequence = frame.sequence;
        for (const [player, position] of Object.entries(frame.players)) {
          if (c.roster.includes(player) && c.players[player]?.connected) positions[player] = position;
        }
        emit('presence', positions); return;
      }
      if (frame.type === 'pong') {
        const sent = pings.get(frame.nonce); pings.delete(frame.nonce);
        if (sent !== undefined && sent === frame.clientTime) sync(frame.serverTime, (sent + clock.now()) / 2, clock.now() - sent);
        return;
      }
      if (frame.type === 'ack' && (frame.sessionId !== identity.sessionId || frame.connectionId !== connectionId)) end('stale-connection');
    });
    next.addEventListener('close', () => { if (!closed && id === generation) lost('service-unavailable'); });
    next.addEventListener('error', () => { if (!closed && id === generation) lost('service-unavailable'); });
  }
  const room = {
    roomCode, resumed: resume !== null,
    get localId() { return localId; },
    get controllerId() { return snapshot?.controllerId ?? null; },
    get isController() { return connected && localId !== null && snapshot?.controllerId === localId; },
    get identity() { return identity ? { ...identity } : null; },
    get snapshot() { return snapshot ? structuredClone(snapshot) : null; },
    get connected() { return connected && !closed; }, now, send,
    sendPresence(payload) {
      if (!connected || !wireSnapshot) return false;
      const c = wireSnapshot.session.context;
      const sequence = presenceSequence + 1;
      const ok = sendFrame({ version: SERVER_ROOM_VERSION, type: 'presence', sessionId: identity.sessionId,
        connectionId, sequence, roundNumber: c.roundNumber, puttIndex: c.puttIndex, payload });
      if (ok) presenceSequence = sequence;
      return ok;
    },
    onSnapshot(listener) { listeners.snapshot.add(listener); if (snapshot) listener(structuredClone(snapshot)); return () => listeners.snapshot.delete(listener); },
    onPresence(listener) { listeners.presence.add(listener); return () => listeners.presence.delete(listener); },
    onStatus(listener) { listeners.status.add(listener); listener({ ...currentStatus }); return () => listeners.status.delete(listener); },
    close({ leave = true } = {}) { end(null, leave); },
  };
  connect();
  return initial;
}
