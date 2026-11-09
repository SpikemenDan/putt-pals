/**
 * Proof chambers for Task W3 (Wind zones in levels, issue #106).
 *
 * Demonstrates:
 * - Putt 0: Steady crosswind. Pushes ball northward (+y). Airborne shots drift more than ground shots.
 *   Compensated route sinks; counterfactual without wind fails.
 * - Putt 1: Vertical updraft zone. Strong vertical force (fz > gravity) lifts the ball onto an
 *   elevated green at z=20. Counterfactual without updraft falls into the void gap.
 * - Putt 2: Deterministic gusting wind. Driven by synchronized room hazard time (periodic sine modulation).
 *   Proves deterministic deflection at different room times.
 * - Multi-stroke routes verified within par (par 2..6) by SV1 par solver.
 */

export function createWindChamberCourse() {
  return {
    name: 'Wind Chambers (W3)',
    desc: 'Test chambers demonstrating 3D wind zones, crosswinds, updrafts, and deterministic room-time gusts.',
    tee: [60, 150],
    hole: [340, 150],
    par: 4,
    limit: 120,
    tiles: [[0, 0, 400, 300]],
    w: [
      [0, 0, 400, 8],
      [0, 292, 400, 8],
      [0, 0, 8, 300],
      [392, 0, 8, 300],
    ],
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
    wind: [
      {
        id: 'crosswind-0',
        bounds: [120, 30, 160, 240],
        force: [0, 120],
        minZ: -20,
        maxZ: 100,
      },
    ],
    putts: [
      // Putt 0: Steady crosswind (+y northward drift)
      {
        id: 'wind-chamber-putt-1',
        index: 0,
        tee: [60, 150],
        hole: [340, 150],
        par: 2,
        pen: 3,
        limitSeconds: 120,
        cupRadius: 15,
        tiles: [[0, 0, 400, 300]],
        w: [
          [0, 0, 400, 8],
          [0, 292, 400, 8],
          [0, 0, 8, 300],
          [392, 0, 8, 300],
        ],
        wind: [
          {
            id: 'crosswind-0',
            bounds: [120, 30, 160, 240],
            force: [0, 120],
            minZ: -20,
            maxZ: 100,
          },
        ],
      },
      // Putt 1: Vertical updraft across void gap onto elevated green
      {
        id: 'wind-chamber-putt-2',
        index: 1,
        tee: [60, 150],
        hole: [340, 150],
        par: 2,
        pen: 3,
        limitSeconds: 120,
        cupRadius: 15,
        tiles: [
          [20, 100, 100, 100],  // Lower tee island (z=0)
          [280, 100, 100, 100], // Elevated cup island (z=20)
        ],
        w: [
          [20, 92, 100, 8],
          [20, 200, 100, 8],
          [12, 92, 8, 116],
          [280, 92, 100, 8],
          [280, 200, 100, 8],
          [380, 92, 8, 116],
        ],
        pl: [
          [280, 100, 100, 100, 20], // Elevated green at z=20
        ],
        wind: [
          {
            id: 'updraft-1',
            bounds: [110, 80, 150, 140],
            force: [0, 0, 1000], // Updraft lifts ball vertically (fz=1000 > gravity=700)
            minZ: -20,
            maxZ: 35,
          },
        ],
      },
      // Putt 2: Deterministic gusting wind
      {
        id: 'wind-chamber-putt-3',
        index: 2,
        tee: [60, 150],
        hole: [340, 150],
        par: 2,
        pen: 3,
        limitSeconds: 120,
        cupRadius: 15,
        tiles: [[0, 0, 400, 300]],
        w: [
          [0, 0, 400, 8],
          [0, 292, 400, 8],
          [0, 0, 8, 300],
          [392, 0, 8, 300],
        ],
        wind: [
          {
            id: 'gust-2',
            bounds: [120, 30, 160, 240],
            force: [0, 150],
            gust: {
              period: 4.0,
              amplitude: 1.0,
              phase: 0,
            },
            minZ: -20,
            maxZ: 100,
          },
        ],
      },
    ],
  };
}

export const windChamberCourse = createWindChamberCourse();
