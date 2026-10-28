# S2 — Cup capture and overshoot correction

Local review candidate for #54, on `agent/s2-cup-capture` in `/private/tmp/putt-pals-s2`, based on accepted main `62482f8`. Worker/coordinator/integration owner: Codex root / arshakir. The user authorized committing and pushing this S2 delivery on 2026-10-28. PR creation and merge remain separate approval gates. P1 was archived separately as `6ba6115` on `agent/p1-rapier-prototype`; no Rapier dependency or production adoption is involved here.

## Problem and resulting behaviour

A fast shot could sink because the cup depression was treated as a terrain slope. On a flat radius-15 test cup at (0,0), a ball starting at (-50,0,0) with vx=900 previously sank; its downward speed reached about -342 game units/s. At vx=300 it reached about -736. Horizontal speed was being converted into an artificial downward tangent velocity, so increasing shot speed did not reliably let the ball cross the opening.

The current engine already required the ball to drop below the surface before scoring. That check was not itself a proximity trigger; the artificial downward acceleration made the condition too easy to reach.

The correction detaches the ball from falling cup support immediately and uses gravity to determine how far it drops while crossing. Terrain slope acceleration reads actual terrain height, excluding the cup depression. Slow centred shots still drop and score; faster shots can cross before falling far enough; airborne crossings stay clear; grazing overlap and lip-outs do not automatically score. A settled ball cannot emit another cup score.

Cup-local substeps restrict travel to roughly half a ball radius per substep when a predicted segment intersects the cup neighbourhood. This reduces tick-phase dependence at ordinary launch and boosted speeds without changing normal terrain integration. Work is capped at 128 subdivisions for pathological input; tested speeds extend through 9,000 units/s, and this is not a general continuous-collision replacement for arbitrary velocities or all obstacles.

The magnet retains its explicit outside-cup attraction and does not bypass the physical drop requirement. Coordinates remain x/y horizontal, z vertical. Global drag, gravity, wall rebound, launch power, course geometry, scoring and shared contracts are unchanged.

## Changed paths and ownership

Runtime: `src/simulation/physics.js` only.

Tests and evidence: dedicated `tests/cup-capture.test.cjs`, `tests/browser/cup-capture.spec.cjs`, the diagnostic `tests/cup-capture-browser.mjs`, explicit measurement command `tests/measure-cup-capture.mjs`, and `tests/fixtures/cup-capture/`.

The integration owner also updates `package.json` to run the new regression suite inside existing `test:simulation` (therefore existing CI executes it). No dependency or lockfile change. Existing simulation/CLI assertions are explicitly reconciled for the intentional gameplay correction, and app/audio/browser smoke inputs use the newly measured shots. These test consumers (`tests/simulation.test.cjs`, `tests/cli.test.cjs`, `tests/app.test.cjs`, `tests/audio.test.cjs`, `tests/browser/support/app.cjs`) are within this coordinator-owned integration change. N2b's new browser specs/helpers and T1c runtime files are untouched.

Historical `tests/fixtures/solver-baseline.json`, source inventory and the legacy HTML are retained unchanged. Historical trajectories remain asserted before cup interaction; dedicated new tests cover changed cup behaviour. CLI tests continue to exercise all 36 solver outcomes, including explicit no-robust-result cases, and replay nominal shots for all 36. No tests report the five narrower solutions as robust.

## New measured course evidence

`node tests/measure-cup-capture.mjs` writes separate, source-fingerprinted first-robust search evidence to `tests/fixtures/cup-capture/solutions.json`. It exits 1 if any putt lacks a robust result; that occurred for five putts and is recorded, not a passing complete robustness gate. The fast solver uses its existing angle/power grid and nine robustness combinations (angle ±0.007 rad, power ±0.025). The script records nominal solutions separately for those gaps.

- **36/36** starters have replayed nominal hole-in-one solutions under the corrected simulation.
- **31/36** have a solution meeting the existing robustness margin on that grid.
- Five lack that robustness margin: Cyclone Ring putts **3 and 5**, Grand Finale putts **1, 3 and 5**. This does not prove a putt impossible, beyond par, or unsolvable on a finer grid.
- **12/36** historical baseline shot inputs no longer sink. The new values are deliberate S2 measurements, not replacements for historical fixtures.
- A separately recorded full grid for Switchback Garden putt 1 has **377 hits**, compared with the prior test's **811**. `reference-full.json` records current source/course/configuration provenance. Other fast searches are not presented as complete current difficulty counts.

