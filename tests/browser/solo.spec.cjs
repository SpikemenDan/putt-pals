// Solo play in a real browser: the built app, real WebGL, the full first map through the real UI.
const { test, expect } = require('@playwright/test');
const { openApp, until, playPutt } = require('./support/app.cjs');

test('solo: a full six-putt map renders in WebGL and scores six holes in one', async ({ page }) => {
  const ana = await openApp(page, 'Ana');
  await ana.solo();
  await expect(ana.ui('room-lobby').locator('p').first()).toHaveText('Solo practice');
  await expect(ana.button('Copy invite')).toBeHidden();
  await ana.button('Start Game').click();
  await expect(ana.ui('map-select')).toBeVisible();
  await ana.ui('map-select').locator('button[data-v]').first().click();
  await expect(ana.ui('game')).toBeVisible({ timeout: 20_000 });
  await expect(ana.ui('hud-info')).toContainText('Switchback Garden · PUTT 1/6 · PAR 2 · STROKES 0');

  // A real course is on screen: sky, turf, walls and the ball give many distinct colours; a blank or
  // cleared canvas gives one or two.
  expect(await ana.canvasColours(), 'WebGL canvas shows a rendered course').toBeGreaterThan(20);

  for (let k = 0; k < 6; k++) {
    await until(async () => (await page.evaluate(() => window.__ppApp.putt?.puttIndex)) === k, { label: 'putt ' + (k + 1) });
    await playPutt([ana]);
    // Solo records the putt and advances at once, so watch the recorded scores.
    await until(async () => (await ana.snapshot()).players.solo?.scores.length > k, { label: 'sink ' + (k + 1) });
    expect((await ana.snapshot()).players.solo.scores[k], `putt ${k + 1} is a hole in one`).toBe(1);
    // The "Hole in one!" toast is replaced within about a second in real time; the banner lasts longer.
    if (k === 0) await expect(ana.ui('banner')).toHaveText('AnaHOLE IN ONE');
  }

  await expect(ana.ui('results')).toBeVisible({ timeout: 30_000 });
  await expect(ana.ui('results').locator('p').first()).toHaveText('Switchback Garden: Ana 6. Map winner: Ana.');
  await ana.button('Back to lobby').click();
  await expect(ana.ui('room-lobby')).toBeVisible();
  await ana.button('Leave room').click();
  await expect(ana.ui('landing')).toBeVisible();
  expect(ana.errors, 'no page or console errors').toEqual([]);
});
