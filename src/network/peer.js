import { MAX_PLAYERS } from '../shared/constants.js';
import { RoomTransport } from './transport.js';

/** Extra in-flight links a full host still opens, only to tell each guest the room is full. */
const REJECT_SLOTS = 2;

/** Inject the existing Peer constructor; no library upgrade or implicit global dependency. */
export function createPeerTransport({ Peer, peerOptions = {}, clock = globalThis, timeoutMs = 10000, ...options } = {}) {
  if (typeof Peer !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Peer constructor and positive timeout required');
  const transport = new RoomTransport(options);
  let peer, pending, rejectPending, timer;
  const removers = new Set(), connections = new Set();
  const listen = (emitter, event, fn, scope = removers) => {
    emitter.on(event, fn);
    const remove = () => { emitter.off(event, fn); scope.delete(remove); };
    scope.add(remove); return remove;
  };
  const cancelTimer = () => { if (timer !== undefined) clock.clearTimeout(timer); timer = undefined; };
  const cleanup = () => {
    cancelTimer(); for (const remove of [...removers]) remove();
    for (const dispose of [...connections]) dispose();
    for (const id of [...transport.links.keys()]) transport.detach(id);
    peer?.destroy(); peer = undefined;
  };
  const fail = reason => {
    if (transport.connectionState === 'closed') return;
    // A reason already reported (room-full from the host) wins over the link closing afterwards.
    if (transport.connectionState !== 'disconnected') transport.status('disconnected', reason);
    cleanup();
    rejectPending?.(new Error(transport.reason || reason)); rejectPending = undefined;
  };
  const attach = connection => {
    if (transport.isHost && connections.size >= MAX_PLAYERS - 1 + REJECT_SLOTS) { connection.close(); return; }
    const scope = new Set(); let open = false, linkTimer, disposed = false;
    const dispose = flush => {
      if (disposed) return; disposed = true; connections.delete(dispose);
      clock.clearTimeout(linkTimer);
      for (const remove of [...scope]) { remove(); removers.delete(remove); }
      if (flush) connection.close({ flush: true }); else connection.close();
    };
    connections.add(dispose);
    const on = (event, fn) => {
      const remove = listen(connection, event, fn, scope); removers.add(remove);
    };
    const drop = () => { if (open) transport.detach(connection.peer); else dispose(); };
    on('open', () => {
      clock.clearTimeout(linkTimer);
      open = transport.attach(connection.peer, raw => connection.send(raw), dispose);
    });
    on('data', raw => { if (open) transport.receive(connection.peer, raw); });
    on('close', () => { drop(); if (!transport.isHost) fail('host-lost'); });
    on('error', () => { drop(); if (!transport.isHost) fail('connection-error'); });
    linkTimer = clock.setTimeout(() => { drop(); if (!transport.isHost) fail('connection-timeout'); }, timeoutMs);
  };
  transport.connect = () => {
    if (transport.connectionState === 'connected') return Promise.resolve();
    if (transport.connectionState === 'connecting') return pending;
    if (transport.connectionState === 'closed') return Promise.reject(new Error('Transport closed'));
    transport.status('connecting');
    pending = new Promise((resolve, reject) => {
      rejectPending = reject;
      const stop = transport.subscribeStatus(({ state }) => {
        if (state === 'connected') { cancelTimer(); rejectPending = undefined; stop(); resolve(); }
        else if (state === 'disconnected') { stop(); fail(transport.reason || 'connection-error'); }
        else if (state === 'closed') stop();
      });
      timer = clock.setTimeout(() => fail('connection-timeout'), timeoutMs);
      try {
        peer = new Peer(transport.peerId, peerOptions);
        listen(peer, 'open', id => {
          if (id !== transport.peerId) { fail('identity-mismatch'); return; }
          if (transport.isHost) transport.status('connected');
          else attach(peer.connect(transport.hostId, { serialization: 'json', reliable: true }));
        });
        listen(peer, 'connection', connection => {
          if (!transport.isHost || transport.connectionState !== 'connected') { connection.close(); return; }
          attach(connection);
        });
        listen(peer, 'error', error => fail(error?.type === 'unavailable-id' ? 'identity-unavailable' : 'peer-error'));
        listen(peer, 'disconnected', () => fail('signaling-disconnected'));
        listen(peer, 'close', () => fail('peer-closed'));
      } catch { fail('peer-initialization-failed'); }
    });
    return pending;
  };
  const close = transport.close.bind(transport);
  transport.close = () => {
    if (transport.connectionState === 'closed') return;
    rejectPending?.(new Error('Transport closed')); rejectPending = undefined;
    close(); cleanup();
  };
  return transport;
}
