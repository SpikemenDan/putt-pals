import { setup, assign, createActor } from 'xstate';
import { createInitialSessionState, GameModes, resolveVote, SessionCommands } from '../shared/session.js';
import { STARTER_COURSE_INDICES, MAX_PLAYERS, MAX_PLAYER_NAME_LENGTH, VOTING_COUNTDOWN_SECONDS } from '../shared/constants.js';
import { calculateTimeoutScore } from '../shared/scoring.js';
import { createCourseDocument, validateCourseDocument } from '../courses/document.js';

export const SessionEvents = Object.freeze({ ...SessionCommands, UPDATE_STROKES: 'UPDATE_STROKES', REPORT_SCORE: 'REPORT_SCORE', PRACTICE_STEP: 'PRACTICE_STEP', PRACTICE_MAPS: 'PRACTICE_MAPS' });
const eventTypes = new Set(Object.values(SessionEvents));
export const SESSION_TIMING = Object.freeze({ start: 2500, minimumPlay: 1500, fallback: 4000, replay: 2200 });
const modes = Object.values(GameModes);
const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
const practice = c => [GameModes.PRACTICE, GameModes.PUTT_PRACTICE].includes(c.mode);
const replay = c => c.mode === GameModes.PUTT_PRACTICE;
const ids = c => Object.keys(c.players).filter(id => c.players[id].connected);
const active = c => c.roster.filter(id => own(c.players, id) && c.players[id].connected);
const allDone = c => active(c).length > 0 && active(c).every(id => c.players[id].done);
const validCount = n => Number.isSafeInteger(n) && n >= 0;
const validIdentity = e => typeof e.playerId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(e.playerId);
const validName = n => typeof n === 'string' && n.trim().length > 0 && n.length <= MAX_PLAYER_NAME_LENGTH;
const seriesLength = mode => ({ tournament_3: 3, tournament_6: 6, tournament_9: 9 })[mode] ?? 1;

