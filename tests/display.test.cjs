const assert = require('node:assert/strict');

async function run() {
  const { DISPLAY, DEFAULT_DISPLAY, DISPLAY_FIELDS, createDisplay, displayProblems } = await import('../src/shared/display.js');
  const { TUNING } = await import('../src/shared/tuning.js');

  // Defaults equal the arrow and ball values the renderer used before they were parameterized.
  assert.deepEqual(DISPLAY, DEFAULT_DISPLAY);
  assert.equal(DISPLAY.ball.visualScale, 1);
  assert.equal(DISPLAY.aim.arrowShaftHalfWidth, 2.6);
  assert.equal(DISPLAY.aim.arrowHeadHalfWidth, 7);
  assert.equal(DISPLAY.aim.arrowHeadLength, 14);
  assert.equal(DISPLAY.aim.arrowOpacity, 0.92);
  assert.ok(Object.isFrozen(DISPLAY) && Object.isFrozen(DISPLAY.aim) && Object.isFrozen(DISPLAY.ball));
  assert.deepEqual(displayProblems(DEFAULT_DISPLAY), []);

  // Spec: every field has a description, a sane range and a default inside it; no field duplicates a physics number.
  assert.ok(DISPLAY_FIELDS.every(f => f.length === 4 && f[1] < f[2] && f[3].length > 0));
  assert.equal(DISPLAY_FIELDS.length, 5);
  assert.equal(TUNING.ball.radius, 5, 'physical radius stays in TUNING');
  assert.equal('radius' in DISPLAY.ball, false);

  // Overrides merge over defaults without touching other fields or the defaults object.
  const wide = createDisplay({ aim: { arrowShaftHalfWidth: 4 }, ball: { visualScale: 1.5 } });
  assert.equal(wide.aim.arrowShaftHalfWidth, 4);
  assert.equal(wide.aim.arrowHeadHalfWidth, 7);
  assert.equal(wide.ball.visualScale, 1.5);
  assert.equal(DEFAULT_DISPLAY.aim.arrowShaftHalfWidth, 2.6);
  assert.equal(DISPLAY.ball.visualScale, 1);

  // Invalid display is rejected whole, naming the field.
  assert.throws(() => createDisplay({ ball: { visualScale: NaN } }), /ball\.visualScale/);
  assert.throws(() => createDisplay({ ball: { visualScale: 0 } }), /ball\.visualScale/);
  assert.throws(() => createDisplay({ ball: { visualScale: '2' } }), /ball\.visualScale/);
  assert.throws(() => createDisplay({ aim: { arrowOpacity: 2 } }), /arrowOpacity/);
  assert.throws(() => createDisplay({ aim: { arrowHeadLength: Infinity } }), /arrowHeadLength/);
  assert.throws(() => createDisplay({ aim: { arrowShaftHalfWidth: 9 } }), /must not exceed/);
  assert.match(displayProblems({ ball: {}, aim: {} }).join(';'), /ball\.visualScale/);
  console.log('ALL DISPLAY TESTS PASSED');
}

run().catch(err => { console.error('FAILED with error:', err); process.exit(1); });
