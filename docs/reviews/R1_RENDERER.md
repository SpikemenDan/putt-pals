# R1 renderer and camera review handoff

Task: [R1 #6](https://github.com/SpikemenDan/putt-pals/issues/6), extracted renderer and camera. Worker: Claude (claude.ai session), started from main at `2b8eab0` on 2026-10-26 at the user's request. The worker could not read the live issue (GitHub account not linked to the session), so the claim was confirmed by the user in chat: R1 was chosen with no other agent working on it. The claim still needs recording on the issue. Status: ready for REVIEW, not DONE.

## Delivered

- `src/render/`: `createGameRenderer()` (WebGL renderer, scene, lights, sky, environment, dream shapes, ground, local/remote actors, per-frame updates, `resize`, `setQuality`, `dispose`), `createGameView()` (renderer + camera, the legacy `draw()` composition), `buildCourseScene()` (legacy `buildAll()` from course definitions), `createMaterialLibrary()`, `createWallFade()`, `createWorldTransform()` and `resolveRenderCourse()`.
- `src/camera/`: `createCameraRig()` with follow/hole/strategic views, free roam, spring-damper smoothing, the putt-to-putt transition and the legacy input clamps, without Three.js or DOM.
- `tests/render.test.cjs`, wired as `npm run test:render` into `npm test` and CI.

`THREE` (the embedded r128 namespace), canvas creation, randomness and the WebGL renderer factory are injected. No dependency, shared contract, HTML, simulation, course data or gameplay changes.

## Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| Preserves reference views | Legacy game and new modules run side by side in jsdom with the real embedded r128. All 52 course/putt builds produce identical scene graphs: transforms, geometry parameters and vertex data, material parameters, shader sources and uniforms, cup-cutout shader patches, and the exact canvas drawing commands of every texture. Live frames (three views, zoom/orbit, rolling and sinking ball, confetti, free roam, remote player, putt transition) match the legacy camera pose and the complete legacy scene on every frame. |
| Explicit coordinate transform | `src/render/transform.js` is the single sim→world mapping, built on `src/shared/coords.js`; covered by an inverse/round-trip check. |
| Disposal | Each course build owns and releases its resources; 44 swaps release every course resource while shared library resources survive; `dispose()` releases everything reachable from the scene plus library/environment resources and is idempotent. |

Test sensitivity was checked by planting 18 deliberate one-line bugs across the modules (surface height, follow spring, fade minimum, remote smoothing factor, transition arc, texture noise, cup-cutout radius precision, confetti gravity, ball spin axis, name label height, free-roam lift, fan speed, power-block bob, aura pulse, hole-view distance and look target, wall containment and the fade ray fan). Every one fails `npm run test:render`. This process exposed and fixed test-harness gaps along the way, including a self-comparison of the scene that is now asserted against.

## Legacy findings (preserved, not fixed)

- The follow camera's wall-collision ray filtered on a material named `'brick'`, which no material has, so it never moved the camera. The no-op is documented, not ported; changing it would be a gameplay/visual change.
- The `orbit` and `cinematic` camera branches were unreachable and are not ported. The unused `qTex`/`qMat` resources are not ported.
- Legacy disposal also disposed the shared fan-particle texture and sprite geometry on every map change, and leaked old remote name labels and the material replaced by the cup cutout. The extraction keeps shared resources and releases those leaks; there is no visual difference.

## Verification at the delivered head

Run on Node 22.23.4 after `npm ci` from the main lockfile:

| Command | Result |
| --- | --- |
| `npm test` | Passed end to end (about 8.5 minutes): check, contracts, simulation, session, network, audio, render (12 scenarios), courses, CLI, physics, solo smoke, four-client smoke |
| `npm run test:render` | 12 scenarios passed, about 80 seconds |
| `npm run build` | Passed; embedded scripts preserved byte for byte |
| `node scripts/inventory-baseline.cjs --check` | Passed; legacy source hashes unchanged |
| `git diff --check` | Clean; CI YAML parses and references `npm run test:render` |

Not verified: real WebGL rendering, pixels against `tests/fixtures/browser-baseline/`, GPU memory, frame time and real browsers. jsdom stubs WebGL output and the legacy PMREM environment map falls back to `null` there, as it does in the smoke tests. Hosted CI later passed on the PR (run 40435405178) and after merge on main (run 40436390477).

## Integration notes

- Integration owner: this change edits `package.json` (one script and the `npm test` chain) and `.github/workflows/ci.yml` (one step), following the A1/N1 pattern. Please accept or redo these per ownership rules.
- I1 consumes `createGameView()`: course definitions from `src/courses`, snapshots from simulation/session, `events` for UI toasts and the view label, `rig.transitioning` to block input during transitions, and `startPuttTransition()` when the session advances to the next putt.
- U1's input adapter calls the rig input hooks. `orbitKey`/`orbitDrag` return `false` when the view rotates the aim instead.
- Visual interpolation (`smoothRemotePosition`) is display-only and never feeds scoring or room transitions.
- R2 (Three.js upgrade) can swap the injected namespace and use this suite plus the browser baseline screenshots to review differences.
