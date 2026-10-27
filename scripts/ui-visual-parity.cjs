// U1 real-browser evidence: renders the legacy page and the extracted React UI in the same Chromium
// with a frozen clock and fixed randomness, drives both into the same states, masks the 3D canvas and
// compares screenshots pixel by pixel.
//
// Requires a local Playwright with Chromium (not a project dependency; T1 owns browser tests):
//   node scripts/ui-visual-parity.cjs [outDir]
// Writes legacy/ui/diff PNGs and report.json to outDir (default node_modules/.cache/putt-pals-tests/parity).
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cache = path.join(root, 'node_modules', '.cache', 'putt-pals-tests');
const harnessDir = path.join(cache, 'harness');
const outDir = path.resolve(process.argv[2] || path.join(cache, 'parity'));
const COLOR = 2; // Math.random() is fixed at 0.3, so the legacy player colour is floor(0.3 * 8)
const ALL_VIEWPORTS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'narrow', width: 600, height: 900 }];
const VIEWPORTS = process.env.UI_PARITY_VIEWPORTS ? ALL_VIEWPORTS.filter(v => process.env.UI_PARITY_VIEWPORTS.split(',').includes(v.name)) : ALL_VIEWPORTS;

async function buildHarness() {
  fs.rmSync(harnessDir, { recursive: true, force: true });
  fs.mkdirSync(harnessDir, { recursive: true });
  const rel = p => path.relative(harnessDir, path.join(root, p)).split(path.sep).join('/');
  fs.writeFileSync(path.join(harnessDir, 'index.html'), '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Putt Pals • Party Circuit</title></head><body><div id="root"></div><script type="module" src="./harness.jsx"></script></body></html>\n');
  fs.writeFileSync(path.join(harnessDir, 'harness.jsx'), `
import { mountUi, createUiStore, createUiDispatcher, createCourseInfo } from '${rel('src/ui/index.js')}';
import { createCourseData } from '${rel('src/courses/index.js')}';
const courses = createCourseInfo(createCourseData());
const store = createUiStore({ courses, clock: window });
window.__commands = [];
window.__ui = { store, courses };
mountUi(document.getElementById('root'), { store, dispatch: createUiDispatcher(store, c => window.__commands.push(c)), initialRoomCode: 'abcd' });
`);
  const { build } = await import('vite');
  const nodeEnv = process.env.NODE_ENV;
  try {
    await build({ configFile: false, root: harnessDir, logLevel: 'warn', base: './', build: { outDir: path.join(harnessDir, 'dist'), emptyOutDir: true } });
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  }
}

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = url.pathname === '/legacy' ? path.join(root, 'putt-pals.html')
      : path.join(harnessDir, 'dist', path.normalize(url.pathname.replace(/^\/ui\/?/, '') || 'index.html'));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// L1-shaped room snapshots matching each legacy state (solo player "Ana").
const player = (extra = {}) => ({ id: 'solo', name: 'Ana', connected: true, strokes: 0, done: false, timedOut: false, score: null, scores: [], ...extra });
const room = extra => ({ phase: 'lobby', mode: 'standard', mapIndex: 0, puttIndex: 0, roundNumber: 0, roundLimitSeconds: 120, roundStartTime: 0, votingDeadline: 0, votes: {}, roster: [], players: { solo: player() }, completedMaps: [], hostId: 'solo', totals: {}, last: null, ...extra });
const START = 100000;
const RESULT_SCORES = [2, 3, 2, 2, 3, 2];

