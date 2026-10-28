// Captures before/after toon sample screenshots of starter maps from scratch-v1/toon.html.
const { chromium } = require('@playwright/test');
const path = require('node:path');

const base = process.argv[2] || 'http://127.0.0.1:4175';
const out = path.join(__dirname, 'shots');
const maps = (process.argv[3] || '0,20,21').split(',').map(Number);

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  for (const style of ['off', 'on']) {
    await page.goto(`${base}/scratch-v1/toon.html?style=${style}`);
    await page.waitForFunction(() => window.sample);
    for (const map of maps) {
      await page.evaluate(m => window.sample.select(m), map);
      for (let b = 0; b < 12; b++) await page.evaluate(() => new Promise(r => requestAnimationFrame(() => { for (let i = 0; i < 20; i++) window.sample.frame(); r(); })));
      const name = await page.evaluate(m => window.sample.definitions[m].name, map);
      for (const cam of ['ball', 'hole']) {
        if (cam === 'hole') {
          await page.evaluate(() => window.sample.cycle());
          for (let b = 0; b < 8; b++) await page.evaluate(() => new Promise(r => requestAnimationFrame(() => { for (let i = 0; i < 20; i++) window.sample.frame(); r(); })));
        }
        const file = path.join(out, `${map}-${name.replace(/\W+/g, '-')}-${cam}-${style}.png`);
        await page.locator('canvas').screenshot({ path: file });
        console.log(file);
      }
    }
  }
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  await browser.close();
})();
