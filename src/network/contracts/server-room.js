/** N4a v2 contracts: additive, not used by the current PeerJS/solo runtime. */
import { GameModes } from '../../shared/session.js';
import { MAX_PLAYERS, MAX_DEPLOYABLES, MAX_TIMEOUT_SECONDS, MIN_TIMEOUT_SECONDS, RECONNECT_GRACE_PERIOD_MS, STARTER_COURSE_INDICES } from '../../shared/constants.js';
import { isColorIndex } from '../../shared/colors.js';
import { DEFAULT_RULES, MAX_SERIES_MAPS, validRules } from '../../shared/rules.js';
import { auraIds } from '../../gameplay/catalog.js';
import { validEffectMessage } from '../../gameplay/effects.js';
import { validDeployable, validDeployCommand } from '../../gameplay/deployables.js';
import { GLOBAL_HAZARD_LIMIT, validGlobalHazard, validGlobalHazardCommand } from '../../gameplay/global-hazards.js';

import { MAP_COUNT } from '../../shared/map-count.js';
// 5: the room snapshot may carry synchronized G1f hazard records.
// 6: Tornado and Hurricane are placed: ACTIVATE_HAZARD and their records carry x and y.
// 7: hello carries the Custom rules a new room is created with (VIS-U); the session context carries the room's rules.
// 8: map indices run to MAP_COUNT (24) with the VIS-G maps.
export const SERVER_ROOM_VERSION = 8;
export const CHECKPOINT_VERSION = 1;
export const ROOM_RULES_VERSION = 'server-room-3';
export const SERVER_ROOM_LIMITS = Object.freeze({
  members: MAX_PLAYERS, history: 128, messageBytes: 65536, checkpointBytes: 262144,
  presenceIntervalMs: 70, commandBurst: 20, commandsPerSecond: 10,
  presenceBurst: 30, presencePerSecond: 20, handshakeMs: 10000,
  pingIntervalMs: 15000, linkTimeoutMs: 45000, pendingHandshakes: 8,
  outgoingQueueBytes: 262144,
});
export const DEFAULT_ROOM_POLICY = Object.freeze({ reconnectGraceMs: RECONNECT_GRACE_PERIOD_MS, controllerTransferDelayMs: 0, emptyRoomTtlMs: 900000 });
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, fields) => object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
const allowed = (v, fields) => object(v) && Object.keys(v).every(k => fields.includes(k));
const count = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => count(n) && n > 0;
const time = count; // Server-owned epoch milliseconds; never client performance.now().
const index = (n, max) => count(n) && n < max;
export const validRoomId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v);
export const validRoomCode = v => typeof v === 'string' && /^[a-z0-9]{1,12}$/.test(v);
export const validRoomSecret = v => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
const validHash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const name = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 14;
const nullable = (v, validate) => v === null || validate(v);
const modes = Object.values(GameModes);
export const SESSION_NODES = Object.freeze(['lobby', 'select.waiting', 'select.timing', 'select.choosingPutt', 'play.starting', 'play.active.settling', 'play.active.running', 'play.active.replaying', 'results']);

export function validRoomPolicy(p) {
  return exact(p, Object.keys(DEFAULT_ROOM_POLICY)) && count(p.reconnectGraceMs) && p.reconnectGraceMs >= 1000 && p.reconnectGraceMs <= 300000
    && count(p.controllerTransferDelayMs) && p.controllerTransferDelayMs <= p.reconnectGraceMs
    && count(p.emptyRoomTtlMs) && p.emptyRoomTtlMs >= p.reconnectGraceMs && p.emptyRoomTtlMs <= 86400000;
}
/** Deployment overrides affect new rooms only; invalid/unknown settings fail closed. */
export function createRoomPolicy(overrides = {}) {
  if (!allowed(overrides, Object.keys(DEFAULT_ROOM_POLICY))) throw new Error('Invalid room policy');
  const policy = { ...DEFAULT_ROOM_POLICY, ...overrides };
  if (!validRoomPolicy(policy)) throw new Error('Invalid room policy');
  return Object.freeze(policy);
}

