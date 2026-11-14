# VIS-G world maps: content and difficulty evidence (#165)

Owner decisions (2026-11-11, MODERNIZATION_PLAN.md "Decided 2026-11-11"): courses stay floating islands with today's physics; Gaia keeps its 22 maps plus 2 new ones (24, four per region); Ares and Luna each start with two regions of four maps. No maps are retired and no physics changed.

## What was added

| World | Region | Maps (index) |
| --- | --- | --- |
| Gaia | Sunspire Sands | Sandstorm Spire (22), replacing the placeholder |
| Gaia | Emberfall Isles | Obsidian Spiral (23), replacing the placeholder |
| Ares | Rustfall Canyons | Redrock Rebound (24), Canyon Leap (25), Dust Devil Draw (26), Ochre Overlook (27) |
| Ares | Ironcrown Highlands | Basalt Bounce (28), Caldera Climb (29), Ironstone Ridge (30), Scarlet Summit (31) |
| Luna | Hushed Mare | Moondust Mile (32), Regolith Rise (33), Starlight Skip (34), Gaiarise Run (35) |
| Luna | Craterpeak Highlands | Crater Hop (36), Rimwalker Ridge (37), Ghostlight Basin (38), Polar Hollow (39) |

Every map is six holes on one island, in either the classic 3 x 2 chamber grid or a 2 x 3 layout of long lanes (348 x 128) that gives low-gravity hops room to land. Ares and Luna maps carry `world` in their course data, so their gravity (Ares 490, Luna 315 units/s^2) comes from the shared course data in the browser, CLI and solver. Region data for Ares and Luna is in `src/shared/world-regions.js`; each region has its own palette in `src/courses/palettes.js`. All names and art are original.

Designed for gravity: jump pads (vertical launch 400 units/s) and launch ramps are the main tools. Rolling distance does not depend on gravity, but airtime does: a pad hop lasts about 1.1 s on Gaia, 1.6 s on Ares and 2.5 s on Luna, and its apex (114, 163, 254) clears walls (28 tall) for longer. Canyons and craters are sized for the home world's arcs. Of the recorded routes that replay as stored, 21 of 48 on Ares and 18 of 48 on Luna no longer hold at Gaia gravity (`tests/world-maps.test.cjs`).

## Par and difficulty evidence

`tests/fixtures/world-maps/par-routes.json` is a measure-par report (SV1 fast search) for all 108 putts of maps 22-39, each solved at its own world's gravity:

```
node tools/cli/measure-par.mjs --only 22/0,...,39/5 --jobs 2 --out tests/fixtures/world-maps/par-routes.json
```

Result: 108 robust routes, 0 none, 0 budget. Par per putt is the shortest robust route plus one (2..6). `tests/world-maps.test.cjs` (in `npm run test:courses`) checks the report is current (simulation, course and solver fingerprints), that every route is within its shipped par, and replays each route with its nine finishing perturbations at that world's gravity. The report rounds angles to 0.01 degree; five edge-of-robust putts (22/2, 32/2, 32/5, 34/0, 34/5) do not replay from the rounded numbers, so the test re-solves those from scratch and requires a robust route within par.

| Map | Name | World | Par | Robust route strokes per putt | Summed difficulty |
| --- | --- | --- | --- | --- | --- |
| 22 | Sandstorm Spire | gaia | 12 | 1 1 1 1 1 1 | 9.50 |
| 23 | Obsidian Spiral | gaia | 13 | 2 1 1 1 1 1 | 10.50 |
| 24 | Redrock Rebound | ares | 13 | 1 2 1 1 1 1 | 10.17 |
| 25 | Canyon Leap | ares | 13 | 1 1 1 1 1 2 | 10.83 |
| 26 | Dust Devil Draw | ares | 12 | 1 1 1 1 1 1 | 9.17 |
| 27 | Ochre Overlook | ares | 12 | 1 1 1 1 1 1 | 9.00 |
| 28 | Basalt Bounce | ares | 13 | 1 1 1 1 1 2 | 10.34 |
| 29 | Caldera Climb | ares | 14 | 1 1 2 1 1 2 | 11.50 |
| 30 | Ironstone Ridge | ares | 12 | 1 1 1 1 1 1 | 9.50 |
| 31 | Scarlet Summit | ares | 13 | 1 1 1 1 1 2 | 9.83 |
| 32 | Moondust Mile | luna | 13 | 1 1 1 1 2 1 | 10.50 |
| 33 | Regolith Rise | luna | 14 | 1 2 1 2 1 1 | 11.33 |
| 34 | Starlight Skip | luna | 13 | 1 1 1 1 1 2 | 11.00 |
| 35 | Gaiarise Run | luna | 12 | 1 1 1 1 1 1 | 10.00 |
| 36 | Crater Hop | luna | 15 | 1 2 1 3 1 1 | 13.00 |
| 37 | Rimwalker Ridge | luna | 14 | 1 1 1 1 3 1 | 11.67 |
| 38 | Ghostlight Basin | luna | 12 | 1 1 1 1 1 1 | 8.67 |
| 39 | Polar Hollow | luna | 12 | 1 1 1 1 1 1 | 9.67 |

All maps are in the Beginner or Intermediate difficulty bands: most holes allow a robust hole-in-one for the solver's precise aim. That is a deliberate first-content baseline; harder variants are an owner playtest decision. Hole-in-ones stay optional.

Checks: `node tools/cli/main.mjs check` (CL1 integrity included) passes on all 40 maps. Physics or geometry changes invalidate this evidence: regenerate with the command above.

## Not covered

- The island's region ground (scenery under each island) is not drawn yet; this adds the maps and regions only.
- There is no 3D atlas of Ares or Luna: their level select is the plain course list grouped by region.
- Owner playtest acceptance of the maps' look and feel is pending.
