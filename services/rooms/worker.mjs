import { RoomDurableObject } from './recovery-object.mjs';
import { ROOM_CREATE_HEADER, roomObjectName } from './room-name.mjs';
import { generateRoomCode, ROOM_CREATE_PATH, validRoomCode } from '../../src/network/contracts/server-room.js';

const ROOM_SOCKET_PATH = /^\/api\/rooms\/([^/]+)\/socket$/;
const LOCAL_IDENTITY_PATH = /^\/api\/_local\/rooms\/([a-z0-9]{1,12})\/identity$/;

function jsonError(status, error) {
  return Response.json({ error }, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

/** The upgrade request forwarded to the room: its canonical socket path, with the create marker only when the Worker set it. */
function forward(request, url, roomCode, create) {
  const target = new URL(`/api/rooms/${roomCode}/socket`, url);
  const headers = new Headers(request.headers);
  headers.delete(ROOM_CREATE_HEADER);
  if (create) headers.set(ROOM_CREATE_HEADER, '1');
  return new Request(target, { method: request.method, headers });
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
      const create = url.pathname === ROOM_CREATE_PATH;
      const socketMatch = create ? null : ROOM_SOCKET_PATH.exec(url.pathname);
      if (!create && !socketMatch) return jsonError(404, 'not-found');

      // Create (VIS-M3): the server, not the player, chooses the party code. A taken code is refused by the room
      // (room-exists) and the client asks again; with 31^8 codes that is vanishingly rare.
      const roomCode = create ? generateRoomCode(bytes => crypto.getRandomValues(bytes)) : socketMatch[1];
      if (!validRoomCode(roomCode)) return jsonError(400, 'invalid-room-code');
      if (request.method !== 'GET') return jsonError(405, 'method-not-allowed');
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return jsonError(426, 'websocket-upgrade-required');
      }

      return roomStub(env, roomCode).fetch(forward(request, url, roomCode, create));
    }

    return env.ASSETS.fetch(request);
  },
};

export { RoomDurableObject };
