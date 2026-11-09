/**
 * Transport tube proof chambers (task K1c, #99).
 *
 * Demonstrates:
 * - Putt 0: Floating islands connected by an enclosed arching transport tube.
 *   Ball enters the tube on Island A, is propelled through 3D space, flung out
 *   over a wide void gap, lands on Island B, and sinks in the cup.
 * - Putt 1: High-speed S-curve transport tube navigating 3D elevation descent
 *   (z=30 -> 15) and flinging the ball onto the lower green approach.
 */

export function createTubeChamberCourse() {
  // Putt 0: Arching transport tube across void gap between floating islands
  const putt0Tube = {
    id: 'tube-arch-1',
    entry: [140, 200, 0],
    exit: [280, 200, 30],
    exitVelocity: [320, 0, 100],
    path: [
      [140, 200, 0],
      [180, 200, 40],
      [240, 200, 45],
      [280, 200, 30]
    ],
    radius: 14,
    speed: 360,
    color: 0x4a9cff
  };

  const putt0Tiles = [
    [40, 150, 120, 100],  // Island A (tee): x: 40..160, y: 150..250
    [360, 150, 140, 100]  // Island B (cup): x: 360..500, y: 150..250
  ];

  const putt0Walls = [
    [30, 140, 10, 120],   // West of Island A
    [30, 140, 130, 10],   // North of Island A
    [30, 250, 130, 10],   // South of Island A
    [500, 140, 10, 120],  // East of Island B
    [360, 140, 150, 10],  // North of Island B
    [360, 250, 150, 10]   // South of Island B
  ];

  // Putt 1: S-curve transport tube with elevation descent
  const putt1Tube = {
    id: 'tube-scurve-2',
    entry: [130, 110, 30],
    exit: [280, 240, 15],
    exitVelocity: [260, 40, 50],
    path: [
      [130, 110, 30],
      [180, 140, 28],
      [220, 200, 22],
      [280, 240, 15]
    ],
    radius: 14,
    speed: 360,
    color: 0xffa726
  };

  const putt1Tiles = [
    [40, 60, 100, 100],   // Upper Island A at z=30
    [300, 180, 200, 140]  // Lower Island B at z=0
  ];

  const putt1Structures = [
    { id: 'tee-deck-1', kind: 'surface', rect: [40, 60, 100, 100], z: 30 }
  ];

  const putt1Walls = [
    [30, 50, 10, 120],    // West of Island A
    [30, 50, 120, 10],    // North of Island A
    [30, 160, 120, 10],   // South of Island A
    [500, 170, 10, 160],  // East of Island B
    [300, 170, 210, 10],  // North of Island B
    [300, 320, 210, 10]   // South of Island B
  ];

  return {
    id: 'tube-chambers',
    name: 'Transport Tube Chambers',
    desc: 'Enclosed transport tube proof chamber with 3D path travel and exit fling velocity',
    tubes: [putt0Tube],
    tiles: putt0Tiles,
    w: putt0Walls,
    sand: [],
    ice: [],
    slime: [],
    pit: [],
    q: [],
    pl: [],
    rp: [],
    pd: [],
    tp: [],
    fan: [],
    tornado: [],
    movers: [],
    tee: [70, 200],
    hole: [450, 200],
    par: 2,
    penalty: 3,
    cup: 15,
    cupRadius: 15,
    limit: 120,
    putts: [
      // Putt 0: Direct tube fling across wide void gap between islands
      {
        id: 'tube-chambers-putt-1',
        index: 0,
        tee: [70, 200],
        hole: [450, 200],
        par: 2,
        penalty: 3,
        limitSeconds: 120,
        cupRadius: 15,
        tubes: [putt0Tube],
        tiles: putt0Tiles,
        w: putt0Walls
      },
      // Putt 1: S-curve transport tube descending z=30 -> 15 and flinging onto green
      {
        id: 'tube-chambers-putt-2',
        index: 1,
        tee: [80, 110],
        hole: [430, 260],
        par: 2,
        penalty: 3,
        limitSeconds: 120,
        cupRadius: 15,
        tubes: [putt1Tube],
        structures: putt1Structures,
        tiles: putt1Tiles,
        w: putt1Walls
      }
    ]
  };
}