export const CONTROLLER_COMMANDS = Object.freeze(['SET_MODE', 'SET_POWERUPS', 'START_VOTING', 'START_ROUND', 'RETURN_TO_LOBBY', 'PRACTICE_STEP', 'PRACTICE_MAPS']);
export function validServerCommand(c) {
  if (!object(c)) return false;
  if (c.type === 'ACTIVATE_HAZARD') {
    const { type, ...command } = c;
    return allowed(c, ['type', 'kind', 'direction', 'targetId', 'x', 'y']) && validGlobalHazardCommand(command);
  }
  const fields = { LEAVE_ROOM: [], SET_COLOR: ['color'], SET_MODE: ['mode'], SET_POWERUPS: ['enabled'], START_VOTING: [], CAST_VOTE: ['mapIndex'], START_ROUND: ['puttIndex'],
    RETURN_TO_LOBBY: [], PRACTICE_STEP: ['step'], PRACTICE_MAPS: [], UPDATE_STROKES: ['strokes'], REPORT_SCORE: ['strokes', 'timedOut'],
    DEPLOY_OBJECT: ['kind', 'x', 'y'], DEPLOY_HIT: ['id'], PONG_SHOT: ['hit', 'cupId', 'timedOut'] }[c.type];
  if (!Array.isArray(fields) || !exact(c, ['type', ...fields])) return false;
  switch (c.type) {
    case 'SET_COLOR': return isColorIndex(c.color);
    case 'SET_MODE': return modes.includes(c.mode);
    case 'SET_POWERUPS': return typeof c.enabled === 'boolean';
    case 'CAST_VOTE': return STARTER_COURSE_INDICES.includes(c.mapIndex);
    case 'START_ROUND': return index(c.puttIndex, 6);
    case 'PRACTICE_STEP': return [-1, 0, 1].includes(c.step);
    case 'UPDATE_STROKES': return count(c.strokes);
    case 'REPORT_SCORE': return count(c.strokes) && typeof c.timedOut === 'boolean';
    case 'DEPLOY_OBJECT': return validDeployCommand(c);
    case 'DEPLOY_HIT': return validRoomId(c.id);
    case 'PONG_SHOT': return typeof c.hit === 'boolean' && (c.cupId === null || typeof c.cupId === 'string') && (c.timedOut === undefined || typeof c.timedOut === 'boolean');
    default: return true;
  }
}
export function validServerPresence(p) {
  return allowed(p, ['x', 'y', 'z', 'mode', 'strokes', 'effect', 'fx']) && ['x','y','z'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) <= 1000000)
    && ['play', 'sunk', 'timeout', 'spectator'].includes(p.mode) && count(p.strokes)
    && (p.effect === undefined || auraIds().includes(p.effect))
    && (p.fx === undefined || (exact(p.fx, ['id','t']) && validEffectMessage(p.fx)));
}
const validResume = r => exact(r, ['sessionId', 'playerId', 'token']) && validRoomId(r.sessionId) && validRoomId(r.playerId) && validRoomSecret(r.token);
export function validClientFrame(m) {
  if (!object(m) || m.version !== SERVER_ROOM_VERSION) return false;
  if (m.type === 'hello') return exact(m, ['version', 'type', 'roomCode', 'name', 'color', 'resume', 'rules']) && validRoomCode(m.roomCode) && name(m.name) && nullable(m.color, isColorIndex) && nullable(m.resume, validResume) && nullable(m.rules, validRules);
  if (m.type === 'ping') return exact(m, ['version', 'type', 'nonce', 'clientTime']) && validRoomId(m.nonce) && Number.isFinite(m.clientTime) && m.clientTime >= 0;
  return exact(m, ['version','type','sessionId','connectionId','sequence','roundNumber','puttIndex','payload'])
    && ['command','presence'].includes(m.type) && validRoomId(m.sessionId) && validRoomId(m.connectionId)
    && positive(m.sequence) && count(m.roundNumber) && index(m.puttIndex, 6)
    && (m.type === 'command' ? validServerCommand(m.payload) : validServerPresence(m.payload));
}

