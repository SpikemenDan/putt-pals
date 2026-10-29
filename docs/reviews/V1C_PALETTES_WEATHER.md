# V1c per-map palettes, weather, clouds and fan wind

Status: REVIEW pending; branch `agent/v1c-palettes-weather` from origin/main c331833, issue #60 (`Closes #60`). Worker: Claude Code session, SpikemenDan account. Palettes approved by the user in chat on 2026-10-28.

## Scope

Per-map palettes for the six starter maps in the V1a toon style, ambient weather on Frost Hollow and Cyclone Ring, procedural clouds and restyled fan wind. Visual only: simulation, course geometry, physics and camera are unchanged. Out of scope: the stronger fan push and gameplay weather (G1 #34), HUD (V1d #61).

## What changed

- `src/courses/palettes.js` (new, plain data): one palette per starter map (Switchback Garden, Dune Serpent, Frost Hollow, Slime Springs, Cyclone Ring, Grand Finale) with one colour per surface role including `wind`, five sky bands above and three below the horizon, sun strength, cloud tint, cloud parameters and optional weather. The 16 other maps use the Switchback Garden palette, which equals the V1a `TOON_PALETTE` (tested).
- `src/render/sky-world.js`: the dome reads its bands, sun strength and a lightning flash from uniforms; `setMood(palette.sky)` swaps colours with no allocation. Clouds are procedural: `generateCloud` builds arched puff rows with uneven spacing, end wisps and occasional tall billows from a seeded generator; `generateLayers` places the horizon ring and the deck. Horizon clouds keep their near edge 1800 units from the camera and their far edge inside the far plane; deck clouds are capped below the courses. Cloud meshes rebuild only when a map's cloud parameters change and the old geometry is released.
- `src/render/weather.js` (new): snow (700 flakes) and rain (520 streaks) are camera-centred volumes moved in the vertex shader from the shared clock, so the CPU writes nothing per frame. `lightningFlash(t)` is a pure function of time (one flash cluster at most per 7 s, none in about a quarter of the periods, soft full-screen wash at 30% peak). `createWindStreaks` draws tapered fan streaks (a horizontal and a vertical ribbon).
- `src/render/course-scene.js`: `buildCourseScene({ palette })`; toon fans use wind streaks instead of the white soft particles.
- `src/render/renderer.js`: `setCourse` applies the palette (sky mood, fog, weather); `setWeather(enabled)` turns weather off or on and survives course swaps. No UI uses `setWeather` yet.
- `tests/render-modern.test.cjs`: palette shape and distinctness, garden equals `TOON_PALETTE`, lightning determinism and cadence, weather per map, sky uniforms per map, no per-frame weather writes, flash wash, wind streak direction and colour, cloud determinism, per-map layouts, bounds, geometry release on swap. The toon-versus-legacy layout check now also excludes fan particles, the one intended difference.

## Design decisions

- Palettes are data in `src/courses/` and the renderer looks them up by course name, so K1's course redesign can keep or change them without touching render code.
- Weather runs in the vertex shader and lightning depends only on time, so it costs no CPU and every player sees the same flashes. Lightning is slow on purpose (well under three flashes per second) and `setWeather(false)` exists for a future reduced-motion setting.
- Fog follows each palette's horizon band, as in V1b.

## Verification

Commands run in a fresh clone on the Windows machine (AMD Radeon 860M / RTX 5060 Laptop GPU, Windows 11, Chrome channel, 144 Hz display):

```sh
npm run test:render     # 12 legacy parity scenarios + modern toon suite: passed
npm run test:app        # 12 scenarios: passed
npm run build           # BUILD_OK
npm test                # see the result recorded on the PR
npx vite --force --host 127.0.0.1 --port 4190 --strictPort
node <capture script> --gpu low|high --timing-only   # 300 measured frames per starter, weather on and off
```

Real-browser frame times, mean RAF interval in ms (p95), capped at the display refresh (vsync), 300 frames after 60 warm-up, weather on / off:

| Starter | Radeon 860M on | Radeon 860M off | RTX 5060 on | RTX 5060 off |
| --- | ---: | ---: | ---: | ---: |
| Switchback Garden | 7.24 (7.20) | 7.22 (7.20) | 6.90 (7.20) | 6.89 (7.20) |
| Dune Serpent | 7.30 (8.20) | 7.20 (7.10) | 6.92 (7.10) | 6.90 (7.10) |
| Frost Hollow | 7.24 (7.10) | 7.40 (7.10) | 6.89 (7.20) | 6.89 (7.20) |
| Slime Springs | 7.17 (7.10) | 7.18 (7.10) | 6.89 (7.10) | 6.88 (7.10) |
| Cyclone Ring | 7.57 (9.60) | 7.93 (10.50) | 6.89 (7.30) | 6.88 (7.10) |
| Grand Finale | 7.14 (7.10) | 7.15 (7.10) | 6.91 (7.20) | 6.89 (7.20) |

All are far under the 16.7 ms budget on the Radeon 860M. Cyclone Ring is the slowest map (largest cloud bank, four fans, vortices) and weather on versus off makes no consistent difference. An earlier capped run had two 300–1000 ms outliers from window throttling; the numbers above are from a clean rerun. Uncapped runs on the Radeon (weather on / off) were 2.8–5.7 ms. No page or console errors in any run. CPU submit (not GPU time) was measured; GPU timers were not.

## Limits and known issues

- Not run: Firefox and WebKit (hosted browser-ci covers them), real multiplayer sessions, audio.
- jsdom tests stub WebGL: shaders are only proven to compile by the real Chrome runs.
- Some clouds show small jagged teeth on their underside where the flat base cuts the puffs. V1b's clouds had the same artifact.
- The palette `wind` colour and cloud parameters are authored by the worker and approved as a set; no per-map tuning beyond that.
- Before/after strips are not committed; screenshots from the run are under the untracked `test-results/v1c/`.
