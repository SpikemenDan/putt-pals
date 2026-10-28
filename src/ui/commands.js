/**
 * Commands the UI dispatches. Input shortcuts and UI buttons share the
 * InputCommands values, so the application handles a single command union.
 */

import { InputCommands } from '../input/commands.js';
import { MAX_PLAYER_NAME_LENGTH, MAX_PLAYERS, VOTING_COUNTDOWN_SECONDS } from '../shared/constants.js';
import { GameModes } from '../shared/session.js';

export const UiCommands = Object.freeze({
  ...InputCommands,
  /** { type, name, roomCode, iceText } — Join room (validate with parseJoinRequest). */
  JOIN: 'join',
  /** { type, name } — Play solo. */
  PLAY_SOLO: 'play-solo',
  /** { type } — Leave room (legacy closes the room and reloads). */
  LEAVE: 'leave',
  /** { type } — Invite / Copy invite. */
  INVITE: 'invite',
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
  iceInvalid: 'ICE servers must be a JSON array.',
  roomCodeRequired: 'Enter a room code.',
  connectFailed: 'Could not connect. Check internet / TURN settings and retry.',
  connectionLost: 'Connection lost. Gameplay paused. Reload and rejoin a new room; host migration is not supported.',
  inviteSolo: 'Join a room from the lobby to invite friends.',
  inviteCopied: 'Invite copied. Keep the host tab open.',
  freeRoamHint: 'Free roam: WASD fly, Q/E down/up, Shift fast, drag to look',
  webglUnavailable: "This browser or device can't run the 3D course: WebGL is unavailable (hardware acceleration may be turned off, or WebGL blocked). Turn on hardware acceleration in your browser settings, or try another desktop browser.",
});

/** Why joining an online room failed, in words a player can act on (shown on the start screen). */
export const CONNECT_ERRORS = Object.freeze({
  'room-full': `That room is full (${MAX_PLAYERS} players). Ask someone to leave, or use a different room code.`,
  'no-webrtc': "This browser can't make peer-to-peer connections (WebRTC is unavailable or blocked), so online rooms won't work here. Try another desktop browser, or play solo.",
  'connection-timeout': 'Could not reach the room in time. Check your internet connection, or add a TURN relay under Online connection settings, then try again.',
  'signaling-disconnected': 'Lost contact with the connection server. Check your internet connection and try again.',
  'identity-rejected': 'The room did not accept this player identity. Reload the page and join again.',
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
 * @returns {{ok:true, multi:boolean, name:string, roomCode:string, peerOptions:object} | {ok:false, message:string}}
 */
export function parseJoinRequest({ multi, name, roomCode = '', iceText = '' }) {
  let peerOptions = {};
  if (multi) {
    try {
      const ice = JSON.parse(iceText || '[]');
      if (!Array.isArray(ice)) throw new Error('not an array');
      peerOptions = ice.length ? { config: { iceServers: ice } } : {};
    } catch {
      return { ok: false, message: MESSAGES.iceInvalid };
    }
  }
  const code = multi ? sanitizeRoomCode(roomCode) : '';
  if (multi && !code) return { ok: false, message: MESSAGES.roomCodeRequired };
  return { ok: true, multi: !!multi, name: sanitizeName(name), roomCode: code, peerOptions };
}

const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Initial room code: `#room=` from the address, else four random unambiguous characters (legacy). */
export function initialRoomCode(hash = '', random = Math.random) {
  const fromHash = sanitizeRoomCode(new URLSearchParams(String(hash).replace(/^#/, '')).get('room'));
  if (fromHash) return fromHash;
  let code = '';
  for (let i = 0; i < 4; i++) code += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  return code;
}
