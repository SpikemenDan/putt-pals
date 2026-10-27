/**
 * Application-level game rules that sit around the simulation in the legacy
 * page (putt-pals.html frame(), launch(), useItem(), audioTick(), effectOf(),
 * environmentAwake()). Pure functions and constants; no DOM, Three.js, audio
 * or network access.
 */

import { BALL_RADIUS, SHOT_POWER } from '../shared/constants.js';
import { inside, movingRect, surfaceHeight, WALL_HEIGHT } from '../simulation/physics.js';

/** Legacy multiplayer room namespace was "puttpals-circuit-v5-"; the modular protocol is incompatible, so it gets its own. */
export const ROOM_PREFIX = 'puttpals-circuit-v6-';
export const SOLO_ID = 'solo';
/** A ball still moving after this many seconds is treated as lost (legacy frame(): me.mt > 25 → oob()). */
export const STALL_SECONDS = 25;
/** Sunk players switch to waiting/free roam after this delay (legacy me.wait). */
export const SINK_WAIT_MS = 1200;
/** Presence publication interval (legacy pub() throttle). */
export const PRESENCE_INTERVAL_MS = 70;
/** HUD/room refresh interval (legacy setInterval(syncRoom/tick, 100)). */
export const TICK_MS = 100;
/** Zanyball multiplies the next shot's speed (legacy launch()). */
export const ZANY_POWER = 1.6;
export const MAX_INVENTORY = 3;
/** Power-ups in the order the legacy random pick indexes them. */
export const ITEMS = Object.freeze(['mag', 'steady', 'rew', 'rev', 'zany']);
export const ITEM_NAMES = Object.freeze({ mag: 'Hole Magnet', steady: 'Steady Aim', rew: 'Rewind', rev: 'Reversiball', zany: 'Zanyball' });
export const ACTIVATION_BANNERS = Object.freeze({ mag: 'HOLE MAGNET', steady: 'STEADY AIM', rev: 'REVERSIBALL', zany: 'ZANYBALL' });
export const EFFECT_FLASH_MS = 1800;

export const hostIdFor = roomCode => ROOM_PREFIX + roomCode;

/** Ball aura for a player (legacy effectOf()). */
export function effectOf(player, now) {
  if (player.pendingPowerups.rev) return 'rev';
  if (player.pendingPowerups.zany) return 'zany';
  if (player.armedPowerups.mag) return 'mag';
  if (player.armedPowerups.steady) return 'steady';
  if (player.flashUntil > now) return player.flashType || '';
  return '';
}

/**
 * True when a resting ball sits inside a fan, tornado or the reach of a moving
 * hazard, which then sets it moving again (legacy environmentAwake()).
 */
export function environmentAwake(course, player, hazardTime) {
  return course.fan.some(f => inside(f, player.x, player.y) && player.z < 80)
    || course.tornado.some(v => Math.hypot(player.x - v[0], player.y - v[1]) < v[2] && player.z < 130)
    || course.movers.some(v => {
      const r = movingRect(v, hazardTime);
      return player.z < surfaceHeight(course, v[0], v[1]) + WALL_HEIGHT
        && inside([r[0] - BALL_RADIUS, r[1] - BALL_RADIUS, r[2] + 2 * BALL_RADIUS, r[3] + 2 * BALL_RADIUS], player.x, player.y);
    });
}

/** Indices of `?` blocks the ball touches this frame (legacy frame() pickup test). */
export function touchedBlocks(course, player) {
  const hits = [];
  course.q.forEach((q, i) => {
    if (!player.collectedPickups[i] && Math.abs(player.z - surfaceHeight(course, q[0], q[1])) < 20 && Math.hypot(player.x - q[0], player.y - q[1]) < BALL_RADIUS + 13) hits.push(i);
  });
  return hits;
}

/** Aim toward the hole from the ball (legacy aim()). */
export const aimAtHole = (course, player) => Math.atan2(course.hole[1] - player.y, course.hole[0] - player.x);

/**
 * Local sounds inferred from consecutive frame states, exactly as the legacy
 * audioTick() did (shot, splash, teleport, jump pad, significant bounce, sink).
 * Returns audio-adapter events plus the `speed` option each one needs.
 *
 * @param {object|null} prev {round, strokes, mode, moving, x, y, vx, vy, vz, over}
 * @param {object} cur Same shape
 */
export function frameSounds(prev, cur) {
  const out = [];
  if (!prev || prev.round !== cur.round) return out;
  const position = [cur.x, cur.y, cur.z];
  const jump = Math.hypot(cur.x - prev.x, cur.y - prev.y), sp = Math.hypot(cur.vx, cur.vy), psp = Math.hypot(prev.vx, prev.vy);
  if (cur.strokes > prev.strokes) out.push({ event: { type: 'shot', position }, speed: sp });
  else if (prev.moving && !cur.moving && jump > 70 && cur.mode === 'play') out.push({ event: { type: 'out_of_bounds', position } });
  else if (prev.moving && cur.moving && jump > 70) out.push({ event: { type: 'hazard', hazardType: 'teleporter', position } });
  else if (cur.moving && cur.vz - prev.vz > 180) out.push({ event: { type: 'hazard', hazardType: 'pad', position } });
  else if (prev.moving && cur.moving && psp > 40 && sp > 20 && (cur.vx * prev.vx + cur.vy * prev.vy) / (sp * psp) < 0.75) out.push({ event: { type: 'bounce', position }, speed: sp });
  if (cur.mode === 'sunk' && prev.mode !== 'sunk') out.push({ event: { type: 'sink', timedOut: !!cur.over, position } });
  return out;
}

/** Shot speed multiplier for the local player's next launch. */
export const shotPower = player => SHOT_POWER * (player.pendingPowerups.zany ? ZANY_POWER : 1);
