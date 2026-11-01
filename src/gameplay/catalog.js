/**
 * Power-up catalog (G1a). Plain data: the single source for the HUD, protocol
 * validation, the box spawn table and solo filtering. No DOM, Three.js or
 * network access; helpers take the catalog as an argument so tests can supply
 * their own entries.
 *
 * Entry fields:
 *   id        short stable id used in presence, effect messages and auras
 *   name      HUD and toast name
 *   group     grouping for the UI and later balance work
 *   target    'self' (applied to the user's own next shots) or 'opponent'
 *             (travels as a validated effect message; applied by the target's client)
 *   solo      true when allowed in solo and practice (self-only effects)
 *   weight    relative box spawn weight (> 0)
 *   duration  { kind: 'next-shot' | 'stroke' }: 'next-shot' clears at launch,
 *             'stroke' stays armed until the ball rests, sinks or is reset
 *   hook      simulation or input hook the effect uses
 *   banner    activation banner text (the HUD adds " ACTIVATED")
 *   toast     message shown when the effect is armed (self) or sent (opponent)
 */

export const PowerupTargets = Object.freeze({ SELF: 'self', OPPONENT: 'opponent' });
export const DurationKinds = Object.freeze({ NEXT_SHOT: 'next-shot', STROKE: 'stroke' });
export const PowerupHooks = Object.freeze({ TICK_FORCE: 'tick-force', AIM_SWAY: 'aim-sway', LAUNCH: 'launch', COLLISION: 'collision', RADIUS: 'radius', AIM_MODE: 'aim-mode' });

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

export const POWERUP_CATALOG = deepFreeze([
  {
    id: 'mag', name: 'Hole Magnet', group: 'self-utility', target: PowerupTargets.SELF, solo: true, weight: 1,
    duration: { kind: DurationKinds.STROKE }, hook: PowerupHooks.TICK_FORCE,
    banner: 'HOLE MAGNET', toast: 'Hole Magnet armed for this shot.',
  },
  {
    id: 'steady', name: 'Steady Aim', group: 'self-utility', target: PowerupTargets.SELF, solo: true, weight: 1,
    duration: { kind: DurationKinds.NEXT_SHOT }, hook: PowerupHooks.AIM_SWAY,
    banner: 'STEADY AIM', toast: 'Your next shot has no wobble.',
  },
  {
    id: 'chip', name: 'Chip In', group: 'self-utility', target: PowerupTargets.SELF, solo: true, weight: 1,
    duration: { kind: DurationKinds.NEXT_SHOT }, hook: PowerupHooks.LAUNCH,
    banner: 'CHIP IN', toast: 'Your next shot is lofted.',
  },
  {
    id: 'ghost', name: 'Ghost Ball', group: 'self-utility', target: PowerupTargets.SELF, solo: true, weight: 1,
    duration: { kind: DurationKinds.STROKE }, hook: PowerupHooks.COLLISION,
    banner: 'GHOST BALL', toast: 'Your next shot passes through walls and obstacles.',
  },
  {
    id: 'small', name: 'Small Ball', group: 'self-utility', target: PowerupTargets.SELF, solo: true, weight: 1,
    duration: { kind: DurationKinds.STROKE }, hook: PowerupHooks.RADIUS,
    banner: 'SMALL BALL', toast: 'Your ball is smaller for this shot.',
  },
  {
    id: 'tall', name: 'Tall Ball', group: 'self-utility', target: PowerupTargets.SELF, solo: true, weight: 1,
    duration: { kind: DurationKinds.STROKE }, hook: PowerupHooks.RADIUS,
    banner: 'TALL BALL', toast: 'Your ball is bigger for this shot.',
  },
  {
    id: 'sticky', name: 'Sticky Ball', group: 'self-utility', target: PowerupTargets.SELF, solo: true, weight: 1,
    duration: { kind: DurationKinds.STROKE }, hook: PowerupHooks.COLLISION,
    banner: 'STICKY BALL', toast: 'Your ball will not rebound on this shot.',
  },
  {
    id: 'aim360', name: '360° Aim', group: 'aim-sabotage', target: PowerupTargets.OPPONENT, solo: false, weight: 1,
    duration: { kind: DurationKinds.NEXT_SHOT }, hook: PowerupHooks.AIM_MODE,
    banner: '360° AIM', toast: 'Their aim indicator spins all the way round on their next shot.',
  },
  {
    id: 'aim180', name: '180° Aim', group: 'aim-sabotage', target: PowerupTargets.OPPONENT, solo: false, weight: 1,
    duration: { kind: DurationKinds.NEXT_SHOT }, hook: PowerupHooks.AIM_MODE,
    banner: '180° AIM', toast: 'Their aim indicator sweeps back and forth on their next shot.',
  },
]);