const score = s => object(s) && ['score','timedOut','par','penalty'].every(k => Object.hasOwn(s, k)) && allowed(s, ['score','timedOut','par','penalty','missed']) && count(s.score) && typeof s.timedOut === 'boolean' && index(s.par,11) && s.par > 0 && index(s.penalty,11) && (s.missed === undefined || typeof s.missed === 'boolean');
const player = p => object(p) && ['id','name','color','connected','strokes','done','timedOut','score','scores'].every(k => Object.hasOwn(p, k)) && allowed(p, ['id','name','color','connected','strokes','done','timedOut','score','scores','token','missed']) && validRoomId(p.id) && name(p.name) && isColorIndex(p.color)
  && typeof p.connected === 'boolean' && count(p.strokes) && typeof p.done === 'boolean' && typeof p.timedOut === 'boolean'
  && nullable(p.score,count) && Array.isArray(p.scores) && p.scores.length <= 6 && p.scores.every(s => nullable(s,score))
  && (p.token === undefined || typeof p.token === 'string') && (p.missed === undefined || typeof p.missed === 'boolean');
const mapOf = (v, max, validator) => object(v) && Object.keys(v).length <= max && Object.entries(v).every(([id, p]) => validRoomId(id) && validator(p,id));
const CONTEXT_KEYS = ['mode','powerups','mapIndex','puttIndex','roundNumber','roundLimitSeconds','roundStartTime','votingDeadline','votes','roster','players','completedMaps','totals','last','rules'];
/** Complete domain context, no XState executable/internal objects and no hostId/isHost. */
export function validSessionContext(c) {
  const hasPong = object(c) && Object.hasOwn(c, 'pong');
  const hasTie = object(c) && Object.hasOwn(c, 'tie');
  const extraKeys = [];
  if (hasPong) extraKeys.push('pong');
  if (hasTie) extraKeys.push('tie');
  if (hasPong) {
    if (!exact(c, [...CONTEXT_KEYS, ...extraKeys]) || c.mode !== GameModes.PONG || (c.pong !== null && !object(c.pong))) return false;
  } else {
    if (!exact(c, [...CONTEXT_KEYS, ...extraKeys])) return false;
  }
  if (hasTie && c.tie !== null) {
    if (!object(c.tie) || !exact(c.tie, ['options', 'winner'])) return false;
    if (!Array.isArray(c.tie.options) || c.tie.options.length < 2 || !c.tie.options.every(n => index(n, MAP_COUNT))) return false;
    if (!index(c.tie.winner, MAP_COUNT) || !c.tie.options.includes(c.tie.winner)) return false;
  }
  if (!modes.includes(c.mode) || typeof c.powerups !== 'boolean' || !validRules(c.rules) || c.rules.powerups !== c.powerups || !index(c.mapIndex, MAP_COUNT) || !index(c.puttIndex,6) || !count(c.roundNumber)
    || !count(c.roundLimitSeconds) || c.roundLimitSeconds < MIN_TIMEOUT_SECONDS || c.roundLimitSeconds > MAX_TIMEOUT_SECONDS || !time(c.roundStartTime) || !time(c.votingDeadline)
    || !mapOf(c.players,SERVER_ROOM_LIMITS.history,(p,id) => player(p) && p.id === id)
    || !Array.isArray(c.roster) || c.roster.length > MAX_PLAYERS || new Set(c.roster).size !== c.roster.length || !c.roster.every(id => validRoomId(id) && Object.hasOwn(c.players,id))
    || !mapOf(c.votes,MAX_PLAYERS,(v,id) => Object.hasOwn(c.players,id) && STARTER_COURSE_INDICES.includes(v))
    || !Array.isArray(c.completedMaps) || c.completedMaps.length > MAX_SERIES_MAPS || !c.completedMaps.every(n => index(n, MAP_COUNT))
    || !mapOf(c.totals,SERVER_ROOM_LIMITS.history,t => exact(t,['name','total','par','wins']) && name(t.name) && count(t.total) && count(t.par) && count(t.wins))) return false;
  return c.last === null || (exact(c.last,['mapIndex','scores','pars','winners']) && index(c.last.mapIndex, MAP_COUNT) && mapOf(c.last.scores,MAX_PLAYERS,count) && mapOf(c.last.pars,MAX_PLAYERS,(v,id) => count(v) && Object.hasOwn(c.last.scores,id))
    && Array.isArray(c.last.winners) && c.last.winners.length <= MAX_PLAYERS && new Set(c.last.winners).size === c.last.winners.length && c.last.winners.every(id => validRoomId(id) && Object.hasOwn(c.last.scores,id)));
}
const seat = s => exact(s,['playerId','joinOrder','connectedSince','resumeUntil']) && validRoomId(s.playerId) && positive(s.joinOrder)
  && nullable(s.connectedSince,time) && nullable(s.resumeUntil,time) && ((s.connectedSince !== null) !== (s.resumeUntil !== null));
