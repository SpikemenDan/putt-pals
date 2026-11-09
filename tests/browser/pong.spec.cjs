// Putt Pong (1v1) integration in a real browser: mode selection, 3D cup racks, HUD tracker, and match flow.
const { test, expect } = require('@playwright/test');
const { openApp, until } = require('./support/app.cjs');

test('putt pong solo flow: select Putt Pong mode, start match, verify 3D racks and HUD tracker', async ({ page }) => {
  const ana = await openApp(page, 'Ana');
  await ana.solo();

  await expect(ana.ui('room-lobby').locator('p').first()).toHaveText('Solo practice');

  // Select Putt Pong mode from the dropdown
  await ana.ui('room-lobby').locator('select').selectOption('pong');

  // Start the game
  await ana.button('Start Game').click();
  await expect(ana.ui('map-select')).toBeVisible({ timeout: 15_000 });
  await ana.ui('map-select').locator('button[data-v]').first().click();

  // Wait for game view
  await expect(ana.ui('game')).toBeVisible({ timeout: 20_000 });

  // HUD rack tracker must be visible
  await expect(ana.ui('pong-hud')).toBeVisible({ timeout: 10_000 });

  // Home and Away cup racks rendered in HUD
  await expect(ana.ui('pong-rack-home')).toBeVisible();
  await expect(ana.ui('pong-rack-away')).toBeVisible();
  await expect(ana.ui('pong-rack-home')).toContainText('10/10');
  await expect(ana.ui('pong-rack-away')).toContainText('10/10');

  // Turn status shows active shooter
  const turnInfo = ana.ui('pong-turn-info');
  await expect(turnInfo).toBeVisible();
  await expect(turnInfo).toContainText('turn');
  await expect(turnInfo).toContainText('Balls:');

  // WebGL canvas renders 3D scene with cup racks
  expect(await ana.canvasColours(), 'WebGL canvas shows rendered course with pong racks').toBeGreaterThan(20);

  expect(ana.errors, 'no page or console errors').toEqual([]);
});

test('putt pong 2-player lobby: controller selects Putt Pong, both clients see mode', async ({ browser }, testInfo) => {
  const code = 'PP' + Date.now().toString(36).slice(-4).toUpperCase();
  const context1 = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 800, height: 600 } });
  const context2 = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 800, height: 600 } });

  try {
    const ana = await openApp(await context1.newPage(), 'Ana');
    const ben = await openApp(await context2.newPage(), 'Ben');

    await ana.join(code);
    await ben.join(code);

    await expect(ana.ui('room-lobby').locator('p').first()).toHaveText(`Room ${code} · 2 players · You control the room`, { timeout: 30_000 });
    await expect(ben.ui('room-lobby').locator('p').first()).toHaveText(`Room ${code} · 2 players · Waiting for room controller`);

    // Host selects Putt Pong
    await ana.ui('room-lobby').locator('select').selectOption('pong');

    // Host starts voting
    await ana.button('Start Game').click();
    await expect(ana.ui('map-select')).toBeVisible();
    await expect(ben.ui('map-select')).toBeVisible();

    expect(ana.errors, 'Ana: no errors').toEqual([]);
    expect(ben.errors, 'Ben: no errors').toEqual([]);
  } finally {
    await context1.close();
    await context2.close();
  }
});
