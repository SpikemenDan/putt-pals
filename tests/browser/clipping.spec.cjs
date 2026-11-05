// CL2: every map is drawn in a real browser from each camera view and zoomed in close, so clipping and
// blank-frame regressions show up as attached screenshots plus a failing check, not as a surprise in play.
// The shots are attached to the report (test-results/browser) and are not committed.
const { test, expect } = require('@playwright/test');
const { openApp, until } = require('./support/app.cjs');

// Ball cam, Hole view, World view (press `c` to cycle) and a close ball cam (wheel zoom). Putts after the
// first are shot close only, to keep the run short.
const VIEWS = ['default', 'hole', 'world', 'close'];

test('clipping: every map renders non-blank from every camera view without page errors @slow', async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  const ana = await openApp(page, 'Ana');
  await ana.solo();
  await ana.ui('room-lobby').locator('select').selectOption('putt_practice');
  await ana.button('Start Game').click();
  await expect(ana.ui('map-select')).toBeVisible();
  const maps = await ana.ui('map-select').locator('button[data-v]').count();
  expect(maps, 'map picker lists the courses').toBeGreaterThan(0);

  const canvas = page.locator('[data-ui=game] canvas');
  // Cameras ease toward their pose with a frame-stepped spring, and on software GL a frame can take a long
  // time, so a fixed sleep can sample a half-way pose (ground only, ball out of shot). Wait for the putt
  // transition, then for the pose to hold still across several rendered frames.
  const settle = async () => {
    await until(async () => !(await page.evaluate(() => window.__ppApp.view.rig.transitioning)), { label: 'camera settled' });
    await page.evaluate(() => new Promise((resolve, reject) => {
      const rig = window.__ppApp.view.rig, pose = () => [...rig.position, ...rig.look];
      const started = performance.now();
      let previous = pose(), still = 0;
      const step = () => {
        const current = pose();
        still = Math.max(...current.map((v, i) => Math.abs(v - previous[i]))) < 0.05 ? still + 1 : 0;
        previous = current;
        if (still >= 5) resolve();
        else if (performance.now() - started > 90_000) reject(new Error('camera pose never settled'));
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }));
  };
  const shoot = async (map, putt, view) => {
    await settle();
    // Poll instead of sampling once: a blank or clipped frame stays flat and still fails after the window,
    // while one flat frame from a slow software-GL present does not. The shot is attached either way.
    let colours = 0;
    const sample = async () => (colours = await ana.canvasColours());
    const name = `map-${String(map).padStart(2, '0')}-putt-${putt + 1}-${view}`;
    try {
      await expect.poll(sample, { timeout: 20_000, intervals: [250, 500, 1000], message: `map ${map} putt ${putt + 1} ${view} view is not a blank frame` }).toBeGreaterThan(8);
    } finally {
      await testInfo.attach(name, { body: await canvas.screenshot(), contentType: 'image/png' });
      if (colours <= 8) await testInfo.attach(name + '-colours', { body: String(colours), contentType: 'text/plain' });
    }
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