const session = s => exact(s,['node','context']) && SESSION_NODES.includes(s.node) && validSessionContext(s.context)
  && (!['select.choosingPutt','play.active.replaying'].includes(s.node) || s.context.mode === GameModes.PUTT_PRACTICE);
const ROOM_SNAPSHOT_KEYS = ['roomCode','sessionId','rulesVersion','courseHash','revision','serverTime','controllerId','policy','seats','session'];
/** Placed Bumpers and Orbital Bumpers (G1e): valid records for the putt in play, owners in the room, unique ids. */
const roomDeployables = (list, context) => Array.isArray(list) && list.length <= MAX_DEPLOYABLES && new Set(list.map(d => d?.id)).size === list.length
  && list.every(d => validDeployable(d) && Object.hasOwn(context.players, d.owner) && d.map === context.mapIndex && d.putt === context.puttIndex);
export function validRoomSnapshot(s) {
  if (!(exact(s,ROOM_SNAPSHOT_KEYS) || exact(s,[...ROOM_SNAPSHOT_KEYS,'deployables']) || exact(s,[...ROOM_SNAPSHOT_KEYS,'globalHazards']) || exact(s,[...ROOM_SNAPSHOT_KEYS,'deployables','globalHazards'])) || !validRoomCode(s.roomCode) || !validRoomId(s.sessionId)
    || s.rulesVersion !== ROOM_RULES_VERSION || !validHash(s.courseHash) || !count(s.revision) || !time(s.serverTime) || !validRoomPolicy(s.policy) || !session(s.session) || !Array.isArray(s.seats) || s.seats.length > MAX_PLAYERS
    || !s.seats.every(seat) || new Set(s.seats.map(s => s.playerId)).size !== s.seats.length || new Set(s.seats.map(s => s.joinOrder)).size !== s.seats.length
    || !s.seats.every(seat => (seat.connectedSince === null || seat.connectedSince <= s.serverTime) && Object.hasOwn(s.session.context.players,seat.playerId) && s.session.context.players[seat.playerId].connected === (seat.connectedSince !== null))
    || !Object.entries(s.session.context.players).every(([id,p]) => !p.connected || s.seats.some(seat => seat.playerId === id))) return false;
  if (s.deployables !== undefined && !roomDeployables(s.deployables, s.session.context)) return false;
  if (s.globalHazards !== undefined && (!Array.isArray(s.globalHazards) || s.globalHazards.length > GLOBAL_HAZARD_LIMIT
    || s.globalHazards.length > 0 && (!s.session.node.startsWith('play.') || !s.session.context.powerups || [GameModes.PRACTICE, GameModes.PUTT_PRACTICE].includes(s.session.context.mode) || s.session.context.roster.length < 2)
    || new Set(s.globalHazards.map(h => h?.id)).size !== s.globalHazards.length
    || !s.globalHazards.every(h => validGlobalHazard(h) && Object.hasOwn(s.session.context.players, h.owner)
      && Object.hasOwn(s.session.context.players, h.kind === 'lightning' ? h.targetId : h.owner)
      && (h.kind !== 'lightning' || h.owner !== h.targetId)
      && h.roundNumber === s.session.context.roundNumber && h.map === s.session.context.mapIndex && h.putt === s.session.context.puttIndex))) return false;
  const controller = s.seats.find(seat => seat.playerId === s.controllerId);
  return s.controllerId === null ? !s.seats.some(seat => seat.connectedSince !== null)
    : validRoomId(s.controllerId) && !!controller && (controller.connectedSince !== null || s.policy.controllerTransferDelayMs > 0);
}
export const ROOM_ERRORS = Object.freeze(['incompatible-version','invalid-message','room-full','identity-rejected','session-expired','stale-round','stale-connection','sequence-rejected','unauthorized','rate-limited','service-unavailable','checkpoint-incompatible','history-full']);
export function validServerFrame(m) {
  if (!object(m) || m.version !== SERVER_ROOM_VERSION) return false;
  switch(m.type) {
    case 'welcome': return exact(m,['version','type','playerId','connectionId','resumeToken','snapshot']) && validRoomId(m.playerId) && validRoomId(m.connectionId)
      && validRoomSecret(m.resumeToken) && validRoomSnapshot(m.snapshot) && m.snapshot.seats.some(s => s.playerId === m.playerId && s.connectedSince !== null);
    case 'snapshot': return exact(m,['version','type','snapshot']) && validRoomSnapshot(m.snapshot);
    case 'ack': return exact(m,['version','type','sessionId','connectionId','sequence','revision']) && validRoomId(m.sessionId) && validRoomId(m.connectionId) && positive(m.sequence) && count(m.revision);
    case 'presence': return exact(m,['version','type','sessionId','roundNumber','puttIndex','sequence','serverTime','players']) && validRoomId(m.sessionId) && count(m.roundNumber)
      && index(m.puttIndex,6) && positive(m.sequence) && time(m.serverTime) && mapOf(m.players,MAX_PLAYERS,validServerPresence);
    case 'pong': return exact(m,['version','type','nonce','clientTime','serverTime']) && validRoomId(m.nonce) && Number.isFinite(m.clientTime) && m.clientTime >= 0 && time(m.serverTime);
    case 'error': return exact(m,['version','type','code','retryAfterMs']) && ROOM_ERRORS.includes(m.code) && nullable(m.retryAfterMs,n => count(n) && n <= 300000);
    default: return false;
  }
}
/** Bytes bounded before JSON parse. Unknown fields and directions are rejected. */
export function decodeRoomFrame(raw, direction) {
  if (typeof raw !== 'string' || raw.length > SERVER_ROOM_LIMITS.messageBytes || new TextEncoder().encode(raw).byteLength > SERVER_ROOM_LIMITS.messageBytes) return null;
  try { const m = JSON.parse(raw); return (direction === 'client' ? validClientFrame(m) : direction === 'server' && validServerFrame(m)) ? m : null; } catch { return null; }
}
export function encodeRoomFrame(frame, direction) {
  try { const raw = JSON.stringify(frame); return decodeRoomFrame(raw,direction) ? raw : null; } catch { return null; }
}

