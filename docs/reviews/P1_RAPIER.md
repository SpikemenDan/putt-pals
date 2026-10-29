# P1 — Rapier experiment and recommendation

Status: REVIEW pending (draft PR for #17, evaluation only). Recommendation unchanged: defer production adoption. Prototype by arshakir / Codex root (preserved commit `6ba6115` on `agent/p1-rapier-prototype`, kept in this branch as `fc94674`); finished and submitted by a Claude Code session after the user selected it again on 2026-10-28. Added here: a second-platform run (Windows), a measured cup-capture comparison against the current shared simulation (`cup.mjs`), and a cross-platform repeatability check. Base: main `df0b595` (S1 `b9ebff0` and the S2 cup-capture rules integrated). Owned files are `prototypes/rapier/**` and this report only; production code, fixtures, root dependencies and status docs are unchanged.

## Recommendation

**Defer production adoption.** Rapier handles mesh ramps, falling and enclosed tube walls with standard colliders, demonstrating useful geometry capability. This experiment does not show a net simplification of this golf game. Native rolling differs substantially, the candidate solver is slower, deployment grows, and golf-specific cup capture, drag, surfaces, hazards and events still need explicit code. The cup comparison below adds a second concrete reason: Rapier's physical cup is more forgiving off-centre and less forgiving at speed than the current capture rules, so adopting it would move the capture window of every putt. Keep the existing shared simulation; reconsider Rapier only as a separately authorized gameplay/geometry migration with a retuning budget and human comparison.

## Reproduce and inspect

Follow `prototypes/rapier/README.md`. The prototype is an independent npm package with pinned Rapier 0.21.0, Three.js 0.186.1, Vite 8.3.5 and Playwright 1.64.0 plus a lockfile. Root package/lock/config, production source and baseline fixtures are unchanged. No new runtime deployment is connected to the game.

- `physics.mjs`: collision fixtures, ball, fixed step and cleanup.
- `main.mjs` / `index.html`: interactive geometry/aim/power controls, live wireframe and custom reference trace.
- `measure.mjs` / `measurements.json`: native/custom traces, capability assertions, initialization, payload and candidate sweep evidence.
- `browser-check.mjs`, `browser-results.json`, `browser-tube.png`: built Chrome flow and screenshot (macOS evidence).
- `cup.mjs` / `cup-measurements.json`: cup capture comparison against the current shared simulation (`npm run measure:cup`).
- `measurements.windows.json`, `browser-results.windows.json`, `browser-tube.windows.png`: the same measure and browser check re-run on Windows. The macOS files are kept as recorded; `npm run measure` overwrites `measurements.json`, so copy results aside when comparing machines.

## Measured result

Apple M1 Pro, macOS arm64, Node v26.10.0. One recorded run, not a broad hardware benchmark:

| Measurement | Recorded result |
| --- | --- |
| Rapier WASM initialization in Node | 50.09 ms; excludes module import/parsing |
| Rapier initialization in headless installed Chrome 156.0.8078.49 | 50.5 ms; excludes download/import/parsing |
| 60 ramp candidates × 1,440 fixed ticks, median of three rounds | Rapier 1,171.13 ms; custom 49.81 ms (~23.5×) |
| Rapier compatibility ESM file | 4,340,292 bytes; gzip 1,655,235 bytes |
| Complete prototype production JS including renderer and reference data | 4,871.37 kB; gzip 1,805.02 kB (Vite output) |

Second platform, same code (Windows 11, AMD Ryzen AI 7 350 / Radeon 860M, Node v24.21.0, installed Chrome 156.0.8078.48), one run:

| Measurement | macOS (above) | Windows |
| --- | --- | --- |
| Rapier WASM initialization in Node | 50.09 ms | 43.13 ms |
| Rapier initialization in headless Chrome | 50.5 ms | 28.7 ms |
| 60 ramp candidates x 1,440 ticks, median of three rounds | Rapier 1,171.13 ms; custom 49.81 ms (~23.5x) | Rapier 961.6 ms; custom 51.8 ms (~18.6x) |
| Rapier compatibility ESM file | 4,340,292 bytes | 4,340,292 bytes (gzip 1,645,573 with this machine's zlib) |
| Complete prototype production JS | 4,871.37 kB | 4,871,372 bytes (same bundle) |

The solver gap is large on both machines (roughly 19x to 24x). The recorded trajectories are **bit-identical** across the two platforms: all 23 compared fields (final positions, extremes and sampled traces of the flat, ramp, drop and tube scenes, and the custom traces) match exactly between macOS arm64 / Node 26 and Windows x64 / Node 24, and the best sweep candidates are the same. That is a useful data point for replay and network use, but it covers four short scenes with one Rapier build and two machines; it is not a determinism proof across browsers, CPUs and long runs.

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

## Cup capture comparison (added)

`cup.mjs` sends the same approaches through the current shared simulation (`src/simulation`, with the S2 capture rules) and through Rapier with a real cup: a trimesh floor with a circular hole, an open sleeve and a bottom 36 units deep. The ball starts 10 units outside the lip, so turf drag barely slows the custom ball before the cup (a first run starting 30 units away was dominated by that drag and was discarded). Grid: speeds 40 to 900 game units per second, lateral offsets 0 to 18 units, cup radii 15 (default) and 8 (smallest); 140 trials. Rapier uses the untuned settings above (friction 0.18, restitution 0.25, CCD, no drag); sunk means the ball is fully below floor level inside the hole. Results (`cup-measurements.json`, Windows, `npm run measure:cup`; the run is deterministic):

| Cup radius | Trials | Both sink | Both miss | Custom only | Rapier only | Fastest centred sink, custom / Rapier |
| --- | --- | --- | --- | --- | --- | --- |
| 15 | 70 | 18 | 40 | 2 | 10 | 200 / 150 |
| 8 | 70 | 4 | 59 | 0 | 7 | 100 / 100 |

- **Off-centre:** Rapier drops balls the custom rules reject. At radius 15 and 40 to 100 u/s Rapier also sinks shots 12 and 15 units off the cup centre, where the custom engine stops at 9; at 150 u/s Rapier sinks offsets 6 to 12 where the custom engine sinks only 0 and 3. At radius 8 the ball (radius 5) tips in at offsets of 3 and 6 units at 40 to 80 u/s (3 at 100 u/s) in Rapier, where the custom engine needs a centred shot. A physical hole behaves like a funnel for the ball's rim contact; the custom engine uses speed and residence-time rules tuned for the S2 cup behaviour.
- **Fast shots:** the custom engine still sinks a centred 200 u/s shot at radius 15 (and its S2 rules deliberately let faster shots cross); the Rapier ball skips over from 200 u/s. At radius 8 both stop sinking above 100 u/s.
- **Net:** the two models disagree on 12 of 70 default-radius trials and 7 of 70 small-radius trials, always in the same two directions (Rapier more forgiving off-centre, custom more forgiving at 150 to 200 u/s). Adopting a collider cup would move every starter putt's capture window. S2 left five putts (Cyclone Ring P3 and P5, Grand Finale P1, P3 and P5) with narrow robust windows, and the 36 starter putts' robust shots and difficulty counts would all need re-solving and re-measuring.
- **Not covered:** lip bounces and magnets, cups on slopes or in sand, airborne approaches, different friction or damping tunings (a tuned Rapier might narrow the gap, but then the golf rules are partly re-implemented on top of it), and a human playtest.

## Migration cost and integration implications

The existing engine already supports smooth height ramps and vertical drops; those do not alone justify replacement. Its heightfield cannot represent an enclosed tube ceiling. Rapier supplies that contact geometry and CCD, but mesh construction, sensible entrances, seams and gameplay behavior remain application work.

Cup capture/lip rules and the radius-dependent depression, velocity drag and rest thresholds, sand/ice/slime behavior, wall effects, moving obstacles, fans/vortexes, pads/teleporters, power-ups and event timing must be ported or deliberately redesigned. A collider hole is not equivalent to the existing speed/distance capture rules. Room/scoring/network/render contracts would need an adapter; browser and solver must continue importing the same selected simulation. Cross-platform determinism and replay/network implications are not proven by same-runtime repeatability.

Any adoption would invalidate existing trajectory/difficulty evidence, require all 36 starter putts to be solved and robustly remeasured, and likely need course/power/friction tuning. That is a gameplay migration, not an extraction or dependency swap. No tuning, fixture refresh or contract change is hidden in P1.

## Verification and limits

Passed (macOS recorded by the previous worker; Windows re-run by this session):

- Windows, this session: prototype `npm ci`, `npm run measure`, `npm run measure:cup`, `npm run build` and `npm run test:browser` (installed Chrome 156.0.8078.48, headless, production bundle; no page or console errors or warnings), plus repository `node tests/simulation.test.cjs` and `node tests/cup-capture.test.cjs` (439 trajectories) on current main. No production file changed.
- Prototype `npm run measure`: ramp elevation, ledge departure/landing, tube exit, off-axis containment, finite results and same-runtime repeatability assertions; three-round candidate sweeps.
- Prototype `npm run build`: production bundle generated, with size warning recorded above.
- Prototype `npm run test:browser`: real installed headless Chrome loaded the production build, selected and advanced all four scenes, exercised reset/shoot, rendered frames and produced no page or console errors/warnings. Screenshot inspected for controls, geometry and ball/trail visibility. This is not a human feel review or full-game test.
- Repository `node tests/simulation.test.cjs`: all shared simulation parity checks passed, including six starter trace fixtures, hazards and surface distances.
- Repository `git diff --check`: passed (new files also checked for whitespace before handoff).

Not run: full root npm test/build (no production edits; the root dependency tree was not installed for this evaluation), Firefox/WebKit, human playtest, GPU performance budgets, network sessions, determinism beyond the two-machine comparison above, full course solver/difficulty refresh. Hosted CI for the PR head is separate evidence. No hosted CI or release/deployment evidence is claimed.

The first browser smoke failed on a missing favicon request; adding a data favicon resolved it. The initial tube traversal assertion failed on the outside-entry lip; moving its documented start inside establishes traversal only, not entry. Neither failure was relabeled as a passing full-course test.

Commit, push and a draft PR were authorized by the user on 2026-10-28 for this evaluation; merge remains a separate gate. No further Rapier implementation is planned: the deliverable is the prototype, the evidence and the defer recommendation. P1 is not an authorization to replace production physics or start K1.

Official implementation references: [Rapier getting started and compatibility packaging](https://rapier.rs/docs/user_guides/javascript/getting_started_js/), [collider construction](https://rapier.rs/docs/user_guides/javascript/collider_creation_and_insertion/). Installed package metadata records Apache-2.0; the dependency is pinned by the prototype-local lockfile.
