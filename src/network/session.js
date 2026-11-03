import { RECONNECT_GRACE_PERIOD_MS, SNAPSHOT_INTERVAL_MS } from '../shared/constants.js';
import { hitDeployable, placeDeployable } from '../gameplay/deployables.js';

/**
 * Host-side bridge. The caller owns the session and transport lifetimes.
 *
 * Guest recovery (N2): a guest that joins with a resume token owns its player ID. The token stays
 * here on the host and is never broadcast. A link for that ID, now or later, must present the same
 * token before its commands or presence count, so another connection cannot claim the seat. A guest
 * whose link drops keeps its seat (still connected in the session) for `graceMs`, then leaves.
 *
 * Liveness (opt-in, the app turns it on): with `heartbeatMs` the host re-sends the snapshot at least
 * that often, so guests can tell a quiet room from a dead host; with `linkTimeoutMs` a guest link that
 * has been silent that long (guests ping) is dropped, which starts its grace period. With `heartbeatMs`
 * the host also re-sends the welcome at that interval to guests that have not answered it yet.
 *
 * Deployables (G1e): the host owns the list of placed Bumpers and Orbital Bumpers. DEPLOY_OBJECT and DEPLOY_HIT from
 * verified guests are handled here, not in the session machine, and the list rides in every snapshot. The host's
 * own actions use the returned function's `deploy(command)` and `hit(id)`. `validPlacement(map, putt, x, y)` is the
 * optional course check (on the floor, clear of walls). Records are dropped when the putt changes.
 */
export function bindRoomSession(transport, session, { clock = globalThis, graceMs = RECONNECT_GRACE_PERIOD_MS, heartbeatMs = 0, linkTimeoutMs = 0, validPlacement } = {}) {
  if (!transport.isHost || session.getSnapshot().hostId !== transport.peerId) throw new Error('Host session required');
  const positions = new Map(); let dirty = false, stopped = false, timer;
  let deployables = [], deploySequence = 0, deployReason = ''; const lastHit = new Map();
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
    deployables = deployables.filter(d => d.map === snapshot.mapIndex && d.putt === snapshot.puttIndex && snapshot.phase === 'play' && Object.hasOwn(snapshot.players, d.owner));
    for (const id of [...lastHit.keys()]) if (!deployables.some(d => d.id === id)) lastHit.delete(id);
    const presence = Object.fromEntries([...positions].map(([id, value]) => [id, value.payload]));
    transport.send({ type: 'snapshot', payload: { ...snapshot, presence, ...(deployables.length ? { deployables } : {}) } }); dirty = false;
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
  const deploy = (id, command) => {
    const snapshot = session.getSnapshot();
    if (snapshot.phase !== 'play' || !snapshot.roster.includes(id) || !snapshot.players[id]?.connected) return false;
    const result = placeDeployable(deployables, command, {
      playerId: id, map: snapshot.mapIndex, putt: snapshot.puttIndex, time: transport.localNow() / 1000, sequence: ++deploySequence,
      validPlacement: validPlacement && ((x, y) => validPlacement(snapshot.mapIndex, snapshot.puttIndex, x, y)),
    });
    deployReason = result.placed ? '' : result.reason;
    if (!result.placed) return false;
    deployables = result.list; publish(); return true;
  };
  const hit = (id, objectId) => {
    if (!session.getSnapshot().roster.includes(id)) return false;
    const result = hitDeployable(deployables, objectId, transport.localNow(), lastHit);
    if (result.counted) { deployables = result.list; publish(); }
    return result.counted;
  };
  const unsubscribe = transport.subscribe(message => {
    const id = message.senderId;
    if (message.type === 'command') {
      if (message.payload.type === 'JOIN_ROOM') join(id, message.payload);
      else if (message.payload.type === 'DEPLOY_OBJECT') { if (verified.has(id)) deploy(id, message.payload); }
      else if (message.payload.type === 'DEPLOY_HIT') { if (verified.has(id)) hit(id, message.payload.id); }
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
  let lastBeat = transport.localNow(), lastGreet = lastBeat;
  const tick = () => {
    if (stopped) return;
    const now = transport.localNow();
    if (linkTimeoutMs > 0) for (const id of [...transport.links.keys()]) if (now - transport.lastSeen(id) > linkTimeoutMs) transport.detach(id);
    // A lost welcome leaves a guest unable to accept snapshots; repeat it (then a snapshot) until the guest answers.
    // Timed apart from lastBeat, which a busy room keeps resetting.
    if (heartbeatMs > 0 && now - lastGreet >= heartbeatMs) { lastGreet = now; if (transport.greet()) dirty = true; }
    if (dirty || (heartbeatMs > 0 && now - lastBeat >= heartbeatMs)) { lastBeat = now; publish(); }
    timer = clock.setTimeout(tick, SNAPSHOT_INTERVAL_MS);
  };
  const stopSession = session.subscribe(publish);
  timer = clock.setTimeout(tick, SNAPSHOT_INTERVAL_MS); publish();
  const unbind = () => {
    stopped = true; clock.clearTimeout(timer); unsubscribe(); stopSession(); positions.clear();
    for (const id of [...grace.keys()]) endGrace(id);
    tokens.clear(); verified.clear(); deployables = []; lastHit.clear();
  };
  unbind.deploy = command => deploy(transport.peerId, command);
  unbind.reason = () => deployReason; // why the last placement was refused (host's own feedback)
  unbind.list = () => deployables; // the host's own view of the list; guests read it from the snapshot
  unbind.hit = objectId => hit(transport.peerId, objectId);
  return unbind;
}
