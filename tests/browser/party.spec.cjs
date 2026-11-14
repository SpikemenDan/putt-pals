// VIS-M3 (#175) party flow in two real browser contexts over the local room Worker: the Party menu makes no room, Create
// gets a server-generated code, a wrong code fails clearly, each player picks a colour before the lobby, and the lobby shows
// both balls on one plane in their colours.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./support/app.cjs');

test('party flow: Create shows the code afterwards, Join by code, colour before lobby, plane lobby', async ({ browser }, testInfo) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1100, height: 900 } })));
  try {
    const [ana, ben] = await Promise.all(contexts.map(async (c, i) => openApp(await c.newPage(), ['Ana', 'Ben'][i])));
    const sockets = { ana: [], ben: [] };
    ana.page.on('websocket', ws => sockets.ana.push(ws.url()));
    ben.page.on('websocket', ws => sockets.ben.push(ws.url()));

    // Opening Party creates nothing and shows no code.
    await ana.menu('party');
    await expect(ana.button('Create party')).toBeVisible();
    await expect(ana.ui('landing').getByLabel('Party code')).toHaveValue('');
    await expect(ana.ui('party-code')).toHaveCount(0);
    expect(sockets.ana, 'the Party menu opens no room socket').toEqual([]);

    // Create: the room service generates the code, shown on the colour step.
    await ana.ui('landing').getByLabel('Your name').fill('Ana');
    await ana.button('Create party').click();
    await expect(ana.ui('party-colour')).toBeVisible({ timeout: 30_000 });
    await ana.loaded();
    expect(sockets.ana.every(url => url.endsWith('/api/rooms/_new/socket')), 'Create asks the Worker for a new code').toBe(true);
    const code = await ana.page.evaluate(() => window.__ppApp.room.roomCode);
    expect(code).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
    await expect(ana.ui('party-colour').locator('[data-ui=party-code] strong')).toHaveText(code.toUpperCase());
    await expect(ana.ui('room-lobby')).toHaveCount(0);
    await ana.page.screenshot({ path: testInfo.outputPath('1-host-colour-step.png') });

    // A wrong code fails on the Party menu and creates nothing.
    await ben.menu('party');
    await ben.ui('landing').getByLabel('Your name').fill('Ben');
    await ben.ui('landing').getByLabel('Party code').fill('zzzz9999');
    await ben.button('Join').click();
    await expect(ben.ui('connect-error')).toHaveText('No party has that code. Check it with your host, or create a party.', { timeout: 30_000 });
    await expect(ben.ui('landing')).toBeVisible();
    expect(await ben.page.evaluate(() => window.__ppApp.room)).toBeNull();

    // Join by code: Ana's colour is taken on Ben's colour step; his pick reaches the room before he enters.
    const anaColor = await ana.page.evaluate(() => { const r = window.__ppApp.room; return r.snapshot.players[r.localId].color; });
    await ben.ui('landing').getByLabel('Party code').fill(code.toUpperCase());
    await ben.button('Join').click();
    await expect(ben.ui('party-colour')).toBeVisible({ timeout: 30_000 });
    await ben.loaded();
    await expect(ben.ui('party-colour').locator('h1')).toHaveText('Joined the party');
    await expect(ben.ui('party-colour').locator(`[data-ui=color-picker] button[data-color="${anaColor}"]`)).toBeDisabled();
    const pick = anaColor === 12 ? 13 : 12;
    await ben.ui('party-colour').locator(`[data-ui=color-picker] button[data-color="${pick}"]`).click();
    await expect(ben.ui('party-colour').locator(`[data-ui=color-picker] button[data-color="${pick}"]`)).toHaveAttribute('aria-checked', 'true');
    await expect(ana.ui('party-colour').locator(`[data-ui=color-picker] button[data-color="${pick}"]`)).toBeDisabled();
    await ben.page.screenshot({ path: testInfo.outputPath('2-joiner-colour-step.png') });
    await ben.button('Enter lobby').click();
    await ana.button('Enter lobby').click();

    // The plane lobby: both balls, in their colours, for both players; Putt Pong is offered with exactly two.
    for (const p of [ana, ben]) {
      const balls = p.ui('lobby-plane').locator('[role=listitem]');
      await expect(balls).toHaveCount(2);
      expect((await balls.evaluateAll(els => els.map(e => Number(e.dataset.color)))).sort((a, b) => a - b)).toEqual([anaColor, pick].sort((a, b) => a - b));
      await expect(p.ui('room-lobby').locator('[data-ui=party-code] strong')).toHaveText(code.toUpperCase());
    }
    await expect(ana.ui('room-lobby').locator('select option[value=pong]')).toHaveCount(1);
    await expect(ana.ui('room-lobby').locator('[data-ui=no-powerups]')).toHaveCount(0);
    await ana.page.screenshot({ path: testInfo.outputPath('3-plane-lobby.png') });
    expect(sockets.ben.filter(url => url.includes('/api/rooms/_new/')), 'joining never creates').toEqual([]);
    for (const p of [ana, ben]) expect(p.errors, p.name + ': no page or console errors').toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
