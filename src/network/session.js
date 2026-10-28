import { RECONNECT_GRACE_PERIOD_MS, SNAPSHOT_INTERVAL_MS } from '../shared/constants.js';

/**
 * Host-side bridge. The caller owns the session and transport lifetimes.
 *
 * Guest recovery (N2): a guest that joins with a resume token owns its player ID. The token stays
 * here on the host and is never broadcast. A link for that ID, now or later, must present the same
 * token before its commands or presence count, so another connection cannot claim the seat. A guest
 * whose link drops keeps its seat (still connected in the session) for `graceMs`, then leaves.
 */
export function bindRoomSession(transport, session, { clock = globalThis, graceMs = RECONNECT_GRACE_PERIOD_MS } = {}) {
  if (!transport.isHost || session.getSnapshot().hostId !== transport.peerId) throw new Error('Host session required');
  const positions = new Map(); let dirty = false, stopped = false, timer;
  // The host's own commands arrive locally (no link), so the host is always verified.
  const tokens = new Map(), verified = new Set([transport.peerId]), grace = new Map();
  const endGrace = id => { if (grace.has(id)) { clock.clearTimeout(grace.get(id)); grace.delete(id); } };
  const publish = () => {
    if (stopped) return;
    const snapshot = session.getSnapshot();
    for (const id of positions.keys()) {
      const p = positions.get(id);
      if (!Object.hasOwn(snapshot.players, id) || !snapshot.players[id].connected
        || p.roundNumber !== snapshot.roundNumber || p.puttIndex !== snapshot.puttIndex) positions.delete(id);
    }
    const presence = Object.fromEntries([...positions].map(([id, value]) => [id, value.payload]));
    transport.send({ type: 'snapshot', payload: { ...snapshot, presence } }); dirty = false;
  };
  const join = (id, { resume, ...command }) => {
    const known = tokens.get(id);
    if (known !== undefined && resume !== known) { transport.reject(id, 'identity-rejected'); return; }
    // An ID already in the room without a token (a guest that never sent one) cannot be resumed by a newcomer.
    if (known === undefined && Object.hasOwn(session.getSnapshot().players, id) && resume !== undefined) { transport.reject(id, 'identity-rejected'); return; }
    if (known === undefined && resume !== undefined) tokens.set(id, resume);
    verified.add(id); endGrace(id);
    session.send({ ...command, playerId: id });
  };
  const unsubscribe = transport.subscribe(message => {
    const id = message.senderId;
    if (message.type === 'command') {
      if (message.payload.type === 'JOIN_ROOM') join(id, message.payload);
      else if (verified.has(id)) session.send({ ...message.payload, playerId: id });
    }
    if (message.type === 'peer-close') {
      verified.delete(id); positions.delete(id);
      const player = session.getSnapshot().players[id];
      if (player?.connected && graceMs > 0 && !grace.has(id)) {
        grace.set(id, clock.setTimeout(() => { grace.delete(id); if (!verified.has(id)) session.send({ type: 'LEAVE_ROOM', playerId: id }); }, graceMs));
      } else if (!grace.has(id)) session.send({ type: 'LEAVE_ROOM', playerId: id });
    }
    if (message.type === 'peer-open') verified.delete(id);
    if (message.type === 'presence' && verified.has(id)) {
      const snapshot = session.getSnapshot();
      if (snapshot.phase === 'play' && snapshot.roster.includes(id) && snapshot.players[id]?.connected) {
        positions.set(id, { payload: message.payload, roundNumber: snapshot.roundNumber, puttIndex: snapshot.puttIndex });
        dirty = true;
      }
    }
    if (['peer-open', 'peer-close', 'command'].includes(message.type)) publish();
  });
  const tick = () => { if (stopped) return; if (dirty) publish(); timer = clock.setTimeout(tick, SNAPSHOT_INTERVAL_MS); };
  const stopSession = session.subscribe(publish);
  timer = clock.setTimeout(tick, SNAPSHOT_INTERVAL_MS); publish();
  return () => {
    stopped = true; clock.clearTimeout(timer); unsubscribe(); stopSession(); positions.clear();
    for (const id of [...grace.keys()]) endGrace(id);
    tokens.clear(); verified.clear();
  };
}
