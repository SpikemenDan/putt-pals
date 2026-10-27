/**
 * The local player's putt: the shared simulation plus the legacy rules the old
 * page applied around it each frame (idle hazards waking the ball, the stall
 * limit, `?` block pickups, timeouts, sunk → waiting, power-ups and attacks).
 * One instance per round; the app discards it when the room moves on.
 */

import { FIXED_TIMESTEP } from '../shared/constants.js';
import { calculateTimeoutScore } from '../shared/scoring.js';
import { SimulationEventTypes } from '../shared/simulation.js';
import { outOfBounds, sinkBall, surfaceHeight } from '../simulation/physics.js';
import { SimulationEngine } from '../simulation/index.js';
import { ACTIVATION_BANNERS, aimAtHole, EFFECT_FLASH_MS, effectOf, environmentAwake, ITEMS, ITEM_NAMES, MAX_INVENTORY, shotPower, SINK_WAIT_MS, STALL_SECONDS, touchedBlocks } from './rules.js';

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
 * @param {() => number} [options.now] Local monotonic ms (effect flashes, sunk → waiting)
 */
export function createPutt({ definition, rule, puttIndex, id, name, playing, timed, roundStartTime, limitSeconds, roomNow, random = Math.random, now: localNow = () => performance.now() }) {
  const hazardTime = () => Math.max(0, (roomNow() - roundStartTime) / 1000);
  const engine = new SimulationEngine(definition, puttIndex, { hazardTime });
  const course = engine.course;
  const player = engine.addPlayer(id, name);
  player.mode = playing ? 'play' : 'spectator';
  player.collectedPickups = {};
  player.flashUntil = 0; player.flashType = '';
  let accumulator = 0, stall = 0, waitUntil = 0, completion = null, fxCount = 0, fx = null, disposed = false;

  const result = () => ({ toasts: [], banners: [], completed: null, aim: null, cancelInput: false, openCard: false });
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
    get effect() { return effectOf(player, localNow()); },
    get fx() { return fx; },
    hazardTime,
    /** Aim straight at the hole from the ball (start of the putt and after the ball stops). */
    aimAngle: () => aimAtHole(course, player),
    /** Ball state the renderer and presence use. */
    view(now) {
      return { x: player.x, y: player.y, z: player.z, vx: player.vx, vy: player.vy, moving: player.moving, mode: player.mode === 'sunk' && now >= waitUntil ? 'wait' : player.mode, effect: effectOf(player, now), collected: { ...player.collectedPickups } };
    },
    get mode() { return player.mode === 'sunk' && localNow() >= waitUntil ? 'wait' : player.mode; },

    /** Legacy launch(): Zanyball speeds the shot, then pending/armed one-shot effects clear. */
    shoot(angle, power) {
      if (disposed || player.mode !== 'play' || player.moving) return null;
      const event = engine.launch(id, angle, power, shotPower(player));
      player.pendingPowerups.rev = player.pendingPowerups.zany = 0;
      player.armedPowerups.steady = 0;
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
        if (!player.moving && environmentAwake(course, player, hazardTime())) { out.cancelInput = true; player.moving = true; stall = 0; }
        if (player.moving) {
          stall += dt; accumulator += dt;
          while (accumulator >= FIXED_TIMESTEP && player.moving) {
            for (const event of engine.step(FIXED_TIMESTEP).events) {
              if (event.type === SimulationEventTypes.SINK) finish(out, event, now);
              else if (event.type === SimulationEventTypes.OUT_OF_BOUNDS) { out.toasts.push('Splash! Back to your last spot. That stroke still counts.'); out.aim = aimAtHole(course, player); }
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
        if (player.mode === 'play') for (const k of touchedBlocks(course, player)) {
          player.collectedPickups[k] = 1;
          if (player.inventory.length < MAX_INVENTORY) {
            const item = ITEMS[Math.floor(random() * ITEMS.length)];
            player.inventory.push(item);
            out.toasts.push('Got ' + ITEM_NAMES[item] + '!');
          } else out.toasts.push('Inventory full. Power-up lost.');
        }
        if (player.mode === 'play' && timed && roomNow() - roundStartTime > limitSeconds * 1000) {
          const events = [];
          sinkBall(player, course, true, events);
          finish(out, events[0], now);
        }
      }
      return out;
    },

    /** Legacy useItem(): returns the toast/banner it produces; attacks become presence fx. */
    useItem(index, now) {
      const out = result();
      const item = player.inventory[index];
      if (disposed || !item || player.mode !== 'play') return out;
      if (ACTIVATION_BANNERS[item]) out.banners.push([name, ACTIVATION_BANNERS[item] + ' ACTIVATED', 'power']);
      if (item === 'rew') {
        if (player.moving || !player.prevPosition) { out.toasts.push('Nothing to rewind right now.'); return out; }
        [player.x, player.y, player.z] = player.prevPosition;
        player.strokes = Math.max(0, player.strokes - 1);
        player.prevPosition = null;
        out.toasts.push('Rewound your last stroke.');
      } else if (item === 'mag') { player.armedPowerups.mag = 1; out.toasts.push('Hole Magnet armed for this shot.'); }
      else if (item === 'steady') { player.armedPowerups.steady = 1; out.toasts.push('Your next shot has no wobble.'); }
      else { fx = { id: ++fxCount, t: item }; out.toasts.push(ITEM_NAMES[item] + ' sent to everyone else!'); }
      player.flashType = item; player.flashUntil = now + EFFECT_FLASH_MS;
      player.inventory.splice(index, 1);
      return out;
    },

    /** Another player's Reversiball/Zanyball lands on this player (legacy applyFx()). */
    receiveAttack(type, from) {
      if (disposed || player.mode !== 'play' || (type !== 'rev' && type !== 'zany')) return null;
      player.pendingPowerups[type] = 1;
      return String(from || 'Someone').slice(0, 14) + ' used ' + ITEM_NAMES[type] + ' on you!';
    },

    /** Ball centre height of the tee/cup for transitions. */
    surface: (x, y) => surfaceHeight(course, x, y),
    dispose() { disposed = true; engine.dispose(); },
  };
}
