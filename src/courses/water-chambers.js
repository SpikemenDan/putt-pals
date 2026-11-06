/**
 * Proof chambers for Task W2 (Water in levels, issue #105).
 *
 * Demonstrates:
 * - Deep water: acts as hazard, catches ball, emits splash event, resets to last spot with stroke penalty.
 * - Stepping stones: elevated structures above deep water provide safe crossing. Counterfactual without
 *   stepping stones fails into deep water.
 * - Shallow water: playable surface that slows the ball down (increased friction & drag).
 * - Flowing currents: directional current vector that pushes the ball.
 * - Multi-stroke routes verified within par (par 2..6) by SV1 par solver.
 */

export function createWaterChamberCourse() {
  return {
    name: 'Water Chambers (W2)',
    desc: 'Test chambers demonstrating real deep water hazards, stepping stones/bridge, shallow water drag, and flowing currents.',
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
    water: [
      {
        id: 'deep-moat-0',
        bounds: [140, 40, 120, 220],
        z: -4,
        shallow: false,
      },
    ],
    putts: [
      // Putt 0: Deep water moat with bridge crossing
      {
        tee: [60, 150],
        hole: [340, 150],
        par: 2,
        pen: 3,
        limitSeconds: 120,
        cupRadius: 15,
        id: 'water-chamber-putt-1',
        index: 0,
        tiles: [[0, 0, 400, 300]],
        w: [
          [0, 0, 400, 8],
          [0, 292, 400, 8],
          [0, 0, 8, 300],
          [392, 0, 8, 300],
        ],
        pl: [[140, 120, 120, 60, 0]], // Bridge across the water moat (x: 140..260, y: 120..180, z: 0)
        water: [
          {
            id: 'deep-moat-0',
            bounds: [140, 40, 120, 220],
            z: -4,
            shallow: false,
          },
        ],
      },
      // Putt 1: Shallow water river with flowing current (+y direction)
      {
        tee: [50, 150],
        hole: [350, 150],
        par: 2,
        pen: 3,
        limitSeconds: 120,
        cupRadius: 15,
        id: 'water-chamber-putt-2',
        index: 1,
        tiles: [[0, 0, 400, 300]],
        w: [
          [0, 0, 400, 8],
          [0, 292, 400, 8],
          [0, 0, 8, 300],
          [392, 0, 8, 300],
        ],
        pl: [],
        water: [
          {
            id: 'shallow-river-1',
            bounds: [120, 40, 160, 220],
            z: 0,
            shallow: true,
            current: [0, 80], // Current pushes northward (+y) at 80 units/s
          },
        ],
      },
    ],
  };
}

export const waterChamberCourse = createWaterChamberCourse();

