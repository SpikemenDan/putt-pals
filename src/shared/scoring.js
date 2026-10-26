/**
 * Pure scoring and scorecard calculation functions.
 * Encapsulates the tournament, standard, and timeout scoring rules.
 */

import { MAX_SCORE, DEFAULT_PAR, DEFAULT_PENALTY } from './constants.js';

/**
 * Calculates timeout score for an unfinished putt.
 * Formula (P26 baseline): Math.max(strokesTaken, par + penalty).
 *
 * @param {number} strokes Strokes taken before timeout
 * @param {number} [par=DEFAULT_PAR] Putt par
 * @param {number} [penalty=DEFAULT_PENALTY] Timeout penalty
 * @returns {number} Final recorded score for the putt
 */
export function calculateTimeoutScore(strokes, par = DEFAULT_PAR, penalty = DEFAULT_PENALTY) {
  const finiteOr = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback);
  const safeStrokes = Math.max(0, Math.min(MAX_SCORE, finiteOr(strokes, 0)));
  const safePar = Math.max(1, finiteOr(par, DEFAULT_PAR));
  // A penalty of 0 is valid (courses allow 0..10), so only fall back when missing or non-numeric.
  const safePenalty = Math.max(0, finiteOr(penalty, DEFAULT_PENALTY));
  return Math.min(MAX_SCORE, Math.max(safeStrokes, safePar + safePenalty));
}

/**
 * Validates whether a score entry represents a timeout.
 * @param {number|string} scoreEntry
 * @returns {boolean}
 */
export function isTimeoutScore(scoreEntry) {
  return typeof scoreEntry === 'string' && scoreEntry.endsWith('*');
}

/**
 * Formats a score entry for the scorecard UI.
 * e.g., 1 -> "1", or timeout 5 with par 2 + pen 3 -> "2+3*"
 *
 * @param {number} score Recorded numerical score
 * @param {boolean} timedOut Whether this was scored via timeout
 * @param {number} par Putt par
 * @param {number} penalty Timeout penalty
 * @returns {string} Formatted scorecard string
 */
export function formatScoreEntry(score, timedOut, par, penalty) {
  if (timedOut) {
    return `${par}+${penalty}*`;
  }
  return String(score);
}

/**
 * Calculates a player's scorecard summary.
 *
 * @param {Array<{ strokes: number, timedOut: boolean, par: number }>} holes
 * @returns {{
 *   totalStrokes: number,
 *   totalPar: number,
 *   relativeToPar: number,
 *   relativeFormatted: string,
 *   holeInOnes: number,
 *   timeouts: number,
 *   completedHoles: number
 * }}
 */
export function summarizeScorecard(holes) {
  let totalStrokes = 0;
  let totalPar = 0;
  let holeInOnes = 0;
  let timeouts = 0;
  let completedHoles = 0;

  for (const hole of holes) {
    if (!hole || hole.strokes == null) continue;
    completedHoles++;
    totalStrokes += hole.strokes;
    totalPar += hole.par;
    if (hole.timedOut) {
      timeouts++;
    } else if (hole.strokes === 1) {
      holeInOnes++;
    }
  }

  const relativeToPar = totalStrokes - totalPar;
  let relativeFormatted = 'E';
  if (relativeToPar > 0) relativeFormatted = `+${relativeToPar}`;
  else if (relativeToPar < 0) relativeFormatted = `${relativeToPar}`;

  return {
    totalStrokes,
    totalPar,
    relativeToPar,
    relativeFormatted,
    holeInOnes,
    timeouts,
    completedHoles,
  };
}

/**
 * Ranks a list of players by total score (lowest strokes first).
 *
 * @param {Array<{ id: string, name: string, totalStrokes: number, holeInOnes: number }>} players
 * @returns {Array<{ id: string, name: string, totalStrokes: number, rank: number, isLeader: boolean }>}
 */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => {
    if (a.totalStrokes !== b.totalStrokes) return a.totalStrokes - b.totalStrokes;
    // Tie-break: more hole-in-ones ranks higher
    if (b.holeInOnes !== a.holeInOnes) return b.holeInOnes - a.holeInOnes;
    return a.name.localeCompare(b.name);
  });

  const lowestScore = sorted[0]?.totalStrokes ?? 0;
  return sorted.map((p, idx) => ({
    ...p,
    rank: idx + 1,
    isLeader: p.totalStrokes === lowestScore,
  }));
}
