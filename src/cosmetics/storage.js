import { DEFAULT_COSMETICS, normalizeCosmetics } from './catalog.js';

export const COSMETICS_KEY = 'pp_cosmetics';

/** Reads the saved selection. Storage can be missing, denied or hold junk, so any failure yields the defaults. */
export function loadCosmetics(storage) {
  try {
    const raw = storage?.getItem(COSMETICS_KEY);
    return raw ? normalizeCosmetics(JSON.parse(raw)) : normalizeCosmetics(DEFAULT_COSMETICS);
  } catch {
    return normalizeCosmetics(DEFAULT_COSMETICS);
  }
}

/** Saves a selection; returns whether it was stored. Storage can throw (private mode, quota). */
export function saveCosmetics(storage, selection) {
  try {
    storage.setItem(COSMETICS_KEY, JSON.stringify(normalizeCosmetics(selection)));
    return true;
  } catch {
    return false;
  }
}
