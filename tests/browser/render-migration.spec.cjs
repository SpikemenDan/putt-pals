// R2: modern Three.js requires WebGL2. A desktop limited to WebGL1 still gets the existing
// actionable notice and working menus instead of a blank screen or an uncaught renderer failure.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./support/app.cjs');
test('WebGL1-only desktop: explains unavailable 3D and keeps solo controls usable', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Capability fault injection is checked in Chromium; normal rendering runs across all engines');
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return type === 'webgl2' ? null : original.call(this, type, ...args);
    };
  });
  const player = await openApp(page, 'Ana');
  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl')), 'WebGL1 remains available').toBe(true);
  await expect(player.ui('webgl-notice')).toBeVisible();
  await player.solo();
  await player.button('Start Game').click();
  await player.ui('map-select').locator('button[data-v]').first().click();
  await expect(player.ui('game')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => window.__ppApp.renderer)).toBeNull();
  expect(player.log.filter(line => line.startsWith('pageerror:'))).toEqual([]);
});
