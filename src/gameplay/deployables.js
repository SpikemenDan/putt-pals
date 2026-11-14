/**
 * Deployable objects (G1e): Bumper and Orbital Bumper. Pure functions over plain records; no DOM, Three.js,
 * network access, clock or randomness. The record shape, caps and commands follow
 * docs/contracts/G1E_DEPLOYABLES.md.
 *
 * With no deployables every function returns without touching a number, so shot results stay bit-identical to
 * the parity fixtures.
 */

import { BALL_RADIUS, MAX_DEPLOYABLES } from '../shared/constants.js';
import { cupOf, surfaceHeight } from '../simulation/physics.js';
import { getPowerup, POWERUP_CATALOG, PowerupTargets } from './catalog.js';

import { DEPLOYABLE_PARAMS, DEPLOYABLE_HIT } from '../simulation/deployables.js';
import { MAP_COUNT } from '../shared/map-count.js';
// The pure contact maths lives in the simulation (no gameplay or catalog imports there); re-exported for existing callers.
export { DEPLOYABLE_PARAMS, DEPLOYABLE_HIT, bumperContact, orbitalAcceleration, orbitalHolds } from '../simulation/deployables.js';

const COORD_LIMIT = 1000000;
const count = n => Number.isSafeInteger(n) && n >= 0;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id); // same rule as network/protocol.js; the simulation must not import the network layer
const index = (n, max) => count(n) && n < max;
const KEYS = ['id', 'kind', 'x', 'y', 'z', 'owner', 'impacts', 'placedAt', 'map', 'putt'];

/** True for a well-formed deployable record (the exact key set, a course catalog id, an impact count below the limit). */
export function validDeployable(d, catalog = POWERUP_CATALOG, params = DEPLOYABLE_PARAMS) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const k = Object.keys(d);
  if (k.length !== KEYS.length || !KEYS.every(key => Object.hasOwn(d, key))) return false;
  return validId(d.id) && validId(d.owner) && getPowerup(d.kind, catalog)?.target === PowerupTargets.COURSE
    && [d.x, d.y, d.z].every(n => Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT)
    && count(d.impacts) && d.impacts < params.maxImpacts
    && Number.isFinite(d.placedAt) && index(d.map, MAP_COUNT) && index(d.putt, 6);
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
 * Course check for a placement (host side). Returns the floor height `z` the object will stand on, or null: the point is on the
 * floor and not over a pit, the footprint is flat within `placementSlopeTolerance` (contract section 8), the whole body clears
 * every wall by `bumperRadius`, and it does not cover the cup. `course` is a resolved course (tiles, pit, w as [x, y, w, h] rows).
 */
export function placementFloor(course, x, y, params = DEPLOYABLE_PARAMS) {
  if (!course) return null;
  const z = surfaceHeight(course, x, y);
  if (!(z > -900)) return null; // off the floor tiles or over a pit
  const r = params.bumperRadius;
  // The whole footprint must stand flat on this one level: ramps, platform ledges and pit edges under it are rejected.
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    if (!(Math.abs(surfaceHeight(course, x + Math.cos(a) * r, y + Math.sin(a) * r) - z) <= params.placementSlopeTolerance)) return null;
  }
  if (Array.isArray(course.hole) && Math.hypot(x - course.hole[0], y - course.hole[1]) < cupOf(course) + r) return null;
  if ((course.w || []).some(([wx, wy, ww, wh]) => Math.hypot(x - Math.max(wx, Math.min(x, wx + ww)), y - Math.max(wy, Math.min(y, wy + wh))) < r)) return null;
  return z;
}
/** Boolean form of `placementFloor`, for the placement hologram. */
export const placementClear = (course, x, y, params = DEPLOYABLE_PARAMS) => placementFloor(course, x, y, params) !== null;

const finiteIn = n => Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT;
/** Shape of a DEPLOY_OBJECT command payload (the network layer checks the same fields). */
export const validDeployCommand = (c, catalog = POWERUP_CATALOG) => !!c && typeof c === 'object'
  && getPowerup(c.kind, catalog)?.target === PowerupTargets.COURSE && finiteIn(c.x) && finiteIn(c.y);

/**
 * Host side of DEPLOY_OBJECT. Pure: returns the new list and the placed record, or the same list and a reason.
 * @param {object[]} list Current records
 * @param {{kind:string,x:number,y:number}} command The placement the player chose
 * @param {{playerId:string, map:number, putt:number, time:number, sequence:number, floorAt?:(x:number,y:number)=>(number|null)}} ctx
 *   `floorAt` is the course check (`placementFloor`): the floor height to stand on, or null when it does not fit. The host supplies it
 *   when it has the course; without it the object stands at height 0.
 * @returns {{list:object[], placed?:object, reason?:string}}
 */
export function placeDeployable(list, command, ctx, catalog = POWERUP_CATALOG, params = DEPLOYABLE_PARAMS) {
  if (!validDeployCommand(command, catalog)) return { list, reason: 'invalid' };
  if (list.length >= MAX_DEPLOYABLES) return { list, reason: 'room-full' };
  const z = ctx.floorAt ? ctx.floorAt(command.x, command.y) : 0;
  if (!Number.isFinite(z)) return { list, reason: 'blocked' };
  if (list.some(d => Math.hypot(d.x - command.x, d.y - command.y) < 2 * params.bumperRadius)) return { list, reason: 'overlap' }; // bodies may sit close, but not inside each other
  const placed = { id: `d${ctx.sequence}`, kind: command.kind, x: command.x, y: command.y, z, owner: ctx.playerId, impacts: 0, placedAt: ctx.time, map: ctx.map, putt: ctx.putt };
  return validDeployable(placed, catalog, params) ? { list: [...list, placed], placed } : { list, reason: 'invalid' };
}

/**
 * Server-room check of a DEPLOY_HIT against the reporter's latest presence (contract section 4): the reporter was playing, within
 * `bumperRadius + ball radius + hitReportTolerance` of the object horizontally, and inside its body band vertically (widened by the
 * same tolerance). A client cannot kill an object from the other side of the course or from far above it.
 * @param {{x:number,y:number,z:number}} d The object
 * @param {{x:number,y:number,z:number,mode:string}|null} presence The reporter's latest presence, or null when it is stale or missing
 */
export function hitPlausible(d, presence, params = DEPLOYABLE_PARAMS, ballRadius = BALL_RADIUS) {
  if (!presence || presence.mode !== 'play') return false;
  const tol = params.hitReportTolerance;
  if (Math.hypot(presence.x - d.x, presence.y - d.y) > params.bumperRadius + ballRadius + tol) return false;
  return presence.z < d.z + params.bodyHeight + tol && presence.z + 2 * ballRadius > d.z - tol;
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
