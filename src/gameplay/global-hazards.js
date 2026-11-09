/**
 * Deterministic global-hazard math (G1f). Activation records are created and
 * synchronized by the room authority; this module only evaluates their effect.
 * No local clock or random source is used, so every peer can derive the same
 * vortex path from the activation seed and synchronized room time.
 */

import { TUNING } from '../shared/tuning.js';

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
const HAZARD_KEYS = ['id', 'kind', 'owner', 'roundNumber', 'map', 'putt', 'startTime', 'endTime', 'seed'];

/** Client command shape; the room assigns owner, timing, identity and seed. */
export function validGlobalHazardCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command) || !GLOBAL_HAZARD_KINDS.includes(command.kind)) return false;
  if (command.kind === 'wind') return Object.keys(command).length === 2 && finite(command.direction)
    && command.direction >= -Math.PI && command.direction <= Math.PI;
  if (command.kind === 'lightning') return Object.keys(command).length === 2 && roomId(command.targetId);
  return Object.keys(command).length === 1;
}

/** Validate the exact snapshot record shape (activation is host-authoritative). */
export function validGlobalHazard(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || !GLOBAL_HAZARD_KINDS.includes(record.kind)) return false;
  const keys = [...HAZARD_KEYS];
  if (record.kind === 'wind') keys.push('direction');
  if (record.kind === 'lightning') keys.push('targetId');
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) return false;
  return roomId(record.id) && roomId(record.owner) && Number.isSafeInteger(record.roundNumber) && record.roundNumber >= 0
    && Number.isSafeInteger(record.map) && record.map >= 0 && record.map < 22
    && Number.isSafeInteger(record.putt) && record.putt >= 0 && record.putt < 6
    && finite(record.startTime) && finite(record.endTime) && record.endTime > record.startTime
    && Number.isSafeInteger(record.seed) && record.seed >= 0 && record.seed <= 0xffffffff
    && (record.kind !== 'wind' || finite(record.direction) && record.direction >= -Math.PI && record.direction <= Math.PI)
    && (record.kind !== 'lightning' || roomId(record.targetId));
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
    endTime: context.now + (command.kind === 'lightning' ? tuning.lightningWindowSeconds : tuning.durationSeconds),
    seed: context.seed,
  };
  if (command.kind === 'wind') record.direction = command.direction;
  if (command.kind === 'lightning') record.targetId = command.targetId;
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
 * Get a repeatable vortex centre constrained to `[minX, minY, maxX, maxY]`.
 * @param {object} record Validated tornado/hurricane record with seed/startTime/endTime
 * @param {number} time Synchronized room time in seconds
 * @param {number[]} bounds Course bounds
 * @param {object} tuning Defaults to the shared authoritative tuning block
 */
export function globalHazardCenter(record, time, bounds, tuning = TUNING.globalHazards) {
  if (!activeAt(record, time) || !['tornado', 'hurricane'].includes(record.kind)
      || record.seed == null || !Array.isArray(bounds) || bounds.length !== 4) return null;
  const [minX, minY, maxX, maxY] = bounds;
  const { roamRadius: radius, roamPeriod: period } = tuning;
  if (![minX, minY, maxX, maxY, radius, period].every(finite) || maxX < minX || maxY < minY || radius < 0 || period <= 0) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const rx = Math.min(radius, (maxX - minX) / 2), ry = Math.min(radius, (maxY - minY) / 2);
  if (rx === 0 || ry === 0) return { x: cx, y: cy };
  const phase = (time - record.startTime) / period * Math.PI * 2 + unit(record.seed, 0) * Math.PI * 2;
  const secondary = phase * 0.63 + unit(record.seed, 1) * Math.PI * 2;
  return {
    x: clamp(cx + Math.cos(phase) * rx * 0.72 + Math.cos(secondary) * rx * 0.28, minX, maxX),
    y: clamp(cy + Math.sin(phase) * ry * 0.72 + Math.sin(secondary) * ry * 0.28, minY, maxY),
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
      result.ax += Math.cos(record.direction) * tuning.windAcceleration;
      result.ay += Math.sin(record.direction) * tuning.windAcceleration;
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

/** Deterministic one-shot Lightning impulse; callers apply each activation id once. */
export function lightningImpulse(record, targetId, tuning = TUNING.globalHazards) {
  if (!record || record.kind !== 'lightning' || targetId !== record.targetId || record.seed == null) return null;
  const angle = unit(record.seed, 2) * Math.PI * 2;
  return { x: Math.cos(angle) * tuning.lightningImpulse, y: Math.sin(angle) * tuning.lightningImpulse };
}
