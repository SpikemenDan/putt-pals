/**
 * Armed effects and activation (G1a). Effects change simulation or input
 * state, never rendering. A self effect arms `player.armedPowerups[id]`, so
 * several armed effects stack on one shot; with nothing armed every hook is a
 * no-op and results stay bit-identical to the parity fixtures. An opponent
 * effect becomes a validated effect message that the target's own client
 * applies (`receiveEffect`).
 */

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
