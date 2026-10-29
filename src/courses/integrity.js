/**
 * Static geometry integrity check (roadmap CL1).
 *
 * Rejects interpenetrating solids and insufficient clearances in course
 * geometry: walls through ramps/platforms, moving obstacles through walls or
 * off the floor, ramps/platforms through each other or over pits or void,
 * hazards and spawns/cups too close to walls, and ramp seams that leave a gap or
 * a step the ball would snag on. Pure data in, plain violation records out; no
 * DOM, rendering or legacy-source access. Every shipped map and every new course
 * element must pass (see ARCHITECTURE.md, "Course geometry integrity").
 */

import { BALL_RADIUS } from '../shared/constants.js';
import { rampHeight, surfaceHeight } from '../simulation/physics.js';
import { moverSweep, overlapExtent, pointInRect, pointRectDistance, rectCovered } from './geometry.js';
import { slugify } from './legacy.js';

/** Solids must overlap by more than this many units on BOTH axes to count as interpenetrating. */
export const OVERLAP_TOLERANCE = 0.5;
/** Minimum gap between the ball's start position and any wall face (two ball radii). */
export const SPAWN_WALL_CLEARANCE = 2 * BALL_RADIUS;
/** Minimum extra margin, beyond the cup radius, between a cup centre and any wall face. */
export const CUP_WALL_MARGIN = BALL_RADIUS;
/** Minimum gap between a pad, bumper or teleporter anchor and any wall face. */
export const HAZARD_WALL_CLEARANCE = BALL_RADIUS;
/** Largest height difference allowed across a ramp seam; the physics ledge-bounce threshold is 5. */
export const RAMP_SEAM_STEP_MAX = 2;
/** How far beyond a ramp edge the seam probe samples, in units. */
export const RAMP_SEAM_PROBE = 1;
/** Fractions along a ramp edge that are probed for gaps and steps. */
export const RAMP_SEAM_SAMPLES = [0.1, 0.3, 0.5, 0.7, 0.9];
/** Largest height spread allowed under a cup mouth or a start ball footprint. */
export const SPAWN_SURFACE_STEP_MAX = 1;

/**
 * Documented exceptions awaiting owner decision. A violation is waived only
 * when course id, rule and the exact element list all match. Add entries only
 * with an explicit reason; never to hide an unreviewed violation.
 */
export const GEOMETRY_INTEGRITY_EXCEPTIONS = [
  {
    course: 'hourglass', rule: 'mover-off-floor', elements: ['movers[0]'],
    reason: 'Sliding shutter: the gate swings out of the one-tile neck over open void (no walls, no ball access there). Appears to be design intent; pending owner confirmation.',
  },
  {
    course: 'elevator-alley', rule: 'mover-off-floor', elements: ['movers[0]'],
    reason: 'The sliding block overhangs the south floor edge by 10 units at full travel (sweep to y=350, floor ends y=340). Possibly unintended; waived pending owner decision on shortening its travel or extending the floor.',
  },
];

const listOf = value => (Array.isArray(value) ? value : []);
const label = (key, index) => `${key}[${index}]`;
const overlaps = (a, b) => { const [w, h] = overlapExtent(a, b); return w > OVERLAP_TOLERANCE && h > OVERLAP_TOLERANCE; };

/**
 * @param {{id?:string,name?:string,index?:number,geometry:object,putts?:Array<{tee:number[],hole:number[],cupRadius:number}>}} input
 *   `geometry` uses the legacy tuple keys. `putts` may be omitted for geometry-only checks.
 * @returns {{violations:object[], waived:object[]}} records carry map, mapId, mapIndex, putt (null = whole map), rule, elements, message.
 */
