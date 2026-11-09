/**
 * Floating islands and guard walls schema, validation and utilities (roadmap K1a, #97).
 *
 * Supports floating islands with designed gaps, guard walls on boundary edges,
 * and declared open edges for risk/reward drop-offs and gap jumps.
 */

import { WALL_HEIGHT } from '../simulation/physics.js';
import { SURFACE_TYPES } from './structures.js';

const object = v => v && typeof v === 'object' && !Array.isArray(v);
const finite = Number.isFinite;
const coordinate = n => finite(n) && Math.abs(n) <= 1000000;
const rect = v => Array.isArray(v) && v.length === 4 && Array.from(v).every(coordinate) && v[2] > 0 && v[3] > 0;

export const ISLAND_EDGES = Object.freeze(['north', 'south', 'east', 'west']);

const EDGE_ALIASES = Object.freeze({
  north: 'north', n: 'north', '-y': 'north',
  south: 'south', s: 'south', '+y': 'south',
  east: 'east', e: 'east', '+x': 'east',
  west: 'west', w: 'west', '-x': 'west'
});

/**
 * Normalizes an edge identifier to canonical 'north' | 'south' | 'east' | 'west'.
 * Returns null if unrecognized.
 */
export function normalizeEdge(edge) {
  if (typeof edge !== 'string') return null;
  return EDGE_ALIASES[edge.trim().toLowerCase()] ?? null;
}

/**
 * Validates a single course island record.
 *
 * @param {object} island
 * @returns {boolean}
 */
export function validCourseIsland(island) {
  if (!object(island) || typeof island.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(island.id)) {
    return false;
  }
  if (!rect(island.rect)) return false;

  if (island.elevation !== undefined && !finite(island.elevation)) return false;
  if (island.surface !== undefined && !SURFACE_TYPES.includes(island.surface)) return false;

  if (island.openEdges !== undefined) {
    if (!Array.isArray(island.openEdges)) return false;
    for (const edge of island.openEdges) {
      if (!normalizeEdge(edge)) return false;
    }
  }

  if (island.guardWalls !== undefined) {
    if (typeof island.guardWalls !== 'boolean') {
      if (!Array.isArray(island.guardWalls)) return false;
      for (const edge of island.guardWalls) {
        if (!normalizeEdge(edge)) return false;
      }
    }
  }

  return true;
}

/**
 * Validates an array of course island records.
 *
 * @param {Array<object>} list
 * @returns {string[]} Error messages, empty if valid
 */
export function validateCourseIslands(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 256) return ['islands must be an array of at most 256 records'];
  const errors = Array.from(list).flatMap((s, i) => validCourseIsland(s) ? [] : [`islands[${i}] is invalid`]);
  if (new Set(list.map(s => s?.id)).size !== list.length) errors.push('islands ids must be unique');
  return errors;
}

/**
 * Converts island records into 2D playable tile tuples [x, y, w, h].
 *
 * @param {Array<object>} islands
 * @returns {Array<[number, number, number, number]>}
 */
export function islandsToTiles(islands = []) {
  return islands.map(island => [island.rect[0], island.rect[1], island.rect[2], island.rect[3]]);
}

/**
 * Generates wall rectangles [x, y, w, h] for guarded edges of floating islands.
 * Walls are placed along perimeter edges that are guarded (and not declared open).
 *
 * @param {Array<object>} islands
 * @param {number} [thickness=10] Guard wall thickness
 * @returns {Array<[number, number, number, number]>}
 */
export function islandsToGuardWalls(islands = [], thickness = 10) {
  const walls = [];

  for (const island of islands) {
    if (island.guardWalls === false) continue;

    const openSet = new Set((island.openEdges ?? []).map(normalizeEdge).filter(Boolean));
    let guardedEdges;

    if (Array.isArray(island.guardWalls)) {
      guardedEdges = new Set(island.guardWalls.map(normalizeEdge).filter(Boolean));
    } else {
      // By default (or guardWalls: true), all non-open edges have guard walls
      guardedEdges = new Set(ISLAND_EDGES.filter(e => !openSet.has(e)));
    }

    const [ix, iy, iw, ih] = island.rect;
    const hasN = guardedEdges.has('north');
    const hasS = guardedEdges.has('south');
    const hasW = guardedEdges.has('west');
    const hasE = guardedEdges.has('east');

    if (hasN) {
      const x0 = hasW ? ix - thickness : ix;
      const x1 = hasE ? ix + iw + thickness : ix + iw;
      walls.push([x0, iy - thickness, x1 - x0, thickness]);
    }
    if (hasS) {
      const x0 = hasW ? ix - thickness : ix;
      const x1 = hasE ? ix + iw + thickness : ix + iw;
      walls.push([x0, iy + ih, x1 - x0, thickness]);
    }
    if (hasW) {
      walls.push([ix - thickness, iy, thickness, ih]);
    }
    if (hasE) {
      walls.push([ix + iw, iy, thickness, ih]);
    }
  }

  return walls;
}
