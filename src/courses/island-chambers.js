/**
 * Floating island proof chambers (task K1a, #97).
 *
 * Demonstrates floating islands with designed gaps, guard walls along perimeters,
 * declared open edges for drop-offs and gap jumps, and multi-island dogleg routes.
 */

import { islandsToTiles, islandsToGuardWalls } from './islands.js';

export function createIslandChamberCourse() {
  const putt0Islands = [
    { id: 'tee-island-0', rect: [40, 100, 200, 200], openEdges: ['east'] },
    { id: 'cup-island-0', rect: [300, 100, 200, 200], openEdges: ['west'] }
  ];
  const putt0Ramps = [
    [160, 140, 60, 120, '+x', 0, 30, 'launch']
  ];

  const putt1Islands = [
    { id: 'start-island-1', rect: [40, 80, 180, 180], openEdges: ['east'] },
    { id: 'mid-island-1', rect: [280, 80, 180, 180], openEdges: ['west', 'south'] },
    { id: 'cup-island-1', rect: [280, 320, 180, 180], openEdges: ['north'] }
  ];
  const putt1Ramps = [
    [150, 120, 60, 100, '+x', 0, 30, 'launch'],
    [320, 190, 100, 60, '+y', 0, 30, 'launch']
  ];

  return {
    id: 'island-chambers',
    name: 'Island Chambers',
    desc: 'Floating islands proof chamber with designed gaps, guard walls, and declared open edges',
    islands: putt0Islands,
    tiles: islandsToTiles(putt0Islands),
    w: islandsToGuardWalls(putt0Islands),
    rp: putt0Ramps,
    sand: [],
    ice: [],
    slime: [],
    pit: [],
    q: [],
    pl: [],
    pd: [],
    tp: [],
    fan: [],
    tornado: [],
    movers: [],
    tee: [90, 200],
    hole: [420, 200],
    par: 2,
    penalty: 3,
    cup: 15,
    cupRadius: 15,
    limit: 120,
    putts: [
      // Putt 0: Direct gap jump across two floating islands over declared open edges
      {
        id: 'island-chambers-putt-1',
        index: 0,
        tee: [90, 200],
        hole: [420, 200],
        par: 2,
        penalty: 3,
        limitSeconds: 120,
        cupRadius: 15,
        islands: putt0Islands,
        tiles: islandsToTiles(putt0Islands),
        w: islandsToGuardWalls(putt0Islands),
        rp: putt0Ramps
      },
      // Putt 1: Multi-island dogleg route via intermediate island
      {
        id: 'island-chambers-putt-2',
        index: 1,
        tee: [90, 170],
        hole: [370, 410],
        par: 3,
        penalty: 3,
        limitSeconds: 150,
        cupRadius: 15,
        islands: putt1Islands,
        tiles: islandsToTiles(putt1Islands),
        w: islandsToGuardWalls(putt1Islands),
        rp: putt1Ramps
      }
    ]
  };
}
