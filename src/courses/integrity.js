import { checkMechanicIntegrity } from './mechanics-integrity.js';
import { ISLAND_EDGES, normalizeEdge } from './islands.js';
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
import { rampHeight, surfaceHeight, WALL_HEIGHT } from '../simulation/physics.js';
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

function checkIslandIntegrity({ islands = [], walls = [], tiles = [], structures = [] }, puttIndex, add) {
  for (let a = 0; a < islands.length; a++) {
    for (let b = a + 1; b < islands.length; b++) {
      const A = islands[a], B = islands[b];
      if (overlaps(A.rect, B.rect)) {
        add(puttIndex, 'islands-interpenetrate', [A.id, B.id], `Islands ${A.id} and ${B.id} interpenetrate`);
      }
    }
  }

  const allWallRects = [
    ...walls.map((w, i) => ({ id: label('w', i), rect: w })),
    ...structures.filter(s => s.kind === 'wall').map(s => ({ id: s.id, rect: s.rect }))
  ];

  const allSurfaces = [
    ...tiles,
    ...islands.map(isl => isl.rect)
  ];

  for (const island of islands) {
    const [ix, iy, iw, ih] = island.rect;
    const openSet = new Set((island.openEdges ?? []).map(normalizeEdge).filter(Boolean));
    const explicitGuardSet = Array.isArray(island.guardWalls)
      ? new Set(island.guardWalls.map(normalizeEdge).filter(Boolean))
      : null;
    const defaultGuarded = island.guardWalls === true;

    for (const edge of ISLAND_EDGES) {
      let blockingWall = null;
      for (const w of allWallRects) {
        const [wx, wy, ww, wh] = w.rect;
        if (edge === 'north') {
          const xOverlap = Math.min(ix + iw, wx + ww) - Math.max(ix, wx);
          if (xOverlap > OVERLAP_TOLERANCE && Math.abs((wy + wh / 2) - iy) <= 15) {
            blockingWall = w;
            break;
          }
        } else if (edge === 'south') {
          const xOverlap = Math.min(ix + iw, wx + ww) - Math.max(ix, wx);
          if (xOverlap > OVERLAP_TOLERANCE && Math.abs((wy + wh / 2) - (iy + ih)) <= 15) {
            blockingWall = w;
            break;
          }
        } else if (edge === 'west') {
          const yOverlap = Math.min(iy + ih, wy + wh) - Math.max(iy, wy);
          if (yOverlap > OVERLAP_TOLERANCE && Math.abs((wx + ww / 2) - ix) <= 15) {
            blockingWall = w;
            break;
          }
        } else if (edge === 'east') {
          const yOverlap = Math.min(iy + ih, wy + wh) - Math.max(iy, wy);
          if (yOverlap > OVERLAP_TOLERANCE && Math.abs((wx + ww / 2) - (ix + iw)) <= 15) {
            blockingWall = w;
            break;
          }
        }
      }

      if (openSet.has(edge)) {
        if (blockingWall) {
          add(puttIndex, 'blocked-open-edge', [island.id, blockingWall.id], `Open drop-off edge "${edge}" of island ${island.id} is blocked by ${blockingWall.id}`);
        }
        if (explicitGuardSet && explicitGuardSet.has(edge)) {
          add(puttIndex, 'blocked-open-edge', [island.id], `Open drop-off edge "${edge}" of island ${island.id} is explicitly declared in guardWalls`);
        }
      } else {
        const hasGuardWall = (explicitGuardSet ? explicitGuardSet.has(edge) : defaultGuarded) || blockingWall !== null;
        if (!hasGuardWall) {
          let connected = false;
          for (const s of allSurfaces) {
            if (s === island.rect) continue;
            const [sx, sy, sw, sh] = s;
            if (edge === 'north') {
              const xOverlap = Math.min(ix + iw, sx + sw) - Math.max(ix, sx);
              if (xOverlap > OVERLAP_TOLERANCE && Math.abs((sy + sh) - iy) <= 1) { connected = true; break; }
            } else if (edge === 'south') {
              const xOverlap = Math.min(ix + iw, sx + sw) - Math.max(ix, sx);
              if (xOverlap > OVERLAP_TOLERANCE && Math.abs(sy - (iy + ih)) <= 1) { connected = true; break; }
            } else if (edge === 'west') {
              const yOverlap = Math.min(iy + ih, sy + sh) - Math.max(iy, sy);
              if (yOverlap > OVERLAP_TOLERANCE && Math.abs((sx + sw) - ix) <= 1) { connected = true; break; }
            } else if (edge === 'east') {
              const yOverlap = Math.min(iy + ih, sy + sh) - Math.max(iy, sy);
              if (yOverlap > OVERLAP_TOLERANCE && Math.abs(sx - (ix + iw)) <= 1) { connected = true; break; }
            }
          }
          if (!connected) {
            add(puttIndex, 'undeclared-open-edge', [island.id], `Edge "${edge}" of island ${island.id} is exposed to void without a guard wall or adjacent tile and is not declared in openEdges`);
          }
        }
      }
    }
  }
}

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
  for (const finding of checkMechanicIntegrity(g,putts,(x,y)=>surfaceHeight(g,x,y))) add(null,'mechanic-clearance',finding.elements,finding.message);
  const walls = listOf(g.w), ramps = listOf(g.rp), plats = listOf(g.pl), pits = listOf(g.pit), tiles = listOf(g.tiles), movers = listOf(g.movers);
  const wallHit = point => {
    let best = null;
    walls.forEach((w, i) => { const d = pointRectDistance(point, w); if (!best || d < best.d) best = { d, i }; });
    return best;
  };

  // Elevated solids: ramps and platforms, plus K0 volumetric structures.
  const structures = listOf(g.structures);
  const elevated = [
    ...ramps.map((r, i) => ({ id: label('rp', i), rect: r, ramp: true, z: Math.max(r[5], r[6]), base: -10, top: Math.max(r[5], r[6]) })),
    ...plats.map((p, i) => ({ id: label('pl', i), rect: p, ramp: false, z: p[4], base: -10, top: p[4] })),
    ...structures.filter(s => s.kind === 'surface').map(s => ({
      id: s.id, rect: s.rect, ramp: false, z: s.z,
      base: s.z - (s.thickness ?? 4), top: s.z, volumetric: true
    })),
    ...structures.filter(s => s.kind === 'ramp').map(s => ({
      id: s.id, rect: s.rect, ramp: true, z: Math.max(s.zStart, s.zEnd),
      base: Math.min(s.zStart, s.zEnd) - (s.thickness ?? 4), top: Math.max(s.zStart, s.zEnd), volumetric: true
    }))
  ];
  const allWalls = [
    ...walls.map((w, i) => ({ id: label('w', i), rect: w, base: 0, height: WALL_HEIGHT })),
    ...structures.filter(s => s.kind === 'wall').map(s => ({ id: s.id, rect: s.rect, base: s.base, height: s.height }))
  ];

  for (const e of elevated) {
    allWalls.forEach(w => {
      if (overlaps(e.rect, w.rect)) {
        const wTop = w.base + w.height;
        if (!(wTop <= e.base + OVERLAP_TOLERANCE || w.base >= e.top - OVERLAP_TOLERANCE)) {
          add(null, 'wall-through-solid', [w.id, e.id], `${w.id} passes through ${e.id}`);
        }
      }
    });
    pits.forEach((p, i) => {
      if (overlaps(e.rect, p)) {
        if (!e.volumetric || e.base < 10) {
          add(null, 'solid-over-pit', [e.id, label('pit', i)], `${e.id} overlaps ${label('pit', i)}`);
        }
      }
    });
    if (!e.volumetric && !rectCovered(e.rect, tiles)) {
      add(null, 'solid-off-floor', [e.id], `${e.id} extends beyond the playable floor tiles`);
    }
  }

  // Check vertical clearance of elevated volumetric structures over ground floor tiles
  for (const s of elevated.filter(e => e.volumetric)) {
    tiles.forEach((t, i) => {
      if (overlaps(s.rect, t)) {
        if (s.base >= 0 && s.base < 2 * BALL_RADIUS) {
          add(null, 'insufficient-vertical-clearance', [s.id, label('tiles', i)], `${s.id} over ${label('tiles', i)} has insufficient vertical clearance (${s.base.toFixed(1)} < ${2 * BALL_RADIUS})`);
        }
      }
    });
  }

  for (let a = 0; a < elevated.length; a++) {
    for (let b = a + 1; b < elevated.length; b++) {
      const A = elevated[a], B = elevated[b];
      if (!overlaps(A.rect, B.rect)) continue;
      if (!A.ramp && !B.ramp && A.z === B.z && A.base === B.base) continue; // coplanar platforms merge

      const aAboveB = A.base >= B.top - OVERLAP_TOLERANCE;
      const bAboveA = B.base >= A.top - OVERLAP_TOLERANCE;
      if (aAboveB || bAboveA) {
        const clearance = aAboveB ? A.base - B.top : B.base - A.top;
        if (clearance < 2 * BALL_RADIUS) {
          add(null, 'insufficient-vertical-clearance', [A.id, B.id], `${aAboveB ? A.id : B.id} over ${aAboveB ? B.id : A.id} has insufficient vertical clearance (${clearance.toFixed(1)} < ${2 * BALL_RADIUS})`);
        }
        continue;
      }
      add(null, 'solids-interpenetrate', [A.id, B.id], `${A.id} and ${B.id} interpenetrate`);
    }
  }

  // Island geometry integrity (K1a)
  if (Array.isArray(g.islands) && g.islands.length > 0) {
    checkIslandIntegrity({ islands: g.islands, walls, tiles, structures }, null, add);
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
    if (Array.isArray(putt?.islands) && putt.islands.length > 0) {
      checkIslandIntegrity({
        islands: putt.islands,
        walls: putt.w ?? walls,
        tiles: putt.tiles ?? tiles,
        structures: putt.structures ?? structures
      }, pi, add);
    }
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
