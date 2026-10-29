/**
 * Network protocol specifications and boundary validators.
 * Defines message envelopes, types, and schema checks for untrusted network messages.
 */

import {
  PROTOCOL_VERSION,
  MAX_PLAYER_NAME_LENGTH,
  MAX_PLAYERS,
} from './constants.js';

export const MessageTypes = Object.freeze({
  SNAPSHOT: 'snapshot',
  PRESENCE: 'presence',
  VOTE: 'vote',
  ACTION: 'action',
});

/**
 * Validates a presence message payload from a player.
 *
 * @param {object} d
 * @param {number} [maxMaps=22]
 * @returns {boolean}
 */
export function validatePresence(d, maxMaps = 22) {
  if (!d || typeof d !== 'object') return false;
  if (typeof d.n !== 'string' || d.n.length === 0 || d.n.length > MAX_PLAYER_NAME_LENGTH) return false;
  if (!Number.isInteger(d.h) || d.h < 0 || d.h >= maxMaps) return false;

  const numericFields = [d.x, d.y, d.z, d.c, d.str, d.round];
  if (!numericFields.every(Number.isFinite)) return false;
  if (!Number.isSafeInteger(d.str) || d.str < 0) return false;

  if (!Array.isArray(d.s)) return false;
  if (d.s.length > 36) return false; // Max holes in a tournament
  if (!d.s.every(n => Number.isSafeInteger(n) && n >= 0)) return false;

  if (d.fx != null) {
    if (typeof d.fx !== 'object') return false;
    if (!Number.isFinite(d.fx.id)) return false;
    if (!['sink', 'shot'].includes(d.fx.t)) return false;
  }

  return true;
}

/**
 * Validates a room snapshot message broadcast by the host.
 *
 * @param {object} r
 * @param {number} [maxMaps=22]
 * @returns {boolean}
 */
export function validateRoomSnapshot(r, maxMaps = 22) {
  if (!r || typeof r !== 'object') return false;

  const validPhases = ['lobby', 'select', 'play', 'results'];
  if (!validPhases.includes(r.phase)) return false;

  if (!Number.isInteger(r.map) || r.map < 0 || r.map >= maxMaps) return false;
  if (!Number.isInteger(r.round) || r.round < 0) return false;
  if (!Number.isFinite(r.startAt)) return false;

  if (!Array.isArray(r.roster)) return false;
  if (r.roster.length > MAX_PLAYERS) return false;
  if (!r.roster.every(p => typeof p === 'string' && p.length > 0)) return false;

  return true;
}

/**
 * Validates a vote message from a guest client.
 *
 * @param {object} v
 * @param {number} [maxMaps=22]
 * @returns {boolean}
 */
export function validateVote(v, maxMaps = 22) {
  if (!v || typeof v !== 'object') return false;
  return Number.isInteger(v.map) && v.map >= 0 && v.map < maxMaps;
}

/**
 * Creates a standard envelope for sending messages over transport.
 *
 * @param {string} type One of MessageTypes
 * @param {object} payload Message payload
 * @param {string} senderId Sender peer or player ID
 * @returns {object}
 */
export function createMessageEnvelope(type, payload, senderId) {
  return {
    version: PROTOCOL_VERSION,
    type,
    senderId,
    timestamp: Date.now(),
    payload,
  };
}
