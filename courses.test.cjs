const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { legacyRawCourses, legacyStarters } = require('../tools/legacy-adapter.cjs');

const load = rel => import(pathToFileURL(path.join(__dirname, '..', rel)).href);

(async () => {
  const { buildCourseCatalog, normalizeLegacyCourse, slugify } = await load('src/courses/index.js');
  const { STARTER_COURSE_INDICES } = await load('src/shared/constants.js');
  let failed = 0;
  const run = (name, fn) => {
    try { fn(); console.log('PASS:', name); }
    catch (error) { failed++; console.log('FAIL:', name, '\n  ', error.message); }
  };

  const raw = legacyRawCourses();
  const catalog = buildCourseCatalog(raw);

  run('all 22 legacy maps pass the shared course schema', () => {
    assert.equal(raw.length, 22);
    assert.deepEqual(catalog.errors, []);
    assert.equal(catalog.courses.length, 22);
  });
  run('legacy STARTERS list equals the shared constant', () => {
    assert.deepEqual(legacyStarters(), [...STARTER_COURSE_INDICES]);
  });
  run('six starter maps are flagged and have exactly six putts', () => {
    const starters = catalog.courses.filter(c => c.starter);
    assert.deepEqual(starters.map(c => c.index), [...STARTER_COURSE_INDICES].sort((a, b) => a - b));
    starters.forEach(c => assert.equal(c.putts.length, 6));
  });
  run('ids are unique slugs', () => {
    assert.equal(new Set(catalog.courses.map(c => c.id)).size, 22);
    assert.equal(slugify('Switchback Garden'), 'switchback-garden');
  });
  run('schema rejects bad data (negative checks)', () => {
    const bad = JSON.parse(JSON.stringify(raw));
    bad[0].putts[0].par = 0;
    bad[1].putts[0].limitSeconds = 90;
    bad[2].name = bad[3].name;
    const result = buildCourseCatalog(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /Par must be/.test(e)));
    assert.ok(result.errors.some(e => /limitSeconds/.test(e)));
    assert.ok(result.errors.some(e => /duplicate id/.test(e)));
  });
  run('normalizer copies tuples instead of sharing them', () => {
    const course = normalizeLegacyCourse(raw[0], true);
    course.putts[0].tee[0] = -999;
    assert.notEqual(raw[0].putts[0].tee[0], -999);
  });

  if (failed) { console.log(`\n${failed} COURSE TEST(S) FAILED`); process.exit(1); }
  console.log('\nALL COURSE CATALOG TESTS PASSED');
})();