Five nominal-only shots (degrees/power): Cyclone Ring P3 44°/0.70, P5 16.5°/0.80; Grand Finale P1 15°/0.90, P3 14°/1.00, P5 21.5°/0.80. These replay successfully but do not meet the previous robustness margin.

Required follow-up before claiming unchanged difficulty/readiness: review whether the narrower hard-map shot windows are intended; if the old robustness target must be restored, separately authorize course/cup tuning or a finer search. Recompute the full 36-putt difficulty report before release acceptance. S2 does not silently retune courses or certify the old difficulty ladder.

## Reproduction

From the task checkout:

```sh
npm ci
npm run test:simulation
node tests/measure-cup-capture.mjs
npm test
npm run build
npx playwright test tests/browser/cup-capture.spec.cjs tests/browser/solo.spec.cjs tests/browser/input.spec.cjs --project=chromium --project=firefox --project=webkit
node tests/cup-capture-browser.mjs
```

The measurement command writes evidence and deliberately signals missing robust solutions with exit 1. The visual probe starts/stops its own Vite server at localhost:4184 and launches installed Chrome. To inspect it manually, run Vite and open `/tests/fixtures/cup-capture/probe.html`; select the shot and scrub time. This fixture uses the actual game renderer and shared simulation, but is not the production app. The committed Playwright spec separately drives the production-built app using public UI and shot commands, reading its diagnostic hook without mutating game state.

## Verification

- Locked offline install: `npm ci --cache /private/tmp/putt-pals-npm-cache --offline` passed.
- `npm run test:simulation`: pre-cup reference parity, four mechanic chambers, unchanged surface roll distances and engine lifecycle pass; dedicated **439** controlled trajectories pass across cup radii 8–15, six approach angles, fast/boosted speeds, airborne/grazing shots, lip deflection, descending/submerged cases, magnet, repeated steps and tick-phase offsets.
- `npm run test:app`: **12 scenarios passed** using new S2 robust shots; jsdom/stub WebGL/audio/fake transport only. The no-WebGL scenario intentionally logs its simulated error.
- `npm run test:physics`: all legacy surface/timer, cup and mechanic checks passed. These remain legacy-reference checks; the new dedicated suite validates the shared-engine correction.
- `npm run test:integration`: all out-of-bounds assertions passed.
- `npm run build`: passed; legacy scripts/CSS preserved, modular bundle generated. Existing bundle-size warning remains.
- `node tests/cup-capture-browser.mjs`: installed headless Chrome passed slow capture, fast crossing, airborne clearance and lip-out with zero page/console errors. Four unedited screenshots and raw sampled traces are in `tests/fixtures/cup-capture/browser/`. This is diagnostic real-renderer evidence, not a human feel approval.
- 36/36 nominal solution replay and current simulation-source hash checks passed separately.
- Selected production browser command above: **9/9 passed** (cup regression, full six-putt solo and input in Chromium, Firefox and WebKit; 5.5 minutes). Chromium production miss/capture screenshots are retained alongside the diagnostic captures. Full `npm test`: **passed, exit 0**, including both final legacy smoke suites. The final added near-threshold cases and strengthened 36-shot/source-fingerprint assertions also passed separately after the aggregate run (439 dedicated trajectories total).

No S2 hosted CI, real-network session or subjective human playtest is claimed. No production merge, deployment, shared-contract migration or source extraction is involved.

## Handoff and remaining gates

Local implementation and verification are complete; keep #54 ACTIVE until authorized review submission, then REVIEW pending user acceptance/integration. The user approved the S2 commit and branch push on 2026-10-28 after reviewing the reported verification and shot-margin limits. PR creation and merge remain separate; this delivery does not close the issue or adopt the change on main. Decide whether the five robustness gaps need tuning before integration or are accepted as a recorded gameplay consequence, and track the full difficulty refresh before release. Do not close this issue solely because the code is written.
