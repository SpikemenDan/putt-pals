# V1a toon look foundation

Status: REVIEW pending (draft PR https://github.com/SpikemenDan/putt-pals/pull/67, `Closes #58`); branch `agent/v1a-toon-foundation` from origin/main 52abc2d. Worker: Claude Code (Opus 5.5) Windows session on the reference laptop, SpikemenDan account. Measured 2026-10-28.

## Scope

Make the user-approved comic toon look (reference `scratch-v1/toon.html` on branch `reference/v1-toon-sample`, approved 2026-10-28 with changes: smooth flat colours, no trees/decorations/ground) the renderer default, inside `src/render/`. Gameplay, physics, course layouts and camera are unchanged. Out of scope: sky world (V1b #59), per-map palettes, weather and fans (V1c #60), HUD (V1d #61).

## What changed

- `materials.js`: `style` option, 'toon' default, 'legacy' kept only for the historical r128 parity suite. `TOON_PALETTE` gives each surface role one flat saturated colour (turf, tile, wall, platform, ramp, sand, ice, slime, pad ring, fan ring/blades, cup sleeve/rim, pole, flag). No surface image textures (bricks, stripes, dimples) are created in the toon style. `library.toon()` is a MeshLambertMaterial with a patch that posterizes light into three flat bands (1.0, 0.62, 0.36 of the base colour) and keeps cast shadows; the two darker bands get screen-space halftone dots.
- Effect shaders (water, jump pads, portals, power blocks, vortex, hazards, vortex particles, auras, ball trail) have toon variants with the same motion posterized into hard bands; portals draw an ink ring in the shader. They still write display sRGB directly, building on R2c #57.
- `outline.js` (new): ink outlines. Inverted back-face hull on merged, smoothed normals, extruded a constant 4 drawing-buffer pixels per 1280 px of width (6 px at 1920). The screen direction uses the perspective divide so off-centre balls get a full ring. Flat open meshes (flag, water, ramps) use a planar hull: only border vertices are pushed out, the owner writes stencil and the hull draws only outside it. Cup-cut meshes (turf, tile) get hulls with the same cup cutout so the hole shows no ink. Ball hulls are lifted 0.3 ball radius toward the camera so a wall behind a ball cannot clip the ring; see-through remote balls use an overlay ink drawn after the ball.
- `course-scene.js`: the cup cutout chains onto the toon patch (toon runs first; cache key `cup-cut-v5-<radius>|toon-v1`). The "Deterministic landscape" trees are not built in the toon style.
- `renderer.js`: in the toon style no ground plane, no floating dream shapes, no PMREM environment map, no tone mapping (NoToneMapping), and white hemisphere/sun lights so the bands depend on light level only, not light tint. A wall or platform that starts to fade hides its ink at once. The default WebGL renderer requests a stencil buffer.
- `actors.js`: flat inked balls; hard-edged trail.

## Design decisions

- Inverted hull rather than a post-process edge pass: matches the approved sample, no render-target plumbing, and per-object control (faded walls, balls).
- The sample's "balls behind a faded wall look cut in half" artifact: hulls of fading walls hide as soon as the wall starts fading (alpha < 0.98), remote balls use overlay ink drawn after themselves, and ball ink is lifted 0.3 radius. A headless Chromium probe on Switchback Garden with the local ball and three remote balls just behind a faded inner wall showed every ball whole and ringed; the full-resolution Grand Finale follow capture (seven remote balls against a wall) does too.
- Floating dream shapes in the sky were also removed (judged "decorations" under the user's "no distracting trees or decorations"); flag for user confirmation.
- Fog and the sky shader are unchanged; V1b replaces the sky.

## Tests changed (deliberately)

- `tests/render.test.cjs`: the renderer is created with `style: 'legacy'`. All 12 historical parity scenarios still compare against the embedded r128 legacy game unchanged.
- `tests/app.test.cjs`, r128 topology scenario: `createMaterialLibrary` gets `style: 'legacy'` on both sides (the toon layout has its own check).
- `tests/render-modern.test.cjs`: now covers the default toon style: no surface textures, no standard materials on the course, cel patch present, cup cutout chained onto it on 1,087 patches, 1,289 ink hulls across 52 putt builds (at least one per build carries the cup cutout), planar hulls marked and stencil-masked, balls inked, faded wall drops ink and gets it back, no trees/ground/dream shapes, NoToneMapping and white lights. It checks that every course's toon build has the same object layout (positions, rotations, scales, geometry parameters) as the legacy build, minus trees, plus ink hulls. The legacy style's PMREM ownership/disposal and failed-PMREM fallback are still checked.
- New tool `tests/render/windows/compare.py` makes the before/after strips.

## Machine and conditions

Same laptop as R2w: AMD Ryzen AI 7 350 w/ Radeon 860M, RTX 5060 Laptop GPU, Windows 11 Home 25H2, Chrome 156.0.8078.48 (Playwright chrome channel). Display 1920x1080 at 144 Hz, Windows scale 125%: probe canvas 1536x960 CSS -> 1920x1200 framebuffer (more pixels than 1920x1080). Complete app canvas 1550x968 framebuffer. Power: ON AC (battery 94%), power plan High performance, overlay "Best performance" — unlike R2w, which was on battery; so compare before/after here, not with R2w's numbers. Before = origin/main 52abc2d in a scratch worktree served on port 4185; after = this branch on port 4184; both `npx vite --force`. GPU selected per run with `--force_low_power_gpu` / `--force_high_performance_gpu`; every run's renderer string matched the requested GPU (ANGLE AMD Radeon 860M / ANGLE NVIDIA RTX 5060 Laptop GPU, Direct3D11).

## Commands

```sh
npx vite --force --host 127.0.0.1 --port 4184 --strictPort                       # this branch
npx vite --force --host 127.0.0.1 --port 4185 --strictPort                       # origin/main checkout
node tests/render/windows/profile.cjs --url http://127.0.0.1:4185 --revision 186 --gpu low --out test-results/v1a/before-low-vsync --app
node tests/render/windows/profile.cjs --url http://127.0.0.1:4184 --revision 186 --gpu low --out test-results/v1a/after-low-vsync --app
# likewise --gpu high, and --uncapped (no --app) for both checkouts
node tests/render/windows/summarize.cjs test-results/v1a
python tests/render/windows/compare.py test-results/v1a/before-low-vsync test-results/v1a/after-low-vsync tests/fixtures/render-migration/windows/v1a/compare strategic follow hole
```

All eight committed runs exited 0 with no page or console errors and a resource plateau.

## Results: Radeon 860M (target <= 16.7 ms mean) — PASS

Every starter holds the 144 Hz display rate (p95 7.10 ms) before and after; the worst after mean is 7.05 ms, under 43% of the 16.7 ms budget. Uncapped, the toon renderer is faster on every starter (4.46–4.99 ms vs 5.18–6.49 ms).

| Starter | Vsync interval mean before → after (ms) | CPU submit mean (p95) before → after (ms) | GPU time mean (p95) before → after (ms) | Uncapped interval mean before → after (ms) |
| --- | ---: | ---: | ---: | ---: |
| Switchback Garden | 6.96 → 6.96 | 2.09 (3.30) → 1.12 (1.60) | 4.55 (5.58) → 2.70 (3.45) | 5.32 → 4.49 |
| Dune Serpent | 7.12 → 6.96 | 2.79 (4.60) → 1.36 (2.10) | 4.71 (5.48) → 3.07 (3.89) | 6.42 → 4.46 |
| Frost Hollow | 7.03 → 6.96 | 2.76 (4.80) → 1.64 (2.60) | 5.46 (6.90) → 3.50 (4.97) | 6.49 → 4.76 |
| Slime Springs | 7.03 → 6.96 | 3.68 (5.30) → 2.36 (3.80) | 5.21 (5.84) → 3.84 (5.69) | 6.12 → 4.99 |
| Cyclone Ring | 6.96 → 7.03 | 2.79 (4.90) → 2.32 (3.70) | 5.05 (6.30) → 4.18 (6.25) | 5.18 → 4.47 |
| Grand Finale | 6.96 → 7.05 | 2.63 (3.60) → 2.32 (3.40) | 5.13 (6.23) → 4.91 (7.28) | 6.09 → 4.88 |

## Results: RTX 5060 Laptop GPU

GPU time roughly halves; CPU submission is within ±0.4 ms. Uncapped intervals under ~1 ms are dominated by back-pressure and noise.

| Starter | Vsync interval mean before → after (ms) | CPU submit mean (p95) before → after (ms) | GPU time mean (p95) before → after (ms) | Uncapped interval mean before → after (ms) |
| --- | ---: | ---: | ---: | ---: |
| Switchback Garden | 6.96 → 6.96 | 1.25 (1.70) → 1.14 (1.60) | 0.78 (0.79) → 0.42 (0.42) | 0.64 → 0.62 |
| Dune Serpent | 6.96 → 6.98 | 1.42 (2.10) → 1.13 (1.60) | 0.87 (0.90) → 0.49 (0.47) | 0.75 → 0.58 |
| Frost Hollow | 6.96 → 6.96 | 1.41 (1.90) → 1.45 (2.10) | 0.94 (0.97) → 0.47 (0.50) | 0.84 → 0.46 |
| Slime Springs | 7.00 → 6.96 | 1.90 (2.80) → 1.68 (2.20) | 0.93 (0.97) → 0.48 (0.50) | 0.86 → 0.82 |
| Cyclone Ring | 6.96 → 6.96 | 1.63 (2.30) → 2.01 (2.60) | 0.94 (0.98) → 0.53 (0.55) | 0.91 → 0.78 |
| Grand Finale | 6.98 → 6.96 | 1.90 (2.50) → 2.08 (2.60) | 1.01 (1.04) → 0.53 (0.56) | 0.96 → 1.06 |

## Complete app (solo, idle at the tee, 1550x968)

All 24 results (before/after x GPU x starter) are 6.96–7.05 ms mean, p95 <= 7.10 ms, 0–1 late frames.

## Draw calls, triangles and resources (Radeon vsync run)

Ink hulls add draw calls and triangles, but removing 10 trees (40 meshes), 30 dream shapes and the ground plane offsets most of the calls. Resources plateau: after 87–88 geometries / 19 textures / 23–24 programs per swap cycle (before 100–102 / 24 / 21–22); JS heap flat (about 22–23 MB). 52 putt builds compile in every run.

| Starter | Calls before → after | Triangles before → after |
| --- | ---: | ---: |
| Switchback Garden | 141 → 124 | 33,376 → 40,684 |
| Dune Serpent | 153 → 143 | 33,548 → 40,950 |
| Frost Hollow | 154 → 144 | 33,560 → 40,962 |
| Slime Springs | 184 → 177 | 35,666 → 44,104 |
| Cyclone Ring | 199 → 203 | 44,100 → 54,182 |
| Grand Finale | 214 → 222 | 44,402 → 54,904 |

## Visual evidence

Before/after strips for all six starters (0 Switchback Garden, 8 Dune Serpent, 20 Frost Hollow, 21 Slime Springs, 5 Cyclone Ring, 19 Grand Finale) in strategic, follow and hole views: `tests/fixtures/render-migration/windows/v1a/compare/map-<id>-<view>.jpg`. Unedited Radeon vsync captures, scaled to half size. Gameplay visuals intact in every capture: cup hole cut with ink rim, aim guide cone and dots, labels, auras, contact shadows, wall fade.

## Excluded run

The first after-low-vsync run after the ink fix had a complete-app pass where Grand Finale ran at 803 ms mean (about 1,000 ms per frame), Chrome's hidden/occluded-page throttle, as in R2w's excluded run; its renderer probe was normal. The rerun gave 6.96–7.05 ms on all six starters and replaces it. Its report is kept in `tests/fixtures/render-migration/windows/v1a/excluded/` and is not acceptance evidence. An earlier full batch was superseded because the ink shader changed afterwards (perspective-correct direction, lifted ball ink); only the before runs from that batch are kept, as the before code did not change.

## Limits and open items

- Battery / "Best power efficiency" not measured for V1a (R2w measured that for the old look).
- Chrome only; Firefox and WebKit run in CI's browser tests, not profiled.
- Renderer probe and idle complete app; no shot-in-flight or multiplayer frame times.
- Per-map palettes (V1c), sky world (V1b) and HUD (V1d) are separate issues.
- User to confirm: removal of the floating dream shapes; outline width (4 px per 1280 px, as in the sample).

## Files

- Renderer: `src/render/{materials,outline,course-scene,renderer,actors}.js`, `src/render/README.md`
- Tests: `tests/render.test.cjs`, `tests/render-modern.test.cjs`, `tests/app.test.cjs`, `tests/render/windows/compare.py`
- Evidence: `tests/fixtures/render-migration/windows/v1a/{summary.md,summary.json,reports/*,compare/*,excluded/*}`
- This document
