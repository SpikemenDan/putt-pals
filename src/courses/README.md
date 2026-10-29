# Course data during migration

`createCourseData()` returns fresh, independently owned `definitions`, normalized `rules`, a validated `catalog`, and `sourceHashes`. Import it from `src/courses/index.js`. Definitions retain the legacy geometry keys and tuple coordinates (x/y ground, z elevation) so the shared simulation can consume them directly. Rules resolve legacy default par, penalty, time limit and cup radius for each putt.

`definitions.js` is an exported migration snapshot of all 22 maps, including the complete geometry and 36 starter putts. It is checked against the legacy source by the CLI tests. The legacy HTML still owns the running browser game until I1; this snapshot is not yet a unified browser source of truth.

- `node scripts/export-courses.cjs` checks exact geometry/rule/source-hash parity without writing.
- `node scripts/export-courses.cjs --write` deliberately regenerates the snapshot from legacy source. Review the resulting changes; do not regenerate to conceal unexpected gameplay changes.
- `npm run test:cli` checks complete legacy geometry/rule parity, independent data ownership, malformed geometry, six reference sink ticks, all 36 recorded starter shots, process exit behavior and execution without legacy files.
- `node tools/cli/main.mjs list` and `shot <map> <putt> <deg> <power>` import course data and simulation directly. They do not load HTML, tools.js or the VM adapter.
- `node tools/cli/main.mjs validate` also reads source files to compare hashes against the recorded inventory and exported provenance. It hashes these files without executing them.

Only the migration exporter and reference tests use the legacy adapter. Do not import it into application code. Remaining D1 work includes comprehensive course/reference validation and replacing the running browser's legacy definitions during integration. Geometry tuple validation here protects current primitive shapes and finite numeric dimensions; it does not certify reachability or course design.

`node tools/cli/main.mjs solve <map> <putt> [--full]` searches through the shared simulation with the historical half-degree/power grid, 4800-tick trial window and nine robustness offsets. Fast mode stops at the first robust shot; `--full` searches the complete grid and reports hit counts. The JSON result uses zero-based indices. Exit status is 1 if no robust solution exists or arguments are invalid. This command does not update historical difficulty fixtures; B4 remains a separate measurement task.

Solver parity includes the legacy floating-point power endpoint (`1.0000000000000002`). The solver uses the simulation launch multiplier port to preserve the exact grid speed without changing normalized user-shot clamping. A full-grid regression on Switchback Garden putt 1 matches the legacy 811 sinks; this is one putt, not the B4 exhaustive difficulty report.

`node tools/cli/main.mjs arena "Grand Finale"` prints a generated course as JSON. It reads exported arena specifications and applies a pure chamber-to-world transform; it does not write game source or replace the checked-in course definitions. `buildArenaGeometry(chambers)` accepts one to six legacy chamber records and returns fresh geometry. `generateArena(name)` resolves the existing rules for the six named starter arenas. Historical counts only preserve the existing par/penalty defaults; they do not certify current difficulty.

`node scripts/export-arenas.cjs` checks exported arena inputs against legacy tools; `--write` deliberately refreshes them. The CLI regression suite compares all six complete generated courses with the legacy generator, validates malformed input, and verifies no HTML writes. Migration exporter/reference tests still use VM loading; the generator and CLI do not.

`node tools/cli/main.mjs check` validates all imported maps without reading legacy source. It checks geometry tuple shapes, finite coordinates, positive primitive dimensions, tee/cup positions on playable tiles and outside pits, geometry/rule identity and count consistency, resolved per-putt rules, and starter total pars. It does not check HTML syntax, wall clearance, connectivity, reachability or every hazard interaction. `validate` remains the separate source/inventory hash check.