async function main() {
  const { chromium } = require('playwright');
  await buildHarness();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(outDir, { recursive: true });
  const report = [];
  let browser = null;
  try {
    for (const vp of VIEWPORTS) {
      // A fresh browser per viewport: a second legacy load in one browser can stall on leftover GPU state.
      await browser?.close();
      browser = await chromium.launch();
      const open = async url => {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await page.addInitScript(() => { Math.random = () => 0.3; window.__PP_TEST = true; });
        await page.clock.install({ time: 1_700_000_000_000 });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(url);
        // The 3D view is not part of U1: hide only the canvas pixels, identically on both pages,
        // so the HUD overlaid on it is still compared.
        await page.addStyleTag({ content: process.env.UI_PARITY_CANVAS === 'none' ? 'canvas{display:none!important}' : 'canvas{visibility:hidden!important}' });
        await page.clock.runFor(200);
        return { page, errors };
      };
      const legacy = await open(base + '/legacy#room=abcd');
      const ui = await open(base + '/ui/');
      // Like the game, give the canvas a WebGL context so it is GPU-composited on both pages; the
      // glass panels' backdrop blur over it is rendered through the same path.
      await ui.page.evaluate(() => { const gl = document.querySelector('canvas').getContext('webgl'); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
      const setUi = (local, snapshot, now) => ui.page.evaluate(([l, s, n]) => { const st = window.__ui.store; st.setLocal(l); if (s) st.setRoom(s, n); }, [local, snapshot, now]);
      const shoot = async (name, beforeShot) => {
        for (const side of [legacy, ui]) await side.page.clock.fastForward(50);
        if (beforeShot) await beforeShot();
        const shots = {};
        for (const [label, side] of [['legacy', legacy], ['ui', ui]]) {
          const file = path.join(outDir, `${vp.name}-${name}-${label}.png`);
          await side.page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
          shots[label] = file;
        }
        report.push({ viewport: vp.name, screen: name, ...shots });
      };
      const local = { active: true, id: 'solo', isHost: true, roomCode: '', colors: { solo: COLOR } };

      await legacy.page.fill('#nm', 'Ana');
      await ui.page.locator('[data-ui=landing] input').first().fill('Ana');
      await shoot('landing');

      await legacy.page.click('#solo');
      await legacy.page.clock.runFor(400);
      await setUi({ ...local, mode: 'lobby' }, room(), 0);
      await shoot('lobby');

      await legacy.page.click('#startgame');
      await legacy.page.clock.runFor(400);
      await setUi({}, room({ phase: 'select' }), 0);
      await shoot('voting');

      await legacy.page.click('#mapgrid [data-map="0"]');
      await legacy.page.clock.fastForward(150);
      await legacy.page.clock.fastForward(150);
      await setUi({}, room({ phase: 'play', roundNumber: 1, roundStartTime: START, roster: ['solo'] }), START - 2200);
      await shoot('countdown');

      await legacy.page.clock.fastForward(2600);
      await legacy.page.clock.fastForward(2300);
      await setUi({ mode: 'play', strokes: 0, inventory: [] }, room({ phase: 'play', roundNumber: 1, roundStartTime: START, roster: ['solo'] }), START);
      await ui.page.clock.fastForward(2300);
      // Sample both timers at the same second. The legacy HUD redraws every 100 ms, so its text can
      // trail the clock; align the React room clock to the second the legacy page actually shows.
      // (The countdown arithmetic itself is unit-tested against the legacy formula in tests/ui.test.cjs.)
      const syncTimer = async () => {
        const shown = await legacy.page.evaluate(() => (document.getElementById('info').textContent.match(/(\d+):(\d\d)$/) || []).slice(1).map(Number));
        const left = shown.length ? shown[0] * 60 + shown[1] : 120;
        await ui.page.evaluate(n => window.__ui.store.tick(n), START + (120 - left) * 1000 + 500);
      };
      await shoot('game', syncTimer);
      if (process.env.UI_PARITY_STYLES) {
        const dump = (page, sel) => page.evaluate(list => list.map(q => {
          const el = document.querySelector(q); if (!el) return { q, missing: true };
          const cs = getComputedStyle(el), out = {};
          for (let i = 0; i < cs.length; i++) out[cs[i]] = cs.getPropertyValue(cs[i]);
          const r = el.getBoundingClientRect();
          return { q, rect: [r.x, r.y, r.width, r.height].map(Math.round), style: out, parents: (() => { const p = []; let e = el.parentElement; while (e) { const c = getComputedStyle(e); p.push([e.tagName, e.id, e.className, c.opacity, c.filter, c.backdropFilter, c.willChange, c.isolation, c.position, c.zIndex, c.transform, c.mixBlendMode].join('|')); e = e.parentElement; } return p; })() };
        }), sel);
        const L = await dump(legacy.page, ['#info', '#bar>span:last-child', '#ctl', '#sb']);
        const U = await dump(ui.page, ['[data-ui=hud-info]', '[data-ui=hud-info] + span', '[data-ui=game] [role=meter]', '[data-ui=scoreboard]']);
        U[2] = (await ui.page.evaluate(() => null)) ?? U[2];
        fs.writeFileSync(path.join(outDir, vp.name + '-styles.json'), JSON.stringify({ legacy: L, ui: U }, null, 1));
      }

      await legacy.page.keyboard.press('k');
      await ui.page.evaluate(() => window.__ui.store.openCard());
      await shoot('scorecard', syncTimer);
      // The only intended visual change: opening the card moves keyboard focus to its close button
      // (focus ring). Capture once more without focus to show nothing else differs.
      await ui.page.evaluate(() => document.activeElement?.blur());
      await shoot('scorecard-unfocused', syncTimer);
      await legacy.page.keyboard.press('Escape');
      await ui.page.evaluate(() => window.__ui.store.closeCard());

      // Results: the legacy host records the finished map the same way finishMap() does.
      await legacy.page.evaluate(scores => {
        const me = window.__pp.me; me.s = [scores[scores.length - 1]]; me.str = me.s[0]; me.tot = scores.slice(0, -1).reduce((a, b) => a + b, 0);
        const R = window.__pp.R, r = R.room();
        R.setRoom({ phase: 'results', mapNo: 1, totals: { solo: { n: 'Ana', t: 14, w: 1 } }, card: { solo: { n: 'Ana', s: scores, o: scores.map(() => 0) } }, last: { map: 0, sc: { solo: 14 }, names: { solo: 'Ana' }, win: ['solo'] }, round: r.round });
      }, RESULT_SCORES);
      await legacy.page.clock.fastForward(400);
      await legacy.page.clock.fastForward(2400);
      await legacy.page.clock.fastForward(400);
      const resultsRoom = room({ phase: 'results', roundNumber: 1, roundStartTime: START, roster: ['solo'], completedMaps: [0], puttIndex: 0,
        players: { solo: player({ done: true, score: 2, strokes: 2, scores: RESULT_SCORES.map((score, k) => ({ score, timedOut: false, par: 2, penalty: 3 })) }) },
        totals: { solo: { name: 'Ana', total: 14, wins: 1 } }, last: { mapIndex: 0, scores: { solo: 14 }, winners: ['solo'] } });
      await setUi({ mode: 'wait', strokes: 2, viewLabel: 'Free roam' }, resultsRoom, START);
      await ui.page.clock.fastForward(2400);
      await ui.page.clock.fastForward(400);
      await shoot('results', syncTimer);

      for (const side of [legacy, ui]) {
        if (side.errors.length) report.push({ viewport: vp.name, errors: side.errors, side: side === legacy ? 'legacy' : 'ui' });
        await side.page.close();
      }
    }
  } finally {
    await browser?.close();
    server.close();
  }
  fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(report, null, 2));
  console.log(`Captured ${report.filter(r => r.screen).length} screen pairs in ${outDir}`);
}

main().catch(error => { console.error(error); process.exit(1); });
