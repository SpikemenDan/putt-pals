import { MAX_PLAYERS, PROTOCOL_VERSION } from '../shared/constants.js';
import { validId, count, validCommand, validPing, validPresence, validReject, validSnapshot, encode, decode } from './protocol.js';

/** Common boundary used by all adapters. Link identities come from the adapter, never payloads. */
export class RoomTransport {
  constructor({ peerId, hostId, sessionId = null, now = () => performance.now() } = {}) {
    if (!validId(peerId) || !validId(hostId) || (sessionId !== null && !validId(sessionId))) throw new Error('Invalid room identity');
    this.peerId = peerId; this.hostId = hostId; this.isHost = peerId === hostId;
    if (this.isHost && !sessionId) throw new Error('Host requires a fresh sessionId');
    this.sessionId = sessionId; this.now = () => now() + this.offset; this.offset = 0; this.localNow = now;
    this.connectionState = 'disconnected'; this.reason = null; this.roundNumber = 0; this.puttIndex = 0;
    this.sequence = 0; this.links = new Map(); this.listeners = new Set(); this.statusListeners = new Set();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  subscribeStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  emit(event) { for (const fn of [...this.listeners]) fn(structuredClone(event)); }
  status(state, reason = null) {
    this.connectionState = state; this.reason = reason;
    for (const fn of [...this.statusListeners]) fn({ state, reason });
  }
  attach(id, write, dispose) {
    if (this.connectionState === 'closed' || !validId(id) || id === this.peerId || this.links.has(id)
      || (!this.isHost && id !== this.hostId)) { dispose(); return false; }
    // A full room tells the guest why before closing, instead of leaving it to time out.
    if (this.isHost && this.links.size >= MAX_PLAYERS - 1) {
      const raw = this.frame('reject', { reason: 'room-full' });
      try { if (raw) write(raw); } catch { /* the link is closing anyway */ }
      dispose(true); return false;
    }
    this.links.set(id, { write, dispose, sequence: -1, seen: this.localNow() });
    if (this.isHost) this.write('welcome', {}, id);
    this.emit({ type: 'peer-open', senderId: id });
    return true;
  }
  detach(id, flush = false) {
    const link = this.links.get(id); if (!link) return;
    this.links.delete(id); link.dispose(flush); this.emit({ type: 'peer-close', senderId: id });
    // Keep the first reason (e.g. room-full) rather than reporting every later close as host loss.
    if (!this.isHost && !['closed', 'disconnected'].includes(this.connectionState)) this.status('disconnected', 'host-lost');
  }
  /** Local time anything valid last arrived on the link to `id` (null if there is no such link). */
  lastSeen(id) { return this.links.get(id)?.seen ?? null; }
  /** Host: tells one guest why it is refused, then closes that link (flushing the message first). */
  reject(id, reason) {
    if (!this.isHost || !this.links.has(id) || !validReject({ reason })) return false;
    const sent = this.write('reject', { reason }, id);
    this.detach(id, true); return sent;
  }
  /**
   * Host: sends the welcome again on every link that has not delivered a valid message yet. Chromium can
   * drop the first messages written the instant a received data channel opens, and a guest without a
   * welcome rejects every snapshot, so the bridge calls this until each guest answers (T1c, #48).
   */
  greet() {
    if (!this.isHost) return false;
    let sent = false;
    for (const [id, link] of this.links) if (link.sequence < 0 && this.write('welcome', {}, id)) sent = true;
    return sent;
  }
  frame(type, payload) {
    return encode({ version: PROTOCOL_VERSION, sessionId: this.sessionId, senderId: this.peerId,
      sequence: this.sequence++, roundNumber: this.roundNumber, puttIndex: this.puttIndex, now: this.now(), type, payload });
  }
  write(type, payload, target) {
    if (!this.sessionId || this.connectionState === 'closed') return false;
    const raw = this.frame(type, payload);
    if (!raw) { this.status(this.connectionState, 'payload-rejected'); return false; }
    let sent = false;
    for (const [id, link] of this.links) if (!target || id === target) {
      try { link.write(raw); sent = true; } catch { this.detach(id); }
    }
    return sent;
  }
  receive(id, raw) {
    const link = this.links.get(id), m = decode(raw);
    if (!link || !m || m.senderId !== id || m.sequence <= link.sequence) return false;
    if (m.type === 'welcome') {
      if (this.isHost || id !== this.hostId || link.sequence >= 0 || (this.sessionId && m.sessionId !== this.sessionId)) return false;
      this.sessionId = m.sessionId; this.roundNumber = m.roundNumber; this.puttIndex = m.puttIndex;
      this.offset = m.now - this.localNow(); link.sequence = m.sequence; link.seen = this.localNow();
      this.status('connected'); return true;
    }
    if (m.type === 'reject') {
      // A refused guest may not have a session yet (rejected before welcome).
      if (this.isHost || id !== this.hostId || (this.sessionId && m.sessionId !== this.sessionId) || !validReject(m.payload)) return false;
      link.sequence = m.sequence;
      this.status('disconnected', m.payload.reason); this.detach(id); return true;
    }
    if (m.sessionId !== this.sessionId) return false;
    if (m.type === 'ping') {
      if (!this.isHost || !validPing(m.payload)) return false;
      link.sequence = m.sequence; link.seen = this.localNow(); return true;
    }
    if (m.type === 'snapshot') {
      if (this.isHost || id !== this.hostId || !validSnapshot(m.payload) || m.payload.hostId !== id
        || m.payload.roundNumber !== m.roundNumber || m.payload.puttIndex !== m.puttIndex
        || m.roundNumber < this.roundNumber || (m.roundNumber === this.roundNumber && m.puttIndex !== this.puttIndex)) return false;
      this.roundNumber = m.roundNumber; this.puttIndex = m.puttIndex; this.offset = m.now - this.localNow();
    } else {
      if (!this.isHost || m.roundNumber !== this.roundNumber || m.puttIndex !== this.puttIndex) return false;
      if (m.type === 'command' ? !validCommand(m.payload, false) : !validPresence(m.payload)) return false;
      if (m.type === 'command' && ['REPORT_SCORE', 'UPDATE_STROKES'].includes(m.payload.type)
        && (m.payload.roundNumber !== this.roundNumber || m.payload.puttIndex !== this.puttIndex)) return false;
    }
    link.sequence = m.sequence; link.seen = this.localNow();
    this.emit({ type: m.type, senderId: id, payload: m.payload }); return true;
  }
  send({ type, payload } = {}) {
    if (this.connectionState !== 'connected') return false;
    if (type === 'ping') return !this.isHost && this.write('ping', {}, this.hostId);
    if (type === 'snapshot') {
      if (!this.isHost) return false;
      if (!validSnapshot(payload) || payload.hostId !== this.peerId) { this.status(this.connectionState, 'snapshot-rejected'); return false; }
      if (payload.roundNumber < this.roundNumber) return false;
      this.roundNumber = payload.roundNumber; this.puttIndex = payload.puttIndex;
      return this.write(type, payload);
    }
    if (type === 'command' ? !validCommand(payload, this.isHost) : type !== 'presence' || !validPresence(payload)) return false;
    if (this.isHost) { this.emit({ type, senderId: this.peerId, payload }); return true; }
    return this.write(type, payload, this.hostId);
  }
  close() {
    if (this.connectionState === 'closed') return;
    this.status('closed'); for (const id of [...this.links.keys()]) this.detach(id);
    this.listeners.clear(); this.statusListeners.clear();
  }
}
