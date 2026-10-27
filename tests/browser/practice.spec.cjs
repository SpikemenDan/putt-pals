// Putt practice mode features, single-putt replay, and navigation in browser.
const { test, expect } = require('@playwright/test');
const { openApp, until, playPutt } = require('./support/app.cjs');

test('putt practice: the picker starts a putt, completion replays it, the bar steps putts and returns to maps', async ({ page }) => {
  const ana = await openApp(page, 'Ana');
  await ana.solo();
  await ana.ui('room-lobby').locator('select').selectOption('putt_practice');
  await ana.button('Start Game').click();
  await expect(ana.ui('map-select')).toBeVisible();
  await ana.ui('map-select').locator('button[data-v]').first().click();
  await ana.button('Putt 3 · Par 2').click();
  await until(async () => (await ana.ready()) && (await page.evaluate(() => window.__ppApp.putt?.puttIndex)) === 2, { label: 'putt 3' });
  await expect(ana.ui('hud-info')).toContainText('Switchback Garden · PUTT 3/6 · PAR 2 · STROKES 0 · PRACTICE');
  const transitioning = await page.evaluate(() => window.__ppApp.view.rig.transitioning);
  expect(transitioning).toBe(false);

  const round = await page.evaluate(() => window.__ppApp.room?.snapshot?.roundNumber);
  await playPutt([ana]);
  await until(async () => (await page.evaluate(() => window.__ppApp.putt?.player?.mode)) === 'sunk', { label: 'sink' });

  const cardOpen = await page.evaluate(() => window.__ppApp.store.getSnapshot().cardOpen);
  expect(cardOpen).toBe(false);

  await until(async () => (await page.evaluate(() => window.__ppApp.room?.snapshot?.roundNumber)) === round + 1, { label: 'replay' });
  await until(async () => await ana.ready(), { label: 'ready again' });

  const puttIndex = await page.evaluate(() => window.__ppApp.putt?.puttIndex);
  expect(puttIndex).toBe(2);
  const strokes = await page.evaluate(() => window.__ppApp.putt?.player?.strokes);
  expect(strokes).toBe(0);

  await ana.button('Next putt ›').click();
  await until(async () => (await page.evaluate(() => window.__ppApp.putt?.puttIndex)) === 3, { label: 'next putt' });

  await ana.button('Maps').click();
  await until(async () => await ana.ui('map-select').isVisible(), { label: 'maps' });
  expect(await page.evaluate(() => window.__ppApp.putt === null), 'leaving play ends the putt').toBe(true);

  expect(ana.errors, 'no page or console errors').toEqual([]);
});
