/**
 * Room connection for the app: a solo room, or a PeerJS room where the first
 * player to claim the room code's host ID becomes host and later players join
 * as guests (the legacy peerRoom() behaviour). Hides host/guest differences
 * behind one interface: room snapshots, remote presence, commands and status.
 */

import { bindRoomSession, createPeerTransport, createSoloTransport } from '../network/index.js';
import { createRoomSession } from '../session/index.js';
import { hostIdFor, PRESENCE_INTERVAL_MS, SOLO_ID } from './rules.js';

const randomId = random => Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)]).join('');
/** Errors meaning the room code's host ID is taken, so this player should join as a guest. */
const HOST_TAKEN = new Set(['identity-unavailable', 'Duplicate peer identity']);

/**
 * @param {object} options
 * @param {boolean} options.multi
 * @param {string} options.name Display name (already sanitized)
 * @param {string} [options.roomCode] Sanitized room code (multi only)
 * @param {object} [options.peerOptions] PeerJS options, e.g. ICE servers
 * @param {Function} [options.Peer] PeerJS constructor (multi with the default transport factory)
 * @param {{now: () => number, setTimeout: Function, clearTimeout: Function}} options.clock Local monotonic clock
 * @param {() => number} [options.random]
 * @param {(options: object) => object} [options.createTransport] Test seam; defaults to PeerJS
 */
export async function openRoom({ multi, name, roomCode = '', peerOptions = {}, Peer, clock, random = Math.random, createTransport }) {
  const now = () => clock.now();
  const makePeer = createTransport || (options => createPeerTransport({ Peer, peerOptions, clock, ...options }));
  let transport, session = null, unbind = null;

  if (!multi) {
    transport = createSoloTransport({ peerId: SOLO_ID, sessionId: randomId(random), now });
  } else {
    const hostId = hostIdFor(roomCode);
    transport = makePeer({ peerId: hostId, hostId, sessionId: randomId(random), now });
    try {
      await transport.connect();
    } catch (error) {
      transport.close();
      if (!HOST_TAKEN.has(error?.message)) throw error;
      transport = makePeer({ peerId: 'pp-' + randomId(random), hostId, now });
    }
  }
  try {
    if (transport.connectionState !== 'connected') await transport.connect();
  } catch (error) {
    transport.close();
    throw error;
  }

  const snapshotListeners = new Set(), presenceListeners = new Set(), statusListeners = new Set();
  const emitSnapshot = s => { for (const l of [...snapshotListeners]) l(s); };
  const presence = new Map(); // host: latest presence per sender for the current round
  const emitPresence = () => { const map = Object.fromEntries([...presence].map(([id, v]) => [id, v.payload])); for (const l of [...presenceListeners]) l(map); };
  const stops = [];
  let last = null, closed = false;

  if (transport.isHost) {
    session = createRoomSession({ hostId: transport.peerId, hostName: name, clock: { now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout } });
    unbind = bindRoomSession(transport, session, { clock });
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
  } else {
    stops.push(transport.subscribe(message => {
      if (message.type !== 'snapshot') return;
      const { presence: positions = {}, ...snapshot } = message.payload;
      last = snapshot;
      emitSnapshot(snapshot);
      presence.clear();
      for (const [id, payload] of Object.entries(positions)) presence.set(id, { payload });
      emitPresence();
    }));
    transport.send({ type: 'command', payload: { type: 'JOIN_ROOM', name } });
  }
  stops.push(transport.subscribeStatus(status => { for (const l of [...statusListeners]) l(status); }));

  return {
    isHost: transport.isHost,
    localId: transport.peerId,
    roomCode: multi ? roomCode : '',
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
      closed = true;
      for (const stop of stops.splice(0)) stop();
      snapshotListeners.clear(); presenceListeners.clear(); statusListeners.clear();
      if (!transport.isHost && transport.connectionState === 'connected') transport.send({ type: 'command', payload: { type: 'LEAVE_ROOM' } });
      unbind?.();
      transport.close();
      session?.dispose();
    },
  };
}
