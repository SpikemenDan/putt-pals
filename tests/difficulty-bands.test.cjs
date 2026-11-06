const assert = require('node:assert/strict');

(async () => {
  const { DIFFICULTY_BANDS, getDifficultyBand } = await import('../src/courses/difficulty.js');
  const { runRank } = await import('../tools/cli/rank.mjs');
  const { createCourseDocument } = await import('../src/courses/index.js');
  const { createDifficultyProvenance } = await import('../tools/cli/provenance.mjs');

  console.log('--- Running Difficulty Bands Test Suite (Task K1d, #100) ---');

  // 1. Structure and invariants of DIFFICULTY_BANDS
  assert.equal(DIFFICULTY_BANDS.length, 4, 'Must define 4 difficulty bands');
  const expectedTiers = [
    { tier: 1, id: 'beginner', name: 'Beginner', max: 10.0 },
    { tier: 2, id: 'intermediate', name: 'Intermediate', max: 14.0 },
    { tier: 3, id: 'advanced', name: 'Advanced', max: 18.0 },
    { tier: 4, id: 'expert', name: 'Expert', max: Infinity },
  ];

  DIFFICULTY_BANDS.forEach((band, i) => {
    assert.equal(band.tier, expectedTiers[i].tier);
    assert.equal(band.id, expectedTiers[i].id);
    assert.equal(band.name, expectedTiers[i].name);
    assert.equal(band.maxRating, expectedTiers[i].max);
    assert.ok(typeof band.description === 'string' && band.description.length > 10);
    assert.ok(Object.isFrozen(band), 'Each difficulty band must be frozen');
  });
  assert.ok(Object.isFrozen(DIFFICULTY_BANDS), 'DIFFICULTY_BANDS array must be frozen');
  console.log('PASS: Difficulty bands schema and structure');

  // 2. getDifficultyBand mapping on 6-putt courses
  assert.equal(getDifficultyBand(0).name, 'Beginner');
  assert.equal(getDifficultyBand(6.0).name, 'Beginner');
  assert.equal(getDifficultyBand(9.668).name, 'Beginner');
  assert.equal(getDifficultyBand(10.0).name, 'Beginner'); // boundary inclusive
  assert.equal(getDifficultyBand(10.001).name, 'Intermediate');
  assert.equal(getDifficultyBand(11.668).name, 'Intermediate');
  assert.equal(getDifficultyBand(14.0).name, 'Intermediate');
  assert.equal(getDifficultyBand(14.001).name, 'Advanced');
  assert.equal(getDifficultyBand(17.5).name, 'Advanced');
  assert.equal(getDifficultyBand(18.0).name, 'Advanced');
  assert.equal(getDifficultyBand(18.001).name, 'Expert');
  assert.equal(getDifficultyBand(30.0).name, 'Expert');
  console.log('PASS: getDifficultyBand 6-putt rating mapping');

  // 3. Normalization for non-6-putt courses
  // A 1-putt course with difficulty 2.0 has normalized 6-putt rating of 12.0 -> Intermediate
  assert.equal(getDifficultyBand(2.0, 1).name, 'Intermediate');
  // A 1-putt course with difficulty 1.5 has normalized 6-putt rating of 9.0 -> Beginner
  assert.equal(getDifficultyBand(1.5, 1).name, 'Beginner');
  // A 1-putt course with difficulty 3.2 has normalized 6-putt rating of 19.2 -> Expert
  assert.equal(getDifficultyBand(3.2, 1).name, 'Expert');
  console.log('PASS: getDifficultyBand normalized non-6-putt mapping');

  // 4. Input validation and error handling
  assert.throws(() => getDifficultyBand('easy'), TypeError);
  assert.throws(() => getDifficultyBand(NaN), TypeError);
  assert.throws(() => getDifficultyBand(Infinity), TypeError);
  console.log('PASS: getDifficultyBand input validation');

  // 5. Integration with rank output
  const doc = createCourseDocument();
  const syntheticRoutes = {
    schemaVersion: 2,
    results: doc.courses.flatMap((c, map) => c.putts.map((_, putt) => ({
      schemaVersion: 2, map, putt, name: c.name, gravity: 700, status: 'route',
      strokes: 1, par: 2, holeInOne: true,
      margin: 1, difficulty: map === 19 ? 2.667 : 1.5,
      route: [{ deg: 10, power: 0.5, to: 'cup' }], verified: true,
      provenance: createDifficultyProvenance(c, putt),
    }))),
  };
  const ranked = runRank(doc.courses, syntheticRoutes);
  assert.equal(ranked.code, 0);
  assert.ok(ranked.lines.some(l => l.includes('Switchback Garden') && l.includes('(Beginner)')));
  assert.ok(ranked.lines.some(l => l.includes('Grand Finale') && l.includes('(Advanced)')));
  console.log('PASS: runRank includes difficulty band classification');

  console.log('ALL DIFFICULTY BANDS TESTS PASSED');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
