/**
 * Curved ramp and multi-tier drop proof chambers (task K1b, #98).
 *
 * Demonstrates:
 * - Putt 0: Curved ramp with elevation descent from z=30 to z=0 around a corner,
 *   with analytical smooth curve profile and banking.
 * - Putt 1: Multi-tier drops with descending elevations (z=40 -> 20 -> 0),
 *   declared drop edges and landing floors with landing restitution.
 */

export function createRampDropChambersCourse() {
  // Putt 0: Curved ramp navigating elevation descent around a corner
  const putt0CurvedRamp = {
    id: 'curved-ramp-corner',
    center: [80, 260],
    innerRadius: 20,
    outerRadius: 140,
    startAngleDeg: 270,
    endAngleDeg: 360,
    zStart: 30,
    zEnd: 0,
    curve: 'smooth',
    bankAngleDeg: 3
  };

  const putt0Tiles = [
    [30, 80, 100, 100],   // Upper tee deck at z=30
    [30, 240, 150, 210]   // Lower green at z=0
  ];

  const putt0Structures = [
    { id: 'tee-deck-0', kind: 'surface', rect: [30, 80, 100, 100], z: 30 }
  ];

  const putt0Walls = [
    [20, 70, 10, 120],    // West wall of tee
    [20, 70, 120, 10],    // North wall of tee
    [130, 70, 10, 110],   // East wall of tee
    [20, 240, 10, 210],   // West wall of lower green
    [180, 240, 10, 210],  // East wall of lower green
    [20, 440, 170, 10]    // South wall of lower green
  ];

  // Putt 1: Multi-tier drops (z=40 -> 20 -> 0)
  const putt1Tiles = [
    [40, 160, 120, 80],   // Tier 1: x: 40..160, y: 160..240, z=40
    [160, 160, 120, 80],  // Tier 2: x: 160..280, y: 160..240, z=20
    [280, 160, 160, 80]   // Tier 3: x: 280..440, y: 160..240, z=0
  ];

  const putt1Structures = [
    { id: 'tier-1', kind: 'surface', rect: [40, 160, 120, 80], z: 40 },
    { id: 'tier-2', kind: 'surface', rect: [160, 160, 120, 80], z: 20 },
    { id: 'tier-3', kind: 'surface', rect: [280, 160, 160, 80], z: 0 }
  ];

  const putt1Drops = [
    {
      id: 'drop-tier-1-to-2',
      dropEdge: [160, 160, 160, 240],
      landingFloor: [160, 160, 120, 80, 20],
      zFrom: 40,
      zTo: 20,
      restitution: 0.25
    },
    {
      id: 'drop-tier-2-to-3',
      dropEdge: [280, 160, 280, 240],
      landingFloor: [280, 160, 160, 80, 0],
      zFrom: 20,
      zTo: 0,
      restitution: 0.25
    }
  ];

  const putt1Walls = [
    [30, 150, 10, 100],   // West wall
    [30, 150, 420, 10],   // North boundary wall
    [30, 240, 420, 10],   // South boundary wall
    [440, 150, 10, 100]   // East boundary wall
  ];

  return {
    id: 'ramp-drop-chambers',
    name: 'Ramp & Drop Chambers',
    desc: 'Curved ramps and multi-tier drops proof chamber with analytical curves and landing floors',
    curvedRamps: [putt0CurvedRamp],
    drops: [],
    structures: putt0Structures,
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
    tee: [80, 100],
    hole: [80, 390],
    par: 2,
    penalty: 3,
    cup: 15,
    cupRadius: 15,
    limit: 120,
    putts: [
      // Putt 0: Curved ramp with smooth elevation descent around corner
      {
        id: 'ramp-drop-chambers-putt-1',
        index: 0,
        tee: [80, 100],
        hole: [80, 390],
        par: 2,
        penalty: 3,
        limitSeconds: 120,
        cupRadius: 15,
        curvedRamps: [putt0CurvedRamp],
        drops: [],
        structures: putt0Structures,
        tiles: putt0Tiles,
        w: putt0Walls
      },
      // Putt 1: Multi-tier drops descending z=40 -> 20 -> 0 to cup
      {
        id: 'ramp-drop-chambers-putt-2',
        index: 1,
        tee: [80, 200],
        hole: [380, 200],
        par: 2,
        penalty: 3,
        limitSeconds: 120,
        cupRadius: 15,
        curvedRamps: [],
        drops: putt1Drops,
        structures: putt1Structures,
        tiles: putt1Tiles,
        w: putt1Walls
      }
    ]
  };
}
