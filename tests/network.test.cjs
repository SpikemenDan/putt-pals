const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
(async () => {
  const { SimulatedClock } = await import('xstate');
  const { createRoomSession } = await import('../src/session/index.js');
  const { MemoryRoomHub, createSoloTransport, createPeerTransport, bindRoomSession } = await import('../src/network/index.js');
  const { isRoomTransport } = await import('../src/shared/transport.js');
  const { encode, decode, MAX_MESSAGE_BYTES } = await import('../src/network/protocol.js');
  const { MAX_PLAYERS } = await import('../src/shared/constants.js');
  let passed = 0;
  const run = async (name, fn) => { await fn(); passed++; console.log('PASS:', name); };
  const fixture = async () => {
    const clock = new SimulatedClock(), hub = new MemoryRoomHub();
    const host = hub.create({ peerId: 'host', hostId: 'host', sessionId: 'session-1', now: () => clock.now() });
    const session = createRoomSession({ hostId: 'host', clock });
    await host.connect(); const unbind = bindRoomSession(host, session, { clock });
    const guests = [], snapshots = [];
    for (const id of ['a', 'b', 'c']) {
      const guest = hub.create({ peerId: id, hostId: 'host', now: () => clock.now() - 100 });
      guest.subscribe(m => { if (m.type === 'snapshot') snapshots.push(m); });
      await guest.connect(); assert.equal(guest.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: id } }), true);
      guests.push(guest);
    }
    const command = (type, extra = {}, transport = host) => transport.send({ type: 'command', payload: { type, ...extra } });
    const close = () => { unbind(); for (const g of guests) g.close(); host.close(); session.dispose(); };
    return { clock, hub, host, session, guests, snapshots, command, close };
  };
  await run('four transports drive the actual session through voting, uncapped scores, six putts and results', async () => {
    const f = await fixture();
    try {
      assert.equal(isRoomTransport(f.host), true); assert.equal(Object.keys(f.session.getSnapshot().players).length, 4);
      assert.equal(f.guests[0].now(), f.clock.now());
      assert.equal(f.command('START_VOTING', {}, f.guests[0]), false);
      f.command('START_VOTING');
      for (const transport of [f.host, ...f.guests]) f.command('CAST_VOTE', { mapIndex: 0 }, transport);
      assert.equal(f.session.getSnapshot().phase, 'play'); f.clock.increment(4000);
      for (let i = 0; i < 6; i++) {
        const before = f.session.getSnapshot();
        f.clock.increment(Math.max(0, before.roundStartTime + 1500 - f.clock.now()));
        const s = f.session.getSnapshot();
        for (const transport of [f.host, ...f.guests]) f.command('REPORT_SCORE', { roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: 150 }, transport);
        if (i < 5) f.clock.increment(4000);
      }
      assert.equal(f.session.getSnapshot().phase, 'results');
      assert.equal(f.session.getSnapshot().last.scores.a, 900);
      assert.equal(f.snapshots.at(-1).payload.last.scores.a, 900);
      f.snapshots.at(-1).payload.players.a.name = 'changed';
      assert.equal(f.session.getSnapshot().players.a.name, 'a');
    } finally { f.close(); }
  });
  await run('reject spoofed identities, host commands, internal events, stale tokens, oversized data and incompatible versions', async () => {
    const f = await fixture();
    try {
      const make = (changes = {}) => ({ version: 1, sessionId: 'session-1', senderId: 'a', sequence: 100, roundNumber: 0, puttIndex: 0, now: 0, type: 'command', payload: { type: 'CAST_VOTE', mapIndex: 0 }, ...changes });
      const receive = m => f.host.receive('a', JSON.stringify(m));
      for (const m of [make({ senderId: 'host' }), make({ version: 2 }), make({ sessionId: 'old' }), make({ roundNumber: 99 }),
        make({ payload: { type: 'START_VOTING' } }), make({ payload: { type: 'xstate.after.fake' } }),
        ...['__proto__', 'constructor', 'toString', 'hasOwnProperty'].map(type => make({ payload: { type } })),
        make({ payload: { type: 'CAST_VOTE', mapIndex: 0, playerId: 'host' } }), make({ payload: { type: 'REPORT_SCORE', strokes: -1, roundNumber: 0, puttIndex: 0 } })]) assert.equal(receive(m), false);
      assert.equal(f.host.receive('a', 'x'.repeat(MAX_MESSAGE_BYTES + 1)), false);
      assert.equal(f.host.receive('a', { ...make() }), false);
      assert.equal(f.host.receive('a', '{bad json'), false);
      assert.equal(receive(make()), true); assert.equal(receive(make()), false);
      assert.equal(receive(make({ sequence: 99 })), false);
      assert.equal(decode(JSON.stringify(make({ payload: 'é'.repeat(MAX_MESSAGE_BYTES / 2) }))), null);
      assert.equal(encode({ cyclic: null }), null);
      f.command('START_VOTING'); f.command('CAST_VOTE', { mapIndex: 0 }); f.clock.increment(15000);
      assert.equal(receive(make({ sequence: 101, payload: { type: 'REPORT_SCORE', strokes: 150, roundNumber: 0, puttIndex: 0 } })), false);
      const guest = f.guests[0];
      assert.equal(guest.receive('host', JSON.stringify(make({ type: 'snapshot', senderId: 'host', payload: { phase: 'play' }, sequence: 999 }))), false);
      const snapshot = f.session.getSnapshot();
      for (const payload of [
        { ...snapshot, players: { ...snapshot.players, host: { ...snapshot.players.host, strokes: -1 } } },
        { ...snapshot, players: { ...snapshot.players, host: { ...snapshot.players.host, extra: { nested: [] } } } },
        { ...snapshot, roster: ['missing'] }, { ...snapshot, state: 'results' },
        { ...snapshot, totals: { host: { name: 'Host', total: -1, wins: 0 } } },
        { ...snapshot, last: { mapIndex: 0, scores: { host: 1 }, winners: ['missing'] } },
        { ...snapshot, presence: { missing: { x: 1, y: 2, z: 0, mode: 'play', strokes: 0 } } },
      ]) assert.equal(guest.receive('host', JSON.stringify(make({ type: 'snapshot', senderId: 'host',
        sessionId: 'session-1', roundNumber: snapshot.roundNumber, puttIndex: snapshot.puttIndex, sequence: 999, payload }))), false);
      assert.equal(f.session.getSnapshot().players.host.strokes, 0);
      let reason; const stopStatus = f.host.subscribeStatus(s => { reason = s.reason; });
      const huge = structuredClone(snapshot);
      for (let i = 0; i < 124; i++) {
        const id = `past-${i}`;
        huge.totals[id] = { name: 'Historical', total: Number.MAX_SAFE_INTEGER, wins: 0 };
        huge.players[id] = { ...huge.players.host, id, name: 'Historical', connected: false,
          scores: Array.from({ length: 6 }, () => ({ score: Number.MAX_SAFE_INTEGER, timedOut: false, par: 2, penalty: 0 })) };
      }
      assert.ok(Buffer.byteLength(JSON.stringify(huge)) > MAX_MESSAGE_BYTES);
      assert.equal(f.host.send({ type: 'snapshot', payload: huge }), false);
      assert.equal(reason, 'payload-rejected'); stopStatus();

    } finally { f.close(); }
  });
  await run('movement is validated, identity-bound and published at 70ms; stale positions and spectators are excluded', async () => {
    const f = await fixture();
    try {
      f.command('START_VOTING'); for (const t of [f.host, ...f.guests]) f.command('CAST_VOTE', { mapIndex: 0 }, t);
      const position = { x: 80, y: 80, z: 0, mode: 'play', strokes: 150 };
      const send = payload => f.guests[0].send({ type: 'presence', payload });
      assert.equal(send({ ...position, x: Infinity }), false);
      assert.equal(send({ ...position, mode: 'bad' }), false);
      assert.equal(send({ ...position, strokes: 1.2 }), false);
      assert.equal(send({ ...position, playerId: 'host' }), false);
      assert.equal(send(position), true);
      assert.deepEqual(f.snapshots.at(-1).payload.presence, {});
      f.clock.increment(69); assert.deepEqual(f.snapshots.at(-1).payload.presence, {});
      f.clock.increment(1); assert.deepEqual(f.snapshots.at(-1).payload.presence.a, position);
      assert.equal(f.snapshots.at(-1).payload.presence.host, undefined);
      f.guests[0].close(); assert.equal(f.snapshots.at(-1).payload.presence.a, undefined);
      f.clock.increment(4000);
      const state = f.session.getSnapshot();
      for (const t of [f.host, ...f.guests.slice(1)]) f.command('REPORT_SCORE', { roundNumber: state.roundNumber, puttIndex: state.puttIndex, strokes: 1 }, t);
      assert.deepEqual(f.snapshots.at(-1).payload.presence, {});
    } finally { f.close(); }
  });
  await run('late guests remain spectators and unjoined clients cannot affect room state', async () => {
    const f = await fixture();
    try {
      f.command('START_VOTING'); for (const t of [f.host, ...f.guests]) f.command('CAST_VOTE', { mapIndex: 0 }, t);
      f.guests[0].close();
      const late = f.hub.create({ peerId: 'late', hostId: 'host' }); await late.connect();
      late.send({ type: 'command', payload: { type: 'CAST_VOTE', mapIndex: 8 } });
      assert.equal(f.session.getSnapshot().players.late, undefined);
      late.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: '<b>Late</b>' } });
      assert.equal(f.session.getSnapshot().players.late.name, '<b>Late</b>');
      assert.equal(f.session.getSnapshot().roster.includes('late'), false);
      f.clock.increment(4000);
      const state = f.session.getSnapshot();
      late.send({ type: 'command', payload: { type: 'REPORT_SCORE', roundNumber: state.roundNumber, puttIndex: state.puttIndex, strokes: 1 } });
      assert.equal(f.session.getSnapshot().players.late.done, false);
      late.send({ type: 'presence', payload: { x: 1, y: 2, z: 0, mode: 'play', strokes: 0 } });
      f.clock.increment(70); assert.equal(f.snapshots.at(-1).payload.presence.late, undefined);
      late.close();
    } finally { f.close(); }
  });
  await run('capacity, duplicate identities, disconnect membership, host loss, subscriptions and cleanup', async () => {
    const f = await fixture();
    assert.equal(MAX_PLAYERS, 8);
    for (const id of ['d', 'e', 'f', 'g']) {
      const guest = f.hub.create({ peerId: id, hostId: 'host' });
      await guest.connect(); guest.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: id } }); f.guests.push(guest);
    }
    assert.equal(Object.values(f.session.getSnapshot().players).filter(p => p.connected).length, 8);
    const extra = f.hub.create({ peerId: 'h', hostId: 'host' }), statuses = [];
    extra.subscribeStatus(s => statuses.push(s));
    await assert.rejects(extra.connect(), /room-full/);
    assert.deepEqual(statuses.at(-1), { state: 'disconnected', reason: 'room-full' }, 'the ninth player is told why, not left to time out');
    assert.equal(f.host.links.size, 7); assert.equal(f.hub.rooms.has('h'), false);
    const duplicate = f.hub.create({ peerId: 'a', hostId: 'host' });
    await assert.rejects(duplicate.connect(), /Duplicate/);
    f.guests[0].close(); assert.equal(f.session.getSnapshot().players.a.connected, true, 'a dropped guest keeps its seat during the grace period');
    f.clock.increment(29999); assert.equal(f.session.getSnapshot().players.a.connected, true);
    f.clock.increment(1); assert.equal(f.session.getSnapshot().players.a.connected, false, 'and leaves when the 30 s grace ends');
    assert.equal(f.host.links.size, 6); assert.equal(f.guests[0].send({ type: 'command', payload: { type: 'LEAVE_ROOM' } }), false);
    let lost; f.guests[1].subscribeStatus(s => { lost = s; });
    f.host.close(); assert.deepEqual(lost, { state: 'disconnected', reason: 'host-lost' });
    f.close(); extra.close(); duplicate.close(); assert.equal(f.hub.rooms.size, 0);
  });
  await run('resume: a dropped guest keeps its seat and scores for 30 s; only its token can reclaim it, before or after grace', async () => {
    const f = await fixture();
    try {
      const token = 'resume-token-aaaaaaaa', join = (t, resume) => t.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: 'Ana', ...(resume ? { resume } : {}) } });
      const reconnect = async resume => {
        const t = f.hub.create({ peerId: 'r', hostId: 'host', now: () => f.clock.now() }), statuses = [];
        t.subscribeStatus(st => statuses.push(st)); await t.connect(); join(t, resume); return { t, statuses };
      };
      let r = await reconnect(token);
      f.command('START_VOTING'); for (const t of [f.host, ...f.guests, r.t]) f.command('CAST_VOTE', { mapIndex: 0 }, t);
      f.clock.increment(4000);
      let s = f.session.getSnapshot(); assert.equal(s.roster.includes('r'), true);
      f.command('REPORT_SCORE', { roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: 2 }, r.t);
      // The link drops without a LEAVE (network loss): the seat is held.
      f.host.detach('r'); assert.equal(r.t.connectionState, 'disconnected'); r.t.close();
      assert.equal(f.session.getSnapshot().players.r.connected, true);
      // Someone else takes the free peer ID: a wrong or missing token is refused and cannot act.
      const thief = await reconnect('stolen-token-bbbbbbbb');
      assert.deepEqual(thief.statuses.at(-1), { state: 'disconnected', reason: 'identity-rejected' });
      thief.t.close();
      const bare = await reconnect(undefined);
      assert.deepEqual(bare.statuses.at(-1), { state: 'disconnected', reason: 'identity-rejected' }, 'no token for a token-owned seat is refused');
      assert.equal(f.command('CAST_VOTE', { mapIndex: 0 }, bare.t), false, 'and the refused link can send nothing more');
      bare.t.close();
      assert.equal(f.session.getSnapshot().players.r.connected, true, 'the impostors did not end the grace period');
      // The owner returns within grace: same seat, same scores, the grace timer is cancelled.
      r = await reconnect(token); f.clock.increment(30000);
      s = f.session.getSnapshot();
      assert.equal(s.players.r.connected, true); assert.equal(s.players.r.score, 2); assert.equal(s.roster.includes('r'), true);
      // After grace runs out the player leaves, and the token still restores the same record.
      f.host.detach('r'); r.t.close(); f.clock.increment(30000);
      assert.equal(f.session.getSnapshot().players.r.connected, false);
      r = await reconnect(token);
      s = f.session.getSnapshot(); assert.equal(s.players.r.connected, true); assert.equal(s.players.r.score, 2);
      r.t.close();
    } finally { f.close(); }
  });
  await run('solo transport uses the same command and session boundary', async () => {
    const clock = new SimulatedClock();
    const t = createSoloTransport({ peerId: 'solo', sessionId: 'solo-session', now: () => clock.now() });
    const s = createRoomSession({ hostId: 'solo', clock }); await t.connect();
    const stop = bindRoomSession(t, s, { clock });
    t.send({ type: 'command', payload: { type: 'START_VOTING' } });
    t.send({ type: 'command', payload: { type: 'CAST_VOTE', mapIndex: 0 } });
    assert.equal(s.getSnapshot().phase, 'play'); stop(); t.close(); s.dispose();
  });
  // PeerJS-shaped fake exercises event order, data channels and ownership; this is not WebRTC.
  class Link extends EventEmitter {
    constructor(peer) { super(); this.peer = peer; this.open = false; }
    send(raw) { if (!this.open) throw new Error('closed'); this.other.emit('data', raw); }
    close() { if (!this.open) return; this.open = false; this.emit('close'); if (this.other.open) { this.other.open = false; this.other.emit('close'); } }
  }
  class FakePeer extends EventEmitter {
    static peers = new Map();
    constructor(id) { super(); this.id = id; this.links = []; FakePeer.peers.set(id, this); queueMicrotask(() => this.emit('open', id)); }
    connect(id) {
      const remote = FakePeer.peers.get(id); if (!remote) throw new Error('missing');
      const a = new Link(id), b = new Link(this.id); a.other = b; b.other = a;
      this.links.push(a); remote.links.push(b);
      queueMicrotask(() => { remote.emit('connection', b); a.open = b.open = true; a.emit('open'); b.emit('open'); });
      return a;
    }
    destroy() { FakePeer.peers.delete(this.id); for (const l of this.links) l.close(); }
  }
  await run('PeerJS-shaped host/guest channels use welcome, bound commands and cleanup', async () => {
    const clock = new SimulatedClock();
    const options = { Peer: FakePeer, clock, now: () => clock.now(), hostId: 'host' };
    const host = createPeerTransport({ ...options, peerId: 'host', sessionId: 'peer-session' });
    const session = createRoomSession({ hostId: 'host', clock });
    await host.connect(); const stop = bindRoomSession(host, session, { clock });
    const guest = createPeerTransport({ ...options, peerId: 'guest' });
    await guest.connect(); guest.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: 'Guest' } });
    assert.equal(session.getSnapshot().players.guest.connected, true);
    assert.equal(guest.sessionId, 'peer-session');
    const peers = [...FakePeer.peers.values()], links = peers.flatMap(p => p.links);
    guest.close(); clock.increment(30000); assert.equal(session.getSnapshot().players.guest.connected, false);
    stop(); host.close(); session.dispose();
    assert.equal(FakePeer.peers.size, 0);
    for (const emitter of [...peers, ...links]) assert.equal(emitter.eventNames().length, 0);
  });
  await run('PeerJS-shaped full room: the ninth guest receives room-full before the link closes', async () => {
    const clock = new SimulatedClock();
    const options = { Peer: FakePeer, clock, now: () => clock.now(), hostId: 'host' };
    const host = createPeerTransport({ ...options, peerId: 'host', sessionId: 'full-session' });
    const session = createRoomSession({ hostId: 'host', clock });
    await host.connect(); const stop = bindRoomSession(host, session, { clock });
    const guests = [];
    for (let i = 0; i < MAX_PLAYERS - 1; i++) {
      const g = createPeerTransport({ ...options, peerId: 'g' + i }); await g.connect();
      g.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: 'G' + i } }); guests.push(g);
    }
    const late = createPeerTransport({ ...options, peerId: 'late' }), statuses = [];
    late.subscribeStatus(st => statuses.push(st));
    await assert.rejects(late.connect(), /room-full/);
    assert.deepEqual(statuses.map(st => st.reason), [null, 'room-full'], 'connecting, then refused with the reason; no later host-lost');
    assert.equal(host.links.size, MAX_PLAYERS - 1); assert.equal(Object.hasOwn(session.getSnapshot().players, 'late'), false);
    late.close(); for (const g of guests) g.close(); stop(); host.close(); session.dispose();
    assert.equal(FakePeer.peers.size, 0);
  });
  await run('PeerJS timeout, startup failure and cancellation settle connect and dispose listeners', async () => {
    class SilentPeer extends EventEmitter { destroy() { this.destroyed = true; } }
    const clock = new SimulatedClock();
    const t = createPeerTransport({ Peer: SilentPeer, peerId: 'h', hostId: 'h', sessionId: 's', clock, timeoutMs: 10 });
    const p = t.connect(); assert.equal(t.connect(), p); clock.increment(10);
    await assert.rejects(p, /timeout/); assert.equal(t.connectionState, 'disconnected'); t.close();
    const c = createPeerTransport({ Peer: SilentPeer, peerId: 'h', hostId: 'h', sessionId: 's', clock });
    const pending = c.connect(); c.close(); await assert.rejects(pending, /closed/);
    await assert.rejects(c.connect(), /closed/);
    const broken = createPeerTransport({ Peer: class { constructor() { throw new Error('broken'); } }, peerId: 'h', hostId: 'h', sessionId: 's', clock });
    await assert.rejects(broken.connect(), /initialization/); broken.close();
  });
  await run('pending PeerJS links consume capacity and close cancels their timers and listeners', async () => {
    const baseClock = new SimulatedClock(), timers = new Set();
    const clock = {
      setTimeout(fn, delay) { const id = baseClock.setTimeout(() => { timers.delete(id); fn(); }, delay); timers.add(id); return id; },
      clearTimeout(id) { timers.delete(id); baseClock.clearTimeout(id); },
    };
    let peer;
    class PendingPeer extends EventEmitter {
      constructor(id) { super(); peer = this; queueMicrotask(() => this.emit('open', id)); }
      destroy() {}
    }
    const host = createPeerTransport({ Peer: PendingPeer, peerId: 'h', hostId: 'h', sessionId: 's', clock });
    await host.connect(); assert.equal(timers.size, 0);
    // Seven guest slots plus two links opened only to tell late guests the room is full.
    const connections = Array.from({ length: MAX_PLAYERS + 2 }, (_, i) => {
      const c = new EventEmitter(); c.peer = `guest-${i}`; c.closed = 0; c.close = () => { c.closed++; }; return c;
    });
    for (const c of connections) peer.emit('connection', c);
    assert.equal(connections[MAX_PLAYERS + 1].closed, 1); assert.equal(timers.size, MAX_PLAYERS + 1);
    host.close(); assert.equal(timers.size, 0);
    for (const c of connections) { assert.equal(c.closed, 1); assert.equal(c.eventNames().length, 0); }
    assert.equal(peer.eventNames().length, 0);
    baseClock.increment(20000); assert.equal(host.connectionState, 'closed');
  });
  await run('interpolation: remotes are drawn 100 ms behind between samples, snap on teleports, never extrapolate and are pruned', async () => {
    const { createRemoteInterpolator, INTERPOLATION_DELAY_MS, TELEPORT_DISTANCE } = await import('../src/network/interpolation.js');
    const r = createRemoteInterpolator();
    assert.equal(INTERPOLATION_DELAY_MS, 100);
    assert.equal(TELEPORT_DISTANCE, 300);
    assert.equal(r.sample('a', 0), null);
    r.push('a', 1000, { x: 0, y: 0, z: 0 });
    r.push('a', 1070, { x: 70, y: 0, z: 0 });
    assert.deepEqual(r.sample('a', 1135), { x: 35, y: 0, z: 0 });
    assert.deepEqual(r.sample('a', 1100), { x: 0, y: 0, z: 0 });
    assert.deepEqual(r.sample('a', 5000), { x: 70, y: 0, z: 0 });
    assert.deepEqual(r.sample('a', 0), { x: 0, y: 0, z: 0 });
    r.push('a', 1050, { x: 999, y: 0, z: 0 });
    assert.deepEqual(r.sample('a', 1135), { x: 35, y: 0, z: 0 });
    r.push('a', 1100, { x: NaN, y: 0, z: 0 });
    assert.deepEqual(r.sample('a', 5000), { x: 70, y: 0, z: 0 });
    r.push('a', 1140, { x: 70 + TELEPORT_DISTANCE + 1, y: 0, z: 0 });
    assert.deepEqual(r.sample('a', 1175), { x: 371, y: 0, z: 0 });
    r.push('b', 1000, { x: 1, y: 2, z: 3 });
    assert.equal(r.size, 2);
    r.retain(['b']);
    assert.equal(r.size, 1);
    assert.equal(r.sample('a', 2000), null);
    assert.deepEqual(r.sample('b', 2000), { x: 1, y: 2, z: 3 });
    r.clear();
    assert.equal(r.size, 0);
  });
  console.log(`Network: ${passed} scenarios passed (fake transports; no real WebRTC).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
