// Server-room capacity and browser capabilities are exercised against the real local Worker.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./support/app.cjs');
const { roomCode, openPlayer } = require('./support/rooms.cjs');

const MAX_PLAYERS = 4;

test('connect errors: a fifth player is told the room is full and stays on the start screen @slow', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
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
    await expect(host.lobbyStatus()).toHaveText(`Room ${code} · ${MAX_PLAYERS} players · You control the room`, { timeout: 30_000 });

    const extra = await openPlayer(browser, testInfo, 'P5', { contexts });
    await extra.ui('landing').getByLabel('Your name').fill('P5');
    await extra.ui('landing').getByLabel(/room code/i).fill(code);
    await extra.button('Join room').click();
    await expect(extra.ui('connect-error')).toHaveText('That room is full. Ask someone to leave, or use a different room code.', { timeout: 30_000 });
    await expect(extra.ui('landing')).toBeVisible();
    await expect(extra.ui('room-lobby')).toBeHidden();
    expect(await extra.peerId(), 'the refused player holds no room').toBeNull();
    // The full room is unchanged, and the Join button is usable again.
    await expect(extra.button('Join room')).toBeEnabled();
    await expect(host.lobbyStatus()).toHaveText(`Room ${code} · ${MAX_PLAYERS} players · You control the room`);
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
  await ana.ui('landing').getByLabel('Your name').fill('Ana');
  await ana.ui('landing').getByLabel(/room code/i).fill(roomCode('N2W'));
  await ana.button('Join room').click();
  await expect(ana.ui('room-lobby')).toBeVisible();
  await expect(ana.ui('room-lobby').locator('p').first()).toContainText('You control the room');
  expect(ana.errors, 'no page or console errors').toEqual([]);
});
