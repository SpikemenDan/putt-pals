/**
 * The local player's putt: the shared simulation plus the legacy rules the old
 * page applied around it each frame (idle hazards waking the ball, the stall
 * limit, `?` block pickups, timeouts, sunk → waiting, power-ups and opponent effects).
 * One instance per round; the app discards it when the room moves on.
 */

import { FIXED_TIMESTEP } from '../shared/constants.js';
import { TUNING } from '../shared/tuning.js';
import { calculateTimeoutScore } from '../shared/scoring.js';
import { SimulationEventTypes } from '../shared/simulation.js';
import { outOfBounds, sinkBall, surfaceHeight } from '../simulation/physics.js';
import { SimulationEngine } from '../simulation/index.js';
import { activatePowerup, addToInventory, armedState, auraOf, ballRadiusOf, clearAtLaunch, pendingState, powerupName, receiveEffect, rollPowerup, takeFromInventory } from '../gameplay/index.js';
import { DEPLOYABLE_HIT } from '../gameplay/deployables.js';
import { courseBounds, evaluateGlobalHazards, lightningImpulse } from '../gameplay/global-hazards.js';
import { aimAtHole, EFFECT_FLASH_MS, environmentAwake, SINK_WAIT_MS, STALL_SECONDS, touchedBlocks } from './rules.js';

/**
 * @param {object} options
 * @param {object} options.definition Course definition (src/courses createCourseData().definitions[i])
 * @param {{par:number, penalty:number}} options.rule Resolved putt rule (createCourseData().rules[i].putts[k])
 * @param {number} options.puttIndex
 * @param {string} options.id Local player id
 * @param {string} options.name
 * @param {boolean} options.playing In the roster (false: spectator)
 * @param {boolean} options.timed False in putt practice (no time limit)
 * @param {number} options.roundStartTime Room-clock ms
 * @param {number} options.limitSeconds
 * @param {() => number} options.roomNow
 * @param {() => number} [options.random=Math.random] Power-up rolls
 * @param {string[]} [options.inventory=[]] Power-ups carried into this putt (see gameplay powerupPolicy / startingInventory)
 * @param {{spawn:boolean, pool:object[]}} [options.powerups] Box rules from gameplay powerupPolicy; omitted: boxes award nothing
 * @param {() => number} [options.now] Local monotonic ms (effect flashes, sunk → waiting)
 */
