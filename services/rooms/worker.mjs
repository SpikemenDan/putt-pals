import { RoomDurableObject } from './recovery-object.mjs';
import { roomObjectName } from './room-name.mjs';
import { validRoomCode } from '../../src/network/contracts/server-room.js';

const ROOM_SOCKET_PATH = /^\/api\/rooms\/([^/]+)\/socket$/;
const LOCAL_IDENTITY_PATH = /^\/api\/_local\/rooms\/([a-z0-9]{1,12})\/identity$/;

function jsonError(status, error) {
  return Response.json({ error }, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function roomStub(env, roomCode) {
  const name = roomObjectName(env.ROOM_ENVIRONMENT, roomCode);
  return env.ROOMS.get(env.ROOMS.idFromName(name));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const localIdentity = LOCAL_IDENTITY_PATH.exec(url.pathname);
    if (localIdentity) {
      if (request.method !== 'GET' || env.ROOM_ENVIRONMENT !== 'development'
        || env.ROOM_LOCAL_DIAGNOSTICS !== 'true') return jsonError(404, 'not-found');
      const stub = roomStub(env, localIdentity[1]);
      return stub.fetch('https://room.internal/__local/identity');
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const socketMatch = ROOM_SOCKET_PATH.exec(url.pathname);
      if (!socketMatch) return jsonError(404, 'not-found');

      const [, roomCode] = socketMatch;
      if (!validRoomCode(roomCode)) return jsonError(400, 'invalid-room-code');
      if (request.method !== 'GET') return jsonError(405, 'method-not-allowed');
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return jsonError(426, 'websocket-upgrade-required');
      }

      return roomStub(env, roomCode).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export { RoomDurableObject };
