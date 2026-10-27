# B4 starter difficulty sweep

Task: [B4 #4](https://github.com/SpikemenDan/putt-pals/issues/4). Exhaustive full-grid difficulty for all 36 starter putts under the corrected launch physics (POWER=900, shared launch path from B2). Measurement only. No physics, course layout, par, penalty or recorded ladder value was changed.

Data: [tests/fixtures/difficulty-b4.json](../../tests/fixtures/difficulty-b4.json). It holds every putt's full hit count, first robust shot, historical count, the par/penalty the game uses today, what the default formulas would give from fresh counts, and the CLI provenance record (course, simulation and solver-configuration SHA-256).

## Result

All 36 putts have a robust hole-in-one. Every putt is above the 60-hit minimum, and the six-map ladder is still strictly harder from first to last. Every map and 35 of 36 putts are easier than the recorded counts suggest. Fresh totals run 14–21% above the recorded ones.

| Slot | Map | Name | Fresh total | Recorded total | Change | Lowest putt | Penalty in game | Penalty from fresh total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | Switchback Garden | 6052 | 5213 | +839 | 768 | 3 | 3 |
| 2 | 8 | Dune Serpent | 4776 | 3948 | +828 | 626 | 3 | 3 |
| 3 | 20 | Frost Hollow | 4253 | 3652 | +601 | 287 | 3 | 3 |
| 4 | 21 | Slime Springs | 3541 | 3115 | +426 | 211 | 3 | 3 |
| 5 | 5 | Cyclone Ring | 1949 | 1673 | +276 | 222 | 4 | 3 |
| 6 | 19 | Grand Finale | 1391 | 1180 | +211 | 125 | 4 | 4 |

The legacy solver (`tools.js solve M --full`) and the modern CLI (`tools/cli/main.mjs solve M P --full`) agree exactly on every hit count and robust shot. All 36 provenance records assess as `current` and `complete` against the checked-out sources (`assessDifficultyResult`).

## Findings for separate tuning work

These are reported, not fixed. Changing par, penalties or `LADDER` needs its own task and approval.

1. **The recorded ladder is stale.** `LADDER` in tools.js (mirrored in `src/courses/arena-specs.js`) undercounts every map. `rank` still exits 2 because it only audits the recorded numbers. Whoever owns tuning can replace the recorded counts with this fixture.
2. **Game par/penalty already disagree with the recorded ladder.** The par and penalty baked into putt-pals.html and `src/courses/definitions.js` were derived from counts older than commit 3d91bbe ("Refresh P25 hole-in-one counts"), which changed `LADDER` without regenerating them. Even against the recorded counts, 9 putts have a different default par. Cyclone Ring's penalty is 4, but its recorded total (1673 ≥ 1500) gives 3.
3. **Fresh counts would lower par on 17 putts.** Using the existing formula (≥600 hits → par 2, ≥250 → 3, else 4), map par totals would drop from 12/15/18/19/23/24 to 12/12/13/16/20/21. Cyclone Ring's penalty would also become 3. Whether to adopt this, or retune layouts to keep the current pars, is a design decision.
4. **Cyclone Ring putt 6 is the only putt that got harder** (322 vs 349 recorded).

## Per-putt results

Robust shot is the first robust grid point (angle in degrees / normalized power). "Par in game" is what players get today. "Par from recorded" and "Par from fresh" apply the default formula to each count.

| Map | Putt | Fresh hits | Recorded | Change | Robust shot | Par in game | Par from recorded | Par from fresh |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Switchback Garden | 1 | 811 | 686 | +125 | 31° / 0.8 | 2 | 2 | 2 |
| Switchback Garden | 2 | 1189 | 1014 | +175 | 25° / 0.65 | 2 | 2 | 2 |
| Switchback Garden | 3 | 768 | 644 | +124 | 14° / 1 | 2 | 2 | 2 |
| Switchback Garden | 4 | 1251 | 1068 | +183 | 13° / 1 | 2 | 2 | 2 |
| Switchback Garden | 5 | 868 | 811 | +57 | 40.5° / 0.4 | 2 | 2 | 2 |
| Switchback Garden | 6 | 1165 | 990 | +175 | 13° / 0.7 | 2 | 2 | 2 |
| Dune Serpent | 1 | 849 | 693 | +156 | 22.5° / 1 | 2 | 2 | 2 |
| Dune Serpent | 2 | 743 | 633 | +110 | 16° / 0.65 | 3 | 2 | 2 |
| Dune Serpent | 3 | 870 | 776 | +94 | 0° / 0.35 | 2 | 2 | 2 |
| Dune Serpent | 4 | 626 | 485 | +141 | 41° / 0.9 | 3 | 3 | 2 |
| Dune Serpent | 5 | 648 | 492 | +156 | 14° / 0.9 | 3 | 3 | 2 |
| Dune Serpent | 6 | 1040 | 869 | +171 | 24° / 1 | 2 | 2 | 2 |
| Frost Hollow | 1 | 287 | 232 | +55 | 19° / 0.75 | 4 | 4 | 3 |
| Frost Hollow | 2 | 774 | 647 | +127 | 44.5° / 0.45 | 3 | 2 | 2 |
| Frost Hollow | 3 | 819 | 716 | +103 | 14° / 0.65 | 3 | 2 | 2 |
| Frost Hollow | 4 | 685 | 579 | +106 | 30.5° / 0.9 | 3 | 3 | 2 |
| Frost Hollow | 5 | 1084 | 954 | +130 | 15.5° / 0.65 | 2 | 2 | 2 |
| Frost Hollow | 6 | 604 | 524 | +80 | 35° / 0.65 | 3 | 3 | 2 |
| Slime Springs | 1 | 1062 | 997 | +65 | 15.5° / 1 | 2 | 2 | 2 |
| Slime Springs | 2 | 211 | 148 | +63 | 0° / 0.7 | 4 | 4 | 4 |
| Slime Springs | 3 | 373 | 277 | +96 | 21.5° / 0.95 | 4 | 3 | 3 |
| Slime Springs | 4 | 451 | 361 | +90 | 50.5° / 0.75 | 3 | 3 | 3 |
| Slime Springs | 5 | 754 | 690 | +64 | 18° / 1 | 3 | 2 | 2 |
| Slime Springs | 6 | 690 | 642 | +48 | 22° / 0.65 | 3 | 2 | 2 |
| Cyclone Ring | 1 | 228 | 170 | +58 | 31° / 1 | 4 | 4 | 4 |
| Cyclone Ring | 2 | 649 | 588 | +61 | 10° / 1 | 3 | 3 | 2 |
| Cyclone Ring | 3 | 222 | 181 | +41 | 60° / 0.65 | 4 | 4 | 4 |
| Cyclone Ring | 4 | 303 | 217 | +86 | 31.5° / 0.7 | 4 | 4 | 3 |
| Cyclone Ring | 5 | 225 | 168 | +57 | 17° / 0.8 | 4 | 4 | 4 |
| Cyclone Ring | 6 | 322 | 349 | −27 | 49.5° / 0.45 | 4 | 3 | 3 |
| Grand Finale | 1 | 186 | 155 | +31 | 31.5° / 0.85 | 4 | 4 | 4 |
| Grand Finale | 2 | 125 | 104 | +21 | 34.5° / 0.9 | 4 | 4 | 4 |
| Grand Finale | 3 | 292 | 238 | +54 | 66.5° / 1 | 4 | 4 | 3 |
| Grand Finale | 4 | 168 | 138 | +30 | 50.5° / 0.8 | 4 | 4 | 4 |
| Grand Finale | 5 | 291 | 252 | +39 | 150° / 0.95 | 4 | 3 | 3 |
| Grand Finale | 6 | 329 | 293 | +36 | 22.5° / 0.65 | 4 | 3 | 3 |

## Provenance

- Measured on main at `2b8eab0` (2026-10-27). Rebased onto `f72a374` (PR #27, R1 renderer). That merge changes none of putt-pals.html, tools.js, src/simulation, src/shared, src/courses or tools/, so the measurement still applies, and every provenance hash re-verified as current.
- putt-pals.html `e5b5a674…4e75` and tools.js `5531b117…d4fd`: the same hashes as the B2 fast-mode fixture.
- Simulation/shared `3e228cda…ead6`, solver configuration `37225943…2b72`. Full hashes are in the fixture.
- Grid: 720 half-degree angles × power 0.30–1.00 in 0.05 steps, 4800-tick trials, nine robustness offsets (`SOLVER_CONFIG`).

## How to reproduce

Run from a clean checkout after `npm ci`. Measured on 2 CPUs: the legacy sweep takes about 43 minutes (two maps in parallel), the CLI sweep about 4.5 minutes.

```sh
node scripts/inventory-baseline.cjs --check            # INVENTORY_OK
mkdir -p sweep/legacy sweep/cli
for m in 0 8 20 21 5 19; do
  node tools.js solve $m --full > sweep/legacy/map-$m.log; echo "exit=$?" >> sweep/legacy/map-$m.log
  for p in 0 1 2 3 4 5; do node tools/cli/main.mjs solve $m $p --full > sweep/cli/map-$m-putt-$p.json; done
done
node scripts/aggregate-difficulty.mjs sweep <measured-commit>   # AGGREGATE_OK, LADDER_OK
```

`scripts/aggregate-difficulty.mjs` only combines the two sweeps. It measures nothing, exits 1 if a putt is missing or the solvers disagree, and never edits course data.

## Limits

- These are headless solver counts over a fixed grid, not human-play difficulty. No browser, multiplayer or playtest evidence is claimed.
- Only the six starter maps were swept. The 16 backlog maps are untouched.
- The fixture is not wired into `npm test`. Any later simulation or course change makes its provenance stale on purpose; `assessDifficultyResult` reports that.
