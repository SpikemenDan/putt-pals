const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
(async () => {
  const { SimulatedClock } = await import('xstate');
  const { createRoomSession } = await import('../src/session/index.js');
  const { MemoryRoomHub, createSoloTransport, createPeerTransport, bindRoomSession } = await import('../src/network/index.js');
  const { isRoomTransport } = await import('../src/shared/transport.js');
  const { encode, decode, MAX_MESSAGE_BYTES, validCommand } = await import('../src/network/protocol.js');
  const { MAX_PLAYERS } = await import('../src/shared/constants.js');
  await import('./rooms/server-client.test.mjs');
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
  await run('No Power-Ups (GM1): SET_POWERUPS validates as a host command and the flag reaches guests in snapshots', async () => {
    assert.equal(validCommand({ type: 'SET_POWERUPS', enabled: false }, true), true);
    assert.equal(validCommand({ type: 'SET_POWERUPS', enabled: false }, false), false, 'guests cannot send it');
    for (const bad of [{ type: 'SET_POWERUPS' }, { type: 'SET_POWERUPS', enabled: 0 }, { type: 'SET_POWERUPS', enabled: true, x: 1 }]) assert.equal(validCommand(bad, true), false, JSON.stringify(bad));
    const f = await fixture();
    try {
      f.command('SET_POWERUPS', { enabled: false }, f.guests[0]);
      f.clock.increment(300);
      assert.ok(f.snapshots.every(s => s.payload?.powerups !== false), 'a guest cannot turn power-ups off');
      f.command('SET_POWERUPS', { enabled: false });
      f.clock.increment(300);
      assert.equal(f.session.getSnapshot().powerups, false);
      assert.ok(f.snapshots.some(s => s.payload?.powerups === false), 'guests receive the flag in the validated snapshot');
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
        { ...snapshot, totals: { host: { name: 'Host', total: -1, par: 0, wins: 0 } } },
        { ...snapshot, last: { mapIndex: 0, scores: { host: 1 }, pars: { host: 1 }, winners: ['missing'] } },
        { ...snapshot, presence: { missing: { x: 1, y: 2, z: 0, mode: 'play', strokes: 0 } } },
      ]) assert.equal(guest.receive('host', JSON.stringify(make({ type: 'snapshot', senderId: 'host',
        sessionId: 'session-1', roundNumber: snapshot.roundNumber, puttIndex: snapshot.puttIndex, sequence: 999, payload }))), false);
      assert.equal(f.session.getSnapshot().players.host.strokes, 0);
      let reason; const stopStatus = f.host.subscribeStatus(s => { reason = s.reason; });
      const huge = structuredClone(snapshot);
      for (let i = 0; i < 124; i++) {
        const id = `past-${i}`;
        huge.totals[id] = { name: 'Historical', total: Number.MAX_SAFE_INTEGER, par: 0, wins: 0 };
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
  await run('PeerJS-shaped duplicate open (T1c): a second open event on the host link keeps the guest connected', async () => {
    const clock = new SimulatedClock();
    const options = { Peer: FakePeer, clock, now: () => clock.now(), hostId: 'host' };
    const host = createPeerTransport({ ...options, peerId: 'host', sessionId: 'twice-session' });
    const session = createRoomSession({ hostId: 'host', clock });
    await host.connect(); const stop = bindRoomSession(host, session, { clock });
    // As seen in real Chromium: the received channel fires `open` twice.
    const hostPeer = FakePeer.peers.get('host');
    hostPeer.once('connection', link => link.once('open', () => queueMicrotask(() => link.emit('open'))));
    const guest = createPeerTransport({ ...options, peerId: 'guest' });
    await guest.connect(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(guest.connectionState, 'connected');
    assert.equal(guest.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: 'Guest' } }), true);
    assert.equal(session.getSnapshot().players.guest.connected, true);
    assert.equal(hostPeer.links[0].open, true, 'the link stays open');
    guest.close(); stop(); host.close(); session.dispose();
    assert.equal(FakePeer.peers.size, 0);
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
  await run('liveness: an idle host heartbeats, a pinging guest stays, a silent guest is dropped after 5 s into its grace period', async () => {
    const { HEARTBEAT_MS, LINK_TIMEOUT_MS } = await import('../src/network/protocol.js');
    const clock = new SimulatedClock(), hub = new MemoryRoomHub();
    const host = hub.create({ peerId: 'host', hostId: 'host', sessionId: 'live', now: () => clock.now() });
    const session = createRoomSession({ hostId: 'host', clock });
    await host.connect(); const stop = bindRoomSession(host, session, { clock, heartbeatMs: HEARTBEAT_MS, linkTimeoutMs: LINK_TIMEOUT_MS });
    const [alive, silent] = ['alive', 'silent'].map(id => hub.create({ peerId: id, hostId: 'host', now: () => clock.now() }));
    let beats = 0; alive.subscribe(m => { if (m.type === 'snapshot') beats++; });
    for (const g of [alive, silent]) { await g.connect(); g.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: g.peerId } }); }
    beats = 0;
    for (let ms = 0; ms < 6000; ms += HEARTBEAT_MS) { assert.equal(alive.send({ type: 'ping' }), true); clock.increment(HEARTBEAT_MS); }
    assert.ok(beats >= 5 && beats <= 7, `idle lobby still gets ~1 snapshot/s (got ${beats})`);
    assert.equal(host.links.has('alive'), true, 'a pinging guest keeps its link');
    assert.equal(host.links.has('silent'), false, 'a guest silent for 5 s is dropped');
    assert.equal(silent.connectionState, 'disconnected');
    assert.equal(session.getSnapshot().players.silent.connected, true, 'and keeps its seat for the grace period');
    assert.equal(host.send({ type: 'ping' }), false, 'only guests ping');
    alive.close(); silent.close(); stop(); host.close(); session.dispose();
  });
  await run('lost welcome (T1c): the host repeats the welcome each heartbeat until the guest answers, then stops', async () => {
    const { HEARTBEAT_MS, LINK_TIMEOUT_MS } = await import('../src/network/protocol.js');
    const { RoomTransport } = await import('../src/network/transport.js');
    const clock = new SimulatedClock(), hub = new MemoryRoomHub();
    const host = hub.create({ peerId: 'host', hostId: 'host', sessionId: 'greet', now: () => clock.now() });
    const session = createRoomSession({ hostId: 'host', clock });
    await host.connect(); const stop = bindRoomSession(host, session, { clock, heartbeatMs: HEARTBEAT_MS, linkTimeoutMs: LINK_TIMEOUT_MS });
    const guest = new RoomTransport({ peerId: 'late', hostId: 'host', now: () => clock.now() });
    const snapshots = []; guest.subscribe(m => { if (m.type === 'snapshot') snapshots.push(m.payload); });
    // As seen in real Chromium: the welcome and first snapshot, written as the link opens, never arrive.
    let dropped = 0, welcomes = 0;
    guest.attach('host', raw => host.receive('late', raw), () => host.detach('late'));
    host.attach('late', raw => {
      if (decode(raw).type === 'welcome') welcomes++;
      if (welcomes <= 1 && dropped < 2) { dropped++; return; }
      guest.receive('host', raw);
    }, () => guest.detach('host'));
    assert.equal(dropped, 2); assert.notEqual(guest.connectionState, 'connected');
    clock.increment(HEARTBEAT_MS);
    assert.equal(welcomes, 2, 'one repeat after a heartbeat');
    assert.equal(guest.connectionState, 'connected');
    assert.ok(snapshots.length >= 1, 'and a snapshot the guest now accepts');
    assert.equal(guest.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: 'Late' } }), true);
    assert.equal(session.getSnapshot().players.late.name, 'Late');
    for (let ms = 0; ms < 3 * HEARTBEAT_MS; ms += HEARTBEAT_MS) { guest.send({ type: 'ping' }); clock.increment(HEARTBEAT_MS); }
    assert.equal(welcomes, 2, 'no further welcomes once the guest has answered');
    assert.equal(guest.greet(), false, 'only hosts greet');
    guest.close(); stop(); host.close(); session.dispose();
  });
  await run('measure: eight-player snapshots stay small and publish at about 14 Hz while everyone moves', async () => {
    const f = await fixture();
    try {
      for (const id of ['d', 'e', 'f', 'g']) {
        const guest = f.hub.create({ peerId: id, hostId: 'host', now: () => f.clock.now() - 100 });
        guest.subscribe(m => { if (m.type === 'snapshot') f.snapshots.push(m); });
        await guest.connect(); guest.send({ type: 'command', payload: { type: 'JOIN_ROOM', name: 'Player-' + id, resume: 'token-' + id.repeat(16) } }); f.guests.push(guest);
      }
      const everyone = [f.host, ...f.guests];
      // Worst case for size: a 9-map tournament late in its first map, all eight scorecards filled.
      f.command('SET_MODE', { mode: 'tournament_9' }); f.command('START_VOTING');
      for (const t of everyone) f.command('CAST_VOTE', { mapIndex: 0 }, t);
      for (let putt = 0; putt < 5; putt++) {
        const st = f.session.getSnapshot(); f.clock.increment(Math.max(0, st.roundStartTime + 1500 - f.clock.now()));
        for (const t of everyone) f.command('REPORT_SCORE', { roundNumber: st.roundNumber, puttIndex: st.puttIndex, strokes: 12345 }, t);
      }
      const st = f.session.getSnapshot(); f.clock.increment(Math.max(0, st.roundStartTime + 1500 - f.clock.now()));
      assert.equal(st.puttIndex, 5); assert.equal(st.roster.length, 8);
      const before = f.snapshots.length;
      for (let ms = 0; ms < 1000; ms += 35) {
        f.guests.forEach((g, i) => g.send({ type: 'presence', payload: { x: 123456.75 + ms, y: -98765.25 + i, z: 4321.5, mode: 'play', strokes: 12345, effect: 'mag' } }));
        f.clock.increment(35);
      }
      // Guests each receive every snapshot the host sends; count one guest's copies.
      const received = (f.snapshots.length - before) / 7;
      const last = f.snapshots.at(-1);
      assert.equal(Object.keys(last.payload.presence).length, 7, 'every moving guest is in the snapshot');
      const bytes = new TextEncoder().encode(encode({ version: 1, sessionId: 'session-1', senderId: 'host', sequence: 1e9, roundNumber: last.payload.roundNumber, puttIndex: last.payload.puttIndex, now: 1e12, type: 'snapshot', payload: last.payload })).byteLength;
      console.log(`  measured: 8-player snapshot ${bytes} bytes (limit ${MAX_MESSAGE_BYTES}); ${received} snapshots per guest in 1 s of play with all 7 guests moving`);
      assert.ok(bytes < MAX_MESSAGE_BYTES / 4, `snapshot ${bytes} B leaves headroom under the ${MAX_MESSAGE_BYTES} B message limit`);
      assert.ok(received >= 13 && received <= 16, `about one snapshot per 70 ms (got ${received})`);
    } finally { f.close(); }
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
