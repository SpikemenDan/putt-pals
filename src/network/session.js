import { SNAPSHOT_INTERVAL_MS } from '../shared/constants.js';

/** Host-side bridge. The caller owns the session and transport lifetimes. */
export function bindRoomSession(transport, session, { clock = globalThis } = {}) {
  if (!transport.isHost || session.getSnapshot().hostId !== transport.peerId) throw new Error('Host session required');
  const positions = new Map(); let dirty = false, stopped = false, timer;
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
  const unsubscribe = transport.subscribe(message => {
    if (message.type === 'command') session.send({ ...message.payload, playerId: message.senderId });
    if (message.type === 'peer-close') { positions.delete(message.senderId); session.send({ type: 'LEAVE_ROOM', playerId: message.senderId }); }
    if (message.type === 'presence') {
      const snapshot = session.getSnapshot();
      if (snapshot.phase === 'play' && snapshot.roster.includes(message.senderId) && snapshot.players[message.senderId]?.connected) {
        positions.set(message.senderId, { payload: message.payload, roundNumber: snapshot.roundNumber, puttIndex: snapshot.puttIndex });
        dirty = true;
      }
    }
    if (message.type === 'peer-open' || message.type === 'command') publish();
  });
  const tick = () => { if (stopped) return; if (dirty) publish(); timer = clock.setTimeout(tick, SNAPSHOT_INTERVAL_MS); };
  const stopSession = session.subscribe(publish);
  timer = clock.setTimeout(tick, SNAPSHOT_INTERVAL_MS); publish();
  return () => { stopped = true; clock.clearTimeout(timer); unsubscribe(); stopSession(); positions.clear(); };
}
