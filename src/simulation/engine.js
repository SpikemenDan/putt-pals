/**
 * SimulationEngine class.
 * Headless, deterministic physics coordinator conforming to the agreed shared simulation contract.
 */

import {
  BALL_RADIUS,
  DEFAULT_CUP_RADIUS,
  MIN_CUP_RADIUS,
  SHOT_POWER,
  FIXED_TIMESTEP,
} from '../shared/constants.js';
import {
  createPlayerState,
  applyShot,
  SimulationEventTypes,
} from '../shared/simulation.js';
import {
  surfaceHeight,
  contactHeight,
  stepBall,
  cupOf,
} from './physics.js';

/**
 * Resolves a course definition for a specific putt index.
 * Mimics legacy H(i) prototype chain inheritance where putt properties override map defaults.
 *
 * @param {object} baseCourse Course definition
 * @param {number} [puttIndex=0]
 * @returns {object} Resolved putt-specific course object
 */
export function resolvePuttCourse(baseCourse, puttIndex = 0) {
  if (!baseCourse) throw new Error('Base course is required');
  const putt = baseCourse.putts && baseCourse.putts[puttIndex];
  if (!putt) return baseCourse;

  // Create child object inheriting all map geometry/arrays from baseCourse
  const resolved = Object.create(baseCourse);
  resolved.tee = putt.tee;
  resolved.hole = putt.hole;
  if (putt.par != null) resolved.par = putt.par;
  if (putt.pen != null) resolved.penalty = putt.pen;
  if (putt.penalty != null) resolved.penalty = putt.penalty;
  if (putt.cup != null) resolved.cup = putt.cup;
  if (putt.cupRadius != null) resolved.cup = putt.cupRadius;
  if (putt.limit != null) resolved.limit = putt.limit;
  if (putt.limitSeconds != null) resolved.limit = putt.limitSeconds;
  resolved.puttIndex = puttIndex;

  return resolved;
}

export class SimulationEngine {
  /**
   * @param {object} baseCourse Base course definition
   * @param {number} [puttIndex=0] Putt index
   * @param {object} [options={}]
   * @param {number|((simTime: number) => number)} [options.hazardTime] Custom hazard time function/constant
   */
  constructor(baseCourse, puttIndex = 0, options = {}) {
    this.baseCourse = baseCourse;
    this.puttIndex = puttIndex;
    this.course = resolvePuttCourse(baseCourse, puttIndex);
    this.players = new Map();
    this.simTime = 0;
    this.tickCount = 0;
    this.hazardTimeOption = options.hazardTime ?? 0;
    this.disposed = false;
  }

  /**
   * Sets the active putt index and updates the resolved course.
   *
   * @param {number} puttIndex
   */
  setPuttIndex(puttIndex) {
    this.puttIndex = puttIndex;
    this.course = resolvePuttCourse(this.baseCourse, puttIndex);
  }

  /**
   * Gets current hazard time in seconds.
   *
   * @returns {number}
   */
  getHazardTime() {
    if (typeof this.hazardTimeOption === 'function') {
      return this.hazardTimeOption(this.simTime);
    }
    if (typeof this.hazardTimeOption === 'number') {
      return this.hazardTimeOption;
    }
    return this.simTime;
  }

  /**
   * Registers a player in the simulation at the current tee.
   *
   * @param {string} id Unique player identifier
   * @param {string} name Player display name
   * @param {number} [colorIndex=0] Color index
   * @param {object} [options={}]
   * @returns {object} Player simulation state
   */
  addPlayer(id, name, colorIndex = 0, options = {}) {
    if (this.disposed) throw new Error('Cannot add player to disposed SimulationEngine');
    const tee = this.course.tee || [0, 0];
    const initialZ = surfaceHeight(this.course, tee[0], tee[1]);

    const player = createPlayerState(name, colorIndex, {
      x: options.x ?? tee[0],
      y: options.y ?? tee[1],
      z: options.z ?? initialZ,
      holeIndex: this.puttIndex,
      scores: options.scores,
      strokes: options.strokes ?? 0,
      prevPosition: options.prevPosition,
    });

    this.players.set(id, player);
    return player;
  }

  /**
   * Retrieves player state by ID.
   *
   * @param {string} id
   * @returns {object|undefined}
   */
  getPlayer(id) {
    return this.players.get(id);
  }

  /**
   * Applies a shot to the specified player.
   *
   * @param {string} playerId
   * @param {number} angle Launch angle in radians
   * @param {number} power Normalized power scalar (0..1)
   * @param {number} [powerMultiplier=SHOT_POWER]
   * @returns {object} Emitted shot event
   */
  launch(playerId, angle, power, powerMultiplier = SHOT_POWER) {
    if (this.disposed) throw new Error('Cannot launch on disposed SimulationEngine');
    const player = this.players.get(playerId);
    if (!player) throw new Error(`Player ${playerId} not found in simulation`);

    const event = applyShot(player, angle, power, powerMultiplier);
    return event;
  }

  /**
   * Steps the simulation forward by fixed timestep dt.
   * Advances all moving balls and resolves collisions and hazards.
   *
   * @param {number} [dt=FIXED_TIMESTEP]
   * @returns {{ time: number, tick: number, events: Array<object> }}
   */
  step(dt = FIXED_TIMESTEP) {
    if (this.disposed) throw new Error('Cannot step disposed SimulationEngine');
    this.simTime += dt;
    this.tickCount++;

    const currentHazardTime = this.getHazardTime();
    const tickEvents = [];

    for (const [id, player] of this.players.entries()) {
      if (!player.moving || player.mode !== 'play') continue;

      const playerEvents = stepBall(player, this.course, dt, currentHazardTime);
      for (const ev of playerEvents) {
        ev.playerId = id;
        tickEvents.push(ev);
      }
    }

    return {
      time: this.simTime,
      tick: this.tickCount,
      events: tickEvents,
    };
  }

  /**
   * Checks whether all players have finished their movement (at rest, sunk, or timeout).
   *
   * @returns {boolean}
   */
  isSettled() {
    for (const player of this.players.values()) {
      if (player.moving) return false;
    }
    return true;
  }

  /**
   * Returns an immutable snapshot of all players and current simulation state.
   *
   * @returns {object}
   */
  getSnapshot() {
    const playersObj = {};
    for (const [id, player] of this.players.entries()) {
      playersObj[id] = {
        name: player.name,
        colorIndex: player.colorIndex,
        x: player.x,
        y: player.y,
        z: player.z,
        vx: player.vx,
        vy: player.vy,
        vz: player.vz,
        moving: player.moving,
        strokes: player.strokes,
        mode: player.mode,
        scores: [...player.scores],
      };
    }

    return {
      simTime: this.simTime,
      tickCount: this.tickCount,
      puttIndex: this.puttIndex,
      settled: this.isSettled(),
      players: playersObj,
    };
  }

  /**
   * Disposes the simulation and clears all player records.
   */
  dispose() {
    this.players.clear();
    this.disposed = true;
  }
}
