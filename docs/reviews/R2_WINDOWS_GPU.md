# R2w Windows GPU validation

Status: REVIEW; issue https://github.com/SpikemenDan/putt-pals/issues/52 ; branch `agent/r2w-windows-gpu` from `origin/main` 03e4db5 (includes R2 merge 62482f8, PR #53). Worker: Claude Code (Opus 5.5) Windows session on the reference laptop, SpikemenDan account. Captured 2026-10-28.

## Scope

Confirm the merged Three.js 0.186.1 renderer (R2) against the r128 baseline on the user-selected Windows reference laptop, on its integrated AMD Radeon 860M and discrete NVIDIA RTX 5060 separately. Target: average frame time <= 16.7 ms (60 FPS) at 1920x1080 on the Radeon 860M. Measurement only: no rendering or physics code was changed or retuned; findings are filed instead. The Mac evidence in `R2_RENDERER.md` is not reused here.

## Machine and conditions

| Parameter | Value |
| --- | --- |
| Hardware | AMD Ryzen AI 7 350 w/ Radeon 860M, RTX 5060 Laptop GPU, 15 GB RAM |
| Display | Internal display 1920x1080 at 144 Hz, Windows display scale 125% (DPR 1.25) |
| OS / Browser | Windows 11 Home 25H2 (10.0.26200.9711), Chrome 156.0.8078.48 (Playwright chrome channel) |
| Drivers | Radeon 860M driver 32.0.32015.7029 (2026-10-17); RTX 5060 Laptop GPU driver 32.0.16.1088 (2026-07-21) |
| Power state | ON BATTERY (77-88%). Power plan: High performance. Overlay: Best power efficiency (GUID 961cc777-...) |
| Window & Framebuffer | Chrome maximized (`--start-maximized`), viewport 1536x730 CSS at DPR 1.25. Probe canvas 1536x960 CSS -> 1920x1200 framebuffer (2.30 MP). Complete app canvas 1550x968 framebuffer |

Power state was on battery with "Best power efficiency" overlay active, representing a throttled condition. On 2026-10-28 the user decided not to rerun on AC with "Best performance", so this battery evidence is final for R2w. The Radeon target passes even in this throttled condition.

## GPU selection and proof

GPUs were selected per run using Chrome command-line switches `--force_low_power_gpu` (Radeon) and `--force_high_performance_gpu` (RTX) without modifying Windows graphics settings. Every report records `WEBGL_debug_renderer_info` UNMASKED_RENDERER and `chrome://gpu` GL_RENDERER; the harness rejects runs with mismatched renderer strings. Radeon runs report ANGLE (AMD, AMD Radeon(TM) 860M Graphics Direct3D11). RTX runs report ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU Direct3D11). Both sources agree in every run. `chrome://gpu` lists Optimus false / AMD switchable false, and its `*ACTIVE*` marker stays on GPU0 (Radeon) in every run, including the RTX runs: it marks the display adapter, not the WebGL adapter. The internal display is driven by the Radeon, so RTX frames are rendered on the NVIDIA GPU and presented through the Radeon. The `chrome://gpu` dumps are kept with the Playwright temp-profile path redacted.

## Method

