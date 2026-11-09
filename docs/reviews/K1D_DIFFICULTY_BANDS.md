# K1d difficulty bands and starter maps

Task: [K1d #100](https://github.com/SpikemenDan/putt-pals/issues/100). Difficulty bands by map rating measured with SV1 (par-based, no hole-in-one requirement), optional hole-in-one shortcuts on some putts, re-solved starter maps, fresh difficulty sweep.

## Outcome

1. **Difficulty bands defined**: Established four standardized difficulty bands (`DIFFICULTY_BANDS` in `src/courses/difficulty.js`):
   - **Tier 1: Beginner** (6-putt rating $\le 10.0$, per-putt rating $\le 1.67$)
   - **Tier 2: Intermediate** ($10.0 < \text{Rating} \le 14.0$, per-putt $1.67 < d \le 2.33$)
   - **Tier 3: Advanced** ($14.0 < \text{Rating} \le 18.0$, per-putt $2.33 < d \le 3.00$)
   - **Tier 4: Expert** ($\text{Rating} > 18.0$, per-putt $> 3.00$)
   - Helper `getDifficultyBand(rating, puttCount)` normalizes non-6-putt maps to the standard 6-putt rating scale.
2. **Starter maps re-solved**: All 36 starter putts were re-solved with the SV1 par-route solver (`tools/cli/par-solver.mjs`), with 36/36 verified robust routes within par (2 to 6 strokes).
3. **Par solver tee refinement**: Added quarter-step local refinement around nominal sinks from the tee in `tools/cli/par-solver.mjs`, enabling fast discovery of robust hole-in-ones with narrow margins (e.g. Cyclone Ring putt 6 at 25.88° / 106.25°), avoiding expensive multi-minute waypoint recursion.
4. **Rank CLI updated**: `tools/cli/main.mjs rank --routes <file>` now outputs the difficulty rating, stroke count, and assigned difficulty band name for each starter course.

## Starter ladder difficulty sweep (SV1 par-based)

Sweep measured across all 36 starter putts under current physics (gravity 700):

| Rank | Map Index | Course Name | SV1 Difficulty | Route Strokes | Difficulty Band |
| --- | --- | --- | --- | --- | --- |
| 1 | 21 | Slime Springs | 9.000 | 6 | Beginner |
| 2 | 0 | Switchback Garden | 9.668 | 6 | Beginner |
| 3 | 20 | Frost Hollow | 9.668 | 6 | Beginner |
| 4 | 8 | Dune Serpent | 9.835 | 6 | Beginner |
| 5 | 5 | Cyclone Ring | 10.002 | 6 | Intermediate |
| 6 | 19 | Grand Finale | 11.668 | 8 | Intermediate |

### Key observations
- **All 36 starter putts have robust routes**: Every putt satisfies the owner par acceptance rule (2 to 6 strokes).
- **Hole-in-one vs multi-stroke routes**:
  - 34 putts feature robust single-stroke hole-in-one lines.
  - Grand Finale putts 1 and 3 (indices 19/0 and 19/2) require 2-stroke routes (par 2), elevating Grand Finale to a rating of 11.668 (Intermediate).
  - Cyclone Ring putt 6 features a tighter margin, crossing into Intermediate at 10.002.
- **Shipped starter order vs measured difficulty**:
  - Shipped starter order: `[0, 8, 20, 21, 5, 19]`
  - Measured difficulty order: `[21, 0, 20, 8, 5, 19]`
  - Slime Springs (21) measures slightly easier than Switchback Garden (0) due to generous bounce angles and wider cup capture margins on slime surfaces. The shipped order remains an owner design choice as reported by `rank`.

## Verification commands and evidence

- `node tests/difficulty-bands.test.cjs`: PASS (4 bands schema, 6-putt and normalized non-6-putt mappings, validation, rank integration)
- `node tools/cli/main.mjs rank --routes /tmp/starters-all.json`: PASS (exit code 0, all 6 starter courses classified)
- `node tests/cli.test.cjs`: PASS (all 39 CLI test scenarios)
- `npm run test:courses`: PASS (all 6 course suites, including difficulty bands)
- `npm run check`: PASS (22 courses geometry and par rules agreement)
