// Four players in separate browser contexts over real PeerJS/WebRTC (local PeerServer, loopback, no
// STUN): one room, one full map, identical results on every page.
const { test, expect } = require('@playwright/test');
const { openApp, until, playPutt } = require('./support/app.cjs');

const NAMES = ['Ana', 'Ben', 'Cy', 'Dee'];

test('multiplayer: four pages on real WebRTC play a full map and agree on the results', async ({ browser }, testInfo) => {
  // Four software-rendered WebGL pages on a CI runner take several minutes per map.
  test.setTimeout(900_000);
  const code = 'T1' + Date.now().toString(36).slice(-5).toUpperCase();
  const contexts = await Promise.all(NAMES.map(() => browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 800, height: 600 } })));
  try {
    // Playwright's Windows WebKit build ships without WebRTC; skip rather than report a false failure.
    const probe = await contexts[0].newPage();
    const webrtc = await probe.evaluate(() => typeof RTCPeerConnection === 'function');
    await probe.close();
    test.skip(!webrtc, `${testInfo.project.name} on ${process.platform} has no RTCPeerConnection`);
    const players = [];
    for (const [i, name] of NAMES.entries()) {
      const p = await openApp(await contexts[i].newPage(), name);
      await p.join(code);
      players.push(p);
    }
    const [ana, ...guests] = players;
    await expect(ana.ui('room-lobby').locator('p').first()).toHaveText(`Room ${code} · 4 players · You are the host`, { timeout: 30_000 });
    for (const g of guests) await expect(g.ui('room-lobby').locator('p').first()).toHaveText(`Room ${code} · 4 players · Waiting for host`);
    await expect(guests[0].ui('room-lobby').getByLabel('Game mode')).toBeHidden();

    await ana.button('Start Game').click();
    for (const p of players) {
      await expect(p.ui('map-select')).toBeVisible();
      await p.ui('map-select').locator('button[data-v]').first().click();
    }
    for (const p of players) await until(() => p.ready(), { label: p.name + ' map start' });
    // Everyone sees the other three balls and a four-row scoreboard.
    for (const p of players) {
      await until(() => p.page.evaluate(() => window.__ppApp.renderer.remoteCount), { label: p.name + ' remote balls' });
      expect(await p.page.evaluate(() => window.__ppApp.renderer.remoteCount), p.name + ' draws the three others').toBe(3);
    }
    expect(await ana.canvasColours(), 'host WebGL canvas shows a rendered course').toBeGreaterThan(20);

    for (let k = 0; k < 6; k++) {
      await until(async () => (await ana.snapshot()).puttIndex === k, { timeout: 90_000, label: 'putt ' + (k + 1) });
      await playPutt(players);
    }
    for (const p of players) await expect(p.ui('results')).toBeVisible({ timeout: 90_000 });
    // Same scores and winners everywhere; guests also wait for the host to return to the lobby.
    const summary = 'Switchback Garden: Ana 6 · Ben 6 · Cy 6 · Dee 6. Map winner: Ana & Ben & Cy & Dee.';
    await expect(ana.ui('results').locator('p').first()).toHaveText(summary);
    for (const g of guests) await expect(g.ui('results').locator('p').first()).toHaveText(summary + ' Waiting for the host to return to the lobby.');
    const snapshots = await Promise.all(players.map(p => p.snapshot()));
    for (const s of snapshots) {
      const scores = Object.values(s.players).map(v => v.scores.join(','));
      expect(scores, 'six holes in one for every player on every page').toEqual(NAMES.map(() => '1,1,1,1,1,1'));
    }
    for (const p of players) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
