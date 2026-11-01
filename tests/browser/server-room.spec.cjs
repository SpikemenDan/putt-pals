// N4F service lifecycle coverage. Score reports below are synthetic protocol inputs;
// multiplayer.spec.cjs separately completes real simulated shots through a full map.
const { test, expect } = require('@playwright/test');
const { until, openApp } = require('./support/app.cjs');
const { roomCode, openPlayer } = require('./support/rooms.cjs');

let contexts;
test.beforeEach(() => { contexts = []; });
test.afterEach(async () => { await Promise.all(contexts.map(c => c.close())); });

test('server rooms: tournament, late spectator and controller departure preserve the series', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const code = roomCode('N4F');
  const ana = await openPlayer(browser, info, 'Ana', { contexts }); await ana.join(code);
  const ben = await openPlayer(browser, info, 'Ben', { contexts }); await ben.join(code);
  await ana.ui('room-lobby').getByLabel('Game mode').selectOption('tournament_3');
  await ana.button('Start Game').click();
  for (const p of [ana, ben]) await p.ui('map-select').locator('button[data-v]').first().click();
  await until(() => ben.ready(), { label: 'first map starts' });
  const cy = await openPlayer(browser, info, '<b>Cy</b>', { contexts }); await cy.join(code);
  const cyId = await cy.peerId();
  expect(await cy.page.evaluate(() => window.__ppApp.room.snapshot.roster)).not.toContain(cyId);
  await expect(cy.ui('hud-info')).toContainText('SPECTATING');
  expect(await cy.page.locator('[data-ui=scoreboard] b b, [data-ui=scoreboard] img').count()).toBe(0);
  // Explicit departure during play preserves the current map and transfers controls.
  await ana.page.evaluate(() => window.__ppApp.dispatch({ type: 'leave' }));
  await until(() => ben.isHost(), { label: 'Ben receives controller permission mid-map' });
  for (let map = 0; map < 3; map++) {
    for (let putt = 0; putt < 6; putt++) {
      await until(() => ben.page.evaluate(k => {
        const r = window.__ppApp.room;
        return r.snapshot.phase === 'play' && r.snapshot.puttIndex === k && r.now() >= r.snapshot.roundStartTime + 500;
      }, putt), { label: `map ${map + 1}, putt ${putt + 1}` });
      const round = await ben.page.evaluate(() => window.__ppApp.room.snapshot.roundNumber);
      for (const p of [ben, cy]) {
        await until(() => p.page.evaluate(round => window.__ppApp.room.snapshot.roundNumber === round, round), { label: `${p.name} receives round ${round}` });
      }
      for (const p of [ben, cy]) {
        await p.page.evaluate(() => {
        const r = window.__ppApp.room, s = r.snapshot;
        if (s.roster.includes(r.localId)) r.command({ type: 'REPORT_SCORE', strokes: 2, timedOut: false, roundNumber: s.roundNumber, puttIndex: s.puttIndex });
        });
      }
      await until(() => ben.page.evaluate(([m, k]) => {
        const s = window.__ppApp.room.snapshot;
        return s.completedMaps.length > m || s.puttIndex !== k;
      }, [map, putt]), { label: `server accepts scores and advances map ${map + 1} putt ${putt + 1}` });
    }
    await expect(ben.ui('results')).toBeVisible();
    if (map < 2) {
      await ben.button('Next map vote').click();
      for (const p of [ben, cy]) await p.ui('map-select').locator('button[data-v]').first().click();
      await until(() => cy.ready(), { label: 'late spectator joins the next map roster' });
    }
  }
  for (const p of [ben, cy]) {
    await expect(p.ui('results')).toContainText('OVERALL CHAMPION');
    expect((await p.snapshot()).players[cyId].scores).toHaveLength(6);
    expect(p.errors).toEqual([]);
  }
});

test('server rooms: duplicate resume and incompatible frames are rejected without disturbing the seat', async ({ browser }, info) => {
  const code = roomCode('N4V');
  const player = await openPlayer(browser, info, 'Player', { contexts }); await player.join(code);
  const results = await player.page.evaluate(async code => {
    async function rejected(hello) {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}/api/rooms/${code}/socket`);
        const timer = setTimeout(() => { ws.close(); reject(new Error('No protocol rejection')); }, 8000);
        ws.onopen = () => ws.send(JSON.stringify(hello));
        ws.onmessage = event => { const f = JSON.parse(event.data); if (f.type === 'error') { clearTimeout(timer); ws.close(); resolve(f.code); } };
      });
    }
    const resume = window.__ppApp.room.identity;
    return [await rejected({ version: 2, type: 'hello', roomCode: code, name: 'Duplicate', resume }),
      await rejected({ version: 1, type: 'hello', roomCode: code, name: 'Old', resume: null }),
      await rejected({ version: 2, type: 'hello', roomCode: code, name: 'Extra', resume: null, playerId: 'forged' })];
  }, code.toLowerCase());
  expect(results).toEqual(['identity-rejected', 'incompatible-version', 'invalid-message']);
  expect(await player.roomConnected()).toBe(true);
  expect(Object.keys((await player.snapshot()).players)).toHaveLength(1);
});

test('server rooms: delayed frames and foreground switching retain synchronized room time', async ({ browser }, info) => {
  const code = roomCode('N4L');
  const context = await browser.newContext({ baseURL: info.project.use.baseURL }); contexts.push(context);
  // Synthetic 150 ms client-frame delay, not a claim about internet latency/loss.
  await context.addInitScript(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (raw) { const ws = this; setTimeout(() => { if (ws.readyState === 1) send.call(ws, raw); }, 150); };
  });
  const ana = await openApp(await context.newPage(), 'Ana'); await ana.join(code);
  const ben = await openApp(await context.newPage(), 'Ben'); await ben.join(code);
  await ana.page.bringToFront();
  const backgroundState = await ben.page.evaluate(() => document.visibilityState);
  if (backgroundState === 'hidden') {
    info.annotations.push({ type: 'background-visibility', description: 'The other client entered the hidden state.' });
  } else {
    info.annotations.push({
      type: 'background-visibility-not-exercised',
      description: `After foregrounding the other tab, the browser still reported ${backgroundState}; background throttling was not exercised.`,
    });
  }
  await ana.page.waitForTimeout(2000);
  await ben.page.bringToFront();
  const foregroundState = await ben.page.evaluate(() => document.visibilityState);
  expect(foregroundState).toBe('visible');
  const times = await Promise.all([ana, ben].map(p => p.page.evaluate(() => window.__ppApp.room.now())));
  expect(Math.abs(times[0] - times[1])).toBeLessThan(1500);
  await ana.button('Start Game').click();
  for (const p of [ana, ben]) await p.ui('map-select').locator('button[data-v]').first().click();
  await until(() => ben.ready(), { label: 'delayed client reaches the server-started putt' });
  const starts = await Promise.all([ana, ben].map(p => p.page.evaluate(() => window.__ppApp.room.snapshot.roundStartTime)));
  expect(starts[0]).toBe(starts[1]);
  for (const p of [ana, ben]) expect(p.errors).toEqual([]);
});
