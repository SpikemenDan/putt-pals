import { SERVER_ROOM_VERSION, validRoomCode } from '../../src/network/contracts/server-room.js';

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
