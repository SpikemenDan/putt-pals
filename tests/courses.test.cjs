const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { legacyRawCourses, legacyStarters, sourceHashes } = require('../tools/legacy-adapter.cjs');

const load = rel => import(pathToFileURL(path.join(__dirname, '..', rel)).href);

(async () => {
  const { buildCourseCatalog, normalizeLegacyCourse, slugify, detectStaleCourses, detectStaleHashes, createCourseDocument, validateCourseDocument, parseCourseDocument, toSimulationCourses, createCourseData } = await load('src/courses/index.js');
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

  const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/source-inventory.json'), 'utf8'));

  run('live course data matches the recorded inventory (22 maps)', () => {
    const result = detectStaleCourses(raw, inventory.courses);
    assert.deepEqual(result.differences, []);
  });
  run('live source hashes match the recorded inventory', () => {
    const result = detectStaleHashes(sourceHashes(), inventory);
    assert.deepEqual(result.differences, []);
  });
  run('stale detection reports changed par, tee, name, putt count and course count', () => {
    const edited = JSON.parse(JSON.stringify(raw));
    edited[0].putts[1].par += 1;
    edited[8].putts[2].tee = [1, 2];
    edited[20].name = 'Renamed';
    edited[5].putts.pop();
    edited.pop();
    const result = detectStaleCourses(edited, inventory.courses);
    assert.equal(result.stale, true);
    for (const pattern of [/course 0 .* putt 1: par/, /course 8 .* putt 2: tee/, /name is now "Renamed"/, /course 5 .* putt count/, /course count/]) {
      assert.ok(result.differences.some(d => pattern.test(d)), `missing report for ${pattern}`);
    }
  });
  run('stale detection reports changed source hashes', () => {
    const result = detectStaleHashes({ htmlSha256: 'x', toolsSha256: inventory.toolsSha256 }, inventory);
    assert.deepEqual(result.differences, ['htmlSha256 changed since the inventory was recorded']);
  });

  const document = createCourseDocument();
  const { runShot } = await load('tools/cli/commands.mjs');
  run('versioned document round-trips all maps with persistent course and putt IDs', () => {
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.courses.length, 22);
    assert.deepEqual(parseCourseDocument(JSON.stringify(document)), document);
    assert.equal(document.courses[0].putts[0].id, 'switchback-garden-putt-1');
    const ids = document.courses.flatMap(c => [c.id, ...c.putts.map(p => p.id)]);
    assert.equal(new Set(ids).size, ids.length);
    const renamed = structuredClone(document);
    renamed.courses[0].name = 'A new display name';
    assert.equal(parseCourseDocument(JSON.stringify(renamed)).courses[0].id, document.courses[0].id);
  });
  run('document parser rejects unsupported versions, duplicate IDs and malformed rules/geometry', () => {
    const mutations = [d => { d.schemaVersion = 999; }, d => { d.courses[1].id = d.courses[0].id; },
      d => { d.courses[0].putts[1].id = d.courses[0].putts[0].id; },
      d => { d.courses[0].putts[0].id = d.courses[0].id; },
      d => { d.courses[0].starter = false; }, d => { d.courses.pop(); },
      d => { d.courses[0].putts[0].index = 99; }, d => { d.courses[0].geometry.w[0][2] = -1; },
      d => { d.courses[0].putts[0].tee = [-1, -1]; }, d => { delete d.courses[0].putts[0].limitSeconds; },
      d => { d.courses[0].putts[0].cupRadius = 100; }, d => { d.courses[0].putts[0] = null; },
      d => { d.courses[0].putts[0].par = { toString: null }; }, d => { d.schemaVersion = { toString: null }; }];
    for (const mutate of mutations) {
      const changed = structuredClone(document); mutate(changed);
      assert.equal(validateCourseDocument(changed).valid, false);
      assert.throws(() => parseCourseDocument(JSON.stringify(changed)));
      assert.throws(() => toSimulationCourses(changed));
    }
    assert.throws(() => parseCourseDocument('{'));
    assert.equal(validateCourseDocument(null).valid, false);
  });
  run('normalized simulation adapter preserves all 36 recorded starter shot results', () => {
    const legacy = createCourseData().definitions;
    const normalized = toSimulationCourses(document);
    const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/solver-baseline.json'), 'utf8'));
    for (const ref of baseline.results) assert.deepEqual(
      runShot(normalized, ref.map, ref.putt, ref.best.deg, ref.best.power),
      runShot(legacy, ref.map, ref.putt, ref.best.deg, ref.best.power), `${ref.map}/${ref.putt}`);
  });
  run('document adapter owns its geometry and preserves explicit zero penalties', () => {
    const changed = structuredClone(document);
    changed.courses[0].putts[0].penalty = 0;
    const courses = toSimulationCourses(changed);
    assert.equal(courses[0].putts[0].penalty, 0);
    courses[0].w[0][0] += 100;
    courses[0].putts[0].tee[0] += 100;
    assert.deepEqual(createCourseDocument(), document);
    assert.deepEqual(parseCourseDocument(JSON.stringify(document)), document);
  });

  if (failed) { console.log(`\n${failed} COURSE TEST(S) FAILED`); process.exit(1); }
  console.log('\nALL COURSE CATALOG TESTS PASSED');
})();
