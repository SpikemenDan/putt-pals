// DX1: values that used to be copied as literals now come from one authoritative default. These checks pin the
// shipped numbers with independent literal expectations, so moving a default can never silently change them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const load = rel => import(pathToFileURL(path.join(root, rel)).href);
const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');

(async () => {
  const contracts = await load('src/network/contracts/server-room.js');
  const rules = await load('src/app/rules.js');
  const cli = await load('tools/cli/commands.mjs');

  // Presence cadence: the client throttle reads the room contract's presence interval, still 70 ms.
  assert.equal(contracts.SERVER_ROOM_LIMITS.presenceIntervalMs, 70);
  assert.equal(rules.PRESENCE_INTERVAL_MS, 70);

  // Reconnect grace: the client fallback reads the room policy default, still 30 s.
  assert.equal(contracts.DEFAULT_ROOM_POLICY.reconnectGraceMs, 30000);
  assert.doesNotMatch(source('src/network/server-room.js'), /\?\?\s*30000\b/, 'no second copy of the reconnect grace default');

  // Room contract snapshot rules read the shared session constants: limits 120..600 s, votes only for starter maps.
  assert.doesNotMatch(source('src/network/contracts/server-room.js'), /reconnectGraceMs:\s*30000|\[0,\s*8,\s*20,\s*21,\s*5,\s*19\]|roundLimitSeconds\s*[<>]\s*\d/, 'no copied session defaults');
  const { createServerRoomFixture } = await load('src/network/contracts/server-room-mocks.js');
  const context = overrides => Object.assign(structuredClone(createServerRoomFixture().session.context), overrides);
  assert.equal(contracts.validSessionContext(context({})), true, 'fixture context is valid');
  for (const [limit, ok] of [[119, false], [120, true], [600, true], [601, false]]) {
    assert.equal(contracts.validSessionContext(context({ roundLimitSeconds: limit })), ok, `round limit ${limit}`);
  }
  const voter = Object.keys(createServerRoomFixture().session.context.players)[0];
  for (const [map, ok] of [[0, true], [8, true], [20, true], [21, true], [5, true], [19, true], [1, false], [7, false]]) {
    assert.equal(contracts.validSessionContext(context({ votes: { [voter]: map } })), ok, `vote for map ${map}`);
    assert.equal(contracts.validServerCommand({ type: 'CAST_VOTE', mapIndex: map }), ok, `CAST_VOTE for map ${map}`);
  }

  // Player names: the attack toast and name labels trim to the 14-character name limit.
  assert.equal((await load('src/shared/constants.js')).MAX_PLAYER_NAME_LENGTH, 14);
  assert.doesNotMatch(source('src/app/putt.js'), /slice\(0,\s*14\)/);
  assert.doesNotMatch(source('src/render/renderer.js'), /slice\(0,\s*14\)/, 'name labels use the shared name limit');
  // Aim guide: the renderer reads aim.guideMinCharge (0.015) instead of a copy.
  assert.equal((await load('src/shared/tuning.js')).TUNING.aim.guideMinCharge, 0.015);
  assert.doesNotMatch(source('src/render/renderer.js'), /charge\s*>\s*0\.015/);

  // CLI timing: 240 Hz from the fixed timestep, a 120 s safety cap.
  assert.equal(cli.TICKS_PER_SECOND, 240);
  assert.equal(cli.MAX_TICKS, 28800);
  assert.doesNotMatch(source('tools/cli/commands.mjs'), /\b240\b(?!\s*Hz)/, 'the tick rate is not copied as a literal');
  const { createCourseDocument, toSimulationCourses } = await load('src/courses/index.js');
  const shot = cli.runShot(toSimulationCourses(createCourseDocument()), 0, 0, 0, 0.4);
  assert.equal(shot.code, 0);
  const [, ticks, seconds] = shot.lines[0].match(/after (\d+) ticks \(([\d.]+) s\)/);
  assert.equal(Number(seconds), Math.round(Number(ticks) / 240 * 100) / 100, 'reported seconds use 240 ticks per second');

  console.log('config-defaults tests passed');
})().catch(error => { console.error(error); process.exit(1); });
