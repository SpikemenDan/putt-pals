// Real drag input, camera cycling, and scorecard toggle in browser.
const { test, expect } = require('@playwright/test');
const { openApp, until } = require('./support/app.cjs');

test('input: a real drag through the canvas shoots through the input adapter and counts the stroke', async ({ page }) => {
  const ana = await openApp(page, 'Ana');
  await ana.solo();
  await ana.button('Start Game').click();
  await ana.ui('map-select').locator('button[data-v]').first().click();
  await expect(ana.ui('game')).toBeVisible({ timeout: 20_000 });
  await until(() => ana.ready(), { label: 'ready' });

  const canvas = page.locator('[data-ui=game] canvas');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 85, cy + 85, { steps: 5 });
  // The meter's inline width is the charge percentage (computed CSS would be pixels).
  await until(async () => !['', '0%'].includes(await page.locator('[role=meter] i').evaluate(e => e.style.width)), { label: 'power meter follows the pull' });
  await page.mouse.up();

  await until(async () => (await ana.ui('hud-info').textContent()).includes('STROKES 1'), { label: 'stroke 1 recorded' });

  await page.keyboard.press('c');
  await expect(ana.button('View: Hole view')).toBeVisible();

  await page.keyboard.press('k');
  await expect(ana.ui('scorecard')).toBeVisible();

  expect(ana.errors, 'no page or console errors').toEqual([]);
});
