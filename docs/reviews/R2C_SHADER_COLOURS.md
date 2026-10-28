# R2c effect-shader colours

Status: REVIEW; issue https://github.com/SpikemenDan/putt-pals/issues/57 ; branch `agent/r2c-shader-colours` from `origin/main` b257e39. Worker: SpikemenDan / Claude Code session.

## Cause

R2 (PR #53) appended `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` to every custom ShaderMaterial (helper `displayFragment` in `src/render/materials.js`). Those shaders were authored on r128 with display (sRGB) values written straight to `gl_FragColor`; r128 applied no tone mapping or encoding to them. On 0.186.1 their output was ACES tone-mapped (exposure 1.15) and sRGB-encoded a second time, which lifts darks and desaturates: the washed-out pads, hazards, portals and auras from #52. Separately, r152+ colour management linearises hex colours passed to `THREE.Color`, so the colour uniforms (portal, aura, trail) and confetti colour attribute no longer held the r128 components. The additive portal beam (a `MeshBasicMaterial` in `src/render/course-scene.js`) got its pink/yellow tint the same way: r128 used its hex unconverted, 0.186.1 linearised it.

## Fix

Removed `displayFragment`, so effect shaders (sky, water, pad, portal, power block, vortex, hazard, vortex particles, aura, ball trail, confetti) output raw display values as on r128. New helper `displayColor(target, color)` in `materials.js` stores raw sRGB components with `setRGB` (unconverted in the linear working space); used for the portal and aura uniforms, the trail colour, confetti colours and the portal beam colour. No global colour-management setting changed. Built-in lit materials, lights, tone mapping, renderer output colour space and geometry are unchanged. The sky in the PMREM environment render target never had tone mapping or encoding applied (render targets are linear), so environment lighting is unchanged.

## Verification

Captured on the Radeon 860M (Chrome, vsync probe) with the R2w harness: `node tests/render/windows/profile.cjs --url http://127.0.0.1:4176 --revision 186 --gpu low --out <dir>`, served by `npx vite --force --host 127.0.0.1 --port 4176 --strictPort`. Compared with the committed #52 captures in `tests/fixtures/render-migration/windows/captures/r128` (r128) and `.../r186` (R2, before). Script: `tests/render/windows/effect-diff.py`; result `tests/fixtures/render-migration/windows/r2c/effect-diff.json`. The effect mask is the pixels the fix changed (before vs after grey difference > 6). Values are mean absolute channel difference (0-255) against r128 inside the mask, and mean HSV saturation inside the mask (r128 / before / after). "Rest" is before vs after outside the mask.

| Shot | Mask | r128 vs before | r128 vs after | Saturation r128 / before / after | Rest |
| --- | ---: | ---: | ---: | ---: | ---: |
| map-0-strategic (Switchback Garden) | 0.39% | 69.55 | 0.28 | 203.1 / 114.5 / 203.4 | 0.00 |
| map-0-hole (Switchback Garden) | 0.58% | 68.09 | 0.41 | 198.8 / 112.6 / 199.0 | 0.02 |
| map-21-strategic (Slime Springs) | 1.05% | 37.31 | 0.50 | 122.8 / 80.8 / 123.4 | 0.03 |
| map-21-follow (Slime Springs) | 7.27% | 17.00 | 2.31 | 27.4 / 61.6 / 30.3 | 0.27 |
| map-19-strategic (Grand Finale) | 0.62% | 36.92 | 0.64 | 127.8 / 83.1 / 128.2 | 0.06 |
| map-0-trail (ball trail) | 0.48% | 10.17 | 4.51 | 32.9 / 15.1 / 33.6 | 0.08 |
| map-5-strategic (Cyclone Ring) | 0.01% | 16.94 | 19.90 | 37.5 / 33.4 / 42.6 | 0.03 |

## Notes

- Cyclone Ring's vortex is near-white additive, so the encoding change barely moves it (0.01% of pixels changed); it matches r128 visually.
- Residual whole-image differences (about 5.2-8.3 of 255) come from R2's accepted built-in material changes: trees, ground/background tint, cup interiors and PBR highlights. They are not effect shaders and are out of scope; V1 #33 owns any restyle.
- The sky sphere is not visible in the probe's downward camera views, so its on-screen fix is covered by the stubbed test and the shared mechanism, not by a capture.
- Only the Radeon was recaptured; #52 found Radeon and RTX captures nearly identical, and this is a colour-pipeline change, not a driver one.
- Comparison strips (left to right: r128, R2 before, R2c after) are in `tests/fixtures/render-migration/windows/r2c/`: `map-0-strategic`, `map-0-hole`, `map-21-strategic`, `map-21-follow`, `map-5-strategic`, `map-19-strategic`.

## Tests

`tests/render-modern.test.cjs` now asserts that no effect shader includes the tone-mapping or colour-space chunks, and that portal, aura, trail and beam colours keep raw sRGB components.

Commands and results: see the PR.
