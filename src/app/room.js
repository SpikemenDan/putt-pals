/**
 * Production online rooms use the durable WebSocket service. Solo uses the
 * in-memory session. The legacy transport seam below keeps unit fixtures
 * independent from the browser service.
 */

import { connectServerRoom } from '../network/server-room.js';
import { bindRoomSession, createSoloTransport } from '../network/index.js';
import { HEARTBEAT_MS, LINK_TIMEOUT_MS, validResumeToken } from '../network/protocol.js';
import { createRoomSession } from '../session/index.js';
import { RECONNECT_GRACE_PERIOD_MS } from '../shared/constants.js';
import { hostIdFor, PRESENCE_INTERVAL_MS, SOLO_ID } from './rules.js';

const randomId = random => Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)]).join('');
/** Errors meaning the room code's host ID is taken, so this player should join as a guest. */
const HOST_TAKEN = new Set(['identity-unavailable', 'Duplicate peer identity']);
/** Refusals that reconnecting cannot fix. */
const FINAL = new Set(['room-full', 'identity-rejected']);
/** Delay between guest reconnect attempts. */
export const RECONNECT_RETRY_MS = 2000;

/** A guest's resumable identity: its peer ID plus a secret only the host learns. */
export const validIdentity = v => !!v && typeof v === 'object' && typeof v.peerId === 'string' && /^pp-[a-z0-9]{16}$/.test(v.peerId) && validResumeToken(v.token);
export const createIdentity = random => ({ peerId: 'pp-' + randomId(random), token: randomId(random) + randomId(random) });

/**
 * @param {object} options
 * @param {boolean} options.multi
 * @param {string} options.name Display name (already sanitized)
 * @param {string} [options.roomCode] Sanitized room code (multi only)
 * @param {{now: () => number, setTimeout: Function, clearTimeout: Function}} options.clock Local monotonic clock
 * @param {() => number} [options.random]
 * @param {(options: object) => object} [options.createTransport] Legacy unit-test transport seam
 * @param {{peerId: string, token: string}} [options.identity] Guest identity to resume (a new one is made if missing or invalid)
 * @param {number} [options.graceMs] How long a guest keeps trying to reconnect after its link drops
 */
