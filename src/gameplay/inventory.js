/**
 * Three-slot power-up inventory and the per-mode power-up policy (G1a).
 * Pure functions over plain arrays; the inventory array lives on the player
 * state (`player.inventory`, ordered, at most MAX_INVENTORY ids).
 */

import { GameModes } from '../shared/session.js';
import { spawnPool } from './catalog.js';

export const MAX_INVENTORY = 3;

const TOURNAMENT_MODES = Object.freeze([GameModes.TOURNAMENT_3, GameModes.TOURNAMENT_6, GameModes.TOURNAMENT_9]);
const SOLO_MODES = Object.freeze([GameModes.PRACTICE, GameModes.PUTT_PRACTICE]);

/**
 * Power-up rules for a session.
 * @param {{mode: string, rosterSize?: number, powerups?: boolean}} session
 *   powerups=false is the No Power-Ups mode (GM1 supplies the flag): no boxes spawn.
 * @returns {{spawn: boolean, boxes: boolean, solo: boolean, carryover: boolean, pool: object[]}}
 *   boxes: whether `?` blocks exist at all; false in the No Power-Ups mode, where they are hidden.
 *   carryover: tournaments keep the inventory across putts and rounds; every other mode resets it each putt.
 */
export function powerupPolicy({ mode, rosterSize = 1, powerups = true }, catalog) {
  const solo = rosterSize <= 1 || SOLO_MODES.includes(mode);
  const pool = spawnPool({ powerups, solo }, catalog);
  return { spawn: powerups && pool.length > 0, boxes: powerups, solo, carryover: TOURNAMENT_MODES.includes(mode), pool };
}

/** Inventory for the next putt: the carried slots in a tournament, empty otherwise. */
export const startingInventory = (policy, carried = []) => (policy.carryover ? carried.slice(0, MAX_INVENTORY) : []);

/** Adds an id when a slot is free. Mutates `inventory`; returns whether it was stored. */
export function addToInventory(inventory, id) {
  if (inventory.length >= MAX_INVENTORY) return false;
  inventory.push(id);
  return true;
}

/** Removes and returns the id in a slot (0-based), or null for an empty or invalid slot. */
export function takeFromInventory(inventory, index) {
  if (!Number.isInteger(index) || index < 0 || index >= inventory.length) return null;
  return inventory.splice(index, 1)[0];
}
