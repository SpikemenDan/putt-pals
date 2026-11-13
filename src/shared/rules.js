/**
 * Custom rules (VIS-U #168): the player-facing gameplay rules a Solo game or a Party room is created with.
 *
 * Rules are a small, flat, validated record that sits over the shipped tuning (src/shared/tuning.js): every rule
 * has one default here that reproduces today's game exactly, and `rulesTuning` turns a rule set into a validated
 * tuning object. A room fixes its rules when it is created, every participant simulates with the same values, and
 * nothing changes them mid-match (the lobby No power-ups toggle, before a match, is the one existing exception).
 *
 * Only player-safe gameplay settings belong here. Never add secrets, authentication, server policy or quotas.
 * Each rule records the category it is shown under, so the editor can list them (layout A) or tab them later.
 */

import { MAX_TIMEOUT_SECONDS, MIN_TIMEOUT_SECONDS } from './constants.js';
import { createTuning, DEFAULT_TUNING, TUNING } from './tuning.js';
import { worldGravity } from './worlds.js';

export const RULE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'worlds', label: 'Worlds', help: 'How hard each planet pulls your ball. Lower is floatier.' }),
  Object.freeze({ id: 'shots', label: 'Shots', help: 'How hard and how straight you hit.' }),
  Object.freeze({ id: 'match', label: 'Match', help: 'Power-ups, the clock and scoring.' }),
]);

/** Aim sway as a multiple of the shipped spread; 'normal' is today's game. */
export const AIM_WOBBLE = Object.freeze({ off: 0, low: 0.5, normal: 1, high: 1.6 });

const slider = (id, category, label, help, min, max, step, value, unit) => Object.freeze({ id, category, kind: 'slider', label, help, min, max, step, default: value, unit });
const select = (id, category, label, help, options, value) => Object.freeze({ id, category, kind: 'select', label, help, options: Object.freeze(options.map(o => Object.freeze(o))), default: value });
const number = (id, category, label, help, min, max, value, warnAbove, warning) => Object.freeze({ id, category, kind: 'number', label, help, min, max, step: 1, default: value, warnAbove, warning });
const toggle = (id, category, label, help, value) => Object.freeze({ id, category, kind: 'toggle', label, help, default: value });

/** Most maps one game may last (the room contracts bound completed maps by this). */
export const MAX_SERIES_MAPS = 20;
/** Above this many maps the editor warns that the game may run long (owner, 2026-11-13). */
export const LONG_SERIES_MAPS = 10;

/** Hole timer choices: 0 keeps each putt's own course limit; the rest are fixed limits inside the room contract's range. */
const HOLE_TIMERS = [0, 120, 180, 300, 600].filter(s => s === 0 || (s >= MIN_TIMEOUT_SECONDS && s <= MAX_TIMEOUT_SECONDS));

/** Rule specs, in display order. Units: '%' is a percentage of the shipped value; 'strokes' are whole strokes. */
export const CUSTOM_RULES = Object.freeze([
  slider('gaiaGravity', 'worlds', 'Gaia gravity', 'Pull on Gaia, as a share of standard.', 50, 200, 5, 100, '%'),
  slider('aresGravity', 'worlds', 'Ares gravity', 'Pull on Ares, as a share of its standard.', 50, 200, 5, 100, '%'),
  slider('lunaGravity', 'worlds', 'Luna gravity', 'Pull on Luna, as a share of its standard.', 50, 200, 5, 100, '%'),
  slider('shotPower', 'shots', 'Shot power', 'How fast a full-power putt leaves.', 50, 150, 5, 100, '%'),
  select('aimWobble', 'shots', 'Aim wobble', 'How far the aim arrow sways on hard shots.',
    [{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }], 'normal'),
  toggle('powerups', 'match', 'Power-ups', 'Item boxes and power-ups. Off is pure mini golf.', true),
  select('holeTimer', 'match', 'Hole timer', 'Time allowed for each hole.',
    HOLE_TIMERS.map(s => ({ value: s, label: s === 0 ? 'Course' : s / 60 + ' min' })), 0),
  number('maps', 'match', 'Maps to play', 'How many maps one game lasts. Leave it blank to use the lobby mode (1, 3, 5 or 7).', 0, MAX_SERIES_MAPS, 0,
    LONG_SERIES_MAPS, 'That many maps might make the game too long.'),
  slider('missedHolePenalty', 'match', 'Missed hole', 'Extra strokes on top of the maximum for a hole you miss.', 0, 5, 1, DEFAULT_TUNING.scoring.missedHolePenalty, 'strokes'),
]);

export const RULE_IDS = Object.freeze(CUSTOM_RULES.map(r => r.id));
const spec = Object.fromEntries(CUSTOM_RULES.map(r => [r.id, r]));

