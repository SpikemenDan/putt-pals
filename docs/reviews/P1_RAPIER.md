# P1 — Rapier experiment and recommendation

Status: experiment deferred by the user. The user authorized committing and pushing the preserved prototype and evidence on 2026-10-28. Issue #17 remains deferred; no PR, merge or production adoption is part of this archival delivery. Worker/coordinator: Codex root / arshakir. Base/accepted contract revision: main `62482f85e4a520ff0aef21a8ddca5c85801562be`, with S1 `b9ebff0` integrated. Owned files are `prototypes/rapier/**` and this report only.

## Recommendation

**Defer production adoption.** Rapier handles mesh ramps, falling and enclosed tube walls with standard colliders, demonstrating useful geometry capability. This experiment does not show a net simplification of this golf game. Native rolling differs substantially, the candidate solver is slower, deployment grows, and golf-specific cup capture, drag, surfaces, hazards and events still need explicit code. Keep the existing shared simulation; reconsider Rapier only as a separately authorized gameplay/geometry migration with a retuning budget and human comparison.

## Reproduce and inspect

Follow `prototypes/rapier/README.md`. The prototype is an independent npm package with pinned Rapier 0.21.0, Three.js 0.186.1, Vite 8.3.5 and Playwright 1.64.0 plus a lockfile. Root package/lock/config, production source and baseline fixtures are unchanged. No new runtime deployment is connected to the game.

- `physics.mjs`: collision fixtures, ball, fixed step and cleanup.
- `main.mjs` / `index.html`: interactive geometry/aim/power controls, live wireframe and custom reference trace.
- `measure.mjs` / `measurements.json`: native/custom traces, capability assertions, initialization, payload and candidate sweep evidence.
- `browser-check.mjs`, `browser-results.json`, `browser-tube.png`: built Chrome flow and screenshot.

## Measured result

Apple M1 Pro, macOS arm64, Node v26.10.0. One recorded run, not a broad hardware benchmark:

| Measurement | Recorded result |
| --- | --- |
| Rapier WASM initialization in Node | 50.09 ms; excludes module import/parsing |
| Rapier initialization in headless installed Chrome 156.0.8078.49 | 50.5 ms; excludes download/import/parsing |
| 60 ramp candidates × 1,440 fixed ticks, median of three rounds | Rapier 1,171.13 ms; custom 49.81 ms (~23.5×) |
| Rapier compatibility ESM file | 4,340,292 bytes; gzip 1,655,235 bytes |
| Complete prototype production JS including renderer and reference data | 4,871.37 kB; gzip 1,805.02 kB (Vite output) |

The compatibility package embeds WASM as base64. This simplifies static serving (no separate WASM fetch/configuration) but increases the JS payload. It is the evaluated packaging choice, not a lower bound for every Rapier build. A split WASM package, lazy loading or a reduced build would require another measurement. The production bundle emits Vite's size warning; no threshold was suppressed.

Both engines use the same nominal radius, gravity, launch speed, timestep and smoothstep ramp dimensions, with explicit metre/game-unit conversion. Contacts are not equivalent: Rapier has angular motion, Coulomb friction, contact solving and restitution; the game uses direct terrain projection, velocity-dependent drag and explicit stopping rules. The sweep includes setup/cleanup; custom rest returns early while Rapier keeps stepping. It is not a normalized collision-kernel benchmark or extrapolation to all 36 putts.

After six seconds at straight 70% power, game-unit x positions are:

| Fixture | Custom | Rapier |
| --- | --- | --- |
| Flat | 665.29 | 2,871.25 |
| Ramp | 535.35 | 1,454.30 |
| Drop | 905.30 | 2,956.53 |

This much longer rolling is the concrete control/feel difference in the untuned prototype. No subjective human preference is established. Adding rolling resistance or custom drag could reduce it, but then Rapier alone does not replace the current golf motion rules. Even matching flat stopping distance would not establish ramp, bounce or cup parity.

Tube capability is independent of that table: it traverses the open-ended mesh and exits beyond x=800 game units. A separate angled shot checks that the ball centre remains within the wall's clearance while inside (234 sampled ticks). It starts inside the mouth; an initial outside-entry attempt hit the raised lip and bounced back. Smooth entrance integration remains unimplemented, and this limitation is displayed in the demo.

## Migration cost and integration implications

The existing engine already supports smooth height ramps and vertical drops; those do not alone justify replacement. Its heightfield cannot represent an enclosed tube ceiling. Rapier supplies that contact geometry and CCD, but mesh construction, sensible entrances, seams and gameplay behavior remain application work.

Cup capture/lip rules and the radius-dependent depression, velocity drag and rest thresholds, sand/ice/slime behavior, wall effects, moving obstacles, fans/vortexes, pads/teleporters, power-ups and event timing must be ported or deliberately redesigned. A collider hole is not equivalent to the existing speed/distance capture rules. Room/scoring/network/render contracts would need an adapter; browser and solver must continue importing the same selected simulation. Cross-platform determinism and replay/network implications are not proven by same-runtime repeatability.

Any adoption would invalidate existing trajectory/difficulty evidence, require all 36 starter putts to be solved and robustly remeasured, and likely need course/power/friction tuning. That is a gameplay migration, not an extraction or dependency swap. No tuning, fixture refresh or contract change is hidden in P1.

## Verification and limits

Passed:

- Prototype `npm run measure`: ramp elevation, ledge departure/landing, tube exit, off-axis containment, finite results and same-runtime repeatability assertions; three-round candidate sweeps.
- Prototype `npm run build`: production bundle generated, with size warning recorded above.
- Prototype `npm run test:browser`: real installed headless Chrome loaded the production build, selected and advanced all four scenes, exercised reset/shoot, rendered frames and produced no page or console errors/warnings. Screenshot inspected for controls, geometry and ball/trail visibility. This is not a human feel review or full-game test.
- Repository `node tests/simulation.test.cjs`: all shared simulation parity checks passed, including six starter trace fixtures, hazards and surface distances.
- Repository `git diff --check`: passed (new files also checked for whitespace before handoff).

Not run: full root npm test/build (no root dependencies installed in this isolated checkout and no production edits), Firefox/WebKit, human playtest, GPU performance budgets, network sessions, cross-platform determinism, full course solver/difficulty refresh. No hosted CI or release/deployment evidence is claimed.

The first browser smoke failed on a missing favicon request; adding a data favicon resolved it. The initial tube traversal assertion failed on the outside-entry lip; moving its documented start inside establishes traversal only, not entry. Neither failure was relabeled as a passing full-course test.

Commit and branch push authorized on 2026-10-28 to preserve this deferred experiment. PR creation and merge remain separate approval gates; no further Rapier implementation is planned. P1 is not an authorization to replace production physics or start K1.

Official implementation references: [Rapier getting started and compatibility packaging](https://rapier.rs/docs/user_guides/javascript/getting_started_js/), [collider construction](https://rapier.rs/docs/user_guides/javascript/collider_creation_and_insertion/). Installed package metadata records Apache-2.0; the dependency is pinned by the prototype-local lockfile.
