// R2w Windows GPU profile: one run = one Three.js checkout x one GPU x one pacing mode.
// Serve the checkout first: `npx vite --force --host 127.0.0.1 --port <port> --strictPort` (copy this
// folder's probe.html into a baseline checkout that predates it). Uses installed desktop Chrome, maximized
// at the display's own size and DPR (the canvas fills the width like the app), and its real GPU, picked with Chrome's own switch rather than a
// Windows setting. The report records the GPU that actually rendered (WEBGL_debug_renderer_info + chrome://gpu).
//
//   node tests/render/windows/profile.cjs --url http://127.0.0.1:4174 --revision 186 --gpu low --out <dir>
//     [--uncapped]  no vsync / frame-rate limit: shows headroom the 144 Hz cap hides; no captures
//     [--app]       also measure the complete app (real UI, solo game) on each starter
//
// Renderer workload: the probe, 7 remote actors, names/auras and aim guide, 60 warmup + 300 measured
// frames per starter. RAF intervals, CPU render submission and (when Chrome exposes it) GPU time are separate.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf('--' + name); return i < 0 ? undefined : args[i + 1]; };
const flag = name => args.includes('--' + name);
const url = opt('url') || 'http://127.0.0.1:4174';
const revision = opt('revision');
const gpu = opt('gpu');
const destination = path.resolve(opt('out') || 'test-results/r2w-profile');
const uncapped = flag('uncapped'), withApp = flag('app');
if (!revision || !['low', 'high'].includes(gpu)) throw new Error('--revision <n> and --gpu low|high are required');

const STARTERS = [0, 8, 20, 21, 5, 19];
const VIEWS = ['follow', 'hole', 'strategic'];
const stats = values => {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  return { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, median: v[Math.floor(v.length * .5)], p95: v[Math.floor(v.length * .95)], p99: v[Math.floor(v.length * .99)], max: v.at(-1) };
};
// Frame pacing: share of intervals more than 1.5x the median (a missed vblank at the display rate).
const pacing = intervals => {
  const s = stats(intervals); if (!s) return null;
  const late = intervals.filter(x => x > s.median * 1.5).length;
  const deltas = intervals.slice(1).map((x, i) => Math.abs(x - intervals[i]));
  return { lateFrames: late, lateShare: late / intervals.length, meanAbsDeltaMs: deltas.reduce((a, b) => a + b, 0) / deltas.length };
};

