/**
 * Deployable objects (G1e): Bumper and Orbital Bumper. Pure functions over plain records; no DOM, Three.js,
 * network access, clock or randomness. The record shape, caps and commands follow
 * docs/contracts/G1E_DEPLOYABLES.md.
 *
 * With no deployables every function returns without touching a number, so shot results stay bit-identical to
 * the parity fixtures.
 */

import { MAX_DEPLOYABLES, MAX_DEPLOYABLES_PER_PLAYER } from '../shared/constants.js';
import { TUNING } from '../shared/tuning.js';
import { surfaceHeight } from '../simulation/physics.js';
import { getPowerup, POWERUP_CATALOG, PowerupTargets } from './catalog.js';

/** The `deployables.*` tuning block (src/shared/tuning.js, docs/TUNING.md). Helpers take it as an argument so tests can pass their own. */
export const DEPLOYABLE_PARAMS = TUNING.deployables;

/** Domain event a bumper contact adds to the step events; the app turns it into a DEPLOY_HIT report. */
export const DEPLOYABLE_HIT = 'deployable-hit';

const COORD_LIMIT = 1000000;
const count = n => Number.isSafeInteger(n) && n >= 0;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id); // same rule as network/protocol.js; the simulation must not import the network layer
const index = (n, max) => count(n) && n < max;
const KEYS = ['id', 'kind', 'x', 'y', 'owner', 'impacts', 'placedAt', 'map', 'putt'];

/** True for a well-formed deployable record (the exact key set, a course catalog id, an impact count below the limit). */
export function validDeployable(d, catalog = POWERUP_CATALOG, params = DEPLOYABLE_PARAMS) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const k = Object.keys(d);
  if (k.length !== KEYS.length || !KEYS.every(key => Object.hasOwn(d, key))) return false;
  return validId(d.id) && validId(d.owner) && getPowerup(d.kind, catalog)?.target === PowerupTargets.COURSE
    && [d.x, d.y].every(n => Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT)
    && count(d.impacts) && d.impacts < params.maxImpacts
    && Number.isFinite(d.placedAt) && index(d.map, 22) && index(d.putt, 6);
}

/** The records that apply on this putt: valid, right map and putt, not yet used up. */
export const activeDeployables = (list, map, putt, catalog = POWERUP_CATALOG, params = DEPLOYABLE_PARAMS) =>
  Array.isArray(list) ? list.filter(d => validDeployable(d, catalog, params) && d.map === map && d.putt === putt) : [];

/**
 * Records one impact on a list (host side). Returns the new list: the object's count goes up by one and it is dropped
 * when it reaches the limit. An unknown id returns the list unchanged.
 */
export function recordImpact(list, id, params = DEPLOYABLE_PARAMS) {
  if (!list.some(d => d.id === id)) return list;
  return list.flatMap(d => d.id !== id ? [d] : d.impacts + 1 >= params.maxImpacts ? [] : [{ ...d, impacts: d.impacts + 1 }]);
}

/**
 * Orbital hook: the acceleration (x/y, world units per second squared, already scaled by dt) that every orbital ring
 * exerts on a ball at (x, y). It pulls toward the centre and falls off linearly to zero at the ring edge.
 * Returns [0, 0] with no orbitals.
 */
export function orbitalAcceleration(list, x, y, dt, params = DEPLOYABLE_PARAMS) {
  let ax = 0, ay = 0;
  if (!list?.length) return [ax, ay];
  for (const d of list) {
    if (d.kind !== 'orbital') continue;
    const dx = d.x - x, dy = d.y - y, dist = Math.hypot(dx, dy);
    if (!(dist > 1e-6 && dist < params.orbitalRange)) continue;
    const strength = params.orbitalPull * (1 - dist / params.orbitalRange) * dt;
    ax += dx / dist * strength; ay += dy / dist * strength;
  }
  return [ax, ay];
}

/**
 * Bumper hook: bounces a ball (player-like, with x, y, vx, vy) off the first solid it overlaps and moving into.
 * Pushes the ball out to the surface, reflects the normal velocity with the restitution gain and returns the
 * contact events. Mutates `ball`. A ball moving away from the centre is only pushed out, with no event and no impact.
 * @returns {{type:string, id:string}[]}
 */
