/**
 * Player ball colours (Putt Planet, #161). Presentation data shared by the renderer, UI and room contracts. It lives
 * outside constants.js so that palette edits stay out of the simulation fingerprint (src/simulation imports constants.js).
 */

// Player colour palette (Putt Planet, #161). 30 colours: the seven rainbow families in standard, light and dark
// shades (21), plus white, black, gray, brown, pink, teal, cyan, gold and silver. A player's colour is an index
// into this list. Indexes 0-7 are the original eight ball colours in their original order, so default join-order
// colours and recorded fixtures are unchanged; the order is part of the wire contract and must only be appended to.
// Colours are unique within a room.
const COLOR_DEFS = Object.freeze([
  ['Pink', '#ff4fb8'], ['Blue', '#3e8ef7'], ['Orange', '#f5a623'], ['Violet', '#8e4ec6'], ['Teal', '#12a594'],
  ['Red', '#e5484d'], ['Green', '#99d52a'], ['White', '#e8e8e8'], ['Yellow', '#ffd23f'], ['Indigo', '#4b45d6'],
  ['Light red', '#ff8a8f'], ['Light orange', '#ffc870'], ['Light yellow', '#fff08a'], ['Light green', '#c4ec7a'],
  ['Light blue', '#8ec5ff'], ['Light indigo', '#8f8cff'], ['Light violet', '#c79bf2'],
  ['Dark red', '#a82a30'], ['Dark orange', '#b8700f'], ['Dark yellow', '#c9a000'], ['Dark green', '#5f8f12'],
  ['Dark blue', '#1f5bb5'], ['Dark indigo', '#2e2a8f'], ['Dark violet', '#5c2a8a'],
  ['Black', '#1d1d1f'], ['Gray', '#8a8f98'], ['Brown', '#8b5a2b'], ['Cyan', '#25d1e6'], ['Gold', '#e6b422'], ['Silver', '#c4c9d1'],
].map(([name, hex]) => Object.freeze({ name, hex })));
export const PLAYER_COLORS = Object.freeze(COLOR_DEFS.map(c => c.hex));
export const PLAYER_COLOR_NAMES = Object.freeze(COLOR_DEFS.map(c => c.name));
export const PLAYER_COLOR_COUNT = PLAYER_COLORS.length;
/** True for a valid palette index. */
export const isColorIndex = n => Number.isInteger(n) && n >= 0 && n < PLAYER_COLOR_COUNT;
/** Hex colour for a palette index; out-of-range or non-integer values wrap so a renderer never gets undefined. */
export const colorHex = n => PLAYER_COLORS[((Number.isInteger(n) ? n : 0) % PLAYER_COLOR_COUNT + PLAYER_COLOR_COUNT) % PLAYER_COLOR_COUNT];
