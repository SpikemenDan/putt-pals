// N2 guest recovery in a real browser: a guest keeps its seat through a reload or a dropped link, and
// host loss ends in an explicit notice rather than a silent hang or host migration. Real PeerJS/WebRTC
// through the local PeerServer (loopback, no STUN), one browser context per player.
const { test, expect } = require('@playwright/test');
const { until, playPutt } = require('./support/app.cjs');
const { roomCode, requireGuestLinks, openPlayer } = require('./support/rooms.cjs');

const RECONNECTING = 'Connection dropped. Reconnecting… your place in the room is kept for 30 seconds.';
const CONNECTION_LOST = 'Connection lost. Gameplay paused. Reload and rejoin a new room; host migration is not supported.';

let contexts = [];
test.beforeEach(async ({ browser }, testInfo) => { contexts = []; await requireGuestLinks(browser, testInfo); });
test.afterEach(async () => { await Promise.all(contexts.map(c => c.close().catch(() => {}))); });

/** A host and guests in one room, all in the lobby. */
async function room(browser, testInfo, prefix, names, { hostBrowser = browser } = {}) {
  const code = roomCode(prefix);
  const players = [];
  for (const [i, name] of names.entries()) {
    const p = await openPlayer(i === 0 ? hostBrowser : browser, testInfo, name, { contexts, hash: '#room=' + code.toLowerCase() });
    await p.join(code);
    players.push(p);
  }
  await expect(players[0].lobbyStatus()).toHaveText(`Room ${code} · ${names.length} players · You are the host`, { timeout: 30_000 });
  return { code, players };
}

test('recovery: a guest reloading mid-map resumes the same seat and scores', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const { code, players } = await room(browser, testInfo, 'N2R', ['Ana', 'Ben']);
  const [ana, ben] = players;
  await ana.button('Start Game').click();
  for (const p of players) {
    await expect(p.ui('map-select')).toBeVisible();
    await p.ui('map-select').locator('button[data-v]').first().click();
  }
  await until(async () => (await ana.snapshot())?.puttIndex === 0 && (await ana.ready()), { label: 'first putt' });
  await playPutt(players);
  await until(async () => (await ana.snapshot()).puttIndex === 1, { timeout: 90_000, label: 'second putt' });
  const id = await ben.peerId();
  expect((await ana.snapshot()).players[id].scores).toEqual([1]);

  await ben.page.reload();
  // The invite link and this tab's stored identity prefill the room and the name.
  await expect(ben.ui('landing').getByLabel('Your name')).toHaveValue('Ben');
  await expect(ben.ui('landing').getByLabel(/room code/i)).toHaveValue(code.toLowerCase());
  await ben.button('Join room').click();
  await expect(ben.ui('game')).toBeVisible({ timeout: 30_000 });
  expect(await ben.peerId(), 'same peer ID after the reload').toBe(id);
  expect(await ben.isHost()).toBe(false);
  await until(async () => (await ben.snapshot())?.players[id]?.scores.join() === '1', { label: 'Ben sees his kept score' });
  const host = await ana.snapshot();
  expect(Object.keys(host.players), 'no second seat for Ben').toHaveLength(2);
  expect(host.players[id].scores).toEqual([1]);
  // Both can finish the putt they resumed.
  await playPutt(players);
  await until(async () => (await ana.snapshot()).puttIndex === 2, { timeout: 90_000, label: 'third putt' });
  expect((await ana.snapshot()).players[id].scores).toEqual([1, 1]);
  for (const p of players) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
});

test('recovery: a guest whose peer links drop reconnects by itself to the same seat', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const { code, players } = await room(browser, testInfo, 'N2D', ['Ana', 'Ben', 'Cy']);
  const [ana, ben] = players;
  const id = await ben.peerId();
  expect(await ben.dropLinks(), 'Ben had an open peer link').toBeGreaterThan(0);
  await until(async () => (await ben.notices()).includes(RECONNECTING), { timeout: 15_000, label: 'Ben shows the reconnecting notice' });
  await expect(ben.notice()).toBeHidden({ timeout: 30_000 });
  await expect(ben.lobbyStatus()).toHaveText(`Room ${code} · 3 players · Waiting for host`);
  expect(await ben.peerId(), 'same peer ID after reconnecting').toBe(id);
  // The host held the seat throughout: still three players, Ben connected, no extra seat.
  await expect(ana.lobbyStatus()).toHaveText(`Room ${code} · 3 players · You are the host`);
  const host = await ana.page.evaluate(() => window.__ppApp.room.snapshot.players);
  expect(Object.keys(host)).toHaveLength(3);
  expect(host[id].connected).toBe(true);
  expect(await ana.notices(), 'the host saw no network notice').toEqual([]);
  for (const p of players) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
});

/** Guests see the reconnecting notice, then the explicit host-loss notice after the grace; none becomes host. */
async function expectHostLoss(guests) {
  for (const g of guests) await until(async () => (await g.notices()).includes(RECONNECTING), { timeout: 20_000, label: g.name + ' shows the reconnecting notice' });
  // 30 s grace from the drop, plus up to 5 s before a silent host is noticed.
  for (const g of guests) await expect(g.notice()).toHaveText(CONNECTION_LOST, { timeout: 60_000 });
  for (const g of guests) {
    expect(await g.notices(), g.name + ': reconnecting, then connection lost').toEqual([RECONNECTING, CONNECTION_LOST]);
    expect(await g.isHost(), g.name + ' did not become host').toBe(false);
    await expect(g.lobbyStatus()).not.toContainText('You are the host');
  }
}

test('recovery: closing the host tab ends in an explicit host-loss notice for guests', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const { players } = await room(browser, testInfo, 'N2C', ['Ana', 'Ben', 'Cy']);
  const [ana, ...guests] = players;
  expect(ana.errors, 'Ana: no page or console errors').toEqual([]);
  await ana.page.close();
  await expectHostLoss(guests);
  for (const g of guests) expect(g.errors, g.name + ': no page or console errors').toEqual([]);
});

test('recovery: killing the host browser ends in an explicit host-loss notice for guests', async ({ browser, playwright, browserName, launchOptions, headless }, testInfo) => {
  test.setTimeout(300_000);
  // The host runs in its own browser process so it can be killed outright: no pagehide, no goodbye frames.
  const browserType = playwright[browserName];
  const server = await browserType.launchServer({ ...launchOptions, headless });
  try {
    const hostBrowser = await browserType.connect(server.wsEndpoint());
    const { players } = await room(browser, testInfo, 'N2K', ['Ana', 'Ben', 'Cy'], { hostBrowser });
    const [ana, ...guests] = players;
    expect(ana.errors, 'Ana: no page or console errors').toEqual([]);
    contexts.shift();
    await server.kill();
    await expectHostLoss(guests);
    for (const g of guests) expect(g.errors, g.name + ': no page or console errors').toEqual([]);
  } finally {
    await server.kill();
  }
});
