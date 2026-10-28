// I2b: the built app in a real browser with WebGL turned off (Chromium --disable-webgl, Firefox
// webgl.disabled) must still show the start screen, explain why there is no 3D course, and let a solo
// game start without uncaught page errors (I2 #38). WebKit has no launch switch for WebGL, so it is
// covered by the jsdom scenario in tests/app.test.cjs instead of here. The normal WebGL path is
// unchanged and covered by solo.spec.cjs (rendered canvas, no console errors).
const { test, expect } = require('@playwright/test');
const { openApp } = require('./support/app.cjs');

// The project's own launch options (CI Firefox forces software WebGL on) are replaced for this file.
test.use({
  launchOptions: async ({ browserName }, use) => use(browserName === 'firefox'
    ? { firefoxUserPrefs: { 'webgl.disabled': true } }
    : { args: ['--disable-webgl'] }),
});

test.skip(({ browserName }) => browserName === 'webkit', 'WebKit cannot disable WebGL at launch; the jsdom scenario covers it');

const pageErrors = player => player.log.filter(line => line.startsWith('pageerror: '));

test('webgl unavailable: start screen, a text-only hint and a solo game without page errors', async ({ page }) => {
  const ana = await openApp(page, 'Ana');
  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl')), 'WebGL is really off').toBe(false);
  const notice = ana.ui('webgl-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("can't run the 3D course");
  await expect(notice).toContainText('hardware acceleration');
  await expect(notice).toContainText('another desktop browser');
  expect(await notice.locator('*').count(), 'the notice is plain text').toBe(0);

  await ana.solo();
  await ana.button('Start Game').click();
  await ana.ui('map-select').locator('button[data-v]').first().click();
  await expect(ana.ui('game')).toBeVisible({ timeout: 20_000 });
  await expect(ana.ui('hud-info')).toContainText('Switchback Garden · PUTT 1/6 · PAR 2 · STROKES 0');
  await expect(notice, 'the notice stays visible in game').toBeVisible();
  expect(await page.evaluate(() => window.__ppApp.renderer), 'no renderer was created').toBeNull();
  await page.waitForTimeout(1000); // let the frame loop and HUD tick run without a renderer
  // Three.js logs one console error when it cannot create a context; only uncaught errors fail the page.
  expect(pageErrors(ana), 'no uncaught page errors').toEqual([]);
});

