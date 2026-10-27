# Renderer

Extracted from the legacy game's rendering section with identical scene construction, materials, shaders, actors and per-frame updates. The browser still runs the legacy embedded game until I1 integrates these modules.

## Using it

```js
import { createGameRenderer, createGameView } from './src/render/index.js';
import { createCourseData } from './src/courses/index.js';

const renderer = createGameRenderer({ THREE, canvas, random: Math.random, devicePixelRatio });
const view = createGameView({ renderer });          // renderer + camera rig, as the legacy draw() loop
const { definitions } = createCourseData();

view.setCourse(definitions[map], putt);              // builds the putt; the camera snaps on the next frame
const { events } = view.frame({
  now, dt, hazardTime,                               // ms, seconds, synchronized room seconds
  local: { x, y, z, vx, vy, moving, mode, color, effect, collected },
  remotes: [{ id, name, x, y, z, color, effect }],   // only players the session wants shown
  aim: { charge, angle, aimAngle, spread, reverse }, // or null when not charging
  free: mode === 'wait' || mode === 'spectator',
  keys,                                              // Set of held keys, lower case (free roam)
});
// events: 'free-roam-start' | 'free-roam-end' | 'transition-end' — the UI owns toasts and labels.
view.startPuttTransition({ previousHole, nextTee, now, reducedMotion }); // after setCourse() for the next putt
renderer.resize(containerWidth);                    // legacy fixed 1.6 aspect
view.dispose();
```

All inputs are plain simulation-space snapshots. The renderer never mutates simulation or session state, and it never reads globals: `THREE`, the canvas factory, randomness and the WebGL renderer factory are injected. `THREE` is the existing embedded r128 namespace; no Three.js dependency is added (the r128 upgrade is R2).

## Coordinates

`transform.js` is the only place simulation x/y/z become Three.js positions: world x = sim x + origin x, world y = sim z (+ `BALL_RADIUS` for ball centres), world z = sim y + origin y. It delegates to `src/shared/coords.js`. Course props are placed in course-local space inside a group positioned at the origin, exactly like the legacy `OFF()` group (always `[0, 0]`). Camera code works in world space.

## Ownership and disposal

- `createMaterialLibrary()` owns shared canvas textures, the sky, water and jump-pad materials and the shared time uniform.
- Each `buildCourseScene()` owns every geometry, material and texture it creates, including materials replaced by the cup-cutout clone. `setCourse()` disposes the previous build before adding the next, and shared library resources are never disposed by a course swap.
- Remote players keep one hidden actor per id (legacy behaviour). Renaming a player disposes the old label texture instead of leaking it.
- `renderer.dispose()` (or `view.dispose()`) releases the course, actors, environment and library resources and calls the WebGL renderer's `dispose()`. Calls after disposal throw.

## Verification

`npm run test:render` boots the legacy game and these modules in one jsdom window with the real embedded Three.js r128 and compares them:

- every putt of all 22 courses (52 builds): full scene graphs, geometry parameters and vertex data, material parameters, shader sources, uniform values, cup-cutout shader patches and the exact 2D canvas drawing commands of every texture;
- live frames in ball cam, hole view and world view with zoom/orbit input, a rolling and sinking ball (trail, spin, confetti), free-roam flight, a remote player (smoothing, teleport, rename, aura, shadow) and the putt-to-putt transition: camera position/orientation and the complete scene every frame;
- wall fading between camera and ball and around the camera; resource release across 44 course swaps and final disposal.

WebGL output is stubbed, so this is scene-level parity, not pixel parity. Real-browser rendering, GPU memory and performance are not verified here; the reference screenshots in `tests/fixtures/browser-baseline/` remain the visual baseline for I1/T1.

## Legacy behaviour preserved, and what was not ported

- The legacy follow camera built a wall-collision raycast that filtered on a material named `'brick'`. No material ever had that name, so it never moved the camera. The no-op is documented in `src/camera/rig.js` rather than ported; the terrain floor clamp is ported.
- `orbit` and `cinematic` camera branches were unreachable (the view cycle only contains follow, hole and strategic) and are not ported.
- The unused `?` block texture/material (`qTex`/`qMat`) is not ported; power-up blocks use the power-block shader, as before.
- Remote ball smoothing (`smoothRemotePosition`) is the legacy display interpolation. It is visual only and never feeds scoring or room state.
