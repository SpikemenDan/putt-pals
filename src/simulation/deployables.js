/**
 * Pure Bumper and Orbital Bumper contact maths (G1e), shared by the simulation. It imports nothing from gameplay,
 * the catalog or the network, so the simulation's fingerprint closure stays free of them. Placement, validation and
 * the catalog live in src/gameplay/deployables.js, which re-exports these names.
 *
 * With no deployables every function returns without touching a number, so shot results stay bit-identical to
 * the parity fixtures.
 */

import { TUNING } from '../shared/tuning.js';

/** The `deployables.*` tuning block (src/shared/tuning.js, docs/TUNING.md). Helpers take it as an argument so tests can pass their own. */
export const DEPLOYABLE_PARAMS = TUNING.deployables;

/** Domain event a bumper contact adds to the step events; the app turns it into a DEPLOY_HIT report. */
export const DEPLOYABLE_HIT = 'deployable-hit';

/**
 * Vertical volume (contract section 7). `b` is the ball's height: its simulated contact height, the underside of the
 * ball. An object stands on its floor height `d.z`. A record without `z` applies at any height (it is level with the
 * ball), which is also what a rolling ball on the object's own level sees, so rolling results do not change.
 */
const GROUND = TUNING.rest.groundTolerance;
/** True when a ball of radius `radius` at height `b` overlaps the solid body vertically: under its top and above its base. */
const inBody = (d, b, radius, params) => !Number.isFinite(d.z) || !Number.isFinite(b) || (b < d.z + params.bodyHeight && b + 2 * radius > d.z - GROUND);
/** True when a ball at height `b` is inside the orbital pull volume: from just under the floor up to `orbitalReach`. */
const inBand = (d, b, params) => !Number.isFinite(d.z) || (b >= d.z - GROUND && b <= d.z + params.orbitalReach);

/**
 * Orbital hook: the acceleration (x/y, world units per second squared, already scaled by dt) that every orbital ring
 * exerts on a ball at (x, y). It pulls toward the centre and falls off linearly to zero at the ring edge.
 * A ball faster than `orbitalSpeedRef` is pulled harder, by (speed / ref) squared, so a fast shot still bends by about
 * the angle a ref-speed shot does instead of sailing straight through. Returns [0, 0] with no orbitals.
 */
export function orbitalAcceleration(list, x, y, dt, params = DEPLOYABLE_PARAMS, speed = 0, z = Number.NaN) {
  let ax = 0, ay = 0;
  if (!list?.length) return [ax, ay];
  const boost = Math.max(1, (speed / params.orbitalSpeedRef) ** 2);
  for (const d of list) {
    if (d.kind !== 'orbital' || (Number.isFinite(z) && !inBand(d, z, params))) continue;
    const dx = d.x - x, dy = d.y - y, dist = Math.hypot(dx, dy);
    if (!(dist > 1e-6 && dist < params.orbitalRange)) continue;
    const strength = params.orbitalPull * boost * (1 - dist / params.orbitalRange) * dt;
    ax += dx / dist * strength; ay += dy / dist * strength;
  }
  return [ax, ay];
}

/**
 * True while an orbital ring is pulling a ball that is not yet touching the orbital's body. Such a ball must not come
 * to rest (physics rest check) and a resting one must start moving (environment wake), so the pull applies at all
 * times. A ball touching the body is held there and may rest. False with no orbitals.
 */
export function orbitalHolds(list, x, y, radius, params = DEPLOYABLE_PARAMS, z = Number.NaN) {
  if (!list?.length) return false;
  return list.some(d => {
    if (d.kind !== 'orbital' || (Number.isFinite(z) && !inBand(d, z, params))) return false;
    const dist = Math.hypot(d.x - x, d.y - y);
    return dist < params.orbitalRange && dist > params.bumperRadius + radius + 0.5;
  });
}

/**
 * Bumper hook: bounces a ball (player-like, with x, y, vx, vy) off the first solid it overlaps and moving into.
 * Pushes the ball out to the surface, reflects the normal velocity with the restitution gain and returns the
 * contact events. Mutates `ball`. A ball moving away from the centre is only pushed out, with no event and no impact.
 * The contact normal is horizontal and only vx and vy change, so a ball moving up or down keeps its vertical velocity.
 * @returns {{type:string, id:string}[]}
 */
export function bumperContact(list, ball, radius, params = DEPLOYABLE_PARAMS) {
  const events = [];
  if (!list?.length) return events;
  for (const d of list) {
    if (!inBody(d, ball.z, radius, params)) continue; // above the top (or below the base): the ball passes over untouched
    const dx = ball.x - d.x, dy = ball.y - d.y, dist = Math.hypot(dx, dy), reach = params.bumperRadius + radius;
    if (!(dist < reach)) continue;
    const nx = dist > 1e-9 ? dx / dist : 1, ny = dist > 1e-9 ? dy / dist : 0;
    ball.x = d.x + nx * reach; ball.y = d.y + ny * reach;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn >= 0) continue;
    const restitution = d.kind === 'orbital' ? params.orbitalRestitution : params.bumperRestitution;
    const counts = -vn >= params.minHitSpeed; // a ball settling against the body is not an impact
    // Both bodies always pop the ball out at `bumperKick` or faster, so a slow second touch does not just rebound like a wall.
    const out = counts ? Math.max(restitution * -vn, params.bumperKick) : restitution * -vn;
    ball.vx += (out - vn) * nx;
    ball.vy += (out - vn) * ny;
    if (counts) events.push({ type: DEPLOYABLE_HIT, id: d.id });
  }
  return events;
}

