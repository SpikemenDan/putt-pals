import { PROTOCOL_VERSION, MAX_PLAYER_NAME_LENGTH, MAX_PLAYERS } from '../shared/constants.js';
import { GameModes } from '../shared/session.js';
import { auraIds } from '../gameplay/catalog.js';
import { validEffectMessage } from '../gameplay/effects.js';

export const MAX_MESSAGE_BYTES = 65536;
/** Liveness (N2): guests ping and hosts re-send a snapshot this often, so a silent link is noticed. */
export const HEARTBEAT_MS = 1000;
/** A link with nothing received for this long is treated as dropped (crash, network cut, closed lid). */
export const LINK_TIMEOUT_MS = 5000;
export const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
export const count = n => Number.isSafeInteger(n) && n >= 0;
/** Guest resume secret (N2): random, URL-safe, never broadcast by the host. */
export const validResumeToken = t => typeof t === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(t);
const record = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const name = n => typeof n === 'string' && n.trim().length > 0 && n.length <= MAX_PLAYER_NAME_LENGTH;
const keys = (o, allowed) => Object.keys(o).every(k => allowed.includes(k));
const index = (n, max) => count(n) && n < max;
const validState = s => s === 'lobby' || s === 'results' || (record(s) && Object.keys(s).length === 1
  && ((Object.hasOwn(s, 'select') && ['waiting', 'timing', 'choosingPutt'].includes(s.select))
    || (Object.hasOwn(s, 'play') && (s.play === 'starting' || (record(s.play) && Object.keys(s.play).length === 1
      && ['settling', 'running', 'replaying'].includes(s.play.active))))));
