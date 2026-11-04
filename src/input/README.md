# Desktop input

`createInputAdapter()` ports the legacy pointer and keyboard listeners with identical conditions, thresholds and ordering. Game and UI actions leave as typed commands; camera manipulation calls the camera rig (`src/camera`) directly, since the rig owns view state.

```js
import { createInputAdapter } from './src/input/index.js';

const input = createInputAdapter({
  canvas,                       // pointer, wheel and context-menu target
  camera: rig,                  // createCameraRig() from src/camera
  pickGround: (x, y) => worldPointOnBallPlane(x, y),   // legacy planePoint(): {x, z} or null
  getState: () => ({ active, mode, moving, connected, transitioning: rig.transitioning, steady }),
  dispatch,                     // same dispatcher the UI uses (createUiDispatcher)
});
input.setAimAngle(angleToHole);               // start of each putt (legacy aim())
const aim = input.frameAim(now / 1000);       // per frame: aim guide for the renderer, or null
view.frame({ ..., aim, keys: input.keys });   // held keys drive free roam
input.cancel();                               // room/phase changes
input.dispose();                              // removes every listener
```

| Command | Source |
| --- | --- |
| `{ type: 'shot', angle, power }` | Release after a pull with charge > 0.025 while playing, not moving, connected and not transitioning. `angle` already includes the sway shown on the last drawn frame. |
| `cycle-camera`, `toggle-card`, `close-card`, `use-item` (`index`), `toggle-sound` | C, K, Escape, 1–3, M (ignored while typing in text fields) |
| `user-gesture` | Any pointer, key, click or touch, so the audio adapter can unlock |

Preserved details: short pulls, Escape, pointer cancel, lost capture and window blur cancel without shooting; the guide appears above charge 0.015 and the release reuses the guide's last sway time (what you see is what you shoot); power is linear in the pull from zero; full power is a 380 px pull or 60% of the canvas width (whichever is smaller); right-drag orbits in ball/world views and rotates the aim in hole view (legacy quirk: the whole drag distance is added on every move); arrows orbit in ball view and rotate the aim in other views; wheel zooms (and prevents page scroll); free roam uses held WASD/QE/Shift/Space/arrows, look drag and wheel dolly.

`subscribeAim()` reports charge changes for the power meter so per-frame values stay out of React state. `aim.js` holds the shared aim rules (`spread`, `sway`, `shotAngle`, `chargeFromDrag`, `accuracyText`).

`npm run test:input` runs the legacy game and this adapter in one jsdom window, sending identical pointer events to each canvas and shared keyboard events. Seven drags covering power, direction, sway phase and Steady Aim produce shots identical to legacy launches bit for bit. The guide direction matches the legacy guide dots, and camera angles track the legacy camera. The test also covers cancel and guard paths, shortcuts, text-field filtering, free roam and removal of every listener on dispose. Real-browser input is not claimed by this suite.

## U2 preview and tuning

Run `npm run dev` and open `/tests/fixtures/aim/preview.html`. This isolated
chamber uses production input, simulation and rendering. Drag to inspect power
and arrow length, release to putt, Escape to cancel, and C to cycle the camera.
Sliders adjust full-power launch speed (units/s), full-pull distance (CSS pixels), canvas-width fraction, arrow
length, shaft/head widths, head length and opacity. Units, ranges, defaults and
current values are shown. Power-mapping changes reset the ball and cancel the
current pull; presentation changes apply live. Import validates every setting
before applying any; Export includes only temporary overrides. Reset restores
shipped defaults. The chamber is development-only and never connects to a room.

The optional input-adapter `aimSettings` port controls only `fullPullPx` and
`canvasPullFraction`; normal application input still uses authoritative TUNING
defaults. `display` remains the existing validated presentation port. The
approved U2 retune sets full-power launch speed to 600 units/s and caps the
full-pull distance at 18% of canvas width (still limited by `fullPullPx`). The
preview starts from these same authoritative defaults.