`node tools/cli/main.mjs rank` audits the recorded six-map ladder without invoking the legacy VM. Counts are explicitly historical: exit 2 means structural checks pass but current difficulty is unverified; exit 1 means malformed counts, mismatched starter identity/order or non-descending difficulty. It deliberately has no success result certifying current difficulty until the separate B4 measurement work exists. No fixture is refreshed by this command.

## Versioned course documents

`node tools/cli/main.mjs export` prints the complete schema-version-1 course document. Each course has its existing stable ID, description and geometry; each putt has a persisted ID, a legacy index, positions and explicit scoring/timer/cup rules. Initial putt IDs use `<course-id>-putt-<1-based-number>`. Once exported, preserve IDs across display-name edits and reordering; update only the positional indices when reordering putts. Re-exporting from legacy source is a migration operation and cannot infer renamed/reordered identity.

`parseCourseDocument(json)` validates version, IDs, indices, rules, geometry, starter presence and playable tee/cup positions at the boundary. Unsupported versions and duplicate/malformed IDs fail explicitly. `toSimulationCourses(document)` returns independent geometry/putt data using normalized rule names already supported by SimulationEngine. Explicit zero penalties are preserved. All 36 recorded starter shots have identical results through this adapter.

The document format is available for course-file and future browser consumers. CLI shots and solver searches use the normalized simulation adapter; the current browser is unchanged. Exporting does not adopt a file automatically. This adds no course editor, automatic file writes or deployment.

## Difficulty provenance

CLI `solve` JSON now includes `schemaVersion: 1` and a `provenance` record: persisted course/putt IDs, a SHA-256 hash of the entire normalized course, a simulation/shared-source hash, a solver configuration/source hash, and `searchMode` (`fast` or `full`). Course hashing sorts object keys but preserves array order. Source hashes use relative paths and file contents, so identical checkouts in different directories agree. Shared-source hashing is conservative: even non-physics contract changes invalidate prior results.

`SOLVER_CONFIG` in tools/cli/solver.mjs defines the actual grid, trial duration, hazard time and robustness offsets used by the solver. Configuration provenance also hashes solver source so algorithm changes cannot silently reuse old evidence. This does not change the grid or gameplay physics.

`assessDifficultyResult(saved, currentProvenance)` in tools/cli/provenance.mjs checks persisted result structure and compares every provenance field. `current` means the recorded fingerprints match; `complete` additionally requires full-grid mode. Neither checks data authenticity or replays a measurement. Missing/malformed provenance, changed geometry/rules, a different putt, simulation changes or changed search configuration invalidate the result. Fast-search hit counts remain partial. Historical rank still exits 2, and the B4 exhaustive sweep is not run or completed by adding provenance.

## Loading course files

Use `--courses <file.json>` before or after the command to supply a schema-version-1 document to `list`, `check`, `export`, `shot` or `solve`. For example: `node tools/cli/main.mjs shot 0 0 31 0.8 --courses courses.json`. Relative paths resolve from your working directory. Export a starting file with `node tools/cli/main.mjs export > courses.json`; this is an explicit shell write, not an automatic game-data update.

All supplied documents are parsed and validated before use. Stored IDs and display-name edits survive listing/re-export; shots/solutions consume the loaded geometry/rules, and solver provenance hashes the loaded course. Default shots and solver commands also use `toSimulationCourses()` on the normalized document. Both default and file-backed modes remain headless.

Missing/malformed files, unsupported schemas, duplicate/missing options, unsupported commands and incorrect argument counts exit 1 with a handled error. `validate` is the source/inventory audit, `rank` is the historical ladder audit, and `arena` uses named chamber specifications; they reject `--courses` rather than silently ignore it. No supplied file is modified.

## Geometry integrity

`check` and document validation also run the CL1 geometry integrity rules (interpenetrating solids, wall/spawn/cup clearances, ramp seams) with errors naming map, putt and element ids. See "Course geometry integrity" in ARCHITECTURE.md. This supersedes the earlier note that `check` does not examine wall clearance; it still does not certify connectivity or reachability.
