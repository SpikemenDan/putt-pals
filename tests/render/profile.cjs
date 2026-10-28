// Run against `npx vite --host 127.0.0.1 --port 4174 --strictPort`.
// Uses installed desktop Chrome and its real GPU. This is a renderer workload, not end-to-end app FPS.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('@playwright/test');
(async () => {
  const destination = path.resolve(process.argv[2] || 'test-results/render-profile');
  fs.mkdirSync(destination, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text()); });
    await page.goto('http://127.0.0.1:4174/tests/render/probe.html');
    await page.waitForFunction(() => !!window.probe);
    const hardware = await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return { revision: probe.THREE.REVISION, userAgent: navigator.userAgent, gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), dpr: devicePixelRatio, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
    });
    if (hardware.revision !== require('../../package.json').dependencies.three.split('.')[1]) throw new Error('Probe loaded a stale Three.js version; restart Vite with --force');
    const samples = [];
    for (const map of [0, 8, 20, 21, 5, 19]) {
      const sample = await page.evaluate(async map => {
        const p = window.probe; p.select(map);
        const intervals = [], cpu = []; let previous;
        for (let i = 0; i < 360; i++) {
          const t = await new Promise(requestAnimationFrame);
          const start = performance.now(); p.frame();
          if (i >= 60) { cpu.push(performance.now() - start); intervals.push(t - previous); }
          previous = t;
        }
        const stats = values => { values.sort((a,b) => a-b); return { mean: values.reduce((a,b) => a+b, 0) / values.length, median: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) }; };
        return { map, name: p.definitions[map].name, frameIntervalMs: stats(intervals), renderSubmissionMs: stats(cpu) };
      }, map);
      samples.push(sample);
      await page.screenshot({ path: path.join(destination, `map-${map}.png`) });
    }
    // Compile every putt and every effect, then revisit the same map for resource plateau checks.
    const resources = await page.evaluate(async () => {
      const p = window.probe;
      let builds = 0;
      for (let map = 0; map < p.definitions.length; map++) {
        for (let putt = 0; putt < (p.definitions[map].putts?.length || 1); putt++) {
          p.select(map, putt); p.frame(); builds++;
        }
      }
      const memory = [];
      for (let i = 0; i < 12; i++) {
        p.select(0); p.frame();
        memory.push(p.renderer.diagnostics?.() || null);
      }
      for (const mode of ['sunk', 'play']) { p.local.mode = mode; p.frame(); }
      for (let i = 0; i < 3; i++) { p.view.rig.cycleView(); p.frame(); }
      p.view.dispose();
      return { builds, memory };
    });
    const sources = Object.fromEntries(['src/render/renderer.js', 'src/render/materials.js', 'src/render/actors.js', 'tests/render/probe.html', 'tests/render/profile.cjs'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../..', file))).digest('hex')]));
    const report = { sources, capturedAt: new Date().toISOString(), hardware, workload: '1280x800 CSS / DPR 2, high quality, 7 remote actors, aim and auras, 60 warmup + 300 measured frames per starter', samples, resources, errors };
    fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (errors.length) process.exitCode = 1;
    const plateau = resources.memory.slice(-3).map(x => JSON.stringify(x));
    if (new Set(plateau).size !== 1) throw new Error('Renderer counters did not plateau');
    if (samples.some(s => s.frameIntervalMs.mean > 16.7)) throw new Error('60 FPS average frame budget exceeded');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