export function createPutt({ definition, rule, puttIndex, id, name, playing, timed, roundStartTime, limitSeconds, roomNow, random = Math.random, inventory = [], powerups = { spawn: false, pool: [] }, now: localNow = () => performance.now() }) {
  const hazardTime = () => Math.max(0, (roomNow() - roundStartTime) / 1000);
  const engine = new SimulationEngine(definition, puttIndex, { hazardTime });
  const course = engine.course;
  const player = engine.addPlayer(id, name);
  player.mode = playing ? 'play' : 'spectator';
  player.globalHazards = [];
  player.globalHazardBounds = courseBounds(course);
  // No Power-Ups (GM1): every `?` block counts as already collected, so none is drawn or touchable.
  player.collectedPickups = powerups.boxes === false ? Object.fromEntries((course.q || []).map((_, i) => [i, 1])) : {};
  player.inventory = inventory.slice();
  player.armedPowerups = armedState();
  player.pendingPowerups = pendingState();
  player.flashUntil = 0; player.flashType = '';
  let accumulator = 0, stall = 0, waitUntil = 0, completion = null, fxCount = 0, fx = null, disposed = false;
  const appliedLightning = new Set();

  const result = () => ({ toasts: [], banners: [], completed: null, aim: null, cancelInput: false, openCard: false, placement: null, deployHits: [], cupEliminations: [] });
  const finish = (out, event, now) => {
    waitUntil = now + SINK_WAIT_MS;
    completion = { strokes: player.strokes, timedOut: !!event.timedOut };
    out.completed = completion;
    out.toasts.push(event.timedOut
      ? 'Time’s up! You score ' + calculateTimeoutScore(player.strokes, rule.par, rule.penalty) + ' (par + penalty).'
      : player.strokes === 1 ? 'Hole in one!' : 'Hole in ' + player.strokes + '!');
    out.openCard = timed;
  };

  return {
    player,
    course,
    definition,
    get completion() { return completion; },
    get effect() { return auraOf(player, localNow()); },
    get fx() { return fx; },
    hazardTime,
    /** Aim straight at the hole from the ball (start of the putt and after the ball stops). */
    aimAngle: () => aimAtHole(course, player),
    /** Ball state the renderer and presence use. */
    view(now) {
      return { x: player.x, y: player.y, z: player.z, vx: player.vx, vy: player.vy, moving: player.moving, mode: player.mode === 'sunk' && now >= waitUntil ? 'wait' : player.mode, effect: auraOf(player, now), radius: ballRadiusOf(player), collected: { ...player.collectedPickups } };
    },
    get mode() { return player.mode === 'sunk' && localNow() >= waitUntil ? 'wait' : player.mode; },

    /** Legacy launch(); one-shot effects clear at launch. */
    shoot(angle, power) {
      if (disposed || player.mode !== 'play' || player.moving) return null;
      const event = engine.launch(id, angle, power);
      clearAtLaunch(player);
      stall = 0; accumulator = 0;
      return event;
    },

    /**
     * Advances one rendered frame (legacy frame()).
     * @param {number} now Local ms (performance.now)
     * @param {number} dt Seconds, already clamped to 0.05
     */
    frame(now, dt) {
      const out = result();
      if (disposed) return out;
      if (player.mode === 'play') {
        const global = evaluateGlobalHazards(player.globalHazards, hazardTime(), player, player.globalHazardBounds);
        if (!player.moving && (environmentAwake(course, player, hazardTime()) || Math.hypot(global.ax, global.ay, global.az) > 0)) { out.cancelInput = true; player.moving = true; stall = 0; }
        if (player.moving) {
          stall += dt; accumulator += dt;
          while (accumulator >= FIXED_TIMESTEP && player.moving) {
            for (const event of engine.step(FIXED_TIMESTEP).events) {
              if (event.type === SimulationEventTypes.SINK) finish(out, event, now);
              else if (event.type === SimulationEventTypes.CUP_ELIMINATION) out.cupEliminations.push(event.cupId);
              else if (event.type === SimulationEventTypes.OUT_OF_BOUNDS) { out.toasts.push('Splash! Back to your last spot. That stroke still counts.'); out.aim = aimAtHole(course, player); }
              else if (event.type === DEPLOYABLE_HIT) out.deployHits.push(event.id);
              else if (event.type === SimulationEventTypes.REST) out.aim = aimAtHole(course, player);
            }
            accumulator -= FIXED_TIMESTEP;
          }
          if (player.moving && stall > STALL_SECONDS) {
            outOfBounds(player, course, []);
            out.toasts.push('Splash! Back to your last spot. That stroke still counts.');
            out.aim = aimAtHole(course, player);
          }
        }
        if (player.mode === 'play' && powerups.spawn) for (const k of touchedBlocks(course, player)) {
          player.collectedPickups[k] = 1;
          const item = rollPowerup(powerups.pool, random);
          if (item && addToInventory(player.inventory, item)) out.toasts.push('Got ' + powerupName(item) + '!');
          else out.toasts.push('Inventory full. Power-up lost.');
        }
        if (player.mode === 'play' && timed && roomNow() - roundStartTime > limitSeconds * 1000) {
          const events = [];
          sinkBall(player, course, true, events);
          finish(out, events[0], now);
        }
      }
      return out;
    },

    /** Activates the power-up in a slot (keys 1–3 or click): arms a self effect or sends an opponent effect as presence fx. */
    useItem(index, now) {
      const out = result();
      const item = player.inventory[index];
      if (disposed || !item || player.mode !== 'play') return out;
      const activation = activatePowerup(player, item, fxCount + 1);
      if (activation.toast && !activation.deploy) out.toasts.push(activation.toast);
      if (!activation.ok) return out;
      if (activation.deploy) { out.placement = { kind: activation.deploy.kind, index }; return out; } // G1e: the slot is spent by consumeItem once the host accepts the placement
      if (activation.global) { out.globalHazard = { kind: activation.global.kind, index }; return out; }
      out.banners.push([name, activation.entry.banner + ' ACTIVATED', 'power', item]);
      if (activation.message) { fx = activation.message; fxCount = fx.id; }
      player.flashType = item; player.flashUntil = now + EFFECT_FLASH_MS;
      takeFromInventory(player.inventory, index);
      return out;
    },

    /** Active Bumper / Orbital Bumper records the physics step applies to this client's ball (G1e). Cleared outside play. */
    setDeployables(list) { player.deployables = disposed || player.mode !== 'play' ? [] : list; },

    /** Room-authoritative timed global hazards (G1f), scoped to this putt. */
    setGlobalHazards(list) {
      player.globalHazards = disposed || player.mode !== 'play' || !Array.isArray(list) ? [] : list;
      const at = hazardTime();
      const events = [];
      for (const hazard of player.globalHazards) {
        if (hazard.kind !== 'lightning' || hazard.targetId !== id || appliedLightning.has(hazard.id)
            || at < hazard.startTime || at >= hazard.startTime + TUNING.globalHazards.lightningWindowSeconds) continue;
        appliedLightning.add(hazard.id);
        const impulse = lightningImpulse(hazard, id);
        if (impulse) { player.vx += impulse.x; player.vy += impulse.y; player.moving = true; stall = 0; events.push({ type: 'lightning', id: hazard.id }); }
      }
      return events;
    },

    /** Spends the slot of a placed deployable (G1e) after the host accepted DEPLOY_OBJECT. Returns false when the slot no longer holds `kind`. */
    consumeItem(kind) {
      const at = player.inventory.indexOf(kind);
      if (disposed || at < 0) return false;
      takeFromInventory(player.inventory, at);
      return true;
    },

    /** Another player's opponent-targeted effect message lands on this player; returns the toast, or null when it cannot. */
    receiveAttack(type, from) {
      if (disposed || !receiveEffect(player, type)) return null;
      return String(from || 'Someone').slice(0, 14) + ' used ' + powerupName(type) + ' on you!';
    },

    /** Love / Hate Ball sources from other players' balls (G1d); this client applies them to its own ball while it rolls. */
    setAuras(sources) { player.auraSources = disposed || player.mode !== 'play' ? [] : sources; },

    /** Ball centre height of the tee/cup for transitions. */
    surface: (x, y) => surfaceHeight(course, x, y),
    dispose() { disposed = true; engine.dispose(); },
  };
}