/** The standard rules: exactly today's game. */
export const DEFAULT_RULES = Object.freeze(Object.fromEntries(CUSTOM_RULES.map(r => [r.id, r.default])));

const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Whether one value is allowed for a rule. */
export function validRuleValue(id, value) {
  const r = Object.hasOwn(spec, id) ? spec[id] : null;
  if (!r) return false;
  if (r.kind === 'toggle') return typeof value === 'boolean';
  if (r.kind === 'select') return r.options.some(o => o.value === value);
  return Number.isSafeInteger(value) && value >= r.min && value <= r.max && (value - r.min) % r.step === 0;
}

/** Problems with a complete rule set (empty when valid). Missing and unknown fields are errors. */
export function rulesProblems(rules) {
  if (!record(rules)) return ['rules must be an object'];
  const problems = Object.keys(rules).filter(k => !RULE_IDS.includes(k)).map(k => 'unknown rule ' + k);
  for (const id of RULE_IDS) {
    if (!Object.hasOwn(rules, id)) problems.push(id + ' is missing');
    else if (!validRuleValue(id, rules[id])) problems.push(id + ' has an invalid value');
  }
  return problems;
}

export const validRules = rules => rulesProblems(rules).length === 0;

/** A frozen copy of a complete, valid rule set; throws listing every problem. Use at every boundary. */
export function validateRules(rules) {
  const problems = rulesProblems(rules);
  if (problems.length) throw new Error('Invalid rules: ' + problems.join('; '));
  return Object.freeze(Object.fromEntries(RULE_IDS.map(id => [id, rules[id]])));
}

/** Standard rules with valid entries of a partial or stale record applied (for stored editor drafts); invalid entries are dropped. */
export function rulesFromPartial(partial) {
  const out = { ...DEFAULT_RULES };
  if (record(partial)) for (const id of RULE_IDS) if (Object.hasOwn(partial, id) && validRuleValue(id, partial[id])) out[id] = partial[id];
  return Object.freeze(out);
}

/** Ids of rules that differ from standard, in display order. */
export const changedRules = rules => RULE_IDS.filter(id => rules[id] !== DEFAULT_RULES[id]);
export const isStandardRules = rules => changedRules(rules).length === 0;

/** Player-facing text for a rule's value, e.g. "120%", "+2 strokes", "3 min", "Off". */
export function ruleValueText(id, value) {
  const r = spec[id];
  if (r.kind === 'toggle') return value ? 'On' : 'Off';
  if (r.kind === 'select') return r.options.find(o => o.value === value)?.label ?? String(value);
  if (r.kind === 'number') return value === 0 ? 'Lobby' : value + (value === 1 ? ' map' : ' maps');
  return r.unit === '%' ? value + '%' : '+' + value + ' ' + (value === 1 ? 'stroke' : 'strokes');
}

const scale = (value, percent) => Math.round(value * percent) / 100;

/**
 * Validated, frozen tuning for a rule set. Standard rules return the shipped TUNING object itself, so a standard
 * game is the same game, bit for bit. Gravity scales each world's shipped value; aim wobble scales the sway spread.
 */
export function rulesTuning(rules) {
  const r = validateRules(rules);
  if (isStandardRules(r)) return TUNING;
  const wobble = AIM_WOBBLE[r.aimWobble];
  return createTuning({
    gravity: scale(DEFAULT_TUNING.gravity, r.gaiaGravity),
    worlds: { ares: { gravity: scale(DEFAULT_TUNING.worlds.ares.gravity, r.aresGravity) }, luna: { gravity: scale(DEFAULT_TUNING.worlds.luna.gravity, r.lunaGravity) } },
    shotPower: scale(DEFAULT_TUNING.shotPower, r.shotPower),
    aim: { spreadBase: DEFAULT_TUNING.aim.spreadBase * wobble, spreadGain: DEFAULT_TUNING.aim.spreadGain * wobble },
    scoring: { missedHolePenalty: r.missedHolePenalty },
  });
}

/** Gravity (units/s^2) for a world under a rule set. */
export const ruleGravity = (rules, worldId) => worldGravity(worldId, rulesTuning(rules));

const MODE_MAPS = Object.freeze({ standard: 1, tournament_3: 3, tournament_5: 5, tournament_7: 7 });

/**
 * Maps in one game for a lobby mode under a rule set: the Maps to play rule when it is set (standard and tournament
 * modes only), otherwise the mode's own length. Practice and Putt Pong are always one map.
 */
export function seriesMaps(mode, rules) {
  if (!Object.hasOwn(MODE_MAPS, mode)) return 1;
  return validRules(rules) && rules.maps > 0 ? rules.maps : MODE_MAPS[mode];
}

/** Time limit (seconds) for a putt under a rule set: the fixed hole timer, or the putt's own course limit. */
export const holeLimitSeconds = (rules, courseLimitSeconds) => rules.holeTimer || courseLimitSeconds;
