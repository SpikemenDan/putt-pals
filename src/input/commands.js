/**
 * Typed commands produced by desktop input. The application handles them;
 * the input adapter never mutates simulation, session or UI state itself.
 * The UI dispatches the same command objects from its buttons, so one handler
 * serves both keyboard shortcuts and clicks.
 */
export const InputCommands = Object.freeze({
  /** { type, angle, power } — release of a charged shot; angle includes sway. */
  SHOT: 'shot',
  /** { type } — Ball cam → Hole view → World view (C key or the View button). */
  CYCLE_CAMERA: 'cycle-camera',
  /** { type } — open/close the paper scorecard (K key or the Card button). */
  TOGGLE_CARD: 'toggle-card',
  /** { type } — Escape closes the scorecard. */
  CLOSE_CARD: 'close-card',
  /** { type, index } — power-up slot 0..2 (keys 1–3 or inventory buttons). */
  USE_ITEM: 'use-item',
  /** { type } — M key or the Sound button. */
  TOGGLE_SOUND: 'toggle-sound',
  /** { type } — any pointer/key/click/touch; lets the audio adapter unlock on a user gesture. */
  USER_GESTURE: 'user-gesture',
});