r128 baseline uses an isolated local clone at 03e4db5 with `three@0.128.0` installed via `npm install --no-save --no-package-lock`. Version 0.186.1 uses the worktree after `npm ci`. Servers run via `npx vite --force --host 127.0.0.1 --port 4175|4174 --strictPort`. Probe `tests/render/windows/probe.html` matches the Mac probe workload: six starters (Switchback Garden, Dune Serpent, Frost Hollow, Slime Springs, Cyclone Ring, Grand Finale), seven remote actors, aim guide, fixed clock and randomness, 60 warmup + 300 measured frames. Two pacing modes: vsync (144 Hz display pacing, captures, complete app pass) and uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`). Metrics tracked: RAF frame interval, CPU render submission (`view.frame()`), GPU time per frame (`EXT_disjoint_timer_query_webgl2`), and late frames (> 1.5x median interval). Complete app measured idle at tee via real UI. Resource check compiles 52 putt builds and 10 swap cycles across all six starters.

The probe differs from `tests/render/probe.html` only in sizing: the canvas follows the window like the app (container width, fixed 1.6 aspect, real DPR) instead of 1280x800 CSS at DPR 2. The harness refuses a run when the loaded `THREE.REVISION` differs from `--revision`, or when the renderer string does not match the requested GPU. In uncapped mode, CPU submission includes back-pressure waits on the GPU, so it tracks the frame interval rather than pure CPU cost, and late-frame counts mean little there (the RTX median is about 1 ms). The complete-app pass is the built modular app through the real UI (Play solo, Start Game, starter card), idle at the tee with the app's own render loop. It measures app frame pacing, not a renderer-only cost. The resource check records renderer counters and JS heap (after `gc()`) per cycle. A plateau means the last three cycles have identical geometry, texture and program counts.

Commands, per GPU (`--gpu low` = Radeon, `--gpu high` = RTX):
```sh
# 0.186.1, this worktree
npx vite --force --host 127.0.0.1 --port 4174 --strictPort
node tests/render/windows/profile.cjs --url http://127.0.0.1:4174 --revision 186 --gpu low --out <dir>/r186-low-vsync --app
node tests/render/windows/profile.cjs --url http://127.0.0.1:4174 --revision 186 --gpu low --out <dir>/r186-low-uncapped --uncapped
# r128, from the baseline clone (probe.html copied in), harness path pointing back at this worktree
npx vite --force --host 127.0.0.1 --port 4175 --strictPort
node <worktree>/tests/render/windows/profile.cjs --url http://127.0.0.1:4175 --revision 128 --gpu low --out <dir>/r128-low-vsync --app
node tests/render/windows/summarize.cjs <dir>
python tests/render/windows/pixel-diff.py <dir>   # needs Pillow
```

All eight committed runs exited 0 with no page or console errors. The uncapped runs used `profile.cjs` sha256 `de63f2a2…` and the vsync runs `6c15bd92…`. The only change between them is the trail/confetti capture, which uncapped mode skips.

## Results: 60 FPS target on the Radeon 860M

**PASS on both revisions.** Every starter holds the 144 Hz display rate on the Radeon 860M at 1920x1200 (more pixels than 1920x1080), with about 4–5 ms of GPU time per frame on battery in the efficiency power mode. Numbers are ms; p95 in brackets.

| Starter | Vsync interval mean r128 → 0.186.1 (ms) | CPU submit mean (p95) r128 → 0.186.1 (ms) | GPU time mean (p95) r128 → 0.186.1 (ms) | Uncapped interval mean r128 → 0.186.1 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Switchback Garden | 6.96 → 6.96 | 1.30 (1.80) → 1.99 (3.20) | 4.46 (5.47) → 4.01 (4.74) | 5.79 → 5.34 |
| Dune Serpent | 6.96 → 6.96 | 1.79 (2.30) → 1.90 (2.40) | 4.46 (4.82) → 4.18 (4.87) | 6.53 → 6.21 |
| Frost Hollow | 6.96 → 6.96 | 1.83 (2.40) → 1.63 (2.40) | 5.03 (5.35) → 4.57 (5.68) | 6.78 → 5.93 |
| Slime Springs | 6.96 → 6.96 | 1.64 (2.40) → 2.02 (2.80) | 4.92 (5.38) → 4.27 (4.70) | 6.66 → 5.91 |
| Cyclone Ring | 6.96 → 6.96 | 2.21 (2.90) → 2.26 (3.20) | 4.57 (4.93) → 4.12 (4.58) | 6.51 → 5.79 |
| Grand Finale | 6.96 → 7.03 | 2.17 (2.60) → 2.36 (3.10) | 4.84 (5.20) → 4.31 (4.71) | 6.80 → 5.99 |

## Results: RTX 5060 Laptop GPU

| Starter | Vsync interval mean r128 → 0.186.1 (ms) | CPU submit mean (p95) r128 → 0.186.1 (ms) | GPU time mean (p95) r128 → 0.186.1 (ms) | Uncapped interval mean r128 → 0.186.1 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Switchback Garden | 6.96 → 7.04 | 1.96 (2.40) → 2.07 (3.20) | 0.99 (1.02) → 0.85 (0.86) | 0.96 → 0.81 |
| Dune Serpent | 7.00 → 6.95 | 1.71 (2.20) → 2.00 (2.90) | 1.05 (1.13) → 3.80 (7.59) | 1.50 → 1.05 |
| Frost Hollow | 6.96 → 6.94 | 1.57 (2.10) → 1.99 (2.60) | 1.16 (1.23) → 1.03 (1.07) | 1.33 → 1.06 |
| Slime Springs | 6.96 → 6.94 | 1.55 (2.00) → 2.28 (3.30) | 1.16 (1.26) → 1.05 (1.09) | 1.29 → 0.94 |
| Cyclone Ring | 6.96 → 6.94 | 2.28 (2.80) → 2.15 (2.80) | 1.19 (1.28) → 1.06 (1.12) | 1.31 → 1.06 |
| Grand Finale | 6.96 → 6.95 | 2.17 (2.70) → 2.51 (3.20) | 1.26 (1.35) → 1.14 (1.20) | 1.49 → 1.19 |

The RTX Dune Serpent 0.186.1 GPU time (3.80 mean, 7.59 p95) is the RTX lowering its clocks under this light vsync load on battery. Superseded battery runs (not committed) showed the same 4–5 ms means and ~8 ms p95 on other starters in both revisions (r128 Slime Springs and Cyclone Ring). It is not attributed to the upgrade. The uncapped runs, with the GPU fully loaded, show 0.186.1 faster on every starter.

**Complete app** (solo, idle at the tee, 1550x968 framebuffer; the app's container is narrower than the window, so this is a lighter workload than the probe): all 24 revision x GPU x starter results are 6.94–6.98 ms mean, p95 <= 7.7 ms, with 0–1 late frames. Per-starter rows are in `battery/summary.md`.

## Regressions against r128

- Frame time and pacing: No regression. Both revisions hold the 144 Hz display rate (6.96 ms). Uncapped mode shows 0.186.1 running faster than r128 across all starters on both GPUs. GPU time per frame is lower on 0.186.1. Grand Finale on Radeon (7.03 ms) and Switchback Garden on RTX (7.04 ms) reflect minor vblank jitter, well within the 16.7 ms budget.
- CPU submission: Regression on both GPUs in vsync mode. RTX mean increases by -0.13 to +0.73 ms, p95 by +0.0 to +1.3 ms (worst Slime Springs 1.55 → 2.28 mean, 2.00 → 3.30 p95). Radeon shows mixed changes, worst Switchback Garden 1.30 → 1.99 mean, 1.80 → 3.20 p95. This matches the Mac finding and is driven by increased draw calls (141–214 vs 91–141) and triangles (33k–44k vs 22k–30k). It is lost CPU headroom, not a missed target: the worst p95 is 3.30 ms against a 16.7 ms budget.
- Draw calls and triangles: about +50% calls and +45–55% triangles on every starter (Switchback Garden 91 → 141 calls, 21,567 → 33,376 triangles; Grand Finale 141 → 214, 30,289 → 44,402).

## Visual checks and findings

Unedited PNG captures (Radeon, vsync runs) for both revisions are in `tests/fixtures/render-migration/windows/captures/r128` and `.../r186`. All 21 shots per run were captured and pixel-diffed (`battery/pixel-diff.json`); ten pairs are committed:
- `map-0-follow`, `map-0-hole`, `map-0-strategic`: the three camera modes on Switchback Garden
- `map-<id>-strategic`: all six starters (0 Switchback Garden, 8 Dune Serpent, 20 Frost Hollow, 21 Slime Springs, 5 Cyclone Ring, 19 Grand Finale)
- `map-21-follow`: Slime Springs hazard shaders and the seven remote actors
- `map-0-trail`: the rolling-ball trail

Radeon and RTX captures are nearly identical (mean absolute difference 0.03–0.11 of 255, 0.0% pixels differing > 16). Comparing r128 to 0.186.1 shows mean absolute difference of 6.1–8.8 of 255, with 1.7–8.0% pixels changed > 16 (Slime Springs hole/follow reaching 7–8%). Geometry, camera framing, cup positions, walls, remote actors, labels and shadows line up. No objects are missing, and no run had shader-compile, page or console errors. Cup cutouts render as dark openings on 0.186.1, where r128 lit them grey; their geometry is unchanged. Trees are darker and more saturated green, skies warmer, and PBR highlights differ.

New finding: Custom hazard and effect shader pads are visibly washed out on 0.186.1. Red/yellow target rings and green/teal swirl pads lose contrast and saturation; portal beams on Slime Springs have a pink/yellow tint; golf-ball dimple texture contrast is reduced. This is consistent across both GPUs, pointing to colour management or output conversion in custom shaders. Not retuned under this measurement assignment. Filed as a finding for V1 #33, which reuses this pipeline, and noted on Q1 #18. See `map-19-strategic` and `map-21-strategic`.

Confetti: the probe fixes randomness to 0.37, so all 90 sink-confetti particles share one trajectory and show as a single small square. That capture is kept locally, but this is a probe limitation, not a renderer regression. The trail renders on both revisions.

## Map swaps and resource plateau

All 52 putt builds compiled successfully. Renderer counters plateau over the last three of ten swap cycles: 0.186.1 maintains 100–102 geometries, 24 textures (down from 40 in r128), and 21–22 programs (up from 17–18). r128 plateaus at 101–103 geometries, 40 textures and 17–18 programs. JS heap after GC stays flat or falls, with no growth trend. These are renderer counters and JS heap, not GPU memory bytes.

## Excluded run

One 0.186.1 RTX vsync run (16:29 UTC) had a complete-app pass where Frost Hollow ran at a steady ~1004 ms per frame, and the next three starters at ~7.8 ms. Its renderer probe was normal. A steady ~1000 ms interval is Chrome's hidden/occluded-page throttle, and it coincided with the user using the desktop. The rerun gave 6.94–6.95 ms on all six starters and replaces it. The excluded report is kept in `tests/fixtures/render-migration/windows/excluded/` and is not acceptance evidence.

## Limits and open items

- AC power with the "Best performance" power mode was not measured; the user decided no AC rerun is needed.
- Thermal endurance, exact GPU memory bytes, and multiplayer network load not measured.
- Chrome browser tested; Firefox and Edge unmeasured.
- Renderer probe and an idle complete app only; no shot-in-flight or multiplayer app frame times.
- Next actions: coordinator review and user merge approval; V1 #33 to decide whether the hazard-shader saturation is fixed within V1 or as a separate renderer fix.

## Files

- Tests and harness: `tests/render/windows/{probe.html,profile.cjs,summarize.cjs,pixel-diff.py}`
- Fixtures and captures: `tests/fixtures/render-migration/windows/{battery/*,captures/*,excluded/*}`
- This review document: `docs/reviews/R2_WINDOWS_GPU.md`
