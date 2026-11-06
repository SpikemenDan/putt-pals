/**
 * Volumetric 3D course proof chambers (task K0).
 *
 * Demonstrates an overpass structure allowing independent travel above and
 * below the same footprint, gravity drops between levels, and ceiling rebound.
 */

export function createOverpassChamberCourse() {
  return {
    id: 'overpass-chamber',
    name: 'Overpass Chamber',
    desc: 'Volumetric 3D proof chamber with an overpass, vertical walls, and ceiling',
    tiles: [[0, 0, 400, 300]],
    w: [
      [0, 0, 400, 10],
      [0, 290, 400, 10],
      [0, 10, 10, 280],
      [390, 10, 10, 280],
    ],
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
    structures: [
      {
        id: 'overpass-deck',
        kind: 'surface',
        rect: [150, 40, 100, 220],
        z: 40,
        thickness: 4,
        surface: 'turf',
        ceiling: true,
      },
      {
        id: 'overpass-wall-w',
        kind: 'wall',
        rect: [150, 40, 10, 220],
        base: 40,
        height: 20,
      },
      {
        id: 'overpass-wall-e',
        kind: 'wall',
        rect: [240, 40, 10, 220],
        base: 40,
        height: 20,
      },
      {
        id: 'test-ceiling',
        kind: 'ceiling',
        rect: [30, 120, 60, 60],
        z: 30,
        thickness: 4,
        restitution: 0.6,
      },
    ],
    putts: [
      // Putt 0: Straight shot under the overpass from west to east
      {
        id: 'overpass-chamber-putt-1',
        index: 0,
        tee: [50, 150],
        hole: [350, 150],
        par: 2,
        penalty: 1,
        limitSeconds: 60,
        cupRadius: 18,
      },
      // Putt 1: Tee on overpass at z=40, rolls off southern edge and lands on ground hole
      {
        id: 'overpass-chamber-putt-2',
        index: 1,
        tee: [195, 80],
        hole: [195, 275],
        par: 2,
        penalty: 1,
        limitSeconds: 60,
        cupRadius: 18,
      },
    ],
    tee: [50, 150],
    hole: [350, 150],
    cup: 18,
  };
}
