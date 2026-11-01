// Four players in separate browser contexts over the local room Worker: one room, one full map, identical results.
const { test, expect } = require('@playwright/test');
const { openApp, until, playPutt } = require('./support/app.cjs');

const NAMES = ['Ana', 'Ben', 'Cy', 'Dee'];

test('multiplayer: four pages on real WebSockets play a full map and agree on the results', async ({ browser }, testInfo) => {
  // Four software-rendered WebGL pages on a CI runner take several minutes per map.
  test.setTimeout(900_000);
  const code = 'T1' + Date.now().toString(36).slice(-5).toUpperCase();
  const contexts = await Promise.all(NAMES.map(() => browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 800, height: 600 } })));
  try {
    const players = [];
    const roomSockets = [];
    for (const [i, name] of NAMES.entries()) {
      const p = await openApp(await contexts[i].newPage(), name);
      const urls = [];
      p.page.on('websocket', ws => urls.push(ws.url()));
      roomSockets.push(urls);
      await p.join(code);
      players.push(p);
    }
    const [ana, ...guests] = players;
    await expect(ana.ui('room-lobby').locator('p').first()).toHaveText(`Room ${code} · 4 players · You control the room`, { timeout: 30_000 });
    for (const g of guests) await expect(g.ui('room-lobby').locator('p').first()).toHaveText(`Room ${code} · 4 players · Waiting for room controller`);
    await expect(guests[0].ui('room-lobby').getByLabel('Game mode')).toBeHidden();

    await ana.button('Start Game').click();
    for (const p of players) {
      await expect(p.ui('map-select')).toBeVisible();
      await p.ui('map-select').locator('button[data-v]').first().click();
    }
    for (const p of players) await until(() => p.ready(), { label: p.name + ' map start' });
    // Everyone sees the other three balls and a four-row scoreboard.
    for (const p of players) {
      // Remote balls appear as each peer's first presence arrives, so wait for all three.
      await until(async () => (await p.page.evaluate(() => window.__ppApp.renderer.remoteCount)) === 3, { label: p.name + ' draws the three others' });
    }
    expect(await ana.canvasColours(), 'host WebGL canvas shows a rendered course').toBeGreaterThan(20);

    for (let k = 0; k < 6; k++) {
      await until(async () => (await ana.snapshot()).puttIndex === k, { timeout: 90_000, label: 'putt ' + (k + 1) });
      await playPutt(players);
    }
    for (const p of players) await expect(p.ui('results')).toBeVisible({ timeout: 90_000 });
    // Same scores and winners everywhere.
    const summary = 'Switchback Garden: Ana 6 (-6) · Ben 6 (-6) · Cy 6 (-6) · Dee 6 (-6). Map winner: Ana & Ben & Cy & Dee.';
    await expect(ana.ui('results').locator('p').first()).toHaveText(summary);
    for (const g of guests) await expect(g.ui('results').locator('p').first()).toHaveText(summary + ' Waiting for the room controller to return to the lobby.');
    const snapshots = await Promise.all(players.map(p => p.snapshot()));
    for (const s of snapshots) {
      const scores = Object.values(s.players).map(v => v.scores.join(','));
      expect(scores, 'six holes in one for every player on every page').toEqual(NAMES.map(() => '1,1,1,1,1,1'));
    }
    for (const urls of roomSockets) {
      expect(urls.some(url => url.includes('/api/rooms/') && url.endsWith('/socket')), 'room traffic uses the Worker WebSocket endpoint').toBe(true);
      expect(urls.every(url => url.startsWith('ws://127.0.0.1:')), 'browser uses the same-origin local Worker').toBe(true);
    }
    for (const p of players) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
