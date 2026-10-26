# D1 data and CLI review handoff

Integrated through [PR #22](https://github.com/SpikemenDan/putt-pals/pull/22), merged into main with user approval as `8dcf760` on 2026-10-26. The reviewed code head was `41bfaa3`. [D1 #8](https://github.com/SpikemenDan/putt-pals/issues/8) remains open for its remaining accepted scope. This bounded data/CLI delivery does not complete browser integration or the whole modernization gate.

## Delivered interfaces

- `createCourseDocument()` exposes all 22 maps in schema version 1, including six starters and their 36 putts. Course and putt IDs persist in saved documents; indices preserve the legacy adapter contract.
- `parseCourseDocument(json)` validates loaded data; `toSimulationCourses(document)` returns independently owned geometry/rules for the shared `SimulationEngine`.
- The CLI imports data and simulation directly for list/check/export/shot/solve. `--courses <file.json>` supplies validated documents to those commands. Stored IDs and edits survive actual consumption. Arena emits JSON rather than patching source.
- Solver JSON fingerprints the normalized course, simulation/shared source and actual solver configuration/source. Fast searches remain partial counts; `assessDifficultyResult()` detects stale metadata and distinguishes full-grid evidence.
- `validate` audits legacy source/inventory provenance without executing source; `rank` labels historical counts and exits 2. Neither claims fresh B4 measurements.

See [the course guide](../../src/courses/README.md) for commands, ownership semantics, schema details and error codes. Normalized browser consumers must preserve simulation coordinates: x/y ground, z elevation.

## Acceptance evidence

- All 22 maps validate; versioned documents round-trip with unique IDs and explicit rules. Malformed versions/IDs/geometry/rules and unplayable tee/cup positions are rejected.
- Complete geometry and resolved rules match the legacy snapshots. All six generated starter arenas match the legacy generator exactly.
- All 36 starter searches return the recorded first robust solution. One full-grid search (map 0, putt 0) matches the legacy 811 sinks and robust shot at 31 degrees/power 0.8. This is not a full difficulty sweep.
- The normalized adapter reproduces the recorded 36 starter shot results. Reference sink ticks and mechanic parity remain covered by the simulation suite.
- Process tests exercise default/file-backed execution, handled failures and commands without legacy HTML/tools/VM files. These are real Node processes, not browser/network evidence.

## Preserved behavior and known limits

No HTML, simulation physics, course layout, scoring constants or dependency versions changed in this PR. The solver preserves the legacy floating power-grid endpoint through the existing launch multiplier API; normalized player-shot clamping is unchanged.

The browser still runs the legacy embedded game. I1 must integrate the shared course/simulation modules with renderer/session/input consumers and verify browser parity. The legacy adapter, exporters and reference tests still use VM/source loading for migration comparison; the normal modern CLI does not. Keep those references until integration acceptance establishes that they can be removed.

A static review found the existing Fortress Spiral backlog map (index 11) cup center `[400,250]` inside wall rectangle `[280,235,258,18]`. The imported data exactly preserves that layout. This geometric overlap alone does not establish that the putt is unsolvable; it is not a migration regression and was not retuned. The six starter courses are unaffected by this observation. Geometry validation currently checks shapes, finite values and playable ground/pits, not complete wall clearance, connectivity or every hazard interaction.

Difficulty hashes identify matching inputs; they do not authenticate reported results or replay measurements. B4 still owns fresh exhaustive difficulty evidence. The current production build still serves the baseline HTML; a successful build does not demonstrate browser adoption of these modules.

## Remaining integration work

1. PR #22 is merged. Use main at `8dcf760` or later as the accepted data/CLI baseline for dependent work.
2. Keep D1 open for any remaining accepted scope; coordinate browser-consumer adoption through I1 rather than silently marking it complete.
3. The coordinator must reconcile PROJECT_STATUS.md/TASKS.md and downstream prerequisites with the accepted integration. No dependent issue should be unblocked solely from this report.
4. Checkout-only CRLF/LF diffs in ARCHITECTURE.md, PROJECT_STATUS.md and TASKS.md were excluded from the delivery. Their content was unchanged; the newer .gitattributes policy needs a separate normalization decision.

## Final verification at 41bfaa3

Run locally on Node v26.10.0 and npm 11.19.1, after `npm ci --offline --cache /private/tmp/putt-pals-npm-cache` installed the locked dependencies successfully:

| Command | Result |
| --- | --- |
| `npm test` | Passed end-to-end: syntax/metadata, contracts, simulation parity, 14 course checks, 31 CLI checks, physics/mechanics, solo/practice/tournament smoke and four-client fake-network smoke |
| `npm run build` | Passed; embedded library/game scripts preserved byte-for-byte |
| `node scripts/export-courses.cjs` | Passed; full geometry/rules/source hashes match legacy export |
| `node scripts/export-arenas.cjs` | Passed; arena specifications match legacy inputs |
| `node scripts/inventory-baseline.cjs --check` | Passed; source hashes, library metadata, 22 maps and six traces match |
| Scoped `git diff --check` | Passed |

Hosted baseline-ci also passed for 41bfaa3: [run 40341590947](https://github.com/SpikemenDan/putt-pals/actions/runs/40341590947). A fresh fetch found no newer main commit missing from this branch. No new real-browser, real WebRTC/TURN, audio-quality or performance validation was performed. jsdom graphics/audio and fake networking remain distinct from those acceptance gates.

The user approved adding this handoff to main after the PR merge. D1 remains open; future implementation and merges retain their documented approval requirements.
