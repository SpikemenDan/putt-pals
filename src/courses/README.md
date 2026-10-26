# Course data during migration

`createCourseData()` returns fresh, independently owned `definitions`, normalized `rules`, a validated `catalog`, and `sourceHashes`. Import it from `src/courses/index.js`. Definitions retain the legacy geometry keys and tuple coordinates (x/y ground, z elevation) so the shared simulation can consume them directly. Rules resolve legacy default par, penalty, time limit and cup radius for each putt.

`definitions.js` is an exported migration snapshot of all 22 maps, including the complete geometry and 36 starter putts. It is checked against the legacy source by the CLI tests. The legacy HTML still owns the running browser game until I1; this snapshot is not yet a unified browser source of truth.

- `node scripts/export-courses.cjs` checks exact geometry/rule/source-hash parity without writing.
- `node scripts/export-courses.cjs --write` deliberately regenerates the snapshot from legacy source. Review the resulting changes; do not regenerate to conceal unexpected gameplay changes.
- `npm run test:cli` checks complete legacy geometry/rule parity, independent data ownership, malformed geometry, six reference sink ticks, all 36 recorded starter shots, process exit behavior and execution without legacy files.
- `node tools/cli/main.mjs list` and `shot <map> <putt> <deg> <power>` import course data and simulation directly. They do not load HTML, tools.js or the VM adapter.
- `node tools/cli/main.mjs validate` also reads source files to compare hashes against the recorded inventory and exported provenance. It hashes these files without executing them.

Only the migration exporter and reference tests use the legacy adapter. Do not import it into application code. Remaining D1 work includes importing arena generation, solve/check/rank consumers, comprehensive playable bounds/reference validation and replacing the running browser's legacy definitions during integration. Geometry tuple validation here protects current primitive shapes and finite numeric dimensions; it does not certify reachability or course design.
