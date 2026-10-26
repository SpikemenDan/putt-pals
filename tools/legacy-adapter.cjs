// Legacy-only adapter: loads the real game data through tools.js (VM based).
// Replace with direct imports once the legacy HTML is no longer the source of truth.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const CLI_BOUNDARY = 'const[,,cmd,...args]=process.argv;';

/** Returns the legacy API object (HOLES, H, parOf, penOf, limitOf, cupOf, NP, ...). */
function loadLegacy() {
  const tools = fs.readFileSync(path.join(root, 'tools.js'), 'utf8');
  assert.equal(tools.split(CLI_BOUNDARY).length, 2, 'unique legacy CLI boundary');
  const context = { require, __dirname: root, process, performance, console };
  vm.createContext(context);
  vm.runInContext(tools.slice(0, tools.indexOf(CLI_BOUNDARY)) + '\nthis.A=load();', context);
  return context.A;
}

/** Reads the STARTERS list from the game HTML. */
function legacyStarters() {
  const html = fs.readFileSync(path.join(root, 'putt-pals.html'), 'utf8');
  const match = html.match(/const STARTERS=\[([\d,\s]+)\]/);
  assert.ok(match, 'STARTERS list in putt-pals.html');
  return match[1].split(',').map(Number);
}

/** Plain-data course records, one per legacy map, in the shape src/courses expects. */
function legacyRawCourses(A = loadLegacy()) {
  const starters = legacyStarters();
  return A.HOLES.map((course, index) => ({
    index,
    name: course.name,
    starter: starters.includes(index),
    putts: Array.from({ length: A.NP(index) }, (_, putt) => {
      A.setPI(putt);
      const player = A.fresh('courses', 0);
      player.h = index;
      A.setMe(player);
      const active = A.H();
      return {
        tee: active.tee, hole: active.hole,
        par: A.parOf(index, putt), penalty: A.penOf(index, putt),
        limitSeconds: A.limitOf(index, putt) / 1000, cupRadius: A.cupOf(active),
      };
    }),
  }));
}

/** SHA-256 of the game HTML and tools.js, the same fields the inventory records. */
function sourceHashes() {
  const hash = file => createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8')).digest('hex');
  return { htmlSha256: hash('putt-pals.html'), toolsSha256: hash('tools.js') };
}

module.exports = { loadLegacy, legacyStarters, legacyRawCourses, sourceHashes };
