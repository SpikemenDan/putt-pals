import assert from 'node:assert/strict';
import { SimulatedClock } from 'xstate';
import { createRoomSession, SESSION_TIMING } from '../../src/session/index.js';
import { sessionDomain } from '../../src/session/recovery.js';

function fixture({ mode = 'standard', guests = [], durable = true } = {}) {
  const clock = new SimulatedClock();
  const options = { controllerId: 'host', hostName: 'Host', serverOwned: true, durable, clock };
  let session = createRoomSession(options);
  for (const id of guests) session.send({ type: 'JOIN_ROOM', playerId: id, name: id });
  if (mode !== 'standard') session.send({ type: 'SET_MODE', playerId: 'host', mode });
  return {
    clock, get session() { return session; },
    send: (type, payload = {}, playerId = 'host') => session.send({ type, ...payload, playerId }),
    restore() {
      const domain = session.exportDomain();
      session.dispose();
      session = createRoomSession({ ...options, restore: domain });
      assert.deepEqual(session.exportDomain(), domain, `restore preserves ${domain.node} without entry resets`);
    },
    deadline(kind, at) {
      clock.increment(Math.max(0, at - clock.now()));
      return session.advanceDeadline(kind, session.getSnapshot().roundNumber, at);
    },
    state: () => session.getSnapshot(),
  };
}
const sendScore = f => {
  const s = f.state();
  f.send('REPORT_SCORE', { strokes: 1, timedOut: false, roundNumber: s.roundNumber, puttIndex: s.puttIndex });
};
{
  const f = fixture({ guests: ['guest'] });
  f.restore();
  f.send('START_VOTING'); f.restore();
  f.send('CAST_VOTE', { mapIndex: 0 }); f.restore();
  const deadline = f.state().votingDeadline;
  f.clock.increment(5000); f.restore();
  assert.equal(f.state().votingDeadline, deadline);
  assert.equal(f.session.advanceDeadline('voteAt', 0, deadline), false, 'early timer ignored');
  assert.equal(f.deadline('voteAt', deadline), true);
  f.restore();
  assert.equal(f.state().roundStartTime, deadline + SESSION_TIMING.start);
  assert.equal(f.session.advanceDeadline('startAt', 0, f.state().roundStartTime), false, 'stale round ignored');
  assert.equal(f.deadline('startAt', f.state().roundStartTime), true); f.restore();
  assert.equal(f.deadline('minimumPlayAt', f.state().roundStartTime + SESSION_TIMING.minimumPlay), true); f.restore();
  const fallback = f.state().roundStartTime + f.state().roundLimitSeconds * 1000 + SESSION_TIMING.fallback;
  assert.equal(f.deadline('fallbackAt', fallback), true); f.restore();
  assert.equal(f.state().puttIndex, 1);
  assert.equal(f.state().players.host.scores.length, 1);
  assert.equal(f.session.advanceDeadline('fallbackAt', 1, fallback), false, 'replayed alarm cannot score twice');
  f.session.dispose();
}
{
  const f = fixture({ mode: 'putt_practice' });
  f.send('START_VOTING'); f.send('CAST_VOTE', { mapIndex: 0 }); f.restore();
  assert.equal(f.session.exportDomain().node, 'select.choosingPutt');
  f.send('START_ROUND', { puttIndex: 0 });
  f.deadline('startAt', f.state().roundStartTime);
  f.deadline('minimumPlayAt', f.state().roundStartTime + SESSION_TIMING.minimumPlay);
  sendScore(f); f.restore();
  assert.equal(f.session.exportDomain().node, 'play.active.replaying');
  const replayAt = f.clock.now() + SESSION_TIMING.replay;
  f.clock.increment(1000); f.restore();
  f.deadline('replayAt', replayAt); f.restore();
  assert.equal(f.state().roundNumber, 2);
  f.session.dispose();
}
for (const mode of ['standard', 'tournament_3', 'tournament_6', 'tournament_9', 'practice']) {
  const f = fixture({ mode });
  f.send('START_VOTING'); f.send('CAST_VOTE', { mapIndex: 0 });
  for (let putt = 0; putt < 6; putt++) {
    f.restore();
    f.deadline('startAt', f.state().roundStartTime);
    f.deadline('minimumPlayAt', f.state().roundStartTime + SESSION_TIMING.minimumPlay);
    sendScore(f);
  }
  f.restore();
  assert.equal(f.session.exportDomain().node, 'results');
  assert.equal(f.state().players.host.scores.length, 6);
  assert.equal(f.state().totals.host.total, 6);
  f.send('RETURN_TO_LOBBY'); f.restore();
  assert.equal(f.session.exportDomain().node, mode === 'standard' ? 'lobby' : 'select.waiting');
  f.session.dispose();
}
{
  const regular = fixture({ durable: false });
  const durable = fixture();
  for (const f of [regular, durable]) { f.send('START_VOTING'); f.send('CAST_VOTE', { mapIndex: 0 }); }
  for (let putt = 0; putt < 6; putt++) {
    const start = durable.state().roundStartTime;
    regular.clock.increment(start - regular.clock.now());
    regular.clock.increment(SESSION_TIMING.minimumPlay);
    durable.deadline('startAt', start);
    durable.deadline('minimumPlayAt', start + SESSION_TIMING.minimumPlay);
    sendScore(regular); sendScore(durable);
    assert.deepEqual(durable.session.exportDomain(), sessionDomain(regular.state()), 'externally driven timers match uninterrupted actor');
    durable.restore();
  }
  regular.session.dispose(); durable.session.dispose();
}
{
  const f = fixture();
  f.send('START_VOTING'); f.send('CAST_VOTE', { mapIndex: 0 });
  const before = f.session.exportDomain();
  f.clock.increment(1_000_000);
  assert.deepEqual(f.session.exportDomain(), before, 'durable actor creates no volatile timers');
  assert.equal(f.send('SERVER_TIMER_startRemaining'), false, 'public commands cannot forge timers');
  const restored = f.session.exportDomain(); restored.node = 'unknown';
  assert.throws(() => createRoomSession({ controllerId: 'host', serverOwned: true, durable: true, clock: f.clock, restore: restored }), /Unknown session recovery node/);
  f.session.dispose();
}
console.log('PASS: domain restore at all nodes, absolute timers, replay protection, tournaments, practice, and uninterrupted actor equivalence.');
