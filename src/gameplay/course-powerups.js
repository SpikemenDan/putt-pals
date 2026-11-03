/** Server-owned pickup receipts, inventory and placed objects. No clocks or randomness read here. */
import { TUNING } from '../shared/tuning.js';
import { getPowerup, isPowerupId, rollPowerup } from './catalog.js';
import { MAX_INVENTORY, powerupPolicy } from './inventory.js';
import { DEPLOYABLE_KINDS, MAX_DEPLOYABLES, MAX_DEPLOYABLES_PER_PLAYER } from './deployables.js';
import { inside, movingRect, surfaceHeight } from '../simulation/physics.js';

const D = TUNING.deployables;
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const count = n => Number.isSafeInteger(n) && n >= 0;
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const position = n => Number.isFinite(n) && Math.abs(n) <= 1000000;
export const isDeployableKind = kind => DEPLOYABLE_KINDS.includes(kind);
export function validDeployable(o) {
  return exact(o, ['id','kind','owner','x','y','z','impacts','placedAt','map','putt','round'])
    && id(o.id) && id(o.owner) && isDeployableKind(o.kind) && [o.x,o.y,o.z].every(position)
    && count(o.impacts) && o.impacts < D.maxImpacts && count(o.placedAt)
    && count(o.map) && o.map < 22 && count(o.putt) && o.putt < 6 && count(o.round);
}
export const createCoursePowerups = () => ({ round: 0, map: 0, putt: 0, nextId: 1, inventories: {}, collected: {}, activations: {}, deployables: [], hitTimes: {} });

export function validCoursePowerups(g, context) {
  if (!exact(g, ['round','map','putt','nextId','inventories','collected','activations','deployables','hitTimes'])
    || !count(g.round) || !count(g.map) || g.map >= 22 || !count(g.putt) || g.putt >= 6 || !count(g.nextId) || g.nextId < 1) return false;
  for (const k of ['inventories','collected','activations','hitTimes']) if (!g[k] || typeof g[k] !== 'object' || Array.isArray(g[k]) || Object.keys(g[k]).length > 128) return false;
  const member = k => id(k) && Object.hasOwn(context.players, k);
  if (!Object.entries(g.inventories).every(([k,v]) => member(k) && Array.isArray(v) && v.length <= MAX_INVENTORY && v.every(x => isPowerupId(x)))) return false;
  if (!Object.entries(g.collected).every(([k,v]) => member(k) && Array.isArray(v) && v.length <= 1024 && new Set(v).size === v.length && v.every(n => count(n) && n < 1024))) return false;
  if (!Object.entries(g.activations).every(([k,v]) => member(k) && exact(v,['id','kind','slot']) && count(v.id) && v.id < g.nextId && isPowerupId(v.kind) && count(v.slot) && v.slot < MAX_INVENTORY)) return false;
  if (!Array.isArray(g.deployables) || g.deployables.length > MAX_DEPLOYABLES || new Set(g.deployables.map(o => o.id)).size !== g.deployables.length
    || !g.deployables.every(o => validDeployable(o) && member(o.owner) && o.round === g.round && o.map === g.map && o.putt === g.putt
      && g.deployables.filter(v => v.owner === o.owner).length <= MAX_DEPLOYABLES_PER_PLAYER)) return false;
  return Object.entries(g.hitTimes).every(([k,v]) => g.deployables.some(o => o.id === k) && count(v));
}

/** On transitions clear objects/receipts; only tournaments carry inventory. Prune departed history. */
export function syncCoursePowerups(g, s) {
  const policy = powerupPolicy({ ...s, rosterSize: s.roster.length });
  if (g.round !== s.roundNumber || g.map !== s.mapIndex || g.putt !== s.puttIndex || s.phase === 'lobby') {
    if (!policy.carryover || s.phase === 'lobby') g.inventories = {};
    g.collected = {}; g.deployables = []; g.hitTimes = {}; g.activations = {};
    g.round = s.roundNumber; g.map = s.mapIndex; g.putt = s.puttIndex;
  }
  if (!policy.boxes) { g.inventories = {}; g.deployables = []; g.hitTimes = {}; }
  for (const k of ['inventories','collected','activations']) for (const p of Object.keys(g[k])) if (!Object.hasOwn(s.players,p)) delete g[k][p];
  g.deployables = g.deployables.filter(o => Object.hasOwn(s.players, o.owner));
  for (const k of Object.keys(g.hitTimes)) if (!g.deployables.some(o => o.id === k)) delete g.hitTimes[k];
}