export function bumperContact(list, ball, radius, params = DEPLOYABLE_PARAMS) {
  const events = [];
  if (!list?.length) return events;
  for (const d of list) {
    const dx = ball.x - d.x, dy = ball.y - d.y, dist = Math.hypot(dx, dy), reach = params.bumperRadius + radius;
    if (!(dist < reach)) continue;
    const nx = dist > 1e-9 ? dx / dist : 1, ny = dist > 1e-9 ? dy / dist : 0;
    ball.x = d.x + nx * reach; ball.y = d.y + ny * reach;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn >= 0) continue;
    ball.vx -= (1 + params.bumperRestitution) * vn * nx;
    ball.vy -= (1 + params.bumperRestitution) * vn * ny;
    events.push({ type: DEPLOYABLE_HIT, id: d.id });
  }
  return events;
}

/**
 * Course check for a placement (host side): the point is on the floor, not over a pit, and the whole body clears
 * every wall by `bumperRadius`. `course` is a resolved course (tiles, pit, w as [x, y, w, h] rows).
 */
export function placementClear(course, x, y, params = DEPLOYABLE_PARAMS) {
  if (!course || surfaceHeight(course, x, y) <= -999) return false;
  const r = params.bumperRadius;
  return !(course.w || []).some(([wx, wy, ww, wh]) => Math.hypot(x - Math.max(wx, Math.min(x, wx + ww)), y - Math.max(wy, Math.min(y, wy + wh))) < r);
}

const finiteIn = n => Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT;
/** Shape of a DEPLOY_OBJECT command payload (the network layer checks the same fields). */
export const validDeployCommand = (c, catalog = POWERUP_CATALOG) => !!c && typeof c === 'object'
  && getPowerup(c.kind, catalog)?.target === PowerupTargets.COURSE && finiteIn(c.x) && finiteIn(c.y);

/**
 * Host side of DEPLOY_OBJECT. Pure: returns the new list and the placed record, or the same list and a reason.
 * @param {object[]} list Current records
 * @param {{kind:string,x:number,y:number}} command The placement the player chose
 * @param {{playerId:string, map:number, putt:number, time:number, sequence:number, validPlacement?:(x:number,y:number)=>boolean}} ctx
 *   `validPlacement` is the course check (on the floor, clear of walls); the host supplies it when it has the course.
 * @returns {{list:object[], placed?:object, reason?:string}}
 */
export function placeDeployable(list, command, ctx, catalog = POWERUP_CATALOG, params = DEPLOYABLE_PARAMS) {
  if (!validDeployCommand(command, catalog)) return { list, reason: 'invalid' };
  if (list.length >= MAX_DEPLOYABLES) return { list, reason: 'room-full' };
  if (list.filter(d => d.owner === ctx.playerId).length >= MAX_DEPLOYABLES_PER_PLAYER) return { list, reason: 'player-full' };
  if (ctx.validPlacement && !ctx.validPlacement(command.x, command.y)) return { list, reason: 'blocked' };
  const placed = { id: `d${ctx.sequence}`, kind: command.kind, x: command.x, y: command.y, owner: ctx.playerId, impacts: 0, placedAt: ctx.time, map: ctx.map, putt: ctx.putt };
  return validDeployable(placed, catalog, params) ? { list: [...list, placed], placed } : { list, reason: 'invalid' };
}

/**
 * Host side of DEPLOY_HIT: counts one impact unless this object was reported less than `hitCooldownMs` ago.
 * `lastHit` maps object id to the time (ms) of its last accepted report and is updated in place.
 * @returns {{list:object[], counted:boolean}}
 */
export function hitDeployable(list, id, nowMs, lastHit, params = DEPLOYABLE_PARAMS) {
  if (!list.some(d => d.id === id)) return { list, counted: false };
  if (lastHit.has(id) && nowMs - lastHit.get(id) < params.hitCooldownMs) return { list, counted: false };
  lastHit.set(id, nowMs);
  const next = recordImpact(list, id, params);
  if (!next.some(d => d.id === id)) lastHit.delete(id);
  return { list: next, counted: true };
}
