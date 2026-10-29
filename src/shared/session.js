/**
 * Session management contracts and lifecycle definitions.
 * Defines the states, transitions, commands, and events for game sessions.
 */

import {
  STARTER_COURSE_INDICES,
  MAX_PLAYERS,
  VOTING_COUNTDOWN_SECONDS,
} from './constants.js';

export const SessionPhases = Object.freeze({
  LOBBY: 'lobby',
  SELECT: 'select',
  PLAY: 'play',
  RESULTS: 'results',
});

export const GameModes = Object.freeze({
  STANDARD: 'standard', // 1 starter map
  TOURNAMENT_3: 'tournament_3', // 3 starter maps
  TOURNAMENT_6: 'tournament_6', // 6 starter maps
  TOURNAMENT_9: 'tournament_9', // 9 starter maps
  PRACTICE: 'practice', // Solo course practice
  PUTT_PRACTICE: 'putt_practice', // Single-putt practice replay
});

export const SessionCommands = Object.freeze({
  JOIN_ROOM: 'JOIN_ROOM',
  LEAVE_ROOM: 'LEAVE_ROOM',
  SET_MODE: 'SET_MODE',
  SET_POWERUPS: 'SET_POWERUPS', // host: power-ups on or off for the room (GM1)
  START_VOTING: 'START_VOTING',
  CAST_VOTE: 'CAST_VOTE',
  START_ROUND: 'START_ROUND',
  ADVANCE_PUTT: 'ADVANCE_PUTT',
  FINISH_ROUND: 'FINISH_ROUND',
  RETURN_TO_LOBBY: 'RETURN_TO_LOBBY',
});

/**
 * Creates initial room state.
 *
 * @param {object} [options]
 * @returns {object}
 */
export function createInitialSessionState(options = {}) {
  return {
    phase: SessionPhases.LOBBY,
    mode: options.mode ?? GameModes.STANDARD,
    powerups: options.powerups ?? true, // false = No Power-Ups: no boxes, no inventory (GM1)
    mapIndex: 0,
    puttIndex: 0,
    roundNumber: 0,
    roundLimitSeconds: 120,
    roundStartTime: 0,
    votingDeadline: 0,
    votes: {}, // playerId -> mapIndex
    roster: options.roster ? [...options.roster] : [],
    players: {}, // playerId -> playerInfo
    isHost: options.isHost ?? true,
    completedMaps: [],
  };
}

/**
 * Resolves map voting deterministically, matching the legacy game.
 *
 * Only integer votes for eligible maps count, and (when `connectedIds` is
 * given) only votes from connected players. Ties are broken the way the legacy
 * host does: tied maps are sorted by ascending index and the winner is
 * `tied[(round * 7 + validVotes) % tied.length]`, so repeated ties rotate
 * between rounds instead of always favouring the same map.
 * With no valid votes, the first eligible map is returned.
 *
 * @param {Record<string, number>} votes Map of playerId -> mapIndex
 * @param {readonly number[]} [eligibleMaps=STARTER_COURSE_INDICES]
 * @param {{ round?: number, connectedIds?: Iterable<string> }} [options]
 * @returns {number} Winning map index
 */
export function resolveVote(votes, eligibleMaps = STARTER_COURSE_INDICES, options = {}) {
  const round = Number.isInteger(options.round) && options.round >= 0 ? options.round : 0;
  const connected = options.connectedIds ? new Set(options.connectedIds) : null;
  const eligible = new Set(eligibleMaps);

  const counts = new Map();
  let validVotes = 0;
  for (const [playerId, map] of Object.entries(votes || {})) {
    if (connected && !connected.has(playerId)) continue;
    if (!Number.isInteger(map) || !eligible.has(map)) continue;
    counts.set(map, (counts.get(map) || 0) + 1);
    validVotes++;
  }

  if (validVotes === 0) return eligibleMaps[0];

  const top = Math.max(...counts.values());
  const tied = [...counts.keys()].filter((m) => counts.get(m) === top).sort((a, b) => a - b);
  return tied[(round * 7 + validVotes) % tied.length];
}

/**
 * Validates whether a command is permissible in the given phase.
 *
 * @param {string} phase Current phase
 * @param {string} commandType Command type
 * @param {boolean} isHost Whether the requester is the host
 * @returns {boolean}
 */
export function canExecuteCommand(phase, commandType, isHost) {
  // Only hosts can trigger room transitions
  const hostOnlyCommands = [
    SessionCommands.START_VOTING,
    SessionCommands.START_ROUND,
    SessionCommands.ADVANCE_PUTT,
    SessionCommands.FINISH_ROUND,
    SessionCommands.RETURN_TO_LOBBY,
  ];

  if (hostOnlyCommands.includes(commandType) && !isHost) {
    return false;
  }

  switch (phase) {
    case SessionPhases.LOBBY:
      return [
        SessionCommands.JOIN_ROOM,
        SessionCommands.LEAVE_ROOM,
        SessionCommands.SET_MODE,
        SessionCommands.SET_POWERUPS,
        SessionCommands.START_VOTING,
      ].includes(commandType);

    case SessionPhases.SELECT:
      return [
        SessionCommands.CAST_VOTE,
        SessionCommands.START_ROUND,
        SessionCommands.LEAVE_ROOM,
      ].includes(commandType);

    case SessionPhases.PLAY:
      return [
        SessionCommands.ADVANCE_PUTT,
        SessionCommands.FINISH_ROUND,
        SessionCommands.LEAVE_ROOM,
      ].includes(commandType);

    case SessionPhases.RESULTS:
      return [
        SessionCommands.RETURN_TO_LOBBY,
        SessionCommands.LEAVE_ROOM,
      ].includes(commandType);

    default:
      return false;
  }
}
