// VIS-U #168: Custom rules. Expectations are independent literals (shipped values and hand-computed results), so a
// moved default or a broken injection path cannot pass by comparing a setting with itself.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const load = rel => import(pathToFileURL(path.join(root, rel)).href);
const FLAT = { tee: [0, 0], hole: [10000, 10000], tiles: [[-20000, -20000, 40000, 40000]], w: [] };

(async () => {
  const rules = await load('src/shared/rules.js');
  const { TUNING } = await load('src/shared/tuning.js');
  const { worldGravity } = await load('src/shared/worlds.js');
  const aim = await load('src/input/aim.js');
  const { SimulationEngine } = await load('src/simulation/index.js');
  const { SimulatedClock } = await import('xstate');
  const { createRoomSession } = await load('src/session/index.js');
  const { createCourseDocument } = await load('src/courses/index.js');
  const { GameModes } = await load('src/shared/session.js');
  const { validClientFrame } = await load('src/network/contracts/server-room.js');
  const { lobbyView, votingView, createCourseInfo } = await load('src/ui/model.js');
  const { createCourseData } = await load('src/courses/index.js');
  const { DEFAULT_RULES: STD } = rules;

  // ---- the rule set and its standard values
  assert.deepEqual(STD, { gaiaGravity: 100, aresGravity: 100, lunaGravity: 100, shotPower: 100, aimWobble: 'normal', powerups: true, holeTimer: 0, maps: 1, missedHolePenalty: 2 });
  assert.ok(Object.isFrozen(STD));
  assert.deepEqual(rules.RULE_CATEGORIES.map(c => c.id), ['match', 'shots', 'worlds'], 'most-changed category first');
  assert.deepEqual(rules.CUSTOM_RULES.map(r => r.label), ['Power-Ups', 'Game Length', 'Time Per Hole', 'Missed Hole Penalty', 'Shot Power', 'Aim Sway', 'Gaia Gravity', 'Ares Gravity', 'Luna Gravity'], 'Title Case labels in display order');
  assert.ok(rules.CUSTOM_RULES.every(r => rules.RULE_CATEGORIES.some(c => c.id === r.category)), 'every rule has a category (for a tabbed layout later)');
  assert.ok(rules.CUSTOM_RULES.every(r => typeof r.label === 'string' && r.label && typeof r.help === 'string' && r.help), 'every rule has player-facing text');
  for (const banned of [/secret/i, /token/i, /auth/i, /quota/i, /policy/i, /grace/i, /ttl/i, /limit/i]) {
    assert.ok(!rules.RULE_IDS.some(id => banned.test(id)), 'no security, policy or quota setting is a rule: ' + banned);
  }
  assert.equal(rules.rulesTuning(STD), TUNING, 'standard rules are the shipped tuning object itself');
  assert.equal(rules.isStandardRules(STD), true);

  // ---- validation at the boundary
  assert.equal(rules.validRules({ ...STD }), true);
  const bad = [
    null, [], 'x', {},
    { ...STD, extra: 1 },
    (({ shotPower, ...rest }) => rest)(STD),
    { ...STD, shotPower: 151 }, { ...STD, shotPower: 45 }, { ...STD, shotPower: 102 }, { ...STD, shotPower: '100' }, { ...STD, shotPower: 100.5 },
    { ...STD, gaiaGravity: Infinity }, { ...STD, lunaGravity: NaN },
    { ...STD, aimWobble: 'wild' }, { ...STD, powerups: 1 }, { ...STD, holeTimer: 60 }, { ...STD, holeTimer: '120' },
    { ...STD, missedHolePenalty: -1 }, { ...STD, missedHolePenalty: 6 },
    { ...STD, maps: 21 }, { ...STD, maps: 0 }, { ...STD, maps: -1 }, { ...STD, maps: 2.5 }, { ...STD, maps: '12' },
    { ...STD, __proto__: null, toString: 1 },
  ];
  for (const value of bad) assert.equal(rules.validRules(value), false, 'rejects ' + JSON.stringify(value));
  assert.throws(() => rules.validateRules({ ...STD, shotPower: 999, mystery: true }), /shotPower has an invalid value; unknown rule mystery|unknown rule mystery.*shotPower/);
  const copy = rules.validateRules({ ...STD, holeTimer: 300 });
  assert.ok(Object.isFrozen(copy));
  assert.equal(copy.holeTimer, 300);
  // Stored editor drafts: keep valid entries, drop bad or unknown ones.
  assert.deepEqual(rules.rulesFromPartial({ shotPower: 120, lunaGravity: 7, hack: 1 }), { ...STD, shotPower: 120 });
  assert.deepEqual(rules.rulesFromPartial('nope'), STD);
  assert.deepEqual(rules.changedRules({ ...STD, powerups: false, lunaGravity: 50 }), ['powerups', 'lunaGravity'], 'changed rules in display order');

  // ---- player-facing values
  assert.equal(rules.ruleValueText('gaiaGravity', 150), '150%');
  assert.equal(rules.ruleValueText('missedHolePenalty', 1), '+1 stroke');
  assert.equal(rules.ruleValueText('missedHolePenalty', 3), '+3 strokes');
  assert.equal(rules.ruleValueText('holeTimer', 0), 'Course');
  assert.equal(rules.ruleValueText('holeTimer', 180), '3 min');
  assert.equal(rules.ruleValueText('powerups', false), 'Off');
  assert.equal(rules.ruleValueText('aimWobble', 'high'), 'High');
  assert.equal(rules.ruleValueText('maps', 1), '1 Map');
  assert.equal(rules.ruleValueText('maps', 2), '2 Maps');
  assert.equal(rules.ruleValueText('maps', 12), '12 Maps');

  // ---- Game length: 1 (standard) keeps the lobby mode's length; more overrides standard and tournament modes
  assert.equal(rules.MAX_SERIES_MAPS, 20);
  assert.equal(rules.LONG_SERIES_MAPS, 10);
  assert.equal(rules.validRules({ ...STD, maps: 20 }), true);
  assert.deepEqual(['standard', 'tournament_3', 'tournament_5', 'tournament_7', 'practice', 'putt_practice', 'pong'].map(m => rules.seriesMaps(m, STD)), [1, 3, 5, 7, 1, 1, 1]);
  assert.deepEqual(['standard', 'tournament_3', 'practice', 'pong'].map(m => rules.seriesMaps(m, { ...STD, maps: 12 })), [12, 12, 1, 1]);
  assert.deepEqual(['standard', 'tournament_5'].map(m => rules.seriesMaps(m, { ...STD, maps: 1 })), [1, 5], 'the standard 1 leaves a lobby tournament alone');
  assert.equal(rules.seriesMaps('standard', { ...STD, maps: 99 }), 1, 'invalid rules fall back to the mode length');
  assert.equal(rules.rulesTuning({ ...STD, maps: 4 }).gravity, 700, 'Game length changes no physics');

  // ---- rules become tuning: shipped Gaia 700, Ares 490, Luna 315, shot power 600, spread 0.002 + 0.14 p^2.6
  const custom = { ...STD, gaiaGravity: 150, aresGravity: 50, lunaGravity: 200, shotPower: 50, aimWobble: 'off', missedHolePenalty: 5 };
  const t = rules.rulesTuning(custom);
  assert.equal(t.gravity, 1050);
  assert.equal(t.worlds.ares.gravity, 245);
  assert.equal(t.worlds.luna.gravity, 630);
  assert.deepEqual(['gaia', 'ares', 'luna'].map(id => rules.ruleGravity(custom, id)), [1050, 245, 630]);
  assert.deepEqual(['gaia', 'ares', 'luna'].map(id => worldGravity(id, t)), [1050, 245, 630]);
  assert.equal(t.shotPower, 300);
  assert.equal(t.aim.spreadBase, 0);
  assert.equal(t.aim.spreadGain, 0);
  assert.equal(t.scoring.missedHolePenalty, 5);
  assert.equal(t.cup.defaultRadius, 15, 'rules leave everything else at shipped values');
  assert.equal(TUNING.gravity, 700, 'shipped tuning is untouched');
  const high = rules.rulesTuning({ ...STD, aimWobble: 'high' });
  assert.ok(Math.abs(high.aim.spreadGain - 0.224) < 1e-12 && Math.abs(high.aim.spreadBase - 0.0032) < 1e-12, 'high wobble is 1.6x the shipped spread');
  assert.throws(() => rules.rulesTuning({ ...STD, shotPower: 1000 }), /Invalid rules/);
  assert.equal(rules.holeLimitSeconds(STD, 150), 150, 'course limit by default');
  assert.equal(rules.holeLimitSeconds({ ...STD, holeTimer: 600 }, 150), 600);

  // ---- aim wobble in the shot itself (input/aim.js)
  const shipped = 0.002 + 0.14;
  assert.ok(Math.abs(aim.spread(1) - shipped) < 1e-12);
  assert.equal(aim.spread(1, 0), 0);
  assert.ok(Math.abs(aim.spread(1, 0.5) - shipped / 2) < 1e-12);
  const time = 0.35; // a time where the sway is not at a zero crossing
  assert.notEqual(aim.shotAngle({ aimAngle: 1, charge: 1, time }), 1);
  assert.equal(aim.shotAngle({ aimAngle: 1, charge: 1, time, wobble: 0 }), 1, 'wobble off: the ball leaves exactly along the aim');
  assert.match(aim.accuracyText(true, 1, 0), /±0\.0° spread/);

  // ---- shot power reaches the launch (simulation)
  const engine = new SimulationEngine(FLAT, 0);
  const ball = engine.addPlayer('p', 'P');
  engine.launch('p', 0, 1, t.shotPower);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - 300) < 1e-9, 'a 50% shot power full putt leaves at 300 units/s');
  engine.dispose?.();

  // ---- the room session carries rules, fixed at creation
  const courses = createCourseDocument().courses;
  const open = (options = {}) => {
    const clock = new SimulatedClock();
    const session = createRoomSession({ hostId: 'host', clock, courses, ...options });
    return { session, clock, state: () => session.getSnapshot(), send: (type, extra = {}, playerId = 'host') => session.send({ type, playerId, ...extra }) };
  };
  const startMap0 = f => {
    f.send('SET_MODE', { mode: GameModes.STANDARD }); f.send('START_VOTING');
    for (const id of Object.keys(f.state().players)) f.send('CAST_VOTE', { mapIndex: 0 }, id);
    f.clock.increment(2500);
  };
  assert.throws(() => open({ rules: { ...STD, shotPower: 7 } }), /Invalid rules/);
  const std = open();
  assert.deepEqual(std.state().rules, STD, 'rooms default to standard rules');
  startMap0(std);
  assert.equal(std.state().roundLimitSeconds, 120, 'Switchback Garden putt 1 keeps its course limit');

  const timed = open({ rules: { ...STD, holeTimer: 300, missedHolePenalty: 5, powerups: false } });
  assert.equal(timed.state().powerups, false, 'Power-ups rule sets the room flag');
  startMap0(timed);
  assert.equal(timed.state().phase, 'play');
  assert.equal(timed.state().roundLimitSeconds, 300, 'fixed hole timer replaces the course limit');
  timed.clock.increment(301000);
  assert.equal(timed.send('JOIN_ROOM', { name: 'Late' }, 'late'), true);
  const late = timed.state().players.late;
  assert.equal(late.missed, true);
  assert.equal(late.score, 10 + 5, 'missed hole scores the maximum plus the rules penalty');
  assert.equal(late.scores[0].penalty, 5);
  assert.deepEqual(timed.state().rules, { ...STD, holeTimer: 300, missedHolePenalty: 5, powerups: false }, 'rules never change during a match');

  const lobby = open({ rules: { ...STD, lunaGravity: 60 } });
  assert.equal(lobby.send('SET_POWERUPS', { enabled: false }), true);
  assert.equal(lobby.state().powerups, false);
  assert.equal(lobby.state().rules.powerups, false, 'the lobby No power-ups toggle keeps the rules in step');
  assert.equal(lobby.state().rules.lunaGravity, 60);
  assert.equal(lobby.send('SET_POWERUPS', { enabled: true }, 'host'), true);
  assert.equal(lobby.state().rules.powerups, true);

  // a Game length game runs that many maps, then ends (Standard mode alone is one map)
  const series = open({ rules: { ...STD, maps: 2 } });
  assert.equal(series.send('START_VOTING'), true);
  for (let map = 0; map < 2; map++) {
    assert.equal(series.state().phase, 'select', 'map ' + (map + 1) + ' is chosen');
    series.send('CAST_VOTE', { mapIndex: [0, 8][map] });
    for (let guard = 0; guard < 40 && series.state().phase !== 'results'; guard++) {
      series.clock.increment(16000);
      const s = series.state();
      if (s.phase === 'play' && !s.players.host.done) series.send('REPORT_SCORE', { roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: 2, timedOut: false });
    }
    assert.equal(series.state().phase, 'results');
    assert.equal(series.state().completedMaps.length, map + 1);
    series.send('RETURN_TO_LOBBY');
  }
  assert.equal(series.state().phase, 'lobby', 'after two maps the game is over');

  // ---- server hello carries rules (validated)
  const hello = r => ({ version: 7, type: 'hello', roomCode: 'abc', name: 'Ann', color: null, resume: null, rules: r });
  assert.equal(validClientFrame(hello(null)), true);
  assert.equal(validClientFrame(hello({ ...STD, lunaGravity: 60 })), true);
  assert.equal(validClientFrame(hello({ ...STD, lunaGravity: 61 })), false);

  // ---- lobby status names the room's custom rules for everyone
  const lobbyState = open({ rules: { ...STD, lunaGravity: 60, aimWobble: 'off', powerups: false } }).state();
  const text = lobbyView(lobbyState, { isHost: true, id: 'host' }, 0, []).status;
  assert.match(text, /Power-ups are off\. Custom rules: Aim Sway Off, Luna Gravity 60%\.$/);
  const info = createCourseInfo(createCourseData());
  const twelve = open({ rules: { ...STD, maps: 12 } });
  twelve.send('START_VOTING');
  assert.match(votingView(twelve.state(), { isHost: true, id: 'host' }, 0, info).status, /^Map 1\/12 · /, 'voting counts the custom number of maps');
  const one = open(); one.send('START_VOTING');
  assert.doesNotMatch(votingView(one.state(), { isHost: true, id: 'host' }, 0, info).status, /^Map /, 'a standard single map shows no count');
  assert.doesNotMatch(lobbyView(open().state(), { isHost: true, id: 'host' }, 0, []).status, /Custom rules/, 'standard rooms say nothing extra');

  console.log('custom rules tests passed (validation, tuning, aim, launch, session, hello, lobby status)');
})().catch(error => { console.error(error); process.exit(1); });
