#!/usr/bin/env node
// Generates src/courses/data/courses.snapshot.json from the legacy game data.
//   node scripts/export-courses.cjs --write   regenerate the snapshot
//   node scripts/export-courses.cjs --check   fail (exit 1) if the snapshot is stale
// This is the one place that still runs legacy source through the VM adapter.
const fs = require('node:fs');
const path = require('node:path');
const { loadLegacy, legacyRawCourses, sourceHashes } = require('../tools/legacy-adapter.cjs');

const SCHEMA_VERSION = 1;
const target = path.resolve(__dirname, '../src/courses/data/courses.snapshot.json');

/** One course per line keeps diffs reviewable. */
function serialize(snapshot) {
  const rows = list => list.map(item => '  ' + JSON.stringify(item)).join(',\n');
  return (
    '{\n' +
    ` "schemaVersion": ${snapshot.schemaVersion},\n` +
    ` "source": ${JSON.stringify(snapshot.source)},\n` +
    ' "courses": [\n' + rows(snapshot.courses) + '\n ],\n' +
    ' "catalog": [\n' + rows(snapshot.catalog) + '\n ]\n' +
    '}\n'
  );
}

function build() {
  const legacy = loadLegacy();
  // JSON round trip drops VM-realm prototypes and anything that is not plain data.
  const courses = JSON.parse(JSON.stringify(legacy.HOLES));
  const catalog = JSON.parse(JSON.stringify(legacyRawCourses(legacy)));
  return { schemaVersion: SCHEMA_VERSION, source: sourceHashes(), courses, catalog };
}

const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') {
  console.error('usage: node scripts/export-courses.cjs --write | --check');
  process.exit(1);
}

const expected = serialize(build());
if (mode === '--write') {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, expected);
  console.log(`Wrote ${path.relative(process.cwd(), target)} (${expected.length} bytes)`);
} else {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
  if (current === expected) {
    console.log('SNAPSHOT OK: course snapshot matches the live legacy data and source hashes');
  } else {
    console.error('SNAPSHOT STALE: run "node scripts/export-courses.cjs --write" and review the diff');
    process.exit(1);
  }
}