/** Conservative placement: solid ground under whole footprint, no walls, movers, pickups, tees or cups. */
export function canPlaceDeployable(course, x, y, roomSeconds = 0, objects = [], settings = D) {
  if (![x,y].every(position)) return false;
  const clearance = settings.bumperRadius + TUNING.ball.radius;
  const z = surfaceHeight(course, x, y);
  if (z < -900) return false;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    if (Math.abs(surfaceHeight(course, x + Math.cos(a) * clearance, y + Math.sin(a) * clearance) - z) > settings.placementSlopeTolerance) return false;
  }
  const intersects = r => inside([r[0]-clearance, r[1]-clearance, r[2]+clearance*2, r[3]+clearance*2], x,y);
  if ((course.w ?? []).some(intersects) || (course.movers ?? []).some(m => intersects(movingRect(m,roomSeconds)))) return false;
  if ([course.tee,course.hole,...(course.q ?? [])].filter(Boolean).some(p => Math.hypot(x-p[0],y-p[1]) < clearance + settings.placementClearance)) return false;
  return !objects.some(o => Math.hypot(x-o.x,y-o.y) < clearance * 2);
}

/** Caller has already bound the sender and checked frame scope/sequence. Random and now are injected. */
export function applyCoursePowerupCommand(g, s, playerId, command, { course, presence, now, random }) {
  syncCoursePowerups(g,s);
  const p = s.players[playerId], policy = powerupPolicy({ ...s, rosterSize: s.roster.length });
  if (s.phase !== 'play' || !s.roster.includes(playerId) || !p?.connected || p.done || now < s.roundStartTime || !policy.boxes) return false;
  const inventory = g.inventories[playerId] ?? [];
  if (command.type === 'CLAIM_POWERUP') {
    const q = course.q?.[command.block];
    if (!q || !presence || presence.mode !== 'play' || (g.collected[playerId] ?? []).includes(command.block)
      || Math.hypot(presence.x-q[0],presence.y-q[1]) >= TUNING.ball.radius + D.pickupRadius
      || Math.abs(presence.z-surfaceHeight(course,...q)) >= D.pickupHeight) return false;
    (g.collected[playerId] ??= []).push(command.block);
    if (inventory.length < MAX_INVENTORY) { inventory.push(rollPowerup(policy.pool,random)); g.inventories[playerId] = inventory; }
    return true;
  }
  if (command.type === 'DEPLOY_HIT') {
    const o = g.deployables.find(o => o.id === command.id);
    if (!o || !presence || presence.mode !== 'play' || Math.hypot(presence.x-o.x,presence.y-o.y) > D.bumperRadius + TUNING.ball.radius + D.hitReportTolerance
      || Math.abs(presence.z-o.z) > D.height || now - (g.hitTimes[o.id] ?? -Infinity) < D.hitCooldownMs) return false;
    g.hitTimes[o.id] = now;
    o.impacts++;
    if (o.impacts >= D.maxImpacts) { g.deployables = g.deployables.filter(v => v.id !== o.id); delete g.hitTimes[o.id]; }
    return true;
  }
  if (inventory[command.slot] !== command.kind || !getPowerup(command.kind)) return false;
  if (command.type === 'DEPLOY_OBJECT') {
    if (!isDeployableKind(command.kind) || !policy.pool.some(e => e.id === command.kind) || g.deployables.length >= MAX_DEPLOYABLES
      || g.deployables.filter(o => o.owner === playerId).length >= MAX_DEPLOYABLES_PER_PLAYER
      || !canPlaceDeployable(course,command.x,command.y,(now-s.roundStartTime)/1000,g.deployables)) return false;
    g.deployables.push({ id: 'd'+g.nextId, kind: command.kind, owner: playerId, x: command.x, y: command.y,
      z: surfaceHeight(course,command.x,command.y), impacts: 0, placedAt: now, map: s.mapIndex, putt: s.puttIndex, round: s.roundNumber });
  } else if (command.type !== 'USE_POWERUP' || isDeployableKind(command.kind)) return false;
  g.activations[playerId] = { id: g.nextId++, kind: command.kind, slot: command.slot };
  inventory.splice(command.slot,1);
  return true;
}
