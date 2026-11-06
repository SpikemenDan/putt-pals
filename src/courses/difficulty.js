/**
 * SV1 course difficulty bands (task K1d, issue #100).
 *
 * Maps par-route solver measurements into standardized difficulty bands.
 * Difficulty rating for a putt = strokes + 1 - min(1, margin / maxMargin).
 * For a standard 6-putt course, rating is the sum across all 6 putts (range ~6.0 to 36.0).
 */

export const DIFFICULTY_BANDS = Object.freeze([
  Object.freeze({
    tier: 1,
    id: 'beginner',
    name: 'Beginner',
    minRating: 0,
    maxRating: 10.0,
    minPuttRating: 0,
    maxPuttRating: 1.67,
    description: 'Forgiving fairways and generous margins; predominantly single-stroke routes within par.',
  }),
  Object.freeze({
    tier: 2,
    id: 'intermediate',
    name: 'Intermediate',
    minRating: 10.0,
    maxRating: 14.0,
    minPuttRating: 1.67,
    maxPuttRating: 2.33,
    description: 'Moderate hazard placement and tactical multi-stroke routes; balanced challenge within par.',
  }),
  Object.freeze({
    tier: 3,
    id: 'advanced',
    name: 'Advanced',
    minRating: 14.0,
    maxRating: 18.0,
    minPuttRating: 2.33,
    maxPuttRating: 3.0,
    description: 'Elevated 3D tiers, curved banking ramps, and floating island gaps requiring precise multi-stroke play.',
  }),
  Object.freeze({
    tier: 4,
    id: 'expert',
    name: 'Expert',
    minRating: 18.0,
    maxRating: Infinity,
    minPuttRating: 3.0,
    maxPuttRating: Infinity,
    description: 'Intricate multi-tier drops, transport tube flings, and high-precision speed control across void gaps.',
  }),
]);

/**
 * Resolves the difficulty band for a given course rating and putt count.
 * @param {number} rating Total difficulty rating
 * @param {number} [puttCount=6] Number of putts in the course
 * @returns {typeof DIFFICULTY_BANDS[number]}
 */
export function getDifficultyBand(rating, puttCount = 6) {
  if (!Number.isFinite(rating)) throw new TypeError('Rating must be a finite number');
  const count = Number.isInteger(puttCount) && puttCount > 0 ? puttCount : 6;
  const normalized = (rating / count) * 6;
  for (const band of DIFFICULTY_BANDS) {
    if (normalized <= band.maxRating) return band;
  }
  return DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1];
}
