# P1 Rapier experiment

This independent package evaluates Rapier 0.21.0 (Apache-2.0) without importing it into the game or changing the root dependency tree. It uses Three.js 0.186.1 for an actual-collider wireframe preview. No CDN or remote service is used at runtime.

From this directory, with the repository's supported Node version:

```sh
npm ci
npm run measure
npm run measure:cup
npm run build
npm run test:browser
npm run dev -- --port 4182
```

Open http://127.0.0.1:4182 for the interactive experiment. `test:browser` starts/stops its own production preview on port 4183 and uses installed Chrome. Set `P1_BROWSER_CHANNEL=chromium` to use a Playwright-installed Chromium instead; install it first with `npx playwright install chromium`. The browser check writes `browser-results.json` and `browser-tube.png`. `measure` writes `measurements.json`; keep original evidence if making a comparison across machines. `dist/` and `node_modules/` are ignored.

Choose flat, ramp, drop or tube; change aim/power and press Shoot / reset. Blue is the live Rapier path. Pink is a **recorded 70% straight** custom-engine path and intentionally stays fixed when sliders change. No custom tube path exists. These collision wireframes are diagnostic geometry, not proposed art.

The fixed timestep is 1/240 s. Axes remain x/y horizontal and z vertical; Rapier uses metres at 100 game units per metre, gravity 7 m/s², radius 0.05 m, and launch speed 9 × power m/s. Native contact friction is 0.18, restitution 0.25, with CCD enabled and no artificial drag. Smoothstep ramp: x=2..4 m, rise=0.6 m, 80 strips. Drop: top z=1.2 m, ledge x=2.5 m. Tube: x=2..8 m, radius=0.45 m, centre z=0.5 m, 48 sides, open ends. The tube ball starts inside at x=2.2 m: entry from the floor needs a transition ramp and is **not solved** here. Wide landing geometry extends to x=101 m so six-second comparison traces cannot fall off its end.

The measurements exercise actual climbing, leaving the ledge/landing, tube exit, off-axis tube containment, finite values and repeatability in one runtime. Sweeps use three rounds of 60 ramp candidates, 1,440 steps each, including world/player setup and cleanup. The target is final distance to (600,0), not a cup or a robust hole-in-one test. The custom engine returns early after rest while Rapier still steps contacts: this is an end-to-end candidate-workload comparison, not a per-collision microbenchmark. The custom fixture omits side walls; near-zero tested angles limit that difference, but the engines are intentionally not equivalent.

`measure:cup` compares cup capture between the shared custom simulation (current main, S2 rules) and a Rapier trimesh cup over a speed by offset grid and writes `cup-measurements.json`. The `*.windows.*` files are the same measure and browser runs on Windows; the unsuffixed files are the original macOS evidence, kept as recorded because `npm run measure` and `npm run test:browser` overwrite them.

See ../../docs/reviews/P1_RAPIER.md for the decision, measured evidence and limitations. The demo has no cup capture, score/session logic, hazards, power-ups, surface-specific rules or network integration. Those remain golf domain code regardless of collision engine. Human feel and Firefox/WebKit are not verified by the Chrome smoke.