async function openLocalRoom({ multi, name, roomCode = '', clock, random = Math.random, createTransport, identity = null, graceMs = RECONNECT_GRACE_PERIOD_MS }) {
  const now = () => clock.now();
  if (multi && !createTransport) throw new Error('test transport required');
  const makePeer = createTransport;
  const wait = ms => new Promise(resolve => clock.setTimeout(resolve, ms));
  const hostId = multi ? hostIdFor(roomCode) : SOLO_ID;
  const guest = validIdentity(identity) ? { peerId: identity.peerId, token: identity.token } : createIdentity(random);
  let transport, session = null, unbind = null;

  /** Guest link with this player's identity. After a reload the old peer ID can stay registered for a few seconds, so retry within grace. */
  const connectGuest = async () => {
    const until = clock.now() + graceMs;
    for (;;) {
      const t = makePeer({ peerId: guest.peerId, hostId, now });
      try { await t.connect(); return t; } catch (error) {
        t.close();
        if (!HOST_TAKEN.has(error?.message) || clock.now() + RECONNECT_RETRY_MS > until) throw error;
      }
      await wait(RECONNECT_RETRY_MS);
    }
  };

  if (!multi) {
    transport = createSoloTransport({ peerId: SOLO_ID, sessionId: randomId(random), now });
    await transport.connect();
  } else {
    transport = makePeer({ peerId: hostId, hostId, sessionId: randomId(random), now });
    try {
      await transport.connect();
    } catch (error) {
      transport.close();
      if (!HOST_TAKEN.has(error?.message)) throw error;
      transport = await connectGuest();
    }
  }

  const snapshotListeners = new Set(), presenceListeners = new Set(), statusListeners = new Set();
  const emitSnapshot = s => { for (const l of [...snapshotListeners]) l(s); };
  const emitStatus = status => { for (const l of [...statusListeners]) l(status); };
  const presence = new Map(); // host: latest presence per sender for the current round
  const emitPresence = () => { const map = Object.fromEntries([...presence].map(([id, v]) => [id, v.payload])); for (const l of [...presenceListeners]) l(map); };
  const stops = [];
  let last = null, closed = false;

  if (transport.isHost) {
    session = createRoomSession({ hostId: transport.peerId, hostName: name, clock: { now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout } });
    unbind = bindRoomSession(transport, session, { clock, graceMs, heartbeatMs: HEARTBEAT_MS, linkTimeoutMs: LINK_TIMEOUT_MS });
    stops.push(session.subscribe(s => {
      last = s;
      for (const [id, v] of presence) if (v.roundNumber !== s.roundNumber || v.puttIndex !== s.puttIndex || !s.players[id]?.connected) presence.delete(id);
      emitSnapshot(s);
    }));
    last = session.getSnapshot();
    // The host reads positions straight from presence messages (its own snapshots are only sent to guests).
    let dirty = false, timer;
    stops.push(transport.subscribe(message => {
      if (message.type === 'presence' && last?.phase === 'play' && last.roster.includes(message.senderId) && last.players[message.senderId]?.connected) {
        presence.set(message.senderId, { payload: message.payload, roundNumber: last.roundNumber, puttIndex: last.puttIndex });
        dirty = true;
      }
      if (message.type === 'peer-close') { presence.delete(message.senderId); dirty = true; }
    }));
    const pump = () => { if (closed) return; if (dirty) { dirty = false; emitPresence(); } timer = clock.setTimeout(pump, PRESENCE_INTERVAL_MS); };
    timer = clock.setTimeout(pump, PRESENCE_INTERVAL_MS);
    stops.push(() => clock.clearTimeout(timer));
    stops.push(transport.subscribeStatus(emitStatus));
  } else {
    // Guest: the transport is replaced on reconnect, so its subscriptions are made again each time.
    let linkStops = [], retry = null, beat = null;
    const onMessage = message => {
      if (message.type !== 'snapshot') return;
      const { presence: positions = {}, ...snapshot } = message.payload;
      last = snapshot;
      emitSnapshot(snapshot);
      presence.clear();
      for (const [id, payload] of Object.entries(positions)) presence.set(id, { payload });
      emitPresence();
    };
    const unwire = () => { for (const stop of linkStops.splice(0)) stop(); if (beat !== null) { clock.clearTimeout(beat); beat = null; } };
    // Ping the host, and treat a host that has gone silent (crashed, network cut) like a dropped link.
    const heartbeat = () => {
      beat = clock.setTimeout(() => {
        beat = null;
        if (closed || transport.connectionState !== 'connected') return;
        const seen = transport.lastSeen(hostId);
        if (seen === null || transport.localNow() - seen > LINK_TIMEOUT_MS) { transport.detach(hostId); return; }
        transport.send({ type: 'ping' });
        heartbeat();
      }, HEARTBEAT_MS);
    };
    const reconnect = until => {
      retry = clock.setTimeout(async () => {
        retry = null;
        if (closed) return;
        let next;
        try { next = await connectGuest(); } catch {
          if (closed) return;
          if (clock.now() + RECONNECT_RETRY_MS <= until) reconnect(until); else emitStatus({ state: 'disconnected', reason: 'host-lost' });
          return;
        }
        if (closed) { next.close(); return; }
        transport = next; wire(); emitStatus({ state: 'connected', reason: null });
      }, RECONNECT_RETRY_MS);
    };
    const onLinkStatus = status => {
      if (closed || status.state !== 'disconnected' || FINAL.has(status.reason)) { emitStatus(status); return; }
      // The host holds this guest's seat for the same grace period; retry as a guest only (no host migration).
      unwire(); transport.close();
      emitStatus({ state: 'reconnecting', reason: status.reason });
      reconnect(clock.now() + graceMs);
    };
    function wire() {
      linkStops = [transport.subscribe(onMessage), transport.subscribeStatus(onLinkStatus)];
      transport.send({ type: 'command', payload: { type: 'JOIN_ROOM', name, resume: guest.token } });
      heartbeat();
    }
    wire();
    stops.push(() => { unwire(); if (retry !== null) clock.clearTimeout(retry); });
  }

  return {
    isHost: transport.isHost,
    localId: transport.peerId,
    roomCode: multi ? roomCode : '',
    /** Guest identity to keep for resuming this room after a reload (null for hosts and solo). */
    identity: multi && !transport.isHost ? { ...guest } : null,
    /** Room clock: host monotonic time (guests apply the host offset). */
    now: () => transport.now(),
    get snapshot() { return last; },
    get connected() { return transport.connectionState === 'connected'; },
    onSnapshot(listener) { snapshotListeners.add(listener); if (last) listener(last); return () => snapshotListeners.delete(listener); },
    onPresence(listener) { presenceListeners.add(listener); return () => presenceListeners.delete(listener); },
    onStatus(listener) { statusListeners.add(listener); return () => statusListeners.delete(listener); },
    /** An L1 command without playerId; the transport binds the sender. */
    command(event) { return transport.send({ type: 'command', payload: event }); },
    /** Local ball state for other players: {x, y, z, mode, strokes, effect?, fx?}. */
    presence(payload) { return transport.send({ type: 'presence', payload }); },
    /** Leaves the room and releases the transport, session bridge and timers. Idempotent. */
    close() {
      if (closed) return;
      const wasConnected = transport.connectionState === 'connected';
      closed = true;
      if (!transport.isHost && wasConnected) transport.send({ type: 'command', payload: { type: 'LEAVE_ROOM' } });
      for (const stop of stops.splice(0)) stop();
      snapshotListeners.clear(); presenceListeners.clear(); statusListeners.clear();
      unbind?.();
      transport.close();
      session?.dispose();
    },
  };
}

/** Online production rooms use the v2 service; injected transports retain the legacy unit-test seam. */
export async function openRoom(options) {
  if (!options.multi || options.createTransport) return openLocalRoom(options);
  const server = await connectServerRoom({ roomCode: options.roomCode, name: options.name,
    resume: options.identity, endpoint: options.endpoint, location: options.location,
    clock: options.clock, WebSocket: options.WebSocket, random: options.random, signal: options.signal,
    expectedCourseHash: options.expectedCourseHash, crypto: options.crypto,
  });
  return {
    serverOwned: true, resumed: server.resumed, localId: server.localId, roomCode: server.roomCode,
    get controllerId() { return server.controllerId; },
    get isHost() { return server.isController; }, // Compatibility permission flag for existing view models.
    get isController() { return server.isController; },
    get identity() { return server.identity; },
    get snapshot() { return server.snapshot; },
    get connected() { return server.connected; },
    now: server.now, command: server.send, presence: server.sendPresence,
    onSnapshot: server.onSnapshot, onPresence: server.onPresence, onStatus: server.onStatus,
    close: options => server.close(options),
  };
}
