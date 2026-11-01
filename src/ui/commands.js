/**
 * Commands the UI dispatches. Input shortcuts and UI buttons share the
 * InputCommands values, so the application handles a single command union.
 */

import { InputCommands } from '../input/commands.js';
import { MAX_PLAYER_NAME_LENGTH, VOTING_COUNTDOWN_SECONDS } from '../shared/constants.js';
import { GameModes } from '../shared/session.js';

export const UiCommands = Object.freeze({
  ...InputCommands,
  /** { type, name, roomCode } — Join room (validate with parseJoinRequest). */
  JOIN: 'join',
  /** { type, name } — Play solo. */
  PLAY_SOLO: 'play-solo',
  /** { type } — Leave room (legacy closes the room and reloads). */
  LEAVE: 'leave',
  /** { type } — Invite / Copy invite. */
  INVITE: 'invite',
  /** { type, kind, id } — Choose a cosmetic (kind: ball, trail or celebration; id from the cosmetics catalog). */
  SET_COSMETIC: 'set-cosmetic',
  /** { type } — Quality: High/Low. */
  TOGGLE_QUALITY: 'toggle-quality',
  /** { type, event } — an L1 SessionEvents command without playerId; the app binds the sender. */
  SESSION: 'session',
});

/** Lobby game-mode choices, in legacy order and wording. */
export const MODE_OPTIONS = Object.freeze([
  { value: GameModes.STANDARD, label: 'Standard · 1 map', soloOnly: false },
  { value: GameModes.TOURNAMENT_3, label: 'Tournament · 3 maps', soloOnly: false },
  { value: GameModes.TOURNAMENT_6, label: 'Tournament · 6 maps', soloOnly: false },
  { value: GameModes.TOURNAMENT_9, label: 'Tournament · 9 maps', soloOnly: false },
  { value: GameModes.PRACTICE, label: 'Practice · pick any map (solo)', soloOnly: true },
  { value: GameModes.PUTT_PRACTICE, label: 'Practice · replay one putt (solo)', soloOnly: true },
].map(Object.freeze));

export const MESSAGES = Object.freeze({
  roomCodeRequired: 'Enter a room code.',
  connectFailed: 'Could not reach the room service. Check your connection and try again, or play solo.',
  connectionLost: 'Connection lost. Gameplay is paused. Leave and rejoin the room, or try again when the service is available.',
  reconnecting: 'Connection dropped. Reconnecting… your place is reserved while the room allows recovery.',
  inviteSolo: 'Join a room from the lobby to invite friends.',
  inviteCopied: 'Invite copied. Friends can join with this room code.',
  freeRoamHint: 'Free roam: WASD fly, Q/E down/up, Shift fast, drag to look',
  webglUnavailable: "This browser or device can't run the 3D course: WebGL is unavailable (hardware acceleration may be turned off, or WebGL blocked). Turn on hardware acceleration in your browser settings, or try another desktop browser.",
});

/** Why joining an online room failed, in words a player can act on (shown on the start screen). */
export const CONNECT_ERRORS = Object.freeze({
  'room-full': 'That room is full. Ask someone to leave, or use a different room code.',
  'connection-timeout': 'Could not reach the room service in time. Check your connection and retry, or play solo.',
  'signaling-disconnected': 'Lost contact with the connection server. Check your internet connection and try again.',
  'host-lost': 'The host closed the connection before you got into the room. Try joining again; if it keeps happening, ask the host to reopen the room.',
  'identity-rejected': 'This player is already connected. Close the other tab or wait for its connection to expire before retrying.',
  'no-websocket': 'This browser cannot connect to the room service. Try another desktop browser, or play solo.',
  'service-unavailable': 'The room service is unavailable or busy. Try again shortly, or play solo.',
  'rate-limited': 'The room service is busy. Slow down and try again shortly.',
  'incompatible-version': 'This game version does not match the room service. Reload the page before joining.',
  'checkpoint-incompatible': 'This room uses an incompatible saved game. Try another room code while the service is updated.',
  'course-incompatible': 'Your course data does not match the room. Reload the page before joining.',
  'session-expired': 'Your reserved seat has expired. Join again to enter as a new player.',
  'history-full': 'This room has reached its history limit. Use a new room code.',
  'invalid-endpoint': 'The room service address is invalid. Open the hosted game, or play solo.',
  'invalid-message': 'The room service rejected a message. Reload the game before rejoining.',
});
export const connectErrorMessage = reason => CONNECT_ERRORS[reason] || MESSAGES.connectFailed;

export const VOTE_SECONDS = VOTING_COUNTDOWN_SECONDS;

/** Room codes keep lower-case letters and digits, up to 12 characters (legacy). */
export function sanitizeRoomCode(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
}

/** Display name: trimmed, at most 14 characters, "Player" when empty (legacy). */
export function sanitizeName(value) {
  return String(value ?? '').trim().slice(0, MAX_PLAYER_NAME_LENGTH) || 'Player';
}

/**
 * Validates the landing form like the legacy begin().
 * @returns {{ok:true, multi:boolean, name:string, roomCode:string} | {ok:false, message:string}}
 */
export function parseJoinRequest({ multi, name, roomCode = '' }) {
  const code = multi ? sanitizeRoomCode(roomCode) : '';
  if (multi && !code) return { ok: false, message: MESSAGES.roomCodeRequired };
  return { ok: true, multi: !!multi, name: sanitizeName(name), roomCode: code };
}

const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Initial room code: `#room=` from the address, else eight random unambiguous characters. */
export function initialRoomCode(hash = '', random = Math.random) {
  const fromHash = sanitizeRoomCode(new URLSearchParams(String(hash).replace(/^#/, '')).get('room'));
  if (fromHash) return fromHash;
  let code = '';
  if (random === Math.random && globalThis.crypto?.getRandomValues) {
    while (code.length < 8) {
      for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(16))) {
        if (byte >= 256 - (256 % ROOM_ALPHABET.length)) continue;
        code += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
        if (code.length === 8) break;
      }
    }
  } else for (let i = 0; i < 8; i++) code += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  return code;
}
