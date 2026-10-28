import { RoomTransport } from './transport.js';

export class MemoryRoomHub {
  constructor() { this.rooms = new Map(); }
  create(options) {
    const transport = new RoomTransport(options);
    transport.connect = async () => {
      if (transport.connectionState === 'connected') return;
      if (transport.connectionState !== 'disconnected') throw new Error('Transport cannot connect');
      transport.status('connecting');
      if (this.rooms.has(transport.peerId)) { transport.status('disconnected', 'duplicate-id'); throw new Error('Duplicate peer identity'); }
      const host = this.rooms.get(transport.hostId);
      if (!transport.isHost && !host?.isHost) { transport.status('disconnected', 'room-unavailable'); throw new Error('Room unavailable'); }
      this.rooms.set(transport.peerId, transport);
      if (transport.isHost) transport.status('connected');
      else {
        transport.attach(host.peerId, raw => host.receive(transport.peerId, raw), () => host.detach(transport.peerId));
        host.attach(transport.peerId, raw => transport.receive(host.peerId, raw), () => transport.detach(host.peerId));
        // The host may refuse the link (room full); the guest then holds the reason.
        if (transport.connectionState === 'disconnected') { this.rooms.delete(transport.peerId); throw new Error(transport.reason || 'room-unavailable'); }
      }
    };
    const close = transport.close.bind(transport);
    transport.close = () => { close(); if (this.rooms.get(transport.peerId) === transport) this.rooms.delete(transport.peerId); };
    return transport;
  }
}
export function createSoloTransport(options) {
  const hub = new MemoryRoomHub(); return hub.create({ ...options, hostId: options.peerId });
}
