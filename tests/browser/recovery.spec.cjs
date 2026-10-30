// N4 recovery in a real browser: identities resume through the room Worker and controller succession
// follows the durable service policy.
const { test, expect } = require('@playwright/test');
const { until, playPutt } = require('./support/app.cjs');
const { roomCode, openPlayer } = require('./support/rooms.cjs');
const { startLocalRoomWorker } = require('./support/local-worker.cjs');

let contexts = [];
test.beforeEach(async () => { contexts = []; });
test.afterEach(async () => { await Promise.all(contexts.map(c => c.close().catch(() => {}))); });

async function room(browser, testInfo, prefix, names, endpoint) {
  const code = roomCode(prefix), players = [];
  for (const name of names) {
    const p = await openPlayer(browser, testInfo, name, { contexts, hash: '#room=' + code.toLowerCase(), endpoint });
    await p.join(code);
    players.push(p);
  }
  await expect(players[0].lobbyStatus()).toHaveText(`Room ${code} · ${names.length} players · You control the room`, { timeout: 30_000 });
  return { code, players };
}

test('recovery: a player reloading mid-map resumes the same seat and scores', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const { code, players } = await room(browser, testInfo, 'N4R', ['Ana', 'Ben']);
  const [ana, ben] = players;
  await ana.button('Start Game').click();
  for (const p of players) {
    await expect(p.ui('map-select')).toBeVisible();
    await p.ui('map-select').locator('button[data-v]').first().click();
  }
  await until(async () => (await ana.snapshot())?.puttIndex === 0 && await ana.ready(), { label: 'first putt' });
  await playPutt(players);
  await until(async () => (await ana.snapshot()).puttIndex === 1, { timeout: 90_000, label: 'second putt' });
  const id = await ben.peerId();
  expect((await ana.snapshot()).players[id].scores).toEqual([1]);

  await ben.page.reload();
  await expect(ben.ui('landing').getByLabel('Your name')).toHaveValue('Ben');
  await expect(ben.ui('landing').getByLabel(/room code/i)).toHaveValue(code.toLowerCase());
  await ben.button('Join room').click();
  await expect(ben.ui('game')).toBeVisible({ timeout: 30_000 });
  expect(await ben.peerId(), 'same server player ID after reload').toBe(id);
  expect(await ben.isHost()).toBe(false);
  await until(async () => (await ben.snapshot())?.players[id]?.scores.join() === '1', { label: 'Ben sees his kept score' });
  expect(Object.keys((await ana.snapshot()).players)).toHaveLength(2);
  await playPutt(players);
  await until(async () => (await ana.snapshot()).puttIndex === 2, { timeout: 90_000, label: 'third putt' });
  for (const p of players) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
});

test('recovery: dropped WebSocket reconnects to the same seat', async ({ browser }, testInfo) => {
  const worker = await startLocalRoomWorker(testInfo.project.use.baseURL);
  try {
    const { code, players } = await room(browser, testInfo, 'N4D', ['Ana', 'Ben', 'Cy'], worker.origin);
    const ids = await Promise.all(players.map(p => p.peerId()));
    const socketsBefore = await Promise.all(players.map(p => p.socketCount()));
    await worker.drop(code.toLowerCase());
    for (const [i, player] of players.entries()) {
      await until(async () => (await player.socketCount()) > socketsBefore[i] && await player.roomConnected(), { timeout: 30_000, label: `${player.name} resumes the same seat on a new WebSocket` });
      expect(await player.peerId()).toBe(ids[i]);
    }
    await until(async () => (await Promise.all(players.map(p => p.isHost()))).filter(Boolean).length === 1, { timeout: 15_000, label: 'recovered room has one elected controller' });
    const snapshot = await players[0].snapshot();
    expect(Object.keys(snapshot.players)).toHaveLength(3);
    const controllers = await Promise.all(players.map(p => p.isHost()));
    expect(controllers.filter(Boolean)).toHaveLength(1);
    for (const [i, player] of players.entries()) {
      await expect(player.lobbyStatus()).toContainText(controllers[i] ? 'You control the room' : 'Waiting for room controller');
    }
    for (const p of players) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
  } finally { await worker.close(); }
});

test('recovery: leaving controller elects the next connected player', async ({ browser }, testInfo) => {
  const { players } = await room(browser, testInfo, 'N4C', ['Ana', 'Ben', 'Cy']);
  const [ana, ben, cy] = players;
  await ana.button('Leave room').click();
  await until(() => ben.isHost(), { timeout: 40_000, label: 'next connected member receives controller authority' });
  await expect(ben.lobbyStatus()).toContainText('You control the room');
  await expect(cy.lobbyStatus()).toContainText('Waiting for room controller');
  for (const p of [ben, cy]) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
});
