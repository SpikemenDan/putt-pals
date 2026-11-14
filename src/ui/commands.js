/**
 * Commands the UI dispatches. Input shortcuts and UI buttons share the
 * InputCommands values, so the application handles a single command union.
 */

import { InputCommands } from '../input/commands.js';
import { MAX_PLAYER_NAME_LENGTH, VOTING_COUNTDOWN_SECONDS } from '../shared/constants.js';
import { GameModes } from '../shared/session.js';

export const UiCommands = Object.freeze({
  ...InputCommands,
  /** { type, name, rules? } — Create a party (VIS-M3): the room service opens a new room and only then gives it a code. `rules`: Custom rules (VIS-U) the party is created with; null or omitted is standard. */
  CREATE_PARTY: 'create-party',
  /** { type, name, roomCode } — Join an existing party by its code (validate with parseJoinRequest). Never creates a room; the party's own rules apply. */
  JOIN: 'join',
  /** { type, name, mode?, world?, rules? } — Play solo. With a mode (from the Solo steps) the room opens straight onto the level select; `rules`: Custom rules (VIS-U), null or omitted is standard. */
  PLAY_SOLO: 'play-solo',
  /** { type } — Leave room (legacy closes the room and reloads). */
  LEAVE: 'leave',
  /** { type } — Invite / Copy invite. */
  INVITE: 'invite',
  /** { type } — Leave the colour step for the party lobby (VIS-M3): every player, host included, picks a colour first. */
  ENTER_LOBBY: 'enter-lobby',
  /** { type, color } — Choose a ball colour (palette index). Saved locally; in a lobby it also asks the room for it. */
  SET_COLOR: 'set-color',
  /** { type, kind, id } — Choose a cosmetic (kind: ball, trail or celebration; id from the cosmetics catalog). */
  SET_COSMETIC: 'set-cosmetic',
  /** { type, volume } — Sound volume, 0 to 1. Saved locally. */
  SET_VOLUME: 'set-volume',
  /** { type } — Quality: High/Low. */
  TOGGLE_QUALITY: 'toggle-quality',
  /** { type, event } — an L1 SessionEvents command without playerId; the app binds the sender. */
  SESSION: 'session',
  /** { type, kind, direction?, targetId? } — confirm a timed global hazard activation. */
  CONFIRM_HAZARD: 'confirm-hazard',
  /** Close a pending hazard chooser without spending the inventory slot. */
  CANCEL_HAZARD: 'cancel-hazard',
});

/** Lobby game-mode choices, in legacy order and wording. */
export const MODE_OPTIONS = Object.freeze([
  { value: GameModes.STANDARD, label: 'Standard · 1 map', soloOnly: false },
  { value: GameModes.PONG, label: 'Putt Pong · 1v1', soloOnly: false },
  { value: GameModes.TOURNAMENT_3, label: 'Tournament · 3 maps', soloOnly: false },
  { value: GameModes.TOURNAMENT_5, label: 'Tournament · 5 maps', soloOnly: false },
  { value: GameModes.TOURNAMENT_7, label: 'Tournament · 7 maps', soloOnly: false },
  { value: GameModes.PRACTICE, label: 'Practice · pick any map (solo)', soloOnly: true },
  { value: GameModes.PUTT_PRACTICE, label: 'Practice · replay one putt (solo)', soloOnly: true },
].map(Object.freeze));

export const MESSAGES = Object.freeze({
  roomCodeRequired: 'Type the party code your host shared.',
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
  'room-not-found': 'No party has that code. Check it with your host, or create a party.',
  'room-exists': 'Could not get a free party code. Try Create again.',
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
 * Validates the menu form like the legacy begin(). A Create (VIS-M3) takes no code: the room service gives one.
 * @returns {{ok:true, multi:boolean, create:boolean, name:string, roomCode:string} | {ok:false, message:string}}
 */
export function parseJoinRequest({ multi, create = false, name, roomCode = '' }) {
  const creating = !!multi && !!create;
  const code = multi && !creating ? sanitizeRoomCode(roomCode) : '';
  if (multi && !creating && !code) return { ok: false, message: MESSAGES.roomCodeRequired };
  return { ok: true, multi: !!multi, create: creating, name: sanitizeName(name), roomCode: code };
}

/** The party code from a `#room=` invite link, or '' (VIS-M3: the menu never makes up a code; only Create gets one). */
export function initialRoomCode(hash = '') {
  return sanitizeRoomCode(new URLSearchParams(String(hash).replace(/^#/, '')).get('room'));
}
