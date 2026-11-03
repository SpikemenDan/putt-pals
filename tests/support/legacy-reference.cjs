// Recorded output of the legacy single-file game (recorded before its retirement), used by the parity
// tests in place of executing the legacy game. Every accessor returns a fresh copy.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/legacy-reference/data.json'), 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;

module.exports = {
  /** Resolved per-putt rules of all 22 legacy maps (the shape src/courses expects). */
  rules: () => copy(recorded.rules),
  starters: () => [...recorded.starters],
  /** SHA-256 of the legacy page and tools.js when they were recorded. */
  sources: () => ({ ...recorded.sources }),
  holeCount: recorded.holeCount,
  holesCanonicalSha256: recorded.holesCanonicalSha256,
  /** Per arena name: { chambers, geometry, course } exactly as the legacy generator produced them. */
  arenas: () => copy(recorded.arenas),
  mechanics: () => copy(recorded.mechanics),
  power: recorded.power,
  /** Order-independent digest of plain JSON data, comparable with holesCanonicalSha256. */
  canonicalSha256: value => createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value))))).digest('hex'),
};