/** Socket identity is supplied by the backend, never by a caller-declared playerId. Schema/authority/freshness only; actor still guards phases/scores. */
export function authorizeRoomFrame(frame, binding, snapshot, now) {
  if (!validClientFrame(frame) || !['command','presence'].includes(frame.type)) return 'invalid-message';
  if (!validRoomSnapshot(snapshot) || !exact(binding,['playerId','connectionId','lastSequence']) || !validRoomId(binding.playerId) || !validRoomId(binding.connectionId) || !count(binding.lastSequence) || !time(now)) return 'unauthorized';
  if (frame.sessionId !== snapshot.sessionId) return 'session-expired';
  if (frame.connectionId !== binding.connectionId) return 'stale-connection';
  if (frame.sequence <= binding.lastSequence) return 'sequence-rejected';
  if (!snapshot.seats.some(s => s.playerId === binding.playerId && s.connectedSince !== null)) return 'unauthorized';
  if (!(frame.type === 'command' && frame.payload.type === 'LEAVE_ROOM') && (frame.roundNumber !== snapshot.session.context.roundNumber || frame.puttIndex !== snapshot.session.context.puttIndex)) return 'stale-round';
  if (frame.type === 'presence' && (snapshot.session.node.split('.')[0] !== 'play' || !snapshot.session.context.roster.includes(binding.playerId))) return 'unauthorized';
  if (frame.type === 'command' && CONTROLLER_COMMANDS.includes(frame.payload.type) && snapshot.controllerId !== binding.playerId) return 'unauthorized';
  return null;
}
/** Stable controller succession. Reconnecting players start a new connected interval and do not reclaim controls. */
export function chooseRoomController(seats) {
  return [...seats].filter(s => s.connectedSince !== null).sort((a,b) => a.connectedSince - b.connectedSince || a.joinOrder - b.joinOrder)[0]?.playerId ?? null;
}