/** Problems with a catalog (empty when valid): duplicate ids, bad fields, non-self entries allowed in solo. */
export function catalogProblems(catalog = POWERUP_CATALOG) {
  const problems = [], seen = new Set();
  const targets = Object.values(PowerupTargets), durations = Object.values(DurationKinds);
  catalog.forEach((e, i) => {
    const at = `catalog[${i}]`;
    if (!e || typeof e.id !== 'string' || !/^[a-z][a-z0-9]{0,15}$/.test(e.id)) { problems.push(`${at}: id must be 1-16 lowercase letters or digits`); return; }
    if (seen.has(e.id)) problems.push(`${at}: duplicate id ${e.id}`);
    seen.add(e.id);
    if (typeof e.name !== 'string' || !e.name) problems.push(`${e.id}: name required`);
    if (typeof e.group !== 'string' || !e.group) problems.push(`${e.id}: group required`);
    if (!targets.includes(e.target)) problems.push(`${e.id}: target must be one of ${targets.join(', ')}`);
    if (typeof e.solo !== 'boolean') problems.push(`${e.id}: solo must be a boolean`);
    if (e.solo && e.target !== PowerupTargets.SELF) problems.push(`${e.id}: only self-targeted power-ups may be allowed in solo`);
    if (!(Number.isFinite(e.weight) && e.weight > 0)) problems.push(`${e.id}: weight must be positive`);
    if (!e.duration || !durations.includes(e.duration.kind)) problems.push(`${e.id}: duration.kind must be one of ${durations.join(', ')}`);
    if (typeof e.hook !== 'string' || !e.hook) problems.push(`${e.id}: hook required`);
    if (typeof e.banner !== 'string' || typeof e.toast !== 'string') problems.push(`${e.id}: banner and toast required`);
  });
  return problems;
}

export const powerupIds = (catalog = POWERUP_CATALOG) => catalog.map(e => e.id);
export const getPowerup = (id, catalog = POWERUP_CATALOG) => catalog.find(e => e.id === id) || null;
export const isPowerupId = (id, catalog = POWERUP_CATALOG) => typeof id === 'string' && !!getPowerup(id, catalog);
export const isOpponentPowerup = (id, catalog = POWERUP_CATALOG) => getPowerup(id, catalog)?.target === PowerupTargets.OPPONENT;
/** Power-up display name; unknown ids fall back to the id text. */
export const powerupName = (id, catalog = POWERUP_CATALOG) => getPowerup(id, catalog)?.name || String(id);

/** Aura values a ball can show in presence: '' for none, then every catalog id. */
export const auraIds = (catalog = POWERUP_CATALOG) => ['', ...powerupIds(catalog)];

/**
 * The entries a box can award for a session.
 * @param {{powerups?: boolean, solo?: boolean}} options powerups=false is the No Power-Ups mode (no boxes at all);
 *   solo (solo room, Practice, Putt Practice) keeps only entries flagged solo.
 */
export function spawnPool({ powerups = true, solo = false } = {}, catalog = POWERUP_CATALOG) {
  if (!powerups) return [];
  return catalog.filter(e => !solo || (e.solo && e.target === PowerupTargets.SELF));
}

/**
 * Weighted pick from a pool using the injected random source (0 <= r < 1).
 * Returns the entry id, or null for an empty pool.
 */
export function rollPowerup(pool, random) {
  if (!pool.length) return null;
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let r = random() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r < 0) return e.id;
  }
  return pool[pool.length - 1].id;
}
