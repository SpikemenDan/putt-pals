/**
 * Simulation contracts and domain event definitions.
 * Provides the pure contract for running fixed-step ball physics,
 * applying shots, and emitting domain events without DOM or Three.js dependencies.
 */

import {
  BALL_RADIUS,
  DEFAULT_CUP_RADIUS,
  SHOT_POWER,
  TURF_FRICTION,
  FIXED_TIMESTEP,
} from './constants.js';
import { TUNING } from './tuning.js';

export const SimulationEventTypes = Object.freeze({
  SHOT: 'shot',
  BOUNCE: 'bounce',
  SURFACE_CHANGE: 'surface_change',
  CUP_LIP: 'cup_lip',
  SINK: 'sink',
  HAZARD: 'hazard',
  OUT_OF_BOUNDS: 'out_of_bounds',
  REST: 'rest',
  TIMEOUT: 'timeout',
});

/**
 * Creates a fresh player simulation record.
 * Matches legacy fresh() contract without global closures.
 *
 * @param {string} name Player display name
 * @param {number} colorIndex Player color index
 * @param {object} [options]
 * @returns {object} Player state
 */
export function createPlayerState(name, colorIndex = 0, options = {}) {
  return {
    name,
    colorIndex,
    holeIndex: options.holeIndex ?? 0,
    scores: options.scores ? [...options.scores] : [],
    x: options.x ?? 0,
    y: options.y ?? 0,
    z: options.z ?? 0,
    vx: 0,
    vy: 0,
    vz: 0,
    moving: false,
    strokes: options.strokes ?? 0,
    prevPosition: options.prevPosition ? [...options.prevPosition] : null,
    inventory: [],
    collectedPickups: {},
    armedPowerups: { mag: 0, steady: 0 },
    pendingPowerups: {},
    puttStartMs: 0,
    mode: 'play', // 'play' | 'sunk' | 'timeout' | 'spectator'
    waitFrames: 0,
    fx: null,
    padCooldown: 0,
    teleporterCooldown: 0,
    movingHazardTime: 0,
    syncUntil: 0,
  };
}

/**
 * Applies a shot to a player state with exact launch physics parity.
 * Sets velocity from angle (radians) and power scalar (0..1).
 *
 * @param {object} player Player simulation state
 * @param {number} angle Launch angle in radians
 * @param {number} power Normalized power scalar (0..1)
 * @param {number} [powerMultiplier=SHOT_POWER]
 * @returns {object} Emitted 'shot' domain event
 */
export function applyShot(player, angle, power, powerMultiplier = SHOT_POWER) {
  const safePower = Math.max(0, Math.min(1, Number(power) || 0));
  const speed = safePower * powerMultiplier;

  player.vx = Math.cos(angle) * speed;
  player.vy = Math.sin(angle) * speed;
  player.vz = 0;
  player.moving = true;
  player.strokes = (player.strokes || 0) + 1;
  player.movingHazardTime = 0;
  player.prevPosition = [player.x, player.y, player.z];
  if (player.armedPowerups?.chip) { // Chip In: lofted launch; the lift keeps the first tick airborne
    player.vz = TUNING.powerups.chipLaunch;
    player.z += 1;
  }

  return {
    type: SimulationEventTypes.SHOT,
    playerName: player.name,
    angle,
    power: safePower,
    strokes: player.strokes,
    position: [player.x, player.y, player.z],
  };
}

/**
 * Contract specification for a headless simulation engine.
 * Any simulation engine (M1 custom engine, Rapier prototype) must implement this contract.
 *
 * @typedef {object} SimulationEngineContract
 * @property {(course: object, puttIndex: number, players: object[], config?: object) => object} init
 * @property {(playerId: string, angle: number, power: number) => object} launch
 * @property {(dt?: number) => { state: object, events: object[] }} step
 * @property {() => object} getSnapshot
 * @property {() => void} dispose
 */
