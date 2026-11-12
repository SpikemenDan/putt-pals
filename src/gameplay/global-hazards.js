/**
 * Deterministic global-hazard math (G1f). Activation records are created and
 * synchronized by the room authority; this module only evaluates their effect.
 * No local clock or random source is used, so every peer can derive the same
 * vortex path from the activation seed and synchronized room time.
 */

import { TUNING } from '../shared/tuning.js';

import { MAP_COUNT } from '../shared/map-count.js';
export const GLOBAL_HAZARD_KINDS = Object.freeze(['rain', 'snow', 'wind', 'lightning', 'tornado', 'hurricane']);
export const GLOBAL_HAZARD_LIMIT = 32;
const finite = Number.isFinite;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hashSeed(seed) {
  let h = 2166136261;
  for (const char of String(seed)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(seed, salt) {
  let value = (hashSeed(seed) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

const activeAt = (record, time) => record && finite(time) && finite(record.startTime)
  && finite(record.endTime) && time >= record.startTime && time < record.endTime;

const roomId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const VORTEX_KINDS = ['tornado', 'hurricane'];
const spot = value => finite(value) && Math.abs(value) <= 1000000; // a placed Tornado or Hurricane; the room clamps it to the putt
const HAZARD_KEYS = ['id', 'kind', 'owner', 'roundNumber', 'map', 'putt', 'startTime', 'endTime', 'seed'];

/** Client command shape; the room assigns owner, timing, identity and seed. */
export function validGlobalHazardCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command) || !GLOBAL_HAZARD_KINDS.includes(command.kind)) return false;
  if (command.kind === 'wind') return Object.keys(command).length === 2 && finite(command.direction)
    && command.direction >= -Math.PI && command.direction <= Math.PI;
  if (command.kind === 'lightning') return Object.keys(command).length === 2 && roomId(command.targetId);
  if (VORTEX_KINDS.includes(command.kind)) return Object.keys(command).length === 3 && spot(command.x) && spot(command.y);
  return Object.keys(command).length === 1;
}

/** Validate the exact snapshot record shape (activation is host-authoritative). */
export function validGlobalHazard(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || !GLOBAL_HAZARD_KINDS.includes(record.kind)) return false;
  const keys = [...HAZARD_KEYS];
  if (record.kind === 'wind') keys.push('direction');
  if (record.kind === 'lightning') keys.push('targetId');
  if (VORTEX_KINDS.includes(record.kind)) keys.push('x', 'y');
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) return false;
  return roomId(record.id) && roomId(record.owner) && Number.isSafeInteger(record.roundNumber) && record.roundNumber >= 0
    && Number.isSafeInteger(record.map) && record.map >= 0 && record.map < MAP_COUNT
    && Number.isSafeInteger(record.putt) && record.putt >= 0 && record.putt < 6
    && finite(record.startTime) && finite(record.endTime) && record.endTime > record.startTime
    && Number.isSafeInteger(record.seed) && record.seed >= 0 && record.seed <= 0xffffffff
    && (record.kind !== 'wind' || finite(record.direction) && record.direction >= -Math.PI && record.direction <= Math.PI)
    && (record.kind !== 'lightning' || roomId(record.targetId))
    && (!VORTEX_KINDS.includes(record.kind) || spot(record.x) && spot(record.y));
}

/** Create a timed record using host-assigned identity, time and seed. */
export function createGlobalHazard(list, command, context, tuning = TUNING.globalHazards) {
  if (!Array.isArray(list) || !context || !GLOBAL_HAZARD_KINDS.includes(command?.kind)) return null;
  const record = {
    id: `h${context.sequence}`,
    kind: command.kind,
    owner: context.owner,
    roundNumber: context.roundNumber,
    map: context.map,
    putt: context.putt,
    startTime: context.now,
    endTime: context.now + (command.kind === 'lightning' ? tuning.lightningWindowSeconds : command.kind === 'wind' ? tuning.windDurationSeconds : tuning.durationSeconds),
    seed: context.seed,
  };
  if (command.kind === 'wind') record.direction = command.direction;
  if (command.kind === 'lightning') record.targetId = command.targetId;
  if (VORTEX_KINDS.includes(command.kind)) { record.x = command.x; record.y = command.y; }
  if (!validGlobalHazard(record)) return null;
  // Opposing weather does not stack; a new weather activation replaces the old one.
  const kinds = command.kind === 'rain' || command.kind === 'snow' ? ['rain', 'snow'] : [command.kind];
  const next = [...list.filter(item => validGlobalHazard(item) && item.endTime > context.now && !kinds.includes(item.kind)), record];
  return next.length <= GLOBAL_HAZARD_LIMIT ? next : null;
}

