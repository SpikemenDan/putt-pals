// N2 join failures in a real browser: they appear on the start screen as text a player can act on,
// instead of a silent hang. Real PeerJS/WebRTC through the local PeerServer (loopback, no STUN).
const { test, expect } = require('@playwright/test');
const { openApp } = require('./support/app.cjs');
const { roomCode, requireGuestLinks, openPlayer } = require('./support/rooms.cjs');

const MAX_PLAYERS = 8;

test('connect errors: a ninth player is told the room is full and stays on the start screen @slow', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  await requireGuestLinks(browser, testInfo);
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
    await expect(host.lobbyStatus()).toHaveText(`Room ${code} · ${MAX_PLAYERS} players · You are the host`, { timeout: 30_000 });

    const ninth = await openPlayer(browser, testInfo, 'P9', { contexts });
    await ninth.ui('landing').getByLabel('Your name').fill('P9');
    await ninth.ui('landing').getByLabel(/room code/i).fill(code);
    await ninth.button('Join room').click();
    await expect(ninth.ui('connect-error')).toHaveText(`That room is full (${MAX_PLAYERS} players). Ask someone to leave, or use a different room code.`, { timeout: 30_000 });
    await expect(ninth.ui('landing')).toBeVisible();
    await expect(ninth.ui('room-lobby')).toBeHidden();
    expect(await ninth.peerId(), 'the refused player holds no room').toBeNull();
    // The full room is unchanged, and the Join button is usable again.
    await expect(ninth.button('Join room')).toBeEnabled();
    await expect(host.lobbyStatus()).toHaveText(`Room ${code} · ${MAX_PLAYERS} players · You are the host`);
    expect(Object.keys((await host.snapshot()).players)).toHaveLength(MAX_PLAYERS);
    for (const p of [...players, ninth]) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});

test('connect errors: without WebRTC, Join room explains why instead of failing silently', async ({ page }) => {
  // Hide WebRTC before the app loads, as a browser with it disabled or blocked would.
  await page.addInitScript(() => { for (const key of ['RTCPeerConnection', 'webkitRTCPeerConnection']) { try { delete window[key]; } catch { /* not configurable */ } window[key] = undefined; } });
  const sockets = [];
  page.on('websocket', ws => sockets.push(ws.url()));
  const ana = await openApp(page, 'Ana');
  expect(await page.evaluate(() => typeof window.RTCPeerConnection)).toBe('undefined');
  await ana.ui('landing').getByLabel('Your name').fill('Ana');
  await ana.ui('landing').getByLabel(/room code/i).fill(roomCode('N2W'));
  await ana.button('Join room').click();
  await expect(ana.ui('connect-error')).toHaveText("This browser can't make peer-to-peer connections (WebRTC is unavailable or blocked), so online rooms won't work here. Try another desktop browser, or play solo.");
  await expect(ana.ui('landing')).toBeVisible();
  await expect(ana.button('Join room')).toBeEnabled();
  expect(sockets, 'no signalling connection is attempted').toEqual([]);
  // Solo still works from the same screen.
  await ana.button('Play solo').click();
  await expect(ana.ui('room-lobby')).toBeVisible();
  expect(ana.errors, 'no page or console errors').toEqual([]);
});
