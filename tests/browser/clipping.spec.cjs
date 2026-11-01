// CL2: every map is drawn in a real browser from each camera view and zoomed in close, so clipping and
// blank-frame regressions show up as attached screenshots plus a failing check, not as a surprise in play.
// The shots are attached to the report (test-results/browser) and are not committed.
const { test, expect } = require('@playwright/test');
const { openApp, until } = require('./support/app.cjs');

// Ball cam, Hole view, World view (press `c` to cycle) and a close ball cam (wheel zoom). Putts after the
// first are shot close only, to keep the run short.
const VIEWS = ['default', 'hole', 'world', 'close'];

test('clipping: every map renders non-blank from every camera view without page errors', async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  const ana = await openApp(page, 'Ana');
  await ana.solo();
  await ana.ui('room-lobby').locator('select').selectOption('putt_practice');
  await ana.button('Start Game').click();
  await expect(ana.ui('map-select')).toBeVisible();
  const maps = await ana.ui('map-select').locator('button[data-v]').count();
  expect(maps, 'map picker lists the courses').toBeGreaterThan(0);

  const canvas = page.locator('[data-ui=game] canvas');
  // Cameras ease toward their pose; wait for the putt transition, then let the frame settle.
  const settle = async () => {
    await until(async () => !(await page.evaluate(() => window.__ppApp.view.rig.transitioning)), { label: 'camera settled' });
    await page.waitForTimeout(400);
  };
  const shoot = async (map, putt, view) => {
    await settle();
    const colours = await ana.canvasColours();
    expect(colours, `map ${map} putt ${putt + 1} ${view} view is not a blank frame`).toBeGreaterThan(8);
    const name = `map-${String(map).padStart(2, '0')}-putt-${putt + 1}-${view}`;
    await testInfo.attach(name, { body: await canvas.screenshot(), contentType: 'image/png' });
  };

  for (let map = 0; map < maps; map++) {
    await ana.ui('map-select').locator('button[data-v]').nth(map).click();
    const putts = await page.getByRole('button', { name: /^Putt \d+ · Par \d+$/ }).count();
    expect(putts, `map ${map} lists its putts`).toBeGreaterThan(0);
    await page.getByRole('button', { name: /^Putt 1 · Par \d+$/ }).click();
    for (let putt = 0; putt < putts; putt++) {
      await until(() => ana.ready(), { label: `map ${map} putt ${putt + 1} ready` });
      // The wheel zoom persists across putts, so later putts are shot close only.
      const views = putt === 0 ? VIEWS : ['close'];
      for (const view of views) {
        if (view === 'hole' || view === 'world') await page.keyboard.press('c');
        if (view === 'close') {
          if (putt === 0) await page.keyboard.press('c'); // world view back to ball cam
          const box = await canvas.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, -2000);
        }
        await shoot(map, putt, view);
      }
      if (putt < putts - 1) await ana.button('Next putt ›').click();
    }
    await ana.button('Maps').click();
    await expect(ana.ui('map-select')).toBeVisible();
  }
  expect(ana.errors, 'no page or console errors').toEqual([]);
});
