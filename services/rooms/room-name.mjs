import { SERVER_ROOM_VERSION, validRoomCode } from '../../src/network/contracts/server-room.js';

/**
 * Header the Worker sets when it routes a Create (VIS-M3) to a fresh room. Durable Objects are reachable only through the
 * Worker, and the Worker removes any client-sent copy, so a room trusts it.
 */
export const ROOM_CREATE_HEADER = 'x-putt-room-create';

const ROOM_ENVIRONMENTS = new Set(['development', 'preview', 'production']);

export function roomObjectName(environment, roomCode) {
  if (!ROOM_ENVIRONMENTS.has(environment)) {
    throw new TypeError('Unknown room environment.');
  }
  if (!validRoomCode(roomCode)) {
    throw new TypeError('Invalid room code.');
  }

  return `putt-pals:${environment}:v${SERVER_ROOM_VERSION}:${roomCode}`;
}
