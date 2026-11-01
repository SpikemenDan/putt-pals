// CL2: every map is drawn in a real browser from each camera view and zoomed in close, so clipping and
// blank-frame regressions show up as attached screenshots plus a failing check, not as a surprise in play.
// The shots are attached to the report (test-results/browser) and are not committed.
const { test, expect } = require('@playwright/test');
const { openApp, until } = require('./support/app.cjs');

// Ball cam, Hole view, World view (press `c` to cycle) and a close ball cam (wheel zoom).
const VIEWS = ['default', 'hole', 'world', 'close'];

test('clipping: every map renders non-blank from every camera view without page errors', async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  const ana = await openApp(page, 'Ana');
  await ana.solo();
  await ana.ui('room-lobby').locator('select').selectOption('practice');
  await ana.button('Start Game').click();
  await expect(ana.ui('map-select')).toBeVisible();
  const maps = await ana.ui('map-select').locator('button[data-v]').count();
  expect(maps, 'map picker lists the courses').toBeGreaterThan(0);

  for (let map = 0; map < maps; map++) {
    await ana.ui('map-select').locator('button[data-v]').nth(map).click();
    await until(() => ana.ready(), { label: `map ${map} ready` });
    const canvas = page.locator('[data-ui=game] canvas');
    const box = await canvas.boundingBox();
    // Cameras ease toward their pose; let the first frames settle before the shot.
    const settle = () => until(async () => !(await page.evaluate(() => window.__ppApp.view.rig.transitioning)), { label: `map ${map} camera settled` });
    for (const view of VIEWS) {
      if (view === 'hole' || view === 'world') await page.keyboard.press('c');
      if (view === 'close') {
        await page.keyboard.press('c'); // back to ball cam from world view
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -2000);
      }
      await settle();
      await page.waitForTimeout(400);
      const colours = await ana.canvasColours();
      expect(colours, `map ${map} ${view} view is not a blank frame`).toBeGreaterThan(8);
      await testInfo.attach(`map-${String(map).padStart(2, '0')}-${view}`, { body: await canvas.screenshot(), contentType: 'image/png' });
    }
    await ana.button('Maps').click();
    await expect(ana.ui('map-select')).toBeVisible();
  }
  expect(ana.errors, 'no page or console errors').toEqual([]);
});
