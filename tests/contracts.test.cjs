const assert = require('node:assert/strict');
const path = require('node:path');
require('./tuning.test.cjs');

// Test runner using dynamic import for ES modules
async function run() {
  console.log('--- Running Shared Contracts Test Suite ---');
  const shared = await import('../src/shared/index.js');

  // 1. Constants
  assert.equal(shared.BALL_RADIUS, 5);
  assert.equal(shared.R, 5);
  assert.equal(shared.DEFAULT_CUP_RADIUS, 15);
  assert.equal(shared.MIN_CUP_RADIUS, 8);
  assert.equal(shared.SHOT_POWER, 900);
  assert.equal(shared.POWER, 900);
  assert.equal(shared.TURF_FRICTION, 0.5);
  assert.equal(shared.FIXED_TIMESTEP, 1 / 240);
  assert.deepEqual(Array.from(shared.STARTER_COURSE_INDICES), [0, 8, 20, 21, 5, 19]);
  console.log('PASS: Constants match P32 baseline');

  // 2. Coordinate Transformations
  const simOrigin = [100, 200];
  const simPos = { x: 50, y: 75, z: 12 };
  const worldPos = shared.simToWorld(simPos.x, simPos.y, simPos.z, simOrigin);
  // Three.js world coordinates: x = simX + originX, y = simZ + R, z = simY + originY
  assert.equal(worldPos.x, 150);
  assert.equal(worldPos.y, 17); // 12 + 5
  assert.equal(worldPos.z, 275); // 75 + 200

  const backToSim = shared.worldToSim(worldPos.x, worldPos.y, worldPos.z, simOrigin);
  assert.equal(backToSim.x, simPos.x);
  assert.equal(backToSim.y, simPos.y);
  assert.equal(backToSim.z, simPos.z);
  console.log('PASS: Coordinate transforms simToWorld and worldToSim roundtrip with precision');

  // 3. Scoring Rules
  // P26 timeout: Math.max(strokes, par + penalty)
  assert.equal(shared.calculateTimeoutScore(0, 2, 3), 5);
  assert.equal(shared.calculateTimeoutScore(3, 2, 3), 5);
  assert.equal(shared.calculateTimeoutScore(12, 2, 3), 12);
  assert.equal(shared.calculateTimeoutScore(1, 4, 4), 8); // Cyclone Ring
  assert.equal(shared.calculateTimeoutScore(1, 2, 0), 2); // a penalty of 0 is valid and must not fall back to the default
  assert.equal(shared.calculateTimeoutScore(5, 2, 0), 5);
  assert.equal(shared.calculateTimeoutScore(0, undefined, undefined), 5); // missing par/penalty use defaults (2 + 3)

  assert.equal(shared.formatScoreEntry(1, false, 2, 3), '1');
  assert.equal(shared.formatScoreEntry(5, true, 2, 3), '2+3*');
  assert.equal(shared.isTimeoutScore('2+3*'), true);
  assert.equal(shared.isTimeoutScore('1'), false);

  const summary = shared.summarizeScorecard([
    { strokes: 1, timedOut: false, par: 2 },
    { strokes: 3, timedOut: false, par: 2 },
    { strokes: 5, timedOut: true, par: 2 },
  ]);
  assert.equal(summary.totalStrokes, 9);
  assert.equal(summary.totalPar, 6);
  assert.equal(summary.relativeToPar, 3);
  assert.equal(summary.relativeFormatted, '+3');
  assert.equal(summary.holeInOnes, 1);
  assert.equal(summary.timeouts, 1);
  assert.equal(summary.completedHoles, 3);

  const ranked = shared.rankPlayers([
    { id: 'p2', name: 'Bob', totalStrokes: 12, holeInOnes: 0 },
    { id: 'p1', name: 'Alice', totalStrokes: 10, holeInOnes: 1 },
    { id: 'p3', name: 'Charlie', totalStrokes: 10, holeInOnes: 2 },
  ]);
  assert.equal(ranked[0].id, 'p3'); // more HIOs tie-breaks
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].isLeader, true);
  assert.equal(ranked[1].id, 'p1');
  assert.equal(ranked[1].isLeader, true);
  assert.equal(ranked[2].id, 'p2');
  assert.equal(ranked[2].isLeader, false);
  console.log('PASS: Pure scoring and scorecard calculations conform to game rules');

  // 4. Course Validation
  const validPutt = {
    index: 0,
    tee: [80, 80],
    hole: [240, 80],
    par: 2,
    penalty: 3,
    limitSeconds: 120,
    cupRadius: 15,
  };
  assert.equal(shared.validatePutt(validPutt).valid, true);

  const badPutt = { index: 0, tee: 'bad', hole: [1, 2], par: 0, penalty: -1 };
  assert.equal(shared.validatePutt(badPutt).valid, false);

  const sampleCourse = shared.createSampleCourse();
  assert.equal(shared.validateCourse(sampleCourse).valid, true);
  assert.equal(shared.normalizeLimit(90), 120); // Rejects under 120s
  assert.equal(shared.normalizeLimit(700), 120); // Rejects over 600s
  assert.equal(shared.normalizeLimit(150), 150); // Accepts valid limit
  console.log('PASS: Course and putt validation schemas');

  // 5. Protocol & Network Boundary Validation
  const validPresenceMsg = {
    n: 'PlayerOne',
    h: 0,
    x: 80,
    y: 80,
    z: 0,
    c: 0xff5252,
    str: 1,
    round: 1,
    s: [1],
    fx: null,
  };
  assert.equal(shared.validatePresence(validPresenceMsg), true);
  assert.equal(shared.validatePresence({ ...validPresenceMsg, str: 150, s: [150] }), true);
  assert.equal(shared.validatePresence({ ...validPresenceMsg, str: -1 }), false);
  assert.equal(shared.validatePresence({ ...validPresenceMsg, s: [1.5] }), false);
  assert.equal(shared.validatePresence({ ...validPresenceMsg, s: [Number.MAX_SAFE_INTEGER + 1] }), false);
  assert.equal(shared.calculateTimeoutScore(150, 2, 0), 150);
  assert.equal(shared.calculateTimeoutScore(0, 2, 0), 2);
  assert.equal(shared.validatePresence({ n: '' }), false); // empty name
  assert.equal(shared.validatePresence({ n: 'AveryLongNameToRejectImmediately' }), false); // > 14 chars

  const validSnapshot = {
    phase: 'play',
    map: 0,
    round: 1,
    startAt: Date.now(),
    roster: ['p1', 'p2'],
  };
  assert.equal(shared.validateRoomSnapshot(validSnapshot), true);
  assert.equal(shared.validateRoomSnapshot({ phase: 'invalid_phase' }), false);

  assert.equal(shared.validateVote({ map: 8 }), true);
  assert.equal(shared.validateVote({ map: -1 }), false);
  assert.equal(shared.validateVote({ map: 'str' }), false);

  const envelope = shared.createMessageEnvelope('vote', { map: 8 }, 'player1');
  assert.equal(envelope.version, 1);
  assert.equal(envelope.type, 'vote');
  assert.equal(envelope.senderId, 'player1');
  assert.equal(envelope.payload.map, 8);
  console.log('PASS: Protocol message validation and envelope packaging');

  // 6. Simulation Launch & Events
  const player = shared.createPlayerState('TestPlayer', 0, { x: 80, y: 80 });
  const shotEvent = shared.applyShot(player, 0, 0.5, 900);
  assert.equal(shotEvent.type, shared.SimulationEventTypes.SHOT);
  assert.equal(player.vx, 450);
  assert.equal(player.vy, 0);
  assert.equal(player.strokes, 1);
  assert.equal(player.moving, true);
  console.log('PASS: applyShot simulation contract initialization');

  // 7. Session Voting Resolution
  const votes = { p1: 8, p2: 20, p3: 8 };
  assert.equal(shared.resolveVote(votes), 8); // 8 has 2 votes

  const tieVotes = { p1: 20, p2: 8 };
  // Tie-breaker picks smaller index (8 < 20)
  assert.equal(shared.resolveVote(tieVotes), 8);

  // Legacy-compatible tie-break: tied maps ascending, winner = tied[(round * 7 + validVotes) % tied.length].
  const tie58 = { a: 8, b: 5 }; // tied [5, 8], validVotes = 2
  assert.equal(shared.resolveVote(tie58, undefined, { round: 0 }), 5); // (0 + 2) % 2 = 0
  assert.equal(shared.resolveVote(tie58, undefined, { round: 1 }), 8); // (7 + 2) % 2 = 1
  assert.equal(shared.resolveVote(tie58), 5); // 5 < 8 numerically, not by STARTER array order
  assert.equal(shared.resolveVote({ a: 5, b: 8, c: 99, d: 'x' }, undefined, { round: 0 }), 5); // invalid votes ignored: tied [5, 8], validVotes = 2, (0 + 2) % 2 = 0
  assert.equal(shared.resolveVote({ a: 5, b: 8, c: 8 }, undefined, { round: 3 }), 8); // clear winner ignores rotation
  assert.equal(shared.resolveVote({ a: 5, b: 8 }, undefined, { connectedIds: ['a'] }), 5); // only connected voters count
  assert.equal(shared.resolveVote({}), shared.STARTER_COURSE_INDICES[0]); // no votes: first eligible map

  assert.equal(shared.canExecuteCommand('lobby', shared.SessionCommands.START_VOTING, true), true);
  assert.equal(shared.canExecuteCommand('lobby', shared.SessionCommands.START_VOTING, false), false); // guest blocked
  assert.equal(shared.canExecuteCommand('results', shared.SessionCommands.START_VOTING, true), false);
  console.log('PASS: Session commands and deterministic voting resolution');

  // 8. Sightline Raycast (Wall Fading)
  const cameraPos = [0, 50, -100];
  const ballPos = [0, 0, 100];
  const wallDirectlyBetween = { min: [-10, -10, -10], max: [10, 60, 10] };
  const wallFarAway = { min: [500, 0, 0], max: [600, 50, 100] };
  const sightlines = shared.checkSightlineObstructions(cameraPos, ballPos, [wallDirectlyBetween, wallFarAway]);
  assert.equal(sightlines[0], true); // obstructed
  assert.equal(sightlines[1], false); // not obstructed
  console.log('PASS: Sightline raycast obstruction check');

  // 9. High-Fidelity Mocks
  const mockSim = new shared.MockSimulation(sampleCourse, 0);
  const p1 = mockSim.addPlayer('p1', 'Alice', 0);
  assert.equal(p1.x, 80);
  assert.equal(p1.y, 80);

  mockSim.launch('p1', 0, 0.5);
  const stepResult = mockSim.step(1 / 240);
  assert.equal(stepResult.time, 1 / 240);
  assert.ok(p1.x > 80);

  const hub = new shared.MockTransportHub();
  const hostTransport = new shared.MockTransport('host-id', true, hub);
  const guestTransport = new shared.MockTransport('guest-id', false, hub);

  assert.equal(shared.isRoomTransport(hostTransport), true);
  assert.equal(shared.isRoomTransport(guestTransport), true);

  await hostTransport.connect();
  await guestTransport.connect();

  const receivedOnGuest = [];
  guestTransport.subscribe(msg => receivedOnGuest.push(msg));

  hostTransport.send({ type: 'welcome', text: 'hi' });
  assert.equal(receivedOnGuest.length, 1);
  assert.equal(receivedOnGuest[0].type, 'welcome');

  hostTransport.close();
  guestTransport.close();
  mockSim.dispose();
  console.log('PASS: High-fidelity mocks and virtual transport hub');

  console.log('\nALL SHARED CONTRACT TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('FAILED with error:', err);
  process.exit(1);
});
