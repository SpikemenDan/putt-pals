# Renderer

The modular app uses the pinned Three.js 0.186.1 renderer. Course object layout, camera behavior and gameplay remain extracted from the legacy game; modern color management, lighting and shader output are handled explicitly. The default look is the V1a toon style, while `style: 'legacy'` exists solely for historical r128 parity.

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
  aim: { charge, angle, aimAngle, spread, length }, // or null when not charging
  free: mode === 'wait' || mode === 'spectator',
  keys,                                              // Set of held keys, lower case (free roam)
});
// events: 'free-roam-start' | 'free-roam-end' | 'transition-end' — the UI owns toasts and labels.
view.startPuttTransition({ previousHole, nextTee, now, reducedMotion }); // after setCourse() for the next putt
renderer.resize(containerWidth);                    // legacy fixed 1.6 aspect
view.dispose();
```

All inputs are plain simulation-space snapshots. The renderer never mutates simulation or session state, and it never reads globals: `THREE`, the canvas factory, randomness and the WebGL renderer factory are injected. The app injects the npm Three.js namespace. Narrow r128 branches exist only to keep the historical scene-parity tests runnable; they are not a second browser renderer or a promise to support arbitrary old releases. Current Three.js requires WebGL2; the app's existing unavailable-3D notice handles unsupported desktops.

## Coordinates

`transform.js` is the only place simulation x/y/z become Three.js positions: world x = sim x + origin x, world y = sim z (+ `BALL_RADIUS` for ball centres), world z = sim y + origin y. It delegates to `src/shared/coords.js`. Course props are placed in course-local space inside a group positioned at the origin, exactly like the legacy `OFF()` group (always `[0, 0]`). Camera code works in world space.

## Ownership and disposal

- `createMaterialLibrary()` owns shared canvas textures, the sky, water and jump-pad materials and the shared time uniform.
- `library.ink.{solid,planar,overlay}` are shared library materials; per-build cup ink materials and hull geometries are owned and disposed by the build; actor hulls are disposed with their ball.
- Each `buildCourseScene()` owns every geometry, material and texture it creates, including materials replaced by the cup-cutout clone. `setCourse()` disposes the previous build before adding the next, and shared library resources are never disposed by a course swap.
- Remote players keep one hidden actor per id (legacy behaviour). Renaming a player disposes the old label texture instead of leaking it.
- Environment lighting owns the PMREM render target (including its framebuffer), not just its texture. Generator and temporary geometry cleanup also runs on failed PMREM generation. The directional shadow target is released at final disposal.
- `renderer.diagnostics()` returns detached geometry/texture/program/draw counters for profiling. It exposes no WebGL objects.
- `renderer.dispose()` (or `view.dispose()`) releases the course, actors, environment and library resources and calls the WebGL renderer's `dispose()`. Calls after disposal throw.

## Verification

`npm run test:render` first boots the legacy game and these modules in one jsdom window with the real embedded Three.js r128 and compares them:

- every putt of all 22 courses (52 builds): full scene graphs, geometry parameters and vertex data, material parameters, shader sources, uniform values, cup-cutout shader patches and the exact 2D canvas drawing commands of every texture;
- live frames in ball cam, hole view and world view with zoom/orbit input, a rolling and sinking ball (trail, spin, confetti), free-roam flight, a remote player (smoothing, teleport, rename, aura, shadow) and the putt-to-putt transition: camera position/orientation and the complete scene every frame;
- wall fading between camera and ball and around the camera; resource release across 44 course swaps and final disposal.

The second suite uses the installed Three.js package: all 52 putt builds, finite vertices, current cup-shader hooks, output/texture color spaces, light scaling and resource disposal. Both suites stub WebGL. Real Chrome profiling and screenshots use `tests/render/probe.html` and `tests/render/profile.cjs`; see `docs/reviews/R2_RENDERER.md` for commands, evidence and limits. B1 screenshots remain a geometry/camera reference; exact pastel colors are not R2 acceptance. `tests/render-modern.test.cjs` covers the toon style (no textures, chained cup patch, ink on every solid, faded walls drop ink, no trees/ground/dream shapes) and checks that every course's toon build has the same object layout as the legacy build, minus trees, plus ink hulls; `tests/render.test.cjs` and the r128 topology check in `tests/app.test.cjs` pin style 'legacy'.

## Toon style (V1a #58)

- `createGameRenderer()` and `createMaterialLibrary()` take a new option `style`: `'toon'` (default) or `'legacy'`. `'legacy'` keeps the old textured materials, landscape trees, ground plane, floating dream shapes, PMREM environment map and ACES tone mapping so historical parity tests keep running.
- Toon style renders every course surface in one flat color from `TOON_PALETTE` in `materials.js` (no image textures). Lit surfaces use `library.toon(color, overrides)`: a `MeshLambertMaterial` with an `onBeforeCompile` patch posterizing light into three flat bands (cast shadows kept) with screen-space halftone dots in the two darker bands.
- Toon lighting uses white lights, `NoToneMapping`, no PMREM environment map, and omits ground planes, dream shapes, and landscape trees.
- The cup cutout in `course-scene.js` chains onto the toon patch (the toon patch runs first) and its program cache key becomes `cup-cut-v6-<radius>|toon-v1` (S3: the radius includes `cup.filletWidth`, and a fillet collar mesh plus a lowered rim follow the physics profile; the legacy parity test undoes both).
- `src/render/outline.js` provides ink outlines for closed meshes using an inverted back-face hull on merged smoothed normals, pushed out 4 drawing-buffer pixels per 1280 px of width.
- Flat open meshes (flag, water, ramps) use a planar hull whose border vertices are pushed away from the mesh center; the owner writes stencil and the hull draws only outside it (the default WebGL renderer requests a stencil buffer).
- Remote see-through balls use an overlay ink material drawn after the ball. Cup-cut mesh hulls get the same cutout. Hulls are children of their mesh (`userData.ink` on the mesh, `userData.inkHull` on the hull), never cast shadows and are not raycast by wall fade. Fading walls immediately hide their ink.
- The renderer keeps shared ink uniforms (width, resolution, halftone cell) in step with the drawing-buffer size each frame.
- Effect shaders (water, pads, portals, power blocks, vortex, hazards, particles, auras, trail) have toon variants posterized into hard bands; they write display sRGB values directly as fixed by R2c #57. Portals draw their ink ring in the shader.

## Sky world (V1b #59)

- `src/render/sky-world.js` (`createSkyWorld({ THREE })`) is what the toon courses float in. It replaces the pastel sky dome in the toon style only; the legacy style is unchanged.
- The dome is a banded comic gradient with a sun disc, halo and rays. The sun sits in the legacy sun direction. Sky and sun are one shader that writes display sRGB values directly (R2c #57).
- Clouds are flat cel-shaded: white tops, a pale blue underside band, flat bases. Each layer is one merged non-indexed mesh, so the clouds cost two draw calls. The dome is one more, and the seven birds are 14 tiny wing meshes.
- Layers: a horizon ring of large clouds (2000+ units from the camera) and seven gull silhouettes, both re-centred on the camera each frame, so nothing passes between the camera and the course; and a cloud deck at least 350 units below the courses, anchored in world space.
- Everything ignores fog and lights, casts no shadow and is deterministic (seeded, no random input). `renderer.js` calls `update(t, camera.position)` each frame and `dispose()` releases the geometries and materials. The toon fog colour matches the sky horizon.
- Layout of clouds, deck and birds is decoration only: it does not depend on course geometry, so K1's floating islands need no change here.

## Per-map palettes, weather and wind (V1c #60)

- `src/courses/palettes.js` is plain data: one palette per starter map (Switchback Garden, Dune Serpent, Frost Hollow, Slime Springs, Cyclone Ring, Grand Finale). Each gives one flat sRGB colour per surface role (including `wind`, the fan streak colour), the five sky bands above the horizon and the three below, a sun strength, a cloud tint and an optional weather. The 16 non-starter maps use the Switchback Garden palette, which is the approved V1a look (`TOON_PALETTE` in `materials.js` must stay equal to it; a test checks).
- `renderer.setCourse()` looks the palette up by course name. `buildCourseScene({ palette })` colours the surfaces and the flag from it; `skyWorld.setMood(palette.sky)` sets the dome bands, sun and cloud tint as uniforms and the toon fog follows the horizon band. A course swap changes colours only: no geometry or material is created for the sky.
- `weather.js` adds ambient weather, visual only (nothing reads or writes simulation state). Frost Hollow has light snowfall; Cyclone Ring has rain and lightning under a dark sky with no sun. Snow and rain are camera-centred volumes (700 flakes, 520 streaks) moved entirely in the vertex shader from the shared clock, so the CPU does no per-frame work for them and the buffers are never rewritten. `renderer.setWeather(false)` hides them (the choice survives course swaps); no UI exposes it yet.
- Lightning is a pure function of time (`lightningFlash(t)`): every viewer sees the same flashes. At most one flash cluster (a pulse and a weaker echo, 0.16 s each) per 7 s period, and no flash in about a quarter of the periods, so nothing flickers faster than once per several seconds. It brightens the dome and clouds and washes the whole view with a soft 30% overlay, so it reads from the ball camera too.
- Clouds are procedural (`generateCloud`/`generateLayers` in `sky-world.js`). Each palette's `sky.clouds` gives a seed, how many horizon and deck clouds, a size factor and a drift speed. A cloud is a row of puffs that arches toward a random peak, with uneven spacing, small wisps at the ends and a 45% chance of a tall billow stacked on the highest puff, all from the seeded generator, so a seed always gives the same sky. Horizon clouds are sized so their near edge stays 1800 units from the camera and their far edge inside the far plane; deck clouds are capped so none rises toward the courses. A course swap rebuilds the two merged cloud meshes only when the parameters change, and releases the old geometry. Cyclone Ring has a dense, large, fast bank (24 and 16 clouds), Frost Hollow a heavy overcast, Dune Serpent a sparse sky.
- Fans keep their blades and ring (restyled by the palette) and the toon style replaces the white soft particles with 36 tapered wind streaks per fan (a horizontal and a vertical ribbon each, 3.6 units wide), blown along the fan direction in the palette's wind colour. The push strength is gameplay and belongs to G1 #34.

## Legacy behaviour preserved, and what was not ported

- The legacy follow camera built a wall-collision raycast that filtered on a material named `'brick'`. No material ever had that name, so it never moved the camera. The no-op is documented in `src/camera/rig.js` rather than ported; the terrain floor clamp is ported.
- `orbit` and `cinematic` camera branches were unreachable (the view cycle only contains follow, hole and strategic) and are not ported.
- The unused `?` block texture/material (`qTex`/`qMat`) is not ported; power-up blocks use the power-block shader, as before.
- Remote ball smoothing (`smoothRemotePosition`) is the legacy display interpolation. It is visual only and never feeds scoring or room state.

## Upgrade decisions

Color canvas textures and screen output use sRGB color spaces. Built-in materials use the current default linear working space. Custom effect shaders (sky, water, pads, portals, vortex, hazards, particles, auras, trail, confetti) write display sRGB values directly, as on r128, with no tone-mapping or colour-space chunks; their colour uniforms use displayColor() so r152+ colour management does not linearise them (R2c #57, docs/reviews/R2C_SHADER_COLOURS.md). Hemisphere and directional light intensities include the PI factor removed from legacy lighting. No global color-management setting is disabled. Bump scale remains the existing authored value; modern bump/PBR/shadow behavior can change surface appearance, which belongs in the before/after review rather than hidden physics or art tuning.
