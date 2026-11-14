// Server-room capacity and browser capabilities are exercised against the real local Worker.
const { test, expect } = require('@playwright/test');
const { openApp, partyCode } = require('./support/app.cjs');
const { roomCode, openPlayer } = require('./support/rooms.cjs');

test('connect errors: a player past the cap is told the room is full and stays on the start screen @slow', async ({ browser }, testInfo) => {
  test.setTimeout(900_000);
  // The real room cap, read from the shared constants the server enforces (ES module, so imported dynamically).
  const { MAX_PLAYERS } = await import('../../src/shared/constants.js');
  const code = roomCode('N2F');
  const contexts = [];
  try {
    const players = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = await openPlayer(browser, testInfo, 'P' + (i + 1), { contexts });
      await p.join(code);
      players.push(p);
    }
    const [host] = players;
    await expect(host.lobbyStatus()).toHaveText(`Room ${partyCode(code)} · ${MAX_PLAYERS} players · You control the room`, { timeout: 30_000 });

    const extraName = 'P' + (MAX_PLAYERS + 1);
    const extra = await openPlayer(browser, testInfo, extraName, { contexts });
    await extra.menu('party');
    await extra.ui('landing').getByLabel('Your name').fill(extraName);
    await extra.ui('landing').getByLabel('Party code').fill(partyCode(code));
    await extra.button('Join').click();
    await expect(extra.ui('connect-error')).toHaveText('That room is full. Ask someone to leave, or use a different room code.', { timeout: 30_000 });
    await expect(extra.ui('landing')).toBeVisible();
    await expect(extra.ui('room-lobby')).toBeHidden();
    expect(await extra.peerId(), 'the refused player holds no room').toBeNull();
    // The full room is unchanged, and the Join button is usable again.
    await expect(extra.button('Join')).toBeEnabled();
    await expect(host.lobbyStatus()).toHaveText(`Room ${partyCode(code)} · ${MAX_PLAYERS} players · You control the room`);
    expect(Object.keys((await host.snapshot()).players)).toHaveLength(MAX_PLAYERS);
    for (const p of [...players, extra]) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});

test('connect errors: online rooms work without WebRTC', async ({ page }) => {
  // Hide WebRTC before the app loads to prove that room connectivity uses WebSockets.
  await page.addInitScript(() => { for (const key of ['RTCPeerConnection', 'webkitRTCPeerConnection']) { try { delete window[key]; } catch { /* not configurable */ } window[key] = undefined; } });
  const ana = await openApp(page, 'Ana');
  expect(await page.evaluate(() => typeof window.RTCPeerConnection)).toBe('undefined');
  await ana.create();
  await expect(ana.ui('room-lobby')).toBeVisible();
  await expect(ana.ui('room-lobby').locator('p').first()).toContainText('You control the room');
  expect(ana.errors, 'no page or console errors').toEqual([]);
});