(async () => {
  fs.mkdirSync(destination, { recursive: true });
  const launchArgs = [
    gpu === 'low' ? '--force_low_power_gpu' : '--force_high_performance_gpu',
    '--start-maximized', '--enable-precise-memory-info', '--js-flags=--expose-gc',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    ...(uncapped ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ];
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: launchArgs });
  const errors = [];
  const watch = page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text()); });
  };
  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    watch(page);
    await page.goto(url + '/tests/render/windows/probe.html');
    await page.waitForFunction(() => !!window.probe);
    const hardware = await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        revision: probe.THREE.REVISION, userAgent: navigator.userAgent,
        vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        glVersion: gl.getParameter(gl.VERSION), timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
        screen: { width: screen.width, height: screen.height }, viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio, canvasCss: { width: probe.cssWidth, height: Math.round(probe.cssWidth * .625) },
        framebuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      };
    });
    hardware.browserVersion = browser.version();
    hardware.launchArgs = launchArgs;
    if (hardware.revision !== String(revision)) throw new Error(`Probe loaded Three.js r${hardware.revision}, expected r${revision}; restart Vite with --force`);
    const expected = gpu === 'low' ? /Radeon/i : /NVIDIA/i;
    hardware.gpuMatchesRequest = expected.test(hardware.gpu);
    console.log(JSON.stringify(hardware));

    const samples = [];
    for (const map of STARTERS) {
      const sample = await page.evaluate(async map => {
        const p = window.probe; p.select(map);
        const gl = document.querySelector('canvas').getContext('webgl2');
        const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        const intervals = [], cpu = [], pending = [], gpuMs = [];
        let previous, disjoint = false;
        const drain = () => {
          while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
            const q = pending.shift();
            if (gl.getParameter(ext.GPU_DISJOINT_EXT)) disjoint = true; else gpuMs.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(q);
          }
        };
        for (let i = 0; i < 360; i++) {
          const t = await new Promise(requestAnimationFrame);
          const q = ext && i >= 60 ? gl.createQuery() : null;
          if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          const start = performance.now(); p.frame();
          const spent = performance.now() - start;
          if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); }
          if (ext) drain();
          if (i >= 60) { cpu.push(spent); intervals.push(t - previous); }
          previous = t;
        }
        for (let i = 0; i < 30 && pending.length; i++) { await new Promise(requestAnimationFrame); drain(); }
        return { map, name: p.definitions[map].name, intervals, cpu, gpuMs, disjoint, diagnostics: p.renderer.diagnostics() };
      }, map);
      samples.push({ map: sample.map, name: sample.name, frameIntervalMs: stats(sample.intervals), pacing: pacing(sample.intervals), renderSubmissionMs: stats(sample.cpu), gpuTimeMs: stats(sample.gpuMs), gpuTimerDisjoint: sample.disjoint, diagnostics: sample.diagnostics, rawIntervalsMs: sample.intervals.map(x => +x.toFixed(2)) });
      console.log(sample.name, stats(sample.intervals).mean.toFixed(2), 'ms mean interval');
      // Deterministic frames (fixed clock/randomness), so captures compare across GPUs and revisions.
      if (!uncapped) {
        for (const [i, viewName] of VIEWS.entries()) {
          await page.evaluate(i => { const p = window.probe; if (i) { p.view.rig.cycleView(); p.view.rig.reset(); } for (let k = 0; k < 30; k++) p.frame(); }, i);
          await page.locator('canvas').screenshot({ path: path.join(destination, `map-${map}-${viewName}.png`) });
        }
        await page.evaluate(() => { const p = window.probe; p.view.rig.cycleView(); p.view.rig.reset(); p.frame(); });
      }
    }
    if (!uncapped) {
      // Effects on Switchback Garden: a rolling ball's trail (play mode), then the sink confetti burst.
      await page.evaluate(() => { const p = window.probe; p.select(0); for (let k = 0; k < 30; k++) p.frame(); Object.assign(p.local, { moving: true, vx: 0, vy: 240 }); for (let k = 0; k < 40; k++) { p.local.y += 4; p.frame(); } });
      await page.locator('canvas').screenshot({ path: path.join(destination, 'map-0-trail.png') });
      await page.evaluate(() => { const p = window.probe; Object.assign(p.local, { moving: false, vy: 0, mode: 'sunk' }); for (let k = 0; k < 6; k++) p.frame(); });
      await page.locator('canvas').screenshot({ path: path.join(destination, 'map-0-confetti.png') });
    }

    // Every putt compiles once, then ten swaps through all six starters; counters and heap per cycle.
    const resources = await page.evaluate(async starters => {
      const p = window.probe;
      let builds = 0;
      p.local.mode = 'play';
      for (let map = 0; map < p.definitions.length; map++) {
        for (let putt = 0; putt < (p.definitions[map].putts?.length || 1); putt++) { p.select(map, putt); p.frame(); builds++; }
      }
      const cycles = [];
      for (let c = 0; c < 10; c++) {
        for (const map of starters) { p.select(map); p.frame(); await new Promise(requestAnimationFrame); }
        p.select(0); p.frame();
        window.gc?.(); await new Promise(requestAnimationFrame);
        cycles.push({ ...p.renderer.diagnostics(), jsHeapBytes: performance.memory?.usedJSHeapSize ?? null });
      }
      p.view.dispose();
      return { builds, cycles };
    }, STARTERS);
    const counters = resources.cycles.map(({ geometries, textures, programs }) => JSON.stringify({ geometries, textures, programs }));
    resources.plateau = new Set(counters.slice(-3)).size === 1;
    resources.heapGrowthLastFiveBytes = resources.cycles.at(-1).jsHeapBytes - resources.cycles.at(-5).jsHeapBytes;

    // Complete app: real UI, solo game, idle at the tee with the app's own render loop.
    let app = null;
    if (withApp) {
      app = [];
      for (const map of STARTERS) {
        const appPage = await context.newPage();
        watch(appPage);
        await appPage.addInitScript(() => { window.__PP_APP_HOOK = true; });
        await appPage.goto(url + '/');
        await appPage.locator('[data-ui=landing]').getByLabel('Your name').fill('R2w');
        await appPage.getByRole('button', { name: 'Play solo', exact: true }).click();
        await appPage.getByRole('button', { name: 'Start Game', exact: true }).click();
        await appPage.locator('[data-ui=map-select] button[data-v]', { hasText: samples.find(s => s.map === map).name }).click();
        await appPage.locator('[data-ui=game]').waitFor({ state: 'visible', timeout: 30_000 });
        await appPage.waitForFunction(() => { const a = window.__ppApp; return a?.putt && !a.putt.player.moving && !a.view.rig.transitioning; }, null, { timeout: 30_000 });
        const measured = await appPage.evaluate(async () => {
          const intervals = []; let previous;
          for (let i = 0; i < 360; i++) { const t = await new Promise(requestAnimationFrame); if (i >= 60) intervals.push(t - previous); previous = t; }
          const c = document.querySelector('[data-ui=game] canvas');
          return { intervals, hud: document.querySelector('[data-ui=hud-info]')?.textContent, framebuffer: { width: c.width, height: c.height }, canvasCss: { width: c.clientWidth, height: c.clientHeight } };
        });
        app.push({ map, hud: measured.hud, framebuffer: measured.framebuffer, canvasCss: measured.canvasCss, frameIntervalMs: stats(measured.intervals), pacing: pacing(measured.intervals), rawIntervalsMs: measured.intervals.map(x => +x.toFixed(2)) });
        console.log('app', measured.hud, stats(measured.intervals).mean.toFixed(2), 'ms mean interval');
        await appPage.close();
      }
    }

    // chrome://gpu as independent proof of the active adapter.
    const gpuPage = await context.newPage();
    await gpuPage.goto('chrome://gpu');
    await gpuPage.waitForTimeout(3000);
    const gpuText = await gpuPage.evaluate(() => {
      const view = document.querySelector('info-view');
      return view?.shadowRoot ? view.shadowRoot.textContent : document.body.innerText;
    });
    fs.writeFileSync(path.join(destination, 'chrome-gpu.txt'), gpuText);
    // The info view's shadow-root text has no line breaks, so match up to the next field name.
    hardware.chromeGpuActive = [...gpuText.matchAll(/(GPU\d+)\s*:VENDOR=[^[]*\[([^\]]+)\][^*]*?\*ACTIVE\*/g)].map(m => `${m[1]} ${m[2]}`);
    hardware.chromeGlRenderer = (gpuText.match(/GL_RENDERER\s*:(.*?)GL_VERSION/) || [])[1] || null;

    const sources = Object.fromEntries(['src/render/renderer.js', 'src/render/materials.js', 'src/render/actors.js', 'tests/render/windows/probe.html'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), file))).digest('hex')]));
    sources['tests/render/windows/profile.cjs'] = createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
    const report = {
      capturedAt: new Date().toISOString(), requestedGpu: gpu, mode: uncapped ? 'uncapped (vsync and frame-rate limit disabled)' : 'vsync (display refresh)',
      sources, hardware,
      workload: `probe, canvas ${hardware.canvasCss.width}x${hardware.canvasCss.height} CSS at DPR ${hardware.dpr} = ${hardware.framebuffer.width}x${hardware.framebuffer.height} framebuffer, high quality/shadows, 7 remote actors, aim and auras, 60 warmup + 300 measured frames per starter`,
      samples, resources, app, errors,
    };
    fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 1) + '\n');
    console.log(JSON.stringify({ gpu: hardware.gpu, match: hardware.gpuMatchesRequest, active: hardware.chromeGpuActive, plateau: resources.plateau, errors }));
    if (errors.length || !hardware.gpuMatchesRequest || !resources.plateau) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
