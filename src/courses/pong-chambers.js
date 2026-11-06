/**
 * Proof chambers for Task GM2a (Multi-cup course schema, 10-cup rack layout, and elimination physics, issue #185).
 *
 * Demonstrates:
 * - Putt 0: Single 10-cup triangular rack layout (4-3-2-1 formation).
 * - Putt 1: 1v1 field with 10-cup racks at both ends (Home vs Away teams).
 * - Putt 2: Elimination proof chamber. An inactive cup (already eliminated) is ignored (ball rolls
 *   across with no lip rebound or capture), while an active cup captures the ball and emits CUP_ELIMINATION.
 * - Multi-stroke routes verified within par (par 2..6) by SV1 par solver.
 */

import { create10CupRack } from './cups.js';

const emptyArrays = {
  sand: [],
  ice: [],
  slime: [],
  q: [],
  pl: [],
  rp: [],
  pd: [],
  pit: [],
  fan: [],
  tp: [],
  tornado: [],
  movers: [],
};

export function createPongChamberCourse() {
  const rack0 = create10CupRack({
    idPrefix: 'rack-0',
    apex: [320, 200],
    direction: [1, 0],
    spacing: 32,
    radius: 15,
    team: 'away',
  });

  const homeRack = create10CupRack({
    idPrefix: 'home',
    apex: [120, 200],
    direction: [-1, 0],
    spacing: 32,
    radius: 15,
    team: 'home',
  });

  const awayRack = create10CupRack({
    idPrefix: 'away',
    apex: [500, 200],
    direction: [1, 0],
    spacing: 32,
    radius: 15,
    team: 'away',
  });

  return {
    name: 'Pong Chambers (GM2a)',
    desc: 'Test chambers demonstrating multi-cup schema, 10-cup triangular rack layouts, per-cup capture, and elimination physics.',
    tee: [60, 200],
    hole: [320, 200],
    par: 2,
    limit: 120,
    tiles: [[0, 0, 500, 400]],
    w: [
      [0, 0, 500, 8],
      [0, 392, 500, 8],
      [0, 0, 8, 400],
      [492, 0, 8, 400],
    ],
    ...emptyArrays,
    cups: rack0,
    putts: [
      // Putt 0: Single 10-cup rack target
      {
        id: 'pong-chamber-putt-1',
        index: 0,
        tee: [60, 200],
        hole: [320, 200],
        par: 2,
        pen: 3,
        limitSeconds: 120,
        cupRadius: 15,
        tiles: [[0, 0, 500, 400]],
        w: [
          [0, 0, 500, 8],
          [0, 392, 500, 8],
          [0, 0, 8, 400],
          [492, 0, 8, 400],
        ],
        ...emptyArrays,
        cups: rack0,
      },
      // Putt 1: 1v1 field with 10-cup racks at both ends (Home vs Away)
      {
        id: 'pong-chamber-putt-2',
        index: 1,
        tee: [200, 200],
        hole: [500, 200],
        par: 2,
        pen: 3,
        limitSeconds: 120,
        cupRadius: 15,
        tiles: [[0, 0, 650, 400]],
        w: [
          [0, 0, 650, 8],
          [0, 392, 650, 8],
          [0, 0, 8, 400],
          [642, 0, 8, 400],
        ],
        ...emptyArrays,
        cups: [...homeRack, ...awayRack],
      },
      // Putt 2: Inactive cup pass-through and active cup elimination
      {
        id: 'pong-chamber-putt-3',
        index: 2,
        tee: [60, 200],
        hole: [320, 200],
        par: 2,
        pen: 3,
        limitSeconds: 120,
        cupRadius: 15,
        tiles: [[0, 0, 400, 400]],
        w: [
          [0, 0, 400, 8],
          [0, 392, 400, 8],
          [0, 0, 8, 400],
          [392, 0, 8, 400],
        ],
        ...emptyArrays,
        cups: [
          { id: 'eliminated-cup-1', x: 180, y: 200, z: 0, radius: 15, active: false, team: 'away', rackIndex: 0 },
          { id: 'active-cup-2', x: 320, y: 200, z: 0, radius: 15, active: true, team: 'away', rackIndex: 1 },
        ],
      },
    ],
  };
}
