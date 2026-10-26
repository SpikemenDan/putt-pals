/**
 * High-fidelity mocks matching the agreed contracts.
 * Allows dependent modules (S1, R1, U1, L1, N1, T1) to implement and test against
 * identical interfaces prior to full module extraction.
 */

import { ConnectionStates } from './transport.js';
import { SessionPhases, GameModes, resolveVote } from './session.js';
import { createPlayerState, applyShot, SimulationEventTypes } from './simulation.js';
import { FIXED_TIMESTEP, SHOT_POWER, BALL_RADIUS } from './constants.js';

/**
 * Creates a valid sample course fixture conforming to the course schema.
 * @returns {object} Validated course object
 */
export function createSampleCourse() {
  return {
    id: 'course-sample-garden',
    index: 0,
    name: 'Sample Garden',
    starter: true,
    puttCount: 6,
    par: 12,
    limitSeconds: 120,
    geometry: {
      tiles: [[0, 0, 800, 600]],
      walls: [
        [0, 0, 800, 10],
        [0, 590, 800, 10],
        [0, 0, 10, 600],
        [790, 0, 10, 600],
      ],
      sand: [],
      ice: [],
      slime: [],
      pits: [],
      platforms: [],
      ramps: [],
      pads: [],
      teleporters: [],
      fans: [],
      tornados: [],
      movers: [],
    },
    putts: [
      { index: 0, tee: [80, 80], hole: [240, 80], par: 2, penalty: 3, limitSeconds: 120, cupRadius: 15 },
      { index: 1, tee: [320, 210], hole: [480, 80], par: 2, penalty: 3, limitSeconds: 120, cupRadius: 15 },
      { index: 2, tee: [560, 146], hole: [720, 146], par: 2, penalty: 3, limitSeconds: 120, cupRadius: 15 },
      { index: 3, tee: [80, 290], hole: [240, 420], par: 2, penalty: 3, limitSeconds: 120, cupRadius: 15 },
      { index: 4, tee: [320, 356], hole: [480, 356], par: 2, penalty: 3, limitSeconds: 120, cupRadius: 15 },
      { index: 5, tee: [560, 420], hole: [720, 290], par: 2, penalty: 3, limitSeconds: 120, cupRadius: 15 },
    ],
  };
}

/**
 * Mock Simulation Engine conforming to SimulationEngineContract.
 */
export class MockSimulation {
  constructor(course = createSampleCourse(), puttIndex = 0) {
    this.course = course;
    this.puttIndex = puttIndex;
    this.players = new Map();
    this.simTime = 0;
    this.events = [];
    this.disposed = false;
  }

  addPlayer(id, name, colorIndex = 0) {
    const putt = this.course.putts[this.puttIndex];
    const player = createPlayerState(name, colorIndex, {
      x: putt.tee[0],
      y: putt.tee[1],
      z: 0,
    });
    this.players.set(id, player);
    return player;
  }

  getPlayer(id) {
    return this.players.get(id);
  }

  launch(playerId, angle, power) {
    const player = this.players.get(playerId);
    if (!player) throw new Error(`Player ${playerId} not found in simulation`);
    const event = applyShot(player, angle, power, SHOT_POWER);
    this.events.push(event);
    return event;
  }

  step(dt = FIXED_TIMESTEP) {
    this.simTime += dt;
    const stepEvents = [];

    for (const [id, player] of this.players.entries()) {
      if (!player.moving) continue;

      // Integrate velocity with dummy drag
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      player.vx *= 0.98;
      player.vy *= 0.98;

      const speed = Math.hypot(player.vx, player.vy);

      // Check distance to cup
      const putt = this.course.putts[this.puttIndex];
      const distToCup = Math.hypot(player.x - putt.hole[0], player.y - putt.hole[1]);

      if (distToCup <= putt.cupRadius && speed < 120) {
        player.moving = false;
        player.vx = 0;
        player.vy = 0;
        player.mode = 'sunk';
        const sinkEvent = {
          type: SimulationEventTypes.SINK,
          playerId: id,
          strokes: player.strokes,
          holeInOne: player.strokes === 1,
        };
        this.events.push(sinkEvent);
        stepEvents.push(sinkEvent);
      } else if (speed < 0.5) {
        player.moving = false;
        player.vx = 0;
        player.vy = 0;
        const restEvent = {
          type: SimulationEventTypes.REST,
          playerId: id,
          position: [player.x, player.y, player.z],
          strokes: player.strokes,
        };
        this.events.push(restEvent);
        stepEvents.push(restEvent);
      }
    }

    return {
      time: this.simTime,
      events: stepEvents,
    };
  }

  getSnapshot() {
    const playersObj = {};
    for (const [id, p] of this.players.entries()) {
      playersObj[id] = { ...p };
    }
    return {
      simTime: this.simTime,
      puttIndex: this.puttIndex,
      players: playersObj,
    };
  }

  dispose() {
    this.players.clear();
    this.events = [];
    this.disposed = true;
  }
}

/**
 * Mock Transport representing a virtual peer or host node.
 * Multiple MockTransports can be linked via a shared virtual hub.
 */
export class MockTransportHub {
  constructor() {
    this.nodes = new Map();
  }

  register(node) {
    this.nodes.set(node.peerId, node);
  }

  unregister(node) {
    this.nodes.delete(node.peerId);
  }

  broadcast(senderId, message) {
    for (const [id, node] of this.nodes.entries()) {
      if (id !== senderId && node.connectionState === ConnectionStates.CONNECTED) {
        node._deliver(message);
      }
    }
  }

  sendTo(targetId, message) {
    const node = this.nodes.get(targetId);
    if (node && node.connectionState === ConnectionStates.CONNECTED) {
      node._deliver(message);
    }
  }
}

export class MockTransport {
  constructor(peerId, isHost = false, hub = null) {
    this.peerId = peerId;
    this.isHost = isHost;
    this.hub = hub;
    this.connectionState = ConnectionStates.DISCONNECTED;
    this.listeners = new Set();
    this.sentMessages = [];
    this.clock = () => Date.now();
  }

  async connect() {
    this.connectionState = ConnectionStates.CONNECTED;
    if (this.hub) {
      this.hub.register(this);
    }
  }

  now() {
    return this.clock();
  }

  send(message) {
    if (this.connectionState !== ConnectionStates.CONNECTED) {
      throw new Error(`Cannot send on transport in state ${this.connectionState}`);
    }
    this.sentMessages.push(message);
    if (this.hub) {
      this.hub.broadcast(this.peerId, message);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _deliver(message) {
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  close() {
    this.connectionState = ConnectionStates.CLOSED;
    if (this.hub) {
      this.hub.unregister(this);
    }
    this.listeners.clear();
  }
}