/** Host-owned domain actor. Transport adapters must bind playerId to authenticated senders. */
export function createRoomSession({ hostId, hostName = 'Host', clock, courses = createCourseDocument().courses } = {}) {
  if (!validIdentity({ playerId: hostId }) || !validName(hostName)) throw new Error('Valid host identity and name required');
  if (!clock || !['now', 'setTimeout', 'clearTimeout'].every(key => typeof clock[key] === 'function')) throw new Error('An explicit now/setTimeout/clearTimeout clock is required');
  const courseData = structuredClone(courses);
  const checked = validateCourseDocument({ schemaVersion: 1, courses: courseData });
  if (!checked.valid) throw new Error(`Invalid session courses: ${checked.errors.join('; ')}`);
  const rule = c => courseData[c.mapIndex].putts[c.puttIndex];
  const host = (c, e) => e.playerId === c.hostId && c.players[c.hostId]?.connected === true;
  const member = (c, e) => own(c.players, e.playerId) && c.players[e.playerId].connected;
  const participant = (c, e) => member(c, e) && c.roster.includes(e.playerId);
  const validVote = (c, e) => member(c, e) && STARTER_COURSE_INDICES.includes(e.mapIndex);
  const hasVotes = c => ids(c).some(id => Number.isInteger(c.votes[id]));
  const everyoneVoted = c => ids(c).length > 0 && ids(c).every(id => Number.isInteger(c.votes[id]));
  const timeoutScore = (c, p) => Math.max(p.strokes, calculateTimeoutScore(p.strokes, rule(c).par, rule(c).penalty));
  const fresh = (id, name) => ({ id, name, connected: true, strokes: 0, done: false, timedOut: false, score: null, scores: [] });
  const resetPlayers = (c, clearScores) => Object.fromEntries(Object.entries(c.players).map(([id, p]) => [id, { ...p, strokes: 0, done: false, timedOut: false, score: null, scores: clearScores ? [] : p.scores }]));
  const round = (c, mapIndex, puttIndex, newMap) => ({
    mapIndex, puttIndex, roundNumber: c.roundNumber + 1,
    roundLimitSeconds: courseData[mapIndex].putts[puttIndex].limitSeconds,
    roundStartTime: clock.now() + (replay(c) ? 0 : SESSION_TIMING.start),
    roster: newMap ? ids(c) : c.roster,
    players: resetPlayers(c, newMap), votes: {}, votingDeadline: 0,
  });
  const recordPutt = c => replay(c) ? {} : { players: Object.fromEntries(Object.entries(c.players).map(([id, p]) => [id, {
    ...p, scores: c.roster.includes(id) ? [...p.scores, p.connected ? { score: p.score ?? timeoutScore(c, p), timedOut: p.timedOut || !p.done, par: rule(c).par, penalty: rule(c).penalty } : null] : p.scores,
  }])) };
  const finishMap = c => {
    const scores = Object.fromEntries(active(c).map(id => [id, c.players[id].scores.reduce((sum, p) => sum + (p?.score ?? 0), 0)]));
    const best = Math.min(...Object.values(scores));
    const winners = Object.keys(scores).filter(id => scores[id] === best);
    let totals = { ...c.totals };
    for (const [id, score] of Object.entries(scores)) {
      const previous = own(totals, id) ? totals[id] : undefined;
      totals = { ...totals, [id]: { name: c.players[id].name, total: (previous?.total ?? 0) + score, wins: (previous?.wins ?? 0) + Number(winners.includes(id)) } };
    }
    return { totals, completedMaps: [...c.completedMaps, c.mapIndex], last: { mapIndex: c.mapIndex, scores, winners } };
  };
  const scoreEvent = (c, e) => participant(c, e) && e.roundNumber === c.roundNumber && e.puttIndex === c.puttIndex
    && clock.now() >= c.roundStartTime && !c.players[e.playerId].done && validCount(e.strokes)
    && e.strokes >= c.players[e.playerId].strokes && (e.timedOut === undefined || typeof e.timedOut === 'boolean')
    && (!e.timedOut || (!replay(c) && clock.now() >= c.roundStartTime + c.roundLimitSeconds * 1000));
  const clearSeries = c => ({ votes: {}, votingDeadline: 0, totals: {}, completedMaps: [], last: null, roster: [], players: resetPlayers(c, true) });

  const machine = setup({
    delays: {
      votingRemaining: ({ context: c }) => Math.max(0, c.votingDeadline - clock.now()),
      startRemaining: ({ context: c }) => Math.max(0, c.roundStartTime - clock.now()),
      minimumPlay: ({ context: c }) => Math.max(0, c.roundStartTime + SESSION_TIMING.minimumPlay - clock.now()),
      fallbackRemaining: ({ context: c }) => Math.max(0, c.roundStartTime + c.roundLimitSeconds * 1000 + SESSION_TIMING.fallback - clock.now()),
      replay: SESSION_TIMING.replay,
    },
    guards: {
      host: ({ context: c, event: e }) => host(c, e),
      canJoin: ({ context: c, event: e }) => validIdentity(e) && validName(e.name) && !(own(c.players, e.playerId) && c.players[e.playerId].connected) && ids(c).length < MAX_PLAYERS && (!practice(c) || ids(c).length === 0),
      canLeave: ({ context: c, event: e }) => member(c, e),
      hostLeaving: ({ context: c, event: e }) => host(c, e),
      mode: ({ context: c, event: e }) => host(c, e) && modes.includes(e.mode) && (![GameModes.PRACTICE, GameModes.PUTT_PRACTICE].includes(e.mode) || ids(c).length === 1),
      vote: ({ context: c, event: e }) => validVote(c, e),
      practice: ({ context: c }) => c.mode === GameModes.PRACTICE,
      replay: ({ context: c }) => replay(c),
      everyoneVoted: ({ context: c }) => everyoneVoted(c),
      hasVotes: ({ context: c }) => hasVotes(c),
      choosePutt: ({ context: c, event: e }) => host(c, e) && replay(c) && Number.isInteger(c.votes[c.hostId]) && Number.isInteger(e.puttIndex) && e.puttIndex >= 0 && e.puttIndex < courseData[c.votes[c.hostId]].putts.length,
      score: ({ context: c, event: e }) => scoreEvent(c, e) && (e.timedOut === true || e.strokes > 0),
      strokes: ({ context: c, event: e }) => scoreEvent(c, e) && e.timedOut !== true,
      doneReplay: ({ context: c }) => replay(c) && allDone(c),
      doneLast: ({ context: c }) => allDone(c) && c.puttIndex + 1 === courseData[c.mapIndex].putts.length,
      done: ({ context: c }) => allDone(c),
      notReplay: ({ context: c }) => !replay(c),
      replayHost: ({ context: c, event: e }) => replay(c) && host(c, e),
      replayStep: ({ context: c, event: e }) => replay(c) && host(c, e) && [-1, 0, 1].includes(e.step),
      moreMaps: ({ context: c, event: e }) => host(c, e) && c.completedMaps.length < seriesLength(c.mode),
      practiceHost: ({ context: c, event: e }) => host(c, e) && practice(c),
    },
    actions: {
      join: assign(({ context: c, event: e }) => ({ players: { ...c.players, [e.playerId]: own(c.players, e.playerId) ? { ...c.players[e.playerId], name: e.name, connected: true } : fresh(e.playerId, e.name) } })),
      leave: assign(({ context: c, event: e }) => ({ players: { ...c.players, [e.playerId]: { ...c.players[e.playerId], connected: false } }, votes: Object.fromEntries(Object.entries(c.votes).filter(([id]) => id !== e.playerId)) })),
      mode: assign(({ event: e }) => ({ mode: e.mode })),
      clearSeries: assign(({ context: c }) => clearSeries(c)),
      clearVotes: assign({ votes: () => ({}), votingDeadline: 0 }),
      lobby: assign(({ context: c }) => ({ ...clearSeries(c), mode: GameModes.STANDARD })),
      vote: assign(({ context: c, event: e }) => ({ votes: { ...c.votes, [e.playerId]: e.mapIndex } })),
      deadline: assign(({ context: c }) => ({ votingDeadline: practice(c) ? 0 : c.votingDeadline || clock.now() + VOTING_COUNTDOWN_SECONDS * 1000 })),
      votedMap: assign(({ context: c }) => round(c, resolveVote(c.votes, STARTER_COURSE_INDICES, { round: c.roundNumber, connectedIds: ids(c) }), 0, true)),
      chosenPutt: assign(({ context: c, event: e }) => round(c, c.votes[c.hostId], e.puttIndex, true)),
      strokes: assign(({ context: c, event: e }) => ({ players: { ...c.players, [e.playerId]: { ...c.players[e.playerId], strokes: e.strokes } } })),
      score: assign(({ context: c, event: e }) => ({ players: { ...c.players, [e.playerId]: { ...c.players[e.playerId], strokes: e.strokes, done: true, timedOut: e.timedOut === true, score: e.timedOut ? timeoutScore(c, { strokes: e.strokes }) : e.strokes } } })),
      forceTimeout: assign(({ context: c }) => ({ players: Object.fromEntries(Object.entries(c.players).map(([id, p]) => [id, active(c).includes(id) && !p.done ? { ...p, done: true, timedOut: true, score: timeoutScore(c, p) } : p])) })),
      record: assign(({ context: c }) => recordPutt(c)),
      next: assign(({ context: c }) => round(c, c.mapIndex, c.puttIndex + 1, false)),
      finish: assign(({ context: c }) => finishMap(c)),
      loop: assign(({ context: c }) => round(c, c.mapIndex, c.puttIndex, false)),
      step: assign(({ context: c, event: e }) => round(c, c.mapIndex, (c.puttIndex + e.step + courseData[c.mapIndex].putts.length) % courseData[c.mapIndex].putts.length, false)),
    },
  }).createMachine({
    id: 'session', initial: 'lobby',
    context: { ...createInitialSessionState(), hostId, players: { [hostId]: fresh(hostId, hostName) }, totals: {}, last: null },
    on: {
      JOIN_ROOM: { guard: 'canJoin', actions: 'join' },
      LEAVE_ROOM: [{ guard: 'hostLeaving', target: '.lobby', actions: ['leave', 'lobby'] }, { guard: 'canLeave', actions: 'leave' }],
    },
    states: {
      lobby: { on: { SET_MODE: { guard: 'mode', actions: 'mode' }, START_VOTING: { guard: 'host', target: 'select', actions: 'clearSeries' } } },
      select: {
        initial: 'waiting',
        states: {
          waiting: { on: { CAST_VOTE: { guard: 'vote', target: 'timing', actions: 'vote' } } },
          timing: {
            entry: 'deadline',
            always: [{ guard: 'practice', target: '#session.play', actions: 'votedMap' }, { guard: 'replay', target: 'choosingPutt' }, { guard: 'everyoneVoted', target: '#session.play', actions: 'votedMap' }],
            after: { votingRemaining: [{ guard: 'hasVotes', target: '#session.play', actions: 'votedMap' }, { target: 'waiting' }] },
            on: { CAST_VOTE: { guard: 'vote', actions: 'vote' } },
          },
          choosingPutt: { on: { CAST_VOTE: { guard: 'vote', actions: 'vote' }, START_ROUND: { guard: 'choosePutt', target: '#session.play', actions: 'chosenPutt' } } },
        },
      },
      play: {
        initial: 'starting',
        on: {
          UPDATE_STROKES: { guard: 'strokes', actions: 'strokes' },
          REPORT_SCORE: { guard: 'score', actions: 'score' },
          PRACTICE_STEP: { guard: 'replayStep', target: '.starting', actions: 'step' },
          PRACTICE_MAPS: { guard: 'replayHost', target: 'select', actions: 'clearSeries' },
          RETURN_TO_LOBBY: { guard: 'replayHost', target: 'lobby', actions: 'lobby' },
        },
        states: {
          starting: { after: { startRemaining: 'active' } },
          active: {
            initial: 'settling',
            states: {
              settling: { after: { minimumPlay: 'running' } },
              running: {
                always: [{ guard: 'doneReplay', target: 'replaying' },
                  { guard: 'doneLast', target: '#session.results', actions: ['record', 'finish'] },
                  { guard: 'done', target: '#session.play.starting', actions: ['record', 'next'] }],
                after: { fallbackRemaining: { guard: 'notReplay', actions: 'forceTimeout' } },
              },
              replaying: { after: { replay: { target: '#session.play.starting', actions: 'loop' } } },
            },
          },
        },
      },
      results: { on: { RETURN_TO_LOBBY: [
        { guard: 'practiceHost', target: 'select', actions: 'clearSeries' },
        { guard: 'moreMaps', target: 'select', actions: 'clearVotes' },
        { guard: 'host', target: 'lobby', actions: 'lobby' },
      ] } },
    },
  });
  const actor = createActor(machine, { clock });
  const snapshot = value => {
    const phase = typeof value.value === 'string' ? value.value : Object.keys(value.value)[0];
    return structuredClone({ ...value.context, phase, state: value.value });
  };
  let disposed = false;
  actor.start();
  return {
    getSnapshot: () => snapshot(actor.getSnapshot()),
    send(event) {
      if (disposed || !event || typeof event !== 'object' || typeof event.type !== 'string' || !eventTypes.has(event.type)) return false;
      const before = actor.getSnapshot();
      let message;
      try { message = structuredClone(event); } catch { return false; }
      actor.send(message);
      return before.context !== actor.getSnapshot().context;
    },
    subscribe(listener) { const subscription = actor.subscribe(value => listener(snapshot(value))); return () => subscription.unsubscribe(); },
    dispose() { disposed = true; actor.stop(); },
  };
}
