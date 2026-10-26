// Migration-only exporter. Runtime modules never import the legacy VM adapter.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { loadLegacy, legacyRawCourses, sourceHashes } = require('../tools/legacy-adapter.cjs');
const root = path.resolve(__dirname, '..');
const legacy = loadLegacy();
const raw = legacyRawCourses(legacy);
const courses = JSON.parse(JSON.stringify(legacy.HOLES));
const output = '// Exported legacy geometry; regenerate with node scripts/export-courses.cjs --write.\n'
  + 'export const courseSourceHashes = ' + JSON.stringify(sourceHashes()) + ';\n'
  + 'export const courseDefinitions = [\n' + courses.map(c => '  ' + JSON.stringify(c)).join(',\n') + '\n];\n'
  + 'export const courseRules = ' + JSON.stringify(raw) + ';\n';
const target = path.join(root, 'src/courses/definitions.js');
if (process.argv[2] === '--write') {
  fs.writeFileSync(target, output);
  console.log('COURSES_WRITTEN: 22 course definitions and resolved putt rules');
} else {
  assert.equal(fs.readFileSync(target, 'utf8'), output, 'course export differs from legacy source; review before regenerating');
  console.log('COURSES_EXPORT_OK: complete geometry and rules match legacy source');
}
