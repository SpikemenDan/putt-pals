const assert = require('node:assert/strict');
(async () => {
  await import('./rooms/session-recovery.test.mjs');
  const { SimulatedClock } = await import('xstate');
  const { createRoomSession } = await import('../src/session/index.js');
  const { createCourseDocument } = await import('../src/courses/index.js');
  const { GameModes, resolveVote } = await import('../src/shared/session.js');
  const courses = createCourseDocument().courses;
  const sessions = [];
  const make = (guests = []) => {
    const clock = new SimulatedClock();
    const session = createRoomSession({ hostId: 'host', clock, courses });
    sessions.push(session);
    for (const id of guests) assert.equal(session.send({ type: 'JOIN_ROOM', playerId: id, name: id }), true);
    return { session, clock, state: () => session.getSnapshot(), send: (type, extra = {}, playerId = 'host') => session.send({ type, playerId, ...extra }) };
  };
  const start = (f, mode = GameModes.STANDARD, map = 0, puttIndex = 0) => {
    f.send('SET_MODE', { mode }); f.send('START_VOTING');
    for (const id of Object.keys(f.state().players).filter(id => f.state().players[id].connected)) f.send('CAST_VOTE', { mapIndex: map }, id);
    if (mode === GameModes.PUTT_PRACTICE) f.send('START_ROUND', { puttIndex });
    f.clock.increment(mode === GameModes.PUTT_PRACTICE ? 0 : 2500);
  };
  const score = (f, id = 'host', strokes = 1, timedOut = false) => {
    const s = f.state();
    return f.send('REPORT_SCORE', { roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes, timedOut }, id);
  };
  const completeMap = f => {
    for (let putt = 0; putt < 6; putt++) {
      f.clock.increment(1500);
      const s = f.state();
      for (const id of s.roster.filter(id => s.players[id].connected)) assert.equal(score(f, id), true);
      if (putt < 5) f.clock.increment(2500);
    }
  };
  let failed = 0;
  const run = (name, fn) => { try { fn(); console.log('PASS:', name); } catch (error) { failed++; console.error('FAIL:', name, error.stack); } };
  run('host commands, membership limits, detached snapshots and disposal are enforced', () => {
    const f = make(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    assert.equal(f.send('JOIN_ROOM', { name: 'h' }, 'h'), false, 'an eighth guest exceeds MAX_PLAYERS (8)');
    assert.equal(f.send('START_VOTING', {}, 'a'), false);
    assert.equal(f.send('SET_MODE', { mode: GameModes.PRACTICE }), false);
    const s = f.state(); s.players.host.name = 'changed'; s.roster.push('fake');
    assert.equal(f.state().players.host.name, 'Host');
    assert.deepEqual(f.state().roster, []);
    assert.equal(f.send('SET_MODE', { mode: 'invalid' }), false);
    assert.equal(f.send('JOIN_ROOM', { name: '' }, 'new'), false);
    assert.equal(f.session.send({ type: 'SET_MODE', playerId: 'host', mode: () => 1 }), false);
    f.session.dispose(); assert.equal(f.send('START_VOTING'), false);
  });
  run('No Power-Ups (GM1): the host sets the room flag in the lobby only; it defaults on and survives starting', () => {
    const f = make(['a']);
    assert.equal(f.state().powerups, true, 'power-ups are on by default');
    assert.equal(f.send('SET_POWERUPS', { enabled: false }, 'a'), false, 'guests cannot change it');
    assert.equal(f.send('SET_POWERUPS', { enabled: 'no' }), false, 'must be a boolean');
    assert.equal(f.send('SET_POWERUPS', {}), false, 'enabled is required');
    assert.equal(f.state().powerups, true);
    assert.equal(f.send('SET_POWERUPS', { enabled: false }), true);
    assert.equal(f.state().powerups, false);
    start(f, GameModes.TOURNAMENT_3);
    assert.equal(f.state().powerups, false, 'the flag carries into the series');
    assert.equal(f.send('SET_POWERUPS', { enabled: true }), false, 'not changeable once voting or play has started');
    assert.equal(f.state().powerups, false);
  });
  run('first vote starts 15 seconds; subsequent votes do not restart it; ties match legacy', () => {
    const f = make(['a', 'b']); f.send('START_VOTING'); f.clock.increment(30000);
    assert.equal(f.state().phase, 'select'); assert.equal(f.state().votingDeadline, 0);
    f.send('CAST_VOTE', { mapIndex: 8 }); const deadline = f.state().votingDeadline;
    assert.equal(deadline, 45000); f.clock.increment(10000);
    f.send('CAST_VOTE', { mapIndex: 5 }, 'a'); assert.equal(f.state().votingDeadline, deadline);
    f.clock.increment(4999); assert.equal(f.state().phase, 'select'); f.clock.increment(1);
    assert.equal(f.state().phase, 'play');
    assert.equal(f.state().mapIndex, resolveVote({ host: 8, a: 5 }, undefined, { round: 0 }));
    assert.equal(f.state().roundStartTime, 47500);
  });
  run('a departed first voter does not reset the original voting deadline', () => {
    const f = make(['a', 'b']); f.send('START_VOTING');
    f.send('CAST_VOTE', { mapIndex: 8 }, 'a'); f.clock.increment(5000);
    f.send('LEAVE_ROOM', {}, 'a'); f.clock.increment(10000);
    assert.equal(f.state().phase, 'select'); assert.equal(f.state().votingDeadline, 15000);
    f.clock.increment(5000); f.send('CAST_VOTE', { mapIndex: 0 }); f.clock.increment(0);
    assert.equal(f.state().phase, 'play'); assert.equal(f.state().mapIndex, 0);
    assert.equal(f.state().roundStartTime, 22500);
  });
  run('external callers cannot spoof XState internal timer events', () => {
    const f = make(['a']); f.send('START_VOTING'); f.send('CAST_VOTE', { mapIndex: 0 });
    assert.equal(f.send('xstate.after.votingRemaining.session.select.timing', {}, 'a'), false);
    assert.equal(f.state().phase, 'select');
    f.clock.increment(15000); assert.equal(f.state().phase, 'play');
  });
  run('everyone voting starts early and disconnected votes are removed', () => {
    const f = make(['a', 'b']); f.send('START_VOTING');
    assert.equal(f.send('CAST_VOTE', { mapIndex: 1 }), false);
    f.send('CAST_VOTE', { mapIndex: 8 }, 'a'); f.send('LEAVE_ROOM', {}, 'a');
    f.send('CAST_VOTE', { mapIndex: 0 }); f.send('CAST_VOTE', { mapIndex: 0 }, 'b');
    assert.equal(f.state().phase, 'play'); assert.equal(f.state().mapIndex, 0);
    assert.deepEqual(f.state().roster, ['host', 'b']);
  });
  run('round token, start delay, minimum play and monotonic strokes reject stale/early results', () => {
    const f = make(); f.send('START_VOTING'); f.send('CAST_VOTE', { mapIndex: 0 });
    assert.equal(score(f), false); f.clock.increment(2500);
    const s = f.state();
    assert.equal(f.send('REPORT_SCORE', { roundNumber: s.roundNumber - 1, puttIndex: 0, strokes: 1 }), false);
    assert.equal(f.send('REPORT_SCORE', { roundNumber: s.roundNumber, puttIndex: 2, strokes: 1 }), false);
    assert.equal(f.send('ADVANCE_PUTT'), false); assert.equal(f.send('FINISH_ROUND'), false);
    assert.equal(f.send('UPDATE_STROKES', { roundNumber: s.roundNumber, puttIndex: 0, strokes: 150 }), true);
    assert.equal(score(f, 'host', 149), false); assert.equal(score(f, 'host', 150), true);
    assert.equal(f.state().puttIndex, 0); assert.equal(score(f, 'host', 150), false);
    f.clock.increment(1500); assert.equal(f.state().puttIndex, 1);
    assert.equal(f.state().players.host.scores[0].score, 150);
  });
  run('timeouts use max(strokes, par+penalty) without a stroke cap and preserve host fallback', () => {
    const f = make(['a']); start(f); const s = f.state();
    f.send('UPDATE_STROKES', { roundNumber: s.roundNumber, puttIndex: 0, strokes: 150 });
    assert.equal(score(f, 'a', 0, true), false);
    f.clock.increment(120000); assert.equal(f.state().puttIndex, 0);
    f.clock.increment(3999); assert.equal(f.state().puttIndex, 0); f.clock.increment(1);
    assert.equal(f.state().puttIndex, 1);
    assert.equal(f.state().players.host.scores[0].score, 150);
    assert.equal(f.state().players.a.scores[0].score, 5);
    assert.equal(f.state().players.a.scores[0].timedOut, true);
  });
  run('normal six-putt map records scorecards and rejects guest result navigation', () => {
    const f = make(['a']); start(f); completeMap(f);
    assert.equal(f.state().phase, 'results'); assert.equal(f.state().players.host.scores.length, 6);
    assert.equal(f.state().last.scores.host, 6); assert.deepEqual(f.state().last.winners, ['host', 'a']);
    assert.equal(f.send('RETURN_TO_LOBBY', {}, 'a'), false);
    f.send('RETURN_TO_LOBBY'); assert.equal(f.state().phase, 'lobby'); assert.deepEqual(f.state().totals, {});
  });
  run('late joins spectate the whole map; disconnects record blanks and do not block', () => {
    const f = make(['a']); start(f); f.send('JOIN_ROOM', { name: 'late' }, 'late');
    assert.equal(score(f, 'late'), false); f.clock.increment(1500); f.send('LEAVE_ROOM', {}, 'a'); score(f);
    assert.equal(f.state().puttIndex, 1); assert.equal(f.state().players.a.scores[0], null);
    assert.equal(f.state().roster.includes('late'), false);
    f.clock.increment(2500); assert.equal(score(f, 'late'), false);
  });
  run('3/6/9-map tournaments preserve cumulative totals and reset after the final map', () => {
    for (const [mode, maps] of [[GameModes.TOURNAMENT_3, 3], [GameModes.TOURNAMENT_6, 6], [GameModes.TOURNAMENT_9, 9]]) {
      const f = make(); start(f, mode);
      for (let map = 0; map < maps; map++) {
        completeMap(f); assert.equal(f.state().totals.host.total, (map + 1) * 6);
        assert.equal(f.state().totals.host.wins, map + 1); f.send('RETURN_TO_LOBBY');
        if (map < maps - 1) { assert.equal(f.state().phase, 'select'); f.send('CAST_VOTE', { mapIndex: 0 }); f.clock.increment(2500); }
      }
      assert.equal(f.state().phase, 'lobby'); assert.deepEqual(f.state().totals, {});
    }
  });
  run('course practice has immediate selection and returns to its map picker', () => {
    const f = make(); start(f, GameModes.PRACTICE, 19);
    assert.equal(f.state().mapIndex, 19); completeMap(f); assert.equal(f.state().phase, 'results');
    f.send('RETURN_TO_LOBBY'); assert.equal(f.state().phase, 'select'); assert.deepEqual(f.state().totals, {});
    assert.equal(f.send('JOIN_ROOM', { name: 'guest' }, 'guest'), false);
  });
  run('putt practice selects a putt, has no timeout/scoring, loops and supports wrapping controls', () => {
    const f = make(); start(f, GameModes.PUTT_PRACTICE, 20, 2);
    assert.equal(f.state().puttIndex, 2); f.clock.increment(1200000);
    assert.equal(f.state().puttIndex, 2); assert.equal(f.state().players.host.done, false);
    assert.equal(score(f), true); f.clock.increment(2199); assert.equal(f.state().roundNumber, 1);
    f.clock.increment(1); assert.equal(f.state().roundNumber, 2); assert.equal(f.state().puttIndex, 2);
    assert.deepEqual(f.state().players.host.scores, []); assert.deepEqual(f.state().totals, {});
    f.send('PRACTICE_STEP', { step: 1 }); assert.equal(f.state().puttIndex, 3);
    f.send('PRACTICE_STEP', { step: 0 }); assert.equal(f.state().puttIndex, 3);
    f.send('PRACTICE_STEP', { step: -1 }); assert.equal(f.state().puttIndex, 2);
    f.send('PRACTICE_STEP', { step: -1 }); f.send('PRACTICE_STEP', { step: -1 }); f.send('PRACTICE_STEP', { step: -1 });
    assert.equal(f.state().puttIndex, 5);
    f.send('PRACTICE_MAPS'); assert.equal(f.state().phase, 'select');
  });
  run('zero penalties, reconnecting identities and unusual peer IDs preserve owned state', () => {
    const edited = structuredClone(courses); edited[0].putts[0].penalty = 0;
    const clock = new SimulatedClock(); const session = createRoomSession({ hostId: '__proto__', clock, courses: edited });
    sessions.push(session);
    session.send({ type: 'START_VOTING', playerId: '__proto__' });
    session.send({ type: 'CAST_VOTE', playerId: '__proto__', mapIndex: 0 }); clock.increment(2500); clock.increment(1500); clock.increment(122500);
    assert.equal(session.getSnapshot().players.__proto__.scores[0].score, 2);
    const f = make(['constructor']); start(f); f.clock.increment(1500);
    score(f, 'constructor', 7); f.send('LEAVE_ROOM', {}, 'constructor');
    f.send('JOIN_ROOM', { name: 'Back' }, 'constructor');
    assert.equal(f.state().players.constructor.score, 7);
    assert.equal(score(f, 'constructor', 1), false);
    score(f); f.clock.increment(2500); completeRemaining(f);
    assert.equal(Object.hasOwn(f.state().totals, 'constructor'), true);
    assert.deepEqual(f.state().last.winners, ['host']);
    assert.equal(f.state().totals.constructor.wins, 0);
    function completeRemaining(g) {
      for (let putt = 1; putt < 6; putt++) { g.clock.increment(1500); score(g); score(g, 'constructor'); if (putt < 5) g.clock.increment(2500); }
    }
  });
  run('host departure and disposal cancel pending timers without host migration', () => {
    const f = make(['a']); f.send('START_VOTING'); f.send('CAST_VOTE', { mapIndex: 0 });
    f.send('LEAVE_ROOM'); assert.equal(f.state().phase, 'lobby'); f.clock.increment(1000000);
    assert.equal(f.state().phase, 'lobby'); assert.equal(f.send('START_VOTING', {}, 'a'), false);
    const g = make(['a']); g.send('START_VOTING'); g.send('CAST_VOTE', { mapIndex: 0 });
    const before = g.state(); g.session.dispose(); g.clock.increment(1000000); assert.deepEqual(g.state(), before);
  });
  run('server-owned controller changes preserve disconnected seats and keep the round alive', () => {
    const clock = new SimulatedClock();
    const session = createRoomSession({ controllerId: 'owner', serverOwned: true, isReserved: id => id === 'owner', clock, courses });
    sessions.push(session);
    assert.equal(session.send({ type: 'JOIN_ROOM', playerId: 'guest', name: 'Guest' }), true);
    assert.equal(session.getSnapshot().hostId, undefined);
    assert.equal(session.getSnapshot().controllerId, 'owner');
    assert.equal(session.send({ type: 'START_VOTING', playerId: 'guest' }), false);
    assert.equal(session.send({ type: 'START_VOTING', playerId: 'owner' }), true);
    assert.equal(session.send({ type: 'CAST_VOTE', playerId: 'owner', mapIndex: 0 }), true);
    assert.equal(session.send({ type: 'CAST_VOTE', playerId: 'guest', mapIndex: 0 }), true);
    assert.equal(session.getSnapshot().phase, 'play');
    assert.equal(session.send({ type: 'LEAVE_ROOM', playerId: 'owner' }), true);
    assert.equal(session.getSnapshot().phase, 'play');
    assert.equal(session.getSnapshot().players.owner.connected, false);
    assert.equal(session.setController('guest'), true);
    assert.equal(session.getSnapshot().controllerId, 'guest');
    assert.equal(session.send({ type: 'RETURN_TO_LOBBY', playerId: 'guest' }), false);
    clock.increment(2500);
    assert.equal(session.send({ type: 'REPORT_SCORE', playerId: 'guest', roundNumber: session.getSnapshot().roundNumber, puttIndex: 0, strokes: 1 }), true);
    assert.equal(session.getSnapshot().roster.includes('owner'), true);
  });
  run('server abandonment invalidates an empty unfinished round without recording results', () => {
    const clock = new SimulatedClock();
    const session = createRoomSession({ controllerId: 'owner', serverOwned: true, clock, courses });
    sessions.push(session);
    session.send({ type: 'START_VOTING', playerId: 'owner' });
    session.send({ type: 'CAST_VOTE', playerId: 'owner', mapIndex: 0 });
    clock.increment(4000);
    const roundNumber = session.getSnapshot().roundNumber;
    session.send({ type: 'LEAVE_ROOM', playerId: 'owner' });
    assert.equal(session.getSnapshot().phase, 'play');
    assert.equal(session.abandonRoom(), true);
    assert.equal(session.getSnapshot().phase, 'lobby');
    assert.equal(session.getSnapshot().roundNumber, roundNumber + 1);
    assert.deepEqual(session.getSnapshot().totals, {});
    assert.equal(session.getSnapshot().last, null);
  });
  run('server-owned reservations remain on the next map roster through reconnect grace', () => {
    const clock = new SimulatedClock();
    const session = createRoomSession({ controllerId: 'owner', serverOwned: true, isReserved: id => id === 'owner', clock, courses });
    sessions.push(session);
    session.send({ type: 'JOIN_ROOM', playerId: 'guest', name: 'Guest' });
    session.send({ type: 'SET_MODE', playerId: 'owner', mode: GameModes.TOURNAMENT_3 });
    session.send({ type: 'START_VOTING', playerId: 'owner' });
    session.send({ type: 'CAST_VOTE', playerId: 'owner', mapIndex: 0 });
    session.send({ type: 'CAST_VOTE', playerId: 'guest', mapIndex: 0 });
    clock.increment(2500);
    for (let putt = 0; putt < 6; putt++) {
      clock.increment(1500);
      for (const id of ['owner', 'guest']) {
        const state = session.getSnapshot();
        assert.equal(session.send({ type: 'REPORT_SCORE', playerId: id, roundNumber: state.roundNumber, puttIndex: state.puttIndex, strokes: 1 }), true);
      }
      if (putt < 5) clock.increment(2500);
    }
    assert.equal(session.getSnapshot().phase, 'results');
    session.send({ type: 'LEAVE_ROOM', playerId: 'owner' });
    session.setController('guest');
    session.send({ type: 'RETURN_TO_LOBBY', playerId: 'guest' });
    session.send({ type: 'CAST_VOTE', playerId: 'guest', mapIndex: 0 });
    assert.equal(session.getSnapshot().phase, 'play');
    assert.deepEqual(session.getSnapshot().roster, ['owner', 'guest']);
    assert.equal(session.getSnapshot().players.owner.connected, false);
  });
  run('scores and automatic timeouts keep map and tournament totals in safe integer range', () => {
    const f = make(); start(f); f.clock.increment(1500);
    assert.equal(score(f, 'host', Number.MAX_SAFE_INTEGER), true);
    for (let putt = 1; putt < 6; putt++) {
      f.clock.increment(2500);
      const state = f.state();
      assert.equal(f.send('UPDATE_STROKES', { roundNumber: state.roundNumber, puttIndex: state.puttIndex, strokes: 1 }), false);
      assert.equal(score(f, 'host', 1), false);
      f.clock.increment(1500);
      f.clock.increment(122500);
    }
    assert.equal(f.state().phase, 'results');
    assert.equal(f.state().last.scores.host, Number.MAX_SAFE_INTEGER);
    assert.equal(f.state().totals.host.total, Number.MAX_SAFE_INTEGER);
  });
  run('server-owned replay putt selection follows the current controller identity', () => {
    const clock = new SimulatedClock();
    const session = createRoomSession({ controllerId: 'owner', serverOwned: true, clock, courses });
    sessions.push(session);
    session.send({ type: 'SET_MODE', playerId: 'owner', mode: GameModes.PUTT_PRACTICE });
    session.send({ type: 'START_VOTING', playerId: 'owner' });
    session.send({ type: 'CAST_VOTE', playerId: 'owner', mapIndex: 0 });
    assert.equal(session.getSnapshot().state.select, 'choosingPutt');
    assert.equal(session.send({ type: 'START_ROUND', playerId: 'owner', puttIndex: 2 }), true);
    assert.equal(session.getSnapshot().phase, 'play');
    assert.equal(session.getSnapshot().puttIndex, 2);
  });
  for (const session of sessions) session.dispose();
  if (failed) process.exitCode = 1;
  else console.log('ALL SESSION LIFECYCLE TESTS PASSED');
})();