export function checkGeometryIntegrity({ id, name, index, geometry, putts = [] }, exceptions = GEOMETRY_INTEGRITY_EXCEPTIONS) {
  const map = name ?? id ?? `#${index}`;
  const courseId = id ?? slugify(name);
  const all = [];
  const add = (putt, rule, elements, message) => all.push({ map, mapId: courseId, mapIndex: index ?? null, putt, rule, elements, message });
  const g = geometry ?? {};
  const walls = listOf(g.w), ramps = listOf(g.rp), plats = listOf(g.pl), pits = listOf(g.pit), tiles = listOf(g.tiles), movers = listOf(g.movers);
  const wallHit = point => {
    let best = null;
    walls.forEach((w, i) => { const d = pointRectDistance(point, w); if (!best || d < best.d) best = { d, i }; });
    return best;
  };

  // Elevated solids: ramps and platforms.
  const elevated = [...ramps.map((r, i) => ({ id: label('rp', i), rect: r, ramp: true, z: Math.max(r[5], r[6]) })),
    ...plats.map((p, i) => ({ id: label('pl', i), rect: p, ramp: false, z: p[4] }))];
  for (const e of elevated) {
    walls.forEach((w, i) => { if (overlaps(e.rect, w)) add(null, 'wall-through-solid', [label('w', i), e.id], `${label('w', i)} passes through ${e.id}`); });
    pits.forEach((p, i) => { if (overlaps(e.rect, p)) add(null, 'solid-over-pit', [e.id, label('pit', i)], `${e.id} overlaps ${label('pit', i)}`); });
    if (!rectCovered(e.rect, tiles)) add(null, 'solid-off-floor', [e.id], `${e.id} extends beyond the playable floor tiles`);
  }
  for (let a = 0; a < elevated.length; a++) {
    for (let b = a + 1; b < elevated.length; b++) {
      const A = elevated[a], B = elevated[b];
      if (!overlaps(A.rect, B.rect)) continue;
      if (!A.ramp && !B.ramp && A.z === B.z) continue; // coplanar platforms merge
      add(null, 'solids-interpenetrate', [A.id, B.id], `${A.id} and ${B.id} interpenetrate`);
    }
  }

  // Moving obstacles: full travel must stay on the floor and clear of walls and pits.
  movers.forEach((m, i) => {
    const sweep = moverSweep(m), mid = label('movers', i);
    walls.forEach((w, wi) => { if (overlaps(sweep, w)) add(null, 'mover-through-wall', [mid, label('w', wi)], `${mid} travel passes through ${label('w', wi)}`); });
    pits.forEach((p, pi) => { if (overlaps(sweep, p)) add(null, 'mover-over-pit', [mid, label('pit', pi)], `${mid} travel passes over ${label('pit', pi)}`); });
    if (!rectCovered(sweep, tiles)) add(null, 'mover-off-floor', [mid], `${mid} travel extends beyond the playable floor tiles`);
  });

  // Hazard anchors: on the floor, out of pits, clear of walls.
  const anchors = [];
  listOf(g.q).forEach((p, i) => anchors.push([label('q', i), [p[0], p[1]]]));
  listOf(g.pd).forEach((p, i) => anchors.push([label('pd', i), [p[0], p[1]]]));
  listOf(g.tp).forEach((t, i) => { anchors.push([`${label('tp', i)}.a`, [t[0], t[1]]]); anchors.push([`${label('tp', i)}.b`, [t[2], t[3]]]); });
  for (const [aid, p] of anchors) {
    if (!tiles.some(t => pointInRect(p, t)) || pits.some(r => pointInRect(p, r))) add(null, 'hazard-off-floor', [aid], `${aid} is not on playable floor`);
    const hit = wallHit(p);
    if (hit && hit.d < HAZARD_WALL_CLEARANCE) add(null, 'hazard-near-wall', [aid, label('w', hit.i)], `${aid} is ${hit.d.toFixed(1)} from ${label('w', hit.i)} (needs ${HAZARD_WALL_CLEARANCE})`);
  }

  // Ramp seams: probe just beyond each ramp end for gaps and snagging steps.
  ramps.forEach((r, i) => {
    const alongX = r[4][1] === 'x';
    const dirSign = r[4][0] === '-' ? -1 : 1;
    const ends = [{ name: 'start', outward: -dirSign, edge: dirSign === 1 ? 0 : 1 }, { name: 'end', outward: dirSign, edge: dirSign === 1 ? 1 : 0 }];
    for (const end of ends) {
      if (end.name === 'end' && r[7] === 'launch') continue; // launch ramps open onto a jump by design
      let bad = null;
      for (const f of RAMP_SEAM_SAMPLES) {
        const lateral = alongX ? r[1] + f * r[3] : r[0] + f * r[2];
        const along = alongX ? r[0] + end.edge * r[2] : r[1] + end.edge * r[3];
        const out = along + end.outward * RAMP_SEAM_PROBE;
        const p = alongX ? [out, lateral] : [lateral, out];
        if (walls.some(w => pointInRect(p, w))) continue; // blocked side
        const h = surfaceHeight(g, p[0], p[1]);
        if (h < -100) continue; // edge of the world, not a seam
        const on = rampHeight(r, ...(alongX ? [along, lateral] : [lateral, along]));
        const step = Math.abs(h - on);
        if (step > RAMP_SEAM_STEP_MAX && (!bad || step > bad.step)) bad = { step, at: p };
      }
      if (bad) add(null, 'ramp-seam', [label('rp', i)], `${label('rp', i)} ${end.name} seam has a ${bad.step.toFixed(1)} step/gap near (${bad.at.map(v => Math.round(v)).join(', ')}) (max ${RAMP_SEAM_STEP_MAX})`);
    }
  });

  // Per-putt spawn and cup placement.
  putts.forEach((putt, pi) => {
    const cupR = Number.isFinite(putt?.cupRadius) ? putt.cupRadius : 0;
    const checks = [['tee', putt?.tee, SPAWN_WALL_CLEARANCE, BALL_RADIUS], ['hole', putt?.hole, cupR + CUP_WALL_MARGIN, cupR]];
    for (const [field, p, clearance, ring] of checks) {
      if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) continue;
      const hit = wallHit(p);
      if (hit && hit.d < clearance) add(pi, `${field}-near-wall`, [field, label('w', hit.i)], `${field} is ${hit.d.toFixed(1)} from ${label('w', hit.i)} (needs ${clearance})`);
      const hs = [surfaceHeight(g, p[0], p[1])];
      for (let k = 0; k < 8; k++) hs.push(surfaceHeight(g, p[0] + ring * Math.cos(k * Math.PI / 4), p[1] + ring * Math.sin(k * Math.PI / 4)));
      const live = hs.filter(h => h > -100);
      const spread = Math.max(...live) - Math.min(...live);
      if (live.length === hs.length && spread > SPAWN_SURFACE_STEP_MAX && !ramps.some(r => pointInRect(p, r))) {
        const edges = elevated.filter(e => !e.ramp && pointRectDistance(p, e.rect) < ring + 0.01).map(e => e.id);
        add(pi, `${field}-on-ledge`, [field, ...edges], `${field} straddles a ledge (surface varies by ${spread.toFixed(1)})`);
      }
    }
  });

  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const violations = [], waived = [];
  for (const v of all) {
    const ex = exceptions.find(e => e.course === v.mapId && e.rule === v.rule && same(e.elements, v.elements));
    if (ex) waived.push({ ...v, reason: ex.reason }); else violations.push(v);
  }
  return { violations, waived };
}

/** Human-readable error line carrying map, putt and element ids. */
export function formatIntegrityViolation(v) {
  return `Geometry integrity [${v.rule}] map "${v.map}" (${v.mapId}) putt ${v.putt === null ? 'all' : v.putt}: ${v.message} {${v.elements.join(', ')}}`;
}
