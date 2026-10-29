const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { legacyRawCourses, legacyStarters, sourceHashes } = require('../tools/legacy-adapter.cjs');

const load = rel => import(pathToFileURL(path.join(__dirname, '..', rel)).href);

(async () => {
  const { buildCourseCatalog, normalizeLegacyCourse, slugify, detectStaleCourses, detectStaleHashes, createCourseDocument, validateCourseDocument, parseCourseDocument, toSimulationCourses, createCourseData, validateCourseDefinitions } = await load('src/courses/index.js');
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

  const { checkGeometryIntegrity, formatIntegrityViolation, GEOMETRY_INTEGRITY_EXCEPTIONS, SPAWN_WALL_CLEARANCE, RAMP_SEAM_STEP_MAX } = await load('src/courses/index.js');
  const emptyGeometry = () => ({ tiles: [[0, 0, 400, 200]], w: [], sand: [], ice: [], slime: [], q: [], pl: [], rp: [], pd: [], pit: [], tp: [], fan: [], tornado: [], movers: [] });
  const okPutt = { tee: [40, 100], hole: [360, 100], cupRadius: 15 };
  const integrity = (patch, putts = [okPutt]) => checkGeometryIntegrity({ name: 'Fixture', index: 0, geometry: { ...emptyGeometry(), ...patch }, putts }, []);
  const rulesOf = patch => integrity(patch).violations.map(v => v.rule);
  run('geometry integrity: a clean fixture has no violations', () => {
    assert.deepEqual(integrity({}).violations, []);
  });
  run('geometry integrity: all 22 shipped maps pass; only the documented exceptions are waived', () => {
    const waived = [];
    document.courses.forEach((course, index) => {
      const result = checkGeometryIntegrity({ id: course.id, name: course.name, index, geometry: course.geometry, putts: course.putts });
      assert.deepEqual(result.violations.map(formatIntegrityViolation), [], course.name);
      waived.push(...result.waived.map(v => `${v.mapId}:${v.rule}:${v.elements}`));
    });
    assert.deepEqual(waived.sort(), GEOMETRY_INTEGRITY_EXCEPTIONS.map(e => `${e.course}:${e.rule}:${e.elements}`).sort());
    GEOMETRY_INTEGRITY_EXCEPTIONS.forEach(e => assert.ok(e.reason.length > 20, 'exceptions need a reason'));
  });
  run('geometry integrity: wall through a ramp and a platform reports map and element ids', () => {
    const result = integrity({ rp: [[100, 20, 100, 100, '+x', 0, 40]], pl: [[250, 20, 100, 100, 40]], w: [[150, 0, 10, 150], [300, 0, 10, 150]] });
    const hits = result.violations.filter(v => v.rule === 'wall-through-solid');
    assert.deepEqual(hits.map(v => v.elements), [['w[0]', 'rp[0]'], ['w[1]', 'pl[0]']]);
    assert.equal(hits[0].map, 'Fixture');
    assert.equal(hits[0].putt, null);
    assert.match(formatIntegrityViolation(hits[0]), /Fixture.*w\[0\], rp\[0\]/);
  });
  run('geometry integrity: overlapping solids, pits, off-floor islands and movers through walls fail', () => {
    assert.ok(rulesOf({ rp: [[100, 20, 100, 100, '+x', 0, 40]], pl: [[150, 20, 100, 100, 40]] }).includes('solids-interpenetrate'));
    assert.ok(rulesOf({ pl: [[100, 20, 100, 100, 40]], pit: [[150, 20, 100, 100]] }).includes('solid-over-pit'));
    assert.ok(rulesOf({ pl: [[350, 20, 100, 100, 40]] }).includes('solid-off-floor'));
    assert.ok(rulesOf({ movers: [[100, 100, 20, 20, 1, 0, 60, 1]], w: [[130, 90, 10, 40]] }).includes('mover-through-wall'));
    assert.ok(rulesOf({ movers: [[100, 100, 20, 20, 0, 1, 150, 1]] }).includes('mover-off-floor'));
  });
  run('geometry integrity: cups, spawns and hazards too close to walls fail', () => {
    const near = integrity({ w: [[0, 0, 10, 200], [350, 0, 10, 200], [180, 0, 10, 40]], pd: [[184, 43]] }, [{ tee: [10 + SPAWN_WALL_CLEARANCE - 1, 100], hole: [370, 100], cupRadius: 15 }]);
    const byRule = Object.fromEntries(near.violations.map(v => [v.rule, v]));
    assert.deepEqual(byRule['tee-near-wall'].elements, ['tee', 'w[0]']);
    assert.equal(byRule['tee-near-wall'].putt, 0);
    assert.deepEqual(byRule['hole-near-wall'].elements, ['hole', 'w[1]']);
    assert.deepEqual(byRule['hazard-near-wall'].elements, ['pd[0]', 'w[2]']);
    assert.ok(rulesOf({ tp: [[100, 100, 500, 100, 0]] }).includes('hazard-off-floor'));
    assert.ok(integrity({}, [{ tee: [40, 100], hole: [400 - 14, 100], cupRadius: 15 }]).violations.length === 0, 'void edges are not walls');
  });
  run('geometry integrity: ramp seams must meet the neighbouring surface without a gap or snagging step', () => {
    const ramp = [100, 20, 100, 100, '+x', 0, 40];
    assert.deepEqual(rulesOf({ rp: [ramp], pl: [[200, 20, 100, 100, 40]] }), [], 'flush seam passes');
    const gap = integrity({ rp: [ramp], pl: [[200, 20, 100, 100, 40 + RAMP_SEAM_STEP_MAX + 3]] });
    assert.deepEqual(gap.violations.map(v => [v.rule, v.elements]), [['ramp-seam', ['rp[0]']]]);
    assert.ok(rulesOf({ rp: [ramp] }).includes('ramp-seam'), 'dead-end ramp leaves a drop');
    assert.deepEqual(rulesOf({ rp: [[...ramp.slice(0, 7), 'launch']] }), [], 'launch ramps open onto a jump');
  });
  run('geometry integrity: exceptions waive only an exact course, rule and element match', () => {
    const geometry = { ...emptyGeometry(), movers: [[100, 100, 20, 20, 0, 1, 150, 1]] };
    const input = { id: 'fixture', name: 'Fixture', index: 0, geometry, putts: [okPutt] };
    const rule = 'mover-off-floor';
    assert.equal(checkGeometryIntegrity(input, [{ course: 'fixture', rule, elements: ['movers[0]'], reason: 'test' }]).violations.length, 0);
    assert.equal(checkGeometryIntegrity(input, [{ course: 'other', rule, elements: ['movers[0]'], reason: 'test' }]).violations.length, 1);
    assert.equal(checkGeometryIntegrity(input, [{ course: 'fixture', rule, elements: ['movers[1]'], reason: 'test' }]).violations.length, 1);
  });
  run('course validation and documents reject overlapping geometry and report ids', () => {
    const changed = structuredClone(document);
    const map = changed.courses[1];
    map.geometry.rp = [[map.geometry.tiles[0][0] + 20, map.geometry.tiles[0][1] + 5, 60, 60, '+x', 0, 30]];
    map.geometry.w.push([map.geometry.tiles[0][0] + 40, map.geometry.tiles[0][1] + 5, 10, 60]);
    const checked = validateCourseDocument(changed);
    assert.equal(checked.valid, false);
    assert.ok(checked.errors.some(e => /wall-through-solid.*Clover Crossing.*putt all.*w\[\d+\], rp\[0\]/.test(e)), checked.errors.join(' | '));
    assert.throws(() => parseCourseDocument(JSON.stringify(changed)), /wall-through-solid/);
    const defs = createCourseData();
    defs.definitions[11].hole = [400, 250];
    defs.rules[11].putts[0].hole = [400, 250];
    const result = validateCourseDefinitions(defs.definitions, defs.rules);
    assert.ok(result.errors.some(e => /hole-near-wall.*Fortress Spiral.*putt 0.*hole, w\[4\]/.test(e)), result.errors.join(' | '));
  });

  if (failed) { console.log(`\n${failed} COURSE TEST(S) FAILED`); process.exit(1); }
  console.log('\nALL COURSE CATALOG TESTS PASSED');
})();
