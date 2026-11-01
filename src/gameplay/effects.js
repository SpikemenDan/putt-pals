/**
 * Armed effects and activation (G1a). Effects change simulation or input
 * state, never rendering. A self effect arms `player.armedPowerups[id]`, so
 * several armed effects stack on one shot; with nothing armed every hook is a
 * no-op and results stay bit-identical to the parity fixtures. An opponent
 * effect becomes a validated effect message that the target's own client
 * applies (`receiveEffect`).
 */

import { BALL_RADIUS } from '../shared/constants.js';
import { TUNING } from '../shared/tuning.js';
import { DurationKinds, getPowerup, isOpponentPowerup, POWERUP_CATALOG, PowerupTargets, powerupIds } from './catalog.js';

const count = n => Number.isSafeInteger(n) && n >= 0;

/** Armed-effect map for a new player: every self effect off. */
export const armedState = (catalog = POWERUP_CATALOG) => Object.fromEntries(catalog.filter(e => e.target === PowerupTargets.SELF).map(e => [e.id, 0]));
/** Pending-effect map for a new player: every opponent effect off. */
export const pendingState = (catalog = POWERUP_CATALOG) => Object.fromEntries(catalog.filter(e => e.target === PowerupTargets.OPPONENT).map(e => [e.id, 0]));

/**
 * Activates one power-up for a player. Does not touch the inventory.
 * @returns {{ok: boolean, entry?: object, message?: {id:number, t:string}, toast: string}}
 */
export function activatePowerup(player, id, nextMessageId, catalog = POWERUP_CATALOG) {
  const entry = getPowerup(id, catalog);
  if (!entry) return { ok: false, toast: '' };
  if (entry.target === PowerupTargets.OPPONENT) {
    return { ok: true, entry, message: { id: nextMessageId, t: id }, toast: entry.name + ' sent to everyone else!' };
  }
  if (player.armedPowerups[id]) return { ok: false, entry, toast: entry.name + ' is already armed.' };
  player.armedPowerups[id] = 1;
  return { ok: true, entry, toast: entry.toast };
}

/** Launch hook: clears armed effects whose duration is the next shot. */
export function clearAtLaunch(player, catalog = POWERUP_CATALOG) {
  for (const e of catalog) if (e.duration.kind === DurationKinds.NEXT_SHOT && e.id in player.armedPowerups) player.armedPowerups[e.id] = 0;
  for (const id of Object.keys(player.pendingPowerups)) player.pendingPowerups[id] = 0;
}

/** Applies an opponent effect message to this player. Returns false when it cannot land. */
export function receiveEffect(player, id, catalog = POWERUP_CATALOG) {
  if (player.mode !== 'play' || !isOpponentPowerup(id, catalog)) return false;
  player.pendingPowerups[id] = 1;
  return true;
}

/** Ball aura (legacy effectOf()): pending opponent effects first, then armed self effects in catalog order, then the activation flash. */
export function auraOf(player, now, catalog = POWERUP_CATALOG) {
  for (const id of powerupIds(catalog)) if (player.pendingPowerups[id]) return id;
  for (const id of powerupIds(catalog)) if (player.armedPowerups[id]) return id;
  if (player.flashUntil > now) return player.flashType || '';
  return '';
}

/**
 * Validates an effect message `{id, t}` carried in presence (`fx`).
 * Only opponent-targeted catalog ids are valid; the sender is the connection it arrived on.
 */
export const validEffectMessage = (m, catalog = POWERUP_CATALOG) => !!m && typeof m === 'object' && !Array.isArray(m)
  && Object.keys(m).length === 2 && count(m.id) && isOpponentPowerup(m.t, catalog);

/** Rest hook: clears armed effects that last for the stroke (called when the ball rests, sinks or is reset). */
export function clearAtRest(player, catalog = POWERUP_CATALOG) {
  if (!player.armedPowerups) return;
  for (const e of catalog) if (e.duration.kind === DurationKinds.STROKE && e.id in player.armedPowerups) player.armedPowerups[e.id] = 0;
}

/** Aim-mode ids and the indicator mode each one puts on the target's aim (G1c). */
export const AIM_MODES = Object.freeze({ aim360: 'spin', aim180: 'sweep' });

/** Aim hook: the indicator mode ('spin', 'sweep' or '') from the player's pending opponent effects; the first in catalog order wins. */
export function aimModeOf(player, catalog = POWERUP_CATALOG) {
  const pending = player.pendingPowerups;
  if (!pending) return '';
  for (const id of powerupIds(catalog)) if (pending[id] && AIM_MODES[id]) return AIM_MODES[id];
  return '';
}

/** Aura kinds: the catalog ids whose owner's ball acts on other players' balls. */
export const AURA_KINDS = Object.freeze(['love', 'hate']);

/**
 * Aura sources from presence-like entries `{x, y, effect}` of other players. Each client applies them to its
 * own ball only (remote balls are non-colliding ghosts). Unknown effects and non-finite positions are ignored.
 */
export const auraSourcesOf = others => others.filter(o => o && AURA_KINDS.includes(o.effect) && Number.isFinite(o.x) && Number.isFinite(o.y))
  .map(o => ({ kind: o.effect, x: o.x, y: o.y }));

/**
 * Aura hook: adds the acceleration (x/y, world units per second squared) that the active sources exert on a ball
 * at (x, y) over dt. Love pulls toward the source and Hate pushes away, both fading linearly to zero at the
 * reach. Returns [0, 0] when there are no sources, so inactive results stay bit-identical.
 */
export function auraAcceleration(sources, x, y, dt) {
  let ax = 0, ay = 0;
  if (!sources?.length) return [ax, ay];
  const range = TUNING.powerups.auraRange;
  for (const s of sources) {
    const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy);
    if (!(d > 1e-6 && d < range)) continue;
    const strength = (s.kind === 'love' ? TUNING.powerups.auraPull : -TUNING.powerups.auraPush) * (1 - d / range) * dt;
    ax += dx / d * strength; ay += dy / d * strength;
  }
  return [ax, ay];
}

/** Radius hook: the ball radius for the armed effects (exactly BALL_RADIUS when none apply). Small and Tall Ball stack multiplicatively. */
export function ballRadiusOf(player) {
  const armed = player.armedPowerups;
  if (!armed || !(armed.small || armed.tall)) return BALL_RADIUS;
  return BALL_RADIUS * (armed.small ? TUNING.powerups.smallBallScale : 1) * (armed.tall ? TUNING.powerups.tallBallScale : 1);
}
