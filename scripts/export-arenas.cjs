// Migration-only export; the arena generator imports data without evaluating source.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools.js'), 'utf8');
const marker = 'const[,,cmd,...args]=process.argv;';
assert.equal(source.split(marker).length, 2, 'unique legacy CLI boundary');
const context = { require, __dirname: root, process, performance, console };
vm.createContext(context);
vm.runInContext(source.slice(0, source.indexOf(marker)) + '\nthis.data={cells:CELLS,perimeter:PERIM,specs:SPECS,ladder:LADDER,limits:MAP_LIMIT};', context);
const output = '// Migration snapshot; check/regenerate with scripts/export-arenas.cjs [--write].\n'
  + 'export const arenaSourceData = ' + JSON.stringify(context.data, null, 2) + ';\n';
const formatted = output.replace(/\[\s*(-?\d+(?:\.\d+)?(?:,\s*-?\d+(?:\.\d+)?)+)\s*\]/g, (_, tuple) => '[' + tuple.replace(/\s+/g, ' ') + ']');
const target = path.join(root, 'src/courses/arena-specs.js');
if (process.argv[2] === '--write') {
  fs.writeFileSync(target, formatted);
  console.log('ARENAS_WRITTEN: six legacy arena specifications');
} else {
  assert.equal(fs.readFileSync(target, 'utf8'), formatted, 'arena specs differ from legacy source');
  console.log('ARENAS_EXPORT_OK: arena inputs match legacy source');
}
