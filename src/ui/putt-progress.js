/**
 * Progress of the loading-screen putt (VIS-M1): the ball rolls from the left end of the green toward the cup. Real load time is not
 * known, so while the room opens the ball eases toward `cap` (never reaching it); `finish()` is called when the game is ready and
 * the ball then rolls the rest of the way to the cup over `display.loading.finishTime` seconds. `value` runs 0..1; 1 means the ball
 * is in, and the screen may close. Plain state with no timers, so it is driven by whoever owns the animation frame.
 */
export function createPuttProgress(display, { tau = 3.2, cap = 0.88 } = {}) {
  let value = 0, elapsed = 0, finishing = false, from = 0, fraction = 0;
  return {
    get value() { return value; },
    get finishing() { return finishing; },
    get done() { return finishing && fraction >= 1; },
    /** The game is ready: roll out the remaining distance. Safe to call more than once. */
    finish() { if (!finishing) { finishing = true; from = value; fraction = 0; } },
    /** Advances by `dt` seconds and returns the new value. */
    step(dt) {
      if (!finishing) {
        elapsed += dt;
        value = Math.max(value, cap * (1 - Math.exp(-elapsed / tau)));
      } else {
        fraction = Math.min(1, fraction + dt / display.loading.finishTime);
        value = fraction >= 1 ? 1 : from + (1 - from) * (1 - (1 - fraction) ** 2);
      }
      return value;
    },
  };
}