/** Filter stale activations to the live putt and synchronized room time. */
export function activeGlobalHazards(list, { roundNumber, map, putt, now }) {
  if (!Array.isArray(list) || ![roundNumber, map, putt, now].every(finite)) return [];
  return list.filter(record => validGlobalHazard(record) && record.roundNumber === roundNumber
    && record.map === map && record.putt === putt && activeAt(record, now));
}

/** Course-wide horizontal limits derived from the playable tiles. */
export function courseBounds(course) {
  if (!Array.isArray(course?.tiles) || !course.tiles.length) return null;
  const bounds = course.tiles.reduce((b, [x, y, width, height]) => [
    Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x + width), Math.max(b[3], y + height),
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  return bounds.every(finite) ? bounds : null;
}

/**
 * Get a repeatable vortex centre: it starts at the spot it was placed at, wanders up to `roamRadius` around it and is
 * always kept inside `[minX, minY, maxX, maxY]`, inset by `roamInset`, so it stays in its own putt.
 * @param {object} record Validated tornado/hurricane record with seed/startTime/endTime
 * @param {number} time Synchronized room time in seconds
 * @param {number[]} bounds Course bounds
 * @param {object} tuning Defaults to the shared authoritative tuning block
 */
export function globalHazardCenter(record, time, bounds, tuning = TUNING.globalHazards) {
  if (!activeAt(record, time) || !['tornado', 'hurricane'].includes(record.kind)
      || record.seed == null || !Array.isArray(bounds) || bounds.length !== 4) return null;
  const [minX, minY, maxX, maxY] = bounds;
  const { roamRadius: radius, roamPeriod: period, roamInset: inset } = tuning;
  if (![minX, minY, maxX, maxY, radius, period, inset, record.x, record.y].every(finite) || maxX < minX || maxY < minY || radius < 0 || period <= 0) return null;
  const px = (maxX - minX) * inset, py = (maxY - minY) * inset;
  const start = unit(record.seed, 0) * Math.PI * 2, offset = unit(record.seed, 1) * Math.PI * 2;
  const wander = (u, wave) => wave(u) * 0.72 + wave(u * 0.63 + offset) * 0.28;
  const phase = (time - record.startTime) / period * Math.PI * 2 + start;
  return {
    x: clamp(record.x + (wander(phase, Math.cos) - wander(start, Math.cos)) * radius, minX + px, maxX - px),
    y: clamp(record.y + (wander(phase, Math.sin) - wander(start, Math.sin)) * radius, minY + py, maxY - py),
  };
}

/**
 * Evaluate continuous effects at a ball's horizontal position.
 * Multipliers affect rolling resistance; acceleration is in world units/s^2.
 */
export function evaluateGlobalHazards(records, time, position, bounds, tuning = TUNING.globalHazards) {
  const result = { frictionMultiplier: 1, dragMultiplier: 1, ax: 0, ay: 0, az: 0 };
  if (!Array.isArray(records) || !finite(time) || !position || !finite(position.x) || !finite(position.y)) return result;
  for (const record of records) {
    if (!activeAt(record, time)) continue;
    if (record.kind === 'rain') {
      result.frictionMultiplier *= tuning.rainFrictionMultiplier;
      result.dragMultiplier *= tuning.rainDragMultiplier;
    } else if (record.kind === 'snow') {
      result.frictionMultiplier *= tuning.snowFrictionMultiplier;
      result.dragMultiplier *= tuning.snowDragMultiplier;
    } else if (record.kind === 'wind' && finite(record.direction)) {
      const gust = tuning.windAcceleration * gustStrength(record, time); // walls do not block this; only the drawn wind reacts to them
      result.ax += Math.cos(record.direction) * gust;
      result.ay += Math.sin(record.direction) * gust;
    } else if (record.kind === 'tornado' || record.kind === 'hurricane') {
      const center = globalHazardCenter(record, time, bounds, tuning);
      if (!center) continue;
      const dx = center.x - position.x, dy = center.y - position.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= tuning.vortexRange || tuning.vortexRange <= 0) continue;
      const falloff = 1 - distance / tuning.vortexRange;
      if (record.kind === 'tornado') result.az += tuning.tornadoLift * falloff;
      if (distance <= 1e-9) continue;
      const direction = record.kind === 'hurricane' ? 1 : -1;
      const strength = tuning.vortexAcceleration * falloff * direction;
      result.ax += dx / distance * strength;
      result.ay += dy / distance * strength;
    }
  }
  return result;
}

