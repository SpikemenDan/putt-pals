import { PROTOCOL_VERSION } from '../shared/constants.js';
import { validId, count, validCommand, validPresence, validSnapshot, encode, decode } from './protocol.js';

/** Common boundary used by all adapters. Link identities come from the adapter, never payloads. */
export class RoomTransport {
  constructor({ peerId, hostId, sessionId = null, now = () => performance.now() } = {}) {
    if (!validId(peerId) || !validId(hostId) || (sessionId !== null && !validId(sessionId))) throw new Error('Invalid room identity');
    this.peerId = peerId; this.hostId = hostId; this.isHost = peerId === hostId;
    if (this.isHost && !sessionId) throw new Error('Host requires a fresh sessionId');
    this.sessionId = sessionId; this.now = () => now() + this.offset; this.offset = 0; this.localNow = now;
    this.connectionState = 'disconnected'; this.roundNumber = 0; this.puttIndex = 0;
    this.sequence = 0; this.links = new Map(); this.listeners = new Set(); this.statusListeners = new Set();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  subscribeStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  emit(event) { for (const fn of [...this.listeners]) fn(structuredClone(event)); }
  status(state, reason = null) {
    this.connectionState = state;
    for (const fn of [...this.statusListeners]) fn({ state, reason });
  }
  attach(id, write, dispose) {
    if (this.connectionState === 'closed' || !validId(id) || id === this.peerId || this.links.has(id)
      || (!this.isHost && id !== this.hostId) || (this.isHost && this.links.size >= 3)) { dispose(); return false; }
    this.links.set(id, { write, dispose, sequence: -1 });
    if (this.isHost) this.write('welcome', {}, id);
    this.emit({ type: 'peer-open', senderId: id });
    return true;
  }
  detach(id) {
    const link = this.links.get(id); if (!link) return;
    this.links.delete(id); link.dispose(); this.emit({ type: 'peer-close', senderId: id });
    if (!this.isHost && this.connectionState !== 'closed') this.status('disconnected', 'host-lost');
  }
  write(type, payload, target) {
    if (!this.sessionId || this.connectionState === 'closed') return false;
    const raw = encode({ version: PROTOCOL_VERSION, sessionId: this.sessionId, senderId: this.peerId,
      sequence: this.sequence++, roundNumber: this.roundNumber, puttIndex: this.puttIndex, now: this.now(), type, payload });
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
      this.offset = m.now - this.localNow(); link.sequence = m.sequence;
      this.status('connected'); return true;
    }
    if (m.sessionId !== this.sessionId) return false;
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
    link.sequence = m.sequence;
    this.emit({ type: m.type, senderId: id, payload: m.payload }); return true;
  }
  send({ type, payload } = {}) {
    if (this.connectionState !== 'connected') return false;
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
