/**
 * Loading-screen tips (M1c): short, original, text-only hints about mechanics that exist today.
 * Plain data so a tip can be added or fixed without touching components; keep each under ~110 characters.
 */
export const TIPS = Object.freeze([
  'Shorter pulls are more accurate. Long pulls add power and widen the sway.',
  'The arrow sways side to side. Release as it crosses the centre for a perfectly straight shot.',
  'Press Esc while pulling back to cancel a putt without using a stroke.',
  'Sand drags the ball to a crawl, ice is slippery and slime is sticky. Plan your power for each.',
  'Jump pads launch the ball into the air. Aim for the landing, not the pad.',
  'Teleporters come in pairs: the ball leaves from the other one with the same speed.',
  'Fans and tornadoes push the ball around. Wait out a gust or use it to your advantage.',
  'Water sends the ball back to where you last putted, so play the safe line.',
  'Collect ? blocks for power-ups, then use them with keys 1 to 3.',
  'Hole Magnet pulls the ball toward a nearby cup. Steady Aim holds the sway still for one shot.',
  'Right-drag or use the arrow keys to rotate the camera. Press C to switch views.',
  'Press K to open the scorecard and see how everyone is doing.',
  'Everyone plays the same hole at once, and the next hole starts when all players finish.',
  'Run out of time and your hole scores par plus the penalty, so keep the ball moving.',
]);

/** Milliseconds each tip stays on screen. */
export const TIP_MS = 5000;

/** Tip index after `step` rotations from `start`; always in range. */
export const tipAt = (start, step) => ((start + step) % TIPS.length + TIPS.length) % TIPS.length;