/** Durable domain checkpoint, explicitly separate from public snapshots and raw XState persistence. */
export function validRoomCheckpoint(c) {
  const checkpointKeys = ['schemaVersion','rulesVersion','courseHash','savedAt','snapshot','identities','deadlines','nextJoinOrder','presenceSequence'];
  if (!(exact(c,checkpointKeys) || exact(c,[...checkpointKeys,'hazardSequence'])) || c.schemaVersion !== CHECKPOINT_VERSION
    || c.rulesVersion !== ROOM_RULES_VERSION || !validHash(c.courseHash) || !time(c.savedAt) || !validRoomSnapshot(c.snapshot) || c.savedAt !== c.snapshot.serverTime || c.courseHash !== c.snapshot.courseHash || c.rulesVersion !== c.snapshot.rulesVersion
    || (c.hazardSequence !== undefined && !count(c.hazardSequence))
    || !positive(c.nextJoinOrder) || c.snapshot.seats.some(s => s.joinOrder >= c.nextJoinOrder) || !count(c.presenceSequence)
    || !Array.isArray(c.identities) || c.identities.length !== c.snapshot.seats.length
    || new Set(c.identities.map(i => i?.playerId)).size !== c.identities.length
    || !c.identities.every(i => exact(i,['playerId','tokenHash','connectionId','lastSequence']) && c.snapshot.seats.some(s => s.playerId === i.playerId)
      && validHash(i.tokenHash) && nullable(i.connectionId,validRoomId) && count(i.lastSequence)
      && ((i.connectionId !== null) === (c.snapshot.seats.find(s => s.playerId === i.playerId).connectedSince !== null)))) return false;
  if (!exact(c.deadlines,['voteAt','startAt','minimumPlayAt','fallbackAt','replayAt','controllerAt','emptyAt']) || !Object.values(c.deadlines).every(t => nullable(t,time))) return false;
  const {node,context} = c.snapshot.session, d = c.deadlines;
  // Every delayed lifecycle node has an explicit restorable absolute deadline.
  if ((node === 'select.timing') !== (d.voteAt !== null) || (d.voteAt !== null && d.voteAt !== context.votingDeadline)
    || (node === 'play.starting') !== (d.startAt !== null) || (d.startAt !== null && d.startAt !== context.roundStartTime)
    || (node === 'play.active.settling') !== (d.minimumPlayAt !== null) || (d.minimumPlayAt !== null && d.minimumPlayAt !== context.roundStartTime + 1500)
    || (node === 'play.active.replaying') !== (d.replayAt !== null)) return false;
  const timed = node.startsWith('play.') && context.mode !== GameModes.PUTT_PRACTICE;
  if (timed !== (d.fallbackAt !== null) || (timed && d.fallbackAt !== context.roundStartTime + context.roundLimitSeconds * 1000 + 4000)) return false;
  const live = c.snapshot.seats.some(s => s.connectedSince !== null);
  const heldController = c.snapshot.controllerId !== null && c.snapshot.seats.find(s => s.playerId === c.snapshot.controllerId)?.connectedSince === null;
  if ((d.emptyAt !== null) === live || (d.controllerAt !== null) !== heldController
    || (heldController && d.controllerAt !== c.snapshot.seats.find(s => s.playerId === c.snapshot.controllerId).resumeUntil - c.snapshot.policy.reconnectGraceMs + c.snapshot.policy.controllerTransferDelayMs)
    || (node === 'play.active.replaying' && context.mode !== GameModes.PUTT_PRACTICE)) return false;
  return true;
}
export function decodeRoomCheckpoint(raw) {
  if (typeof raw !== 'string' || raw.length > SERVER_ROOM_LIMITS.checkpointBytes || new TextEncoder().encode(raw).byteLength > SERVER_ROOM_LIMITS.checkpointBytes) return null;
  try {
    const c=JSON.parse(raw);
    // Checkpoints saved before GM1 have no `powerups`; those rooms had power-ups on.
    const ctx=c?.snapshot?.session?.context;
    if (object(ctx) && !Object.hasOwn(ctx,'powerups')) ctx.powerups=true;
    // Checkpoints saved before VIS-U have no `rules`; those rooms played standard rules (with their power-ups setting).
    if (object(ctx) && !Object.hasOwn(ctx,'rules')) ctx.rules={ ...DEFAULT_RULES, powerups: ctx.powerups === true };
    // server-room-2 snapshots predate G1f; migrate them with no active hazards.
    if (c?.rulesVersion === 'server-room-2' && c?.snapshot?.rulesVersion === 'server-room-2') {
      c.rulesVersion = ROOM_RULES_VERSION;
      c.snapshot.rulesVersion = ROOM_RULES_VERSION;
    }
    if (c && c.hazardSequence === undefined) c.hazardSequence = Math.max(0, ...(c.snapshot?.globalHazards || []).map(h => Number(String(h?.id).slice(1)) || 0));
    return validRoomCheckpoint(c) ? c : null;
  } catch { return null; }
}
/** Caller executes due events serially through the guarded actor and re-evaluates after every commit. */
export function dueRoomDeadlines(checkpoint, now) {
  if (!validRoomCheckpoint(checkpoint) || !time(now)) throw new Error('Invalid checkpoint/clock');
  const due = Object.entries(checkpoint.deadlines).filter(([,at]) => at !== null && at <= now).map(([kind,at]) => ({kind,at}));
  for (const seat of checkpoint.snapshot.seats) if (seat.resumeUntil !== null && seat.resumeUntil <= now) due.push({kind:'resumeUntil',at:seat.resumeUntil,playerId:seat.playerId});
  const priority = { resumeUntil:0, emptyAt:1, controllerAt:2, voteAt:3, startAt:4, minimumPlayAt:5, replayAt:6, fallbackAt:7 };
  return due.sort((a,b) => a.at-b.at || priority[a.kind]-priority[b.kind] || (a.playerId ?? '').localeCompare(b.playerId ?? ''));
}
