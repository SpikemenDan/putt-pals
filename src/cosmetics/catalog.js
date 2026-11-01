/**
 * Cosmetics catalog (F1): ball skins, trail skins and hole-in-one celebrations as plain data.
 * The renderer applies these records; they never reach the simulation, so physics is identical
 * whatever is selected. A choice is always a catalog id: unknown ids fall back to the default,
 * and no peer-supplied content is ever rendered.
 */

const frozen = records => Object.freeze(records.map(Object.freeze));

/** Ball finish: a faint self-lit glow over the player's colour. */
export const BALL_SKINS = frozen([
  { id: 'classic', name: 'Classic', emissive: 0x000000, emissiveIntensity: 0 },
  { id: 'glow', name: 'Glow', emissive: 0xffffff, emissiveIntensity: 0.35 },
  { id: 'ember', name: 'Ember', emissive: 0xff5a1f, emissiveIntensity: 0.45 },
  { id: 'frost', name: 'Frost', emissive: 0x7fe3ff, emissiveIntensity: 0.4 },
]);

/** Trail: `color` is 'player', 'rainbow' or a hex; `size` scales the points. */
export const TRAIL_SKINS = frozen([
  { id: 'classic', name: 'Classic', color: 'player', size: 1 },
  { id: 'rainbow', name: 'Rainbow', color: 'rainbow', size: 1 },
  { id: 'sparks', name: 'Comic sparks', color: 0xffd23f, size: 0.7 },
  { id: 'comet', name: 'Comet', color: 0xffffff, size: 1.5 },
]);

/** Celebration burst: confetti `palette`, `speed` and `lift` scale the launch, `lifetime` is seconds. */
export const CELEBRATIONS = frozen([
  { id: 'confetti', name: 'Confetti', palette: Object.freeze([0xff7ac8, 0xffd23f, 0x7fe3ff, 0xb8f0a2, 0xc9a8ff, 0xffffff]), speed: 1, lift: 1, lifetime: 2.4 },
  { id: 'gold', name: 'Gold rush', palette: Object.freeze([0xffd23f, 0xffe98a, 0xffb000, 0xffffff]), speed: 0.8, lift: 1.3, lifetime: 3 },
  { id: 'fireworks', name: 'Fireworks', palette: Object.freeze([0xff3b3b, 0x7fe3ff, 0xffffff, 0xb8f0a2]), speed: 1.7, lift: 1.1, lifetime: 2.4 },
  { id: 'mint', name: 'Mint burst', palette: Object.freeze([0xb8f0a2, 0x7fe3ff, 0xffffff]), speed: 1, lift: 0.8, lifetime: 2 },
]);

export const COSMETIC_KINDS = Object.freeze({ ball: BALL_SKINS, trail: TRAIL_SKINS, celebration: CELEBRATIONS });

/** The first record of each kind is its default. */
export const DEFAULT_COSMETICS = Object.freeze({ ball: BALL_SKINS[0].id, trail: TRAIL_SKINS[0].id, celebration: CELEBRATIONS[0].id });

export const isCosmeticId = (kind, id) => Object.hasOwn(COSMETIC_KINDS, kind) && COSMETIC_KINDS[kind].some(record => record.id === id);

/** The catalog record for an id, or the kind's default record when the id is unknown. */
export function cosmeticRecord(kind, id) {
  const records = COSMETIC_KINDS[kind];
  return records.find(record => record.id === id) ?? records[0];
}

/** A complete selection from untrusted input (storage, messages): every unknown or missing id becomes its default. */
export function normalizeCosmetics(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const kind of Object.keys(COSMETIC_KINDS)) out[kind] = isCosmeticId(kind, source[kind]) ? source[kind] : DEFAULT_COSMETICS[kind];
  return Object.freeze(out);
}

/** The selection with one kind changed; an unknown kind or id leaves it as it was. */
export function selectCosmetic(selection, kind, id) {
  const current = normalizeCosmetics(selection);
  return isCosmeticId(kind, id) ? Object.freeze({ ...current, [kind]: id }) : current;
}

/** Hex colour cycling the hue with time in seconds (rainbow trail). Pure, so tests need no WebGL. */
export function rainbowHex(time) {
  const h = ((time * 0.6) % 1 + 1) % 1 * 6, x = 1 - Math.abs(h % 2 - 1);
  const [r, g, b] = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][Math.floor(h) % 6];
  const channel = v => Math.round((0.35 + 0.65 * v) * 255);
  return (channel(r) << 16) | (channel(g) << 8) | channel(b);
}