/** Gust strength 0..1: a smooth rise, peak at the middle of the gust and fall; zero outside it. */
export function gustStrength(record, time) {
  if (!activeAt(record, time)) return 0;
  const s = Math.sin(Math.PI * (time - record.startTime) / (record.endTime - record.startTime));
  return s * s;
}

/**
 * Distance from (x, y) along the unit direction (dx, dy) to the first wall in `course.w`, up to `maxDistance`; Infinity when
 * nothing is in the way, 0 when the point is inside a wall.
 */
export function rayToWall(course, x, y, dx, dy, maxDistance) {
  let best = Infinity;
  for (const r of course?.w || []) {
    let near = 0, far = maxDistance; // slab test, written out because it runs per tick and per ribbon point
    if (Math.abs(dx) < 1e-9) { if (x < r[0] || x > r[0] + r[2]) continue; } else {
      const a = (r[0] - x) / dx, b = (r[0] + r[2] - x) / dx;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    if (Math.abs(dy) < 1e-9) { if (y < r[1] || y > r[1] + r[3]) continue; } else {
      const a = (r[1] - y) / dy, b = (r[1] + r[3] - y) / dy;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    if (near <= far && near < best) best = near;
  }
  return best;
}

const PINNED_GAP = TUNING.ball.radius + 3; // a wall this close downwind stops the ball, so the wind cannot move it

/**
 * True while a hazard is really moving this ball: it wakes a resting ball and keeps a slow one from stopping. A gust too weak to beat
 * the surface, or one holding the ball against a wall, does not count, so that ball can rest and be played.
 */
export function hazardHoldsBall(records, time, ball, bounds, course, tuning = TUNING.globalHazards) {
  if (!records?.length) return false;
  for (const record of records) {
    if (!activeAt(record, time)) continue;
    if (record.kind === 'wind') {
      const pinned = rayToWall(course, ball.x, ball.y, Math.cos(record.direction), Math.sin(record.direction), PINNED_GAP) !== Infinity;
      if (!pinned && tuning.windAcceleration * gustStrength(record, time) > tuning.windWakeAccel) return true;
    } else if (VORTEX_KINDS.includes(record.kind)) {
      const force = evaluateGlobalHazards([record], time, ball, bounds, tuning);
      if (Math.hypot(force.ax, force.ay, force.az) > 0) return true;
    }
  }
  return false;
}

/** Deterministic one-shot Lightning impulse; callers apply each activation id once. */
export function lightningImpulse(record, targetId, tuning = TUNING.globalHazards) {
  if (!record || record.kind !== 'lightning' || targetId !== record.targetId || record.seed == null) return null;
  const angle = unit(record.seed, 2) * Math.PI * 2;
  return { x: Math.cos(angle) * tuning.lightningImpulse, y: Math.sin(angle) * tuning.lightningImpulse };
}
