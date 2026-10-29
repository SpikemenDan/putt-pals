import { TUNING } from '../shared/tuning.js';

const AIM = TUNING.aim;

/**
 * Shot aiming rules, ported verbatim from the legacy game.
 *
 * Deterministic sway: one fixed-frequency sine whose amplitude is spread(power).
 * The offset is exactly 0 at every zero crossing, so releasing there gives a
 * perfectly centred shot at any power. No randomness anywhere.
 */

/** Seconds per sway cycle. */
export const SWAY_PERIOD = AIM.swayPeriod;
export const SWAY_W = 2 * Math.PI / SWAY_PERIOD;
/** Below this charge no aim guide is drawn (and the sway time is not refreshed). */
export const GUIDE_MIN_CHARGE = AIM.guideMinCharge;
/** Below this charge a release cancels instead of shooting. */
export const SHOT_MIN_CHARGE = AIM.shotMinCharge;
/**
 * Pull distance (CSS px) for full power, capped by FULL_PULL_CANVAS_FRACTION of the canvas width.
 * Power is linear in the pull from zero (U2): twice the pull, twice the arrow, twice the power.
 */
export const FULL_PULL_PX = AIM.fullPullPx;
export const FULL_PULL_CANVAS_FRACTION = AIM.canvasPullFraction;
/** World-unit length of the aim arrow at full power; the arrow is charge * this, with no minimum. */
export const AIM_ARROW_MAX_LENGTH = AIM.arrowMaxLength;
/** Arrow keys and non-orbit drags rotate aim by this many radians per step/pixel factor. */
export const AIM_STEP = AIM.keyStep;
export const DRAG_RADIANS_PER_PX = AIM.dragRadiansPerPx;

/** Angular spread (radians) at a power 0..1. */
export function spread(power) { return AIM.spreadBase + AIM.spreadGain * Math.pow(power, AIM.spreadExponent); }

/** Sway offset (radians) at a power and a time in seconds. */
export function sway(power, time) { return spread(power) * Math.sin(time * SWAY_W); }

/**
 * Direction the ball actually leaves in.
 * @param {{aimAngle:number, charge:number, time:number, reverse?:boolean, steady?:boolean}} input
 *   time is the sway time last shown on screen, so what you see is what you shoot.
 */
export function shotAngle({ aimAngle, charge, time, reverse = false, steady = false }) {
  return aimAngle + (reverse ? Math.PI : 0) + (steady ? 0 : sway(charge, time));
}

/** Charge 0..1 from a pointer drag distance in CSS pixels. */
export function chargeFromDrag(dx, dy, canvasWidth) {
  return Math.min(1, Math.hypot(dx, dy) / Math.min(FULL_PULL_PX, canvasWidth * FULL_PULL_CANVAS_FRACTION));
}

/** The power meter caption. */
export function accuracyText(charging, charge) {
  return charging ? Math.round(charge * 100) + '% power · ±' + (spread(charge) * 180 / Math.PI).toFixed(1) + '° spread' : 'Pull to set power';
}