const hostCommands = ['SET_MODE', 'SET_POWERUPS', 'START_VOTING', 'START_ROUND', 'RETURN_TO_LOBBY', 'PRACTICE_STEP', 'PRACTICE_MAPS'];
export function validCommand(e, isHost) {
  if (!record(e) || typeof e.type !== 'string') return false;
  if (!isHost && hostCommands.includes(e.type)) return false;
  const fields = {
    JOIN_ROOM: ['name', 'resume'], LEAVE_ROOM: [], SET_MODE: ['mode'], SET_POWERUPS: ['enabled'], START_VOTING: [],
    CAST_VOTE: ['mapIndex'], START_ROUND: ['puttIndex'], RETURN_TO_LOBBY: [],
    PRACTICE_STEP: ['step'], PRACTICE_MAPS: [],
    UPDATE_STROKES: ['strokes', 'roundNumber', 'puttIndex'],
    REPORT_SCORE: ['strokes', 'roundNumber', 'puttIndex', 'timedOut'],
  }[e.type];
  if (!Array.isArray(fields) || !keys(e, ['type', ...fields])) return false;
  switch (e.type) {
    case 'JOIN_ROOM': return name(e.name) && (e.resume === undefined || validResumeToken(e.resume));
    case 'SET_MODE': return Object.values(GameModes).includes(e.mode);
    case 'SET_POWERUPS': return typeof e.enabled === 'boolean';
    case 'CAST_VOTE': return index(e.mapIndex, 22);
    case 'START_ROUND': return index(e.puttIndex, 6);
    case 'PRACTICE_STEP': return [-1, 0, 1].includes(e.step);
    case 'UPDATE_STROKES': case 'REPORT_SCORE':
      return count(e.strokes) && count(e.roundNumber) && index(e.puttIndex, 6)
        && (e.timedOut === undefined || typeof e.timedOut === 'boolean');
    default: return true;
  }
}
/** Power-up aura shown on a ball ('' for none) and attacks that affect other players (I1). */
export const PRESENCE_EFFECTS = Object.freeze(auraIds());
const validFx = fx => record(fx) && keys(fx, ['id', 't']) && validEffectMessage(fx);
export function validPresence(p) {
  return record(p) && keys(p, ['x', 'y', 'z', 'mode', 'strokes', 'effect', 'fx'])
    && [p.x, p.y, p.z].every(n => Number.isFinite(n) && Math.abs(n) <= 1000000)
    && ['play', 'sunk', 'timeout', 'spectator'].includes(p.mode) && count(p.strokes)
    && (p.effect === undefined || PRESENCE_EFFECTS.includes(p.effect))
    && (p.fx === undefined || validFx(p.fx));
}
export function validSnapshot(s) {
  if (!record(s) || !['lobby', 'select', 'play', 'results'].includes(s.phase)
    || !Object.values(GameModes).includes(s.mode) || !validId(s.hostId)
    || !index(s.mapIndex, 22) || !index(s.puttIndex, 6) || !count(s.roundNumber)
    || !Number.isFinite(s.roundStartTime) || !Number.isFinite(s.votingDeadline)
    || !record(s.players) || !Array.isArray(s.roster) || s.roster.length > MAX_PLAYERS
    || new Set(s.roster).size !== s.roster.length) return false;
  const entries = Object.entries(s.players);
  // Disconnected historical participants can remain in L1; wire storage stays bounded.
  if (entries.length > 128 || entries.filter(([, p]) => p?.connected).length > MAX_PLAYERS) return false;
  for (const [id, p] of entries) {
    if (!validId(id) || !record(p) || !keys(p, ['id', 'name', 'connected', 'strokes', 'done', 'timedOut', 'score', 'scores']) || p.id !== id || !name(p.name) || typeof p.connected !== 'boolean'
      || !count(p.strokes) || typeof p.done !== 'boolean' || typeof p.timedOut !== 'boolean'
      || !(p.score === null || count(p.score)) || !Array.isArray(p.scores) || p.scores.length > 6
      || !p.scores.every(h => h === null || (record(h) && keys(h, ['score', 'timedOut', 'par', 'penalty']) && count(h.score) && typeof h.timedOut === 'boolean'
        && index(h.par, 11) && h.par > 0 && index(h.penalty, 11)))) return false;
  }
  if (!keys(s, ['phase', 'mode', 'powerups', 'hostId', 'mapIndex', 'puttIndex', 'roundNumber', 'roundLimitSeconds',
    'roundStartTime', 'votingDeadline', 'votes', 'roster', 'players', 'isHost', 'completedMaps', 'totals', 'last', 'state', 'presence'])
    || !(s.powerups === undefined || typeof s.powerups === 'boolean')
    || !Number.isFinite(s.roundLimitSeconds) || s.roundLimitSeconds < 120 || s.roundLimitSeconds > 600
    || typeof s.isHost !== 'boolean' || !validState(s.state)
    || (typeof s.state === 'string' ? s.state !== s.phase : !Object.hasOwn(s.state, s.phase)) || !record(s.votes) || Object.keys(s.votes).length > MAX_PLAYERS
    || !Object.entries(s.votes).every(([id, vote]) => Object.hasOwn(s.players, id) && index(vote, 22))
    || !Array.isArray(s.completedMaps) || s.completedMaps.length > 9 || !s.completedMaps.every(n => index(n, 22))
    || !record(s.totals) || Object.keys(s.totals).length > 128
    || !Object.entries(s.totals).every(([id, t]) => validId(id) && record(t) && keys(t, ['name', 'total', 'wins']) && name(t.name) && count(t.total) && count(t.wins))) return false;
  if (s.last !== null && (!record(s.last) || !keys(s.last, ['mapIndex', 'scores', 'winners']) || !index(s.last.mapIndex, 22) || !record(s.last.scores)
    || Object.keys(s.last.scores).length > MAX_PLAYERS || !Object.entries(s.last.scores).every(([id, score]) => validId(id) && count(score))
    || !Array.isArray(s.last.winners) || !s.last.winners.every(id => Object.hasOwn(s.last.scores, id)))) return false;
  if (s.presence !== undefined && (!record(s.presence) || Object.keys(s.presence).length > MAX_PLAYERS
    || !Object.entries(s.presence).every(([id, p]) => Object.hasOwn(s.players, id) && s.players[id].connected && validPresence(p)))) return false;
  return Object.hasOwn(s.players, s.hostId) && s.roster.every(id => validId(id) && Object.hasOwn(s.players, id));
}
/** Why a host refused a guest; sent in a 'reject' frame just before the host closes that link. */
export const REJECT_REASONS = Object.freeze(['room-full', 'identity-rejected']);
export const validReject = p => record(p) && keys(p, ['reason']) && REJECT_REASONS.includes(p.reason);
export const validPing = p => record(p) && Object.keys(p).length === 0;
// JSON text is the only wire representation. Bound bytes before parsing and clone ownership.
export function decode(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES || new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;
  try {
    const m = JSON.parse(raw);
    if (!record(m) || !keys(m, ['version', 'sessionId', 'roundNumber', 'puttIndex', 'sequence', 'senderId', 'type', 'payload', 'now'])
      || m.version !== PROTOCOL_VERSION || !validId(m.sessionId) || !validId(m.senderId)
      || !count(m.sequence) || !count(m.roundNumber) || !index(m.puttIndex, 6) || !Number.isFinite(m.now)
      || !['welcome', 'reject', 'ping', 'command', 'presence', 'snapshot'].includes(m.type)) return null;
    return m;
  } catch { return null; }
}
export function encode(message) {
  try { const raw = JSON.stringify(message); return decode(raw) ? raw : null; } catch { return null; }
}
