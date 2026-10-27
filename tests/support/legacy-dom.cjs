// Boots the legacy embedded game in jsdom for parity tests (U1 input/UI). WebGL output, canvas 2D and
// audio are stubbed; time is controlled: performance.now()/Date.now() are fixed until advanced, and
// animation frames run only when frame() is called. setInterval/setTimeout use real time, as the
// legacy HUD tick (100 ms) does in the existing smoke tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'putt-pals.html'), 'utf8');
const threeSource = html.match(/<script>\/\* three\.js \(inlined\) \*\/([\s\S]*?)<\/script>/)[1];
const gameSource = html.match(/<script id="game">([\s\S]*?)<\/script>/)[1];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (fn()) return true; } catch { /* retry */ } await sleep(20); }
  return false;
}

/**
 * @param {object} [options]
 * @param {number} [options.random=0.37] Fixed Math.random() value (player colour, room code, noise)
 * @param {{width:number, height:number}} [options.canvasSize] Layout to report for every canvas (jsdom has no layout)
 */
async function bootLegacy({ random = 0.37, canvasSize = { width: 800, height: 500 } } = {}) {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window, errors = [];
  w.addEventListener('error', e => errors.push(String(e.message)));
  w.console.error = (...a) => errors.push(a.join(' '));
  w.alert = m => errors.push('alert: ' + m);
  const ctx = new Proxy(function () {}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : ctx), set: () => true, apply: () => ctx });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  Object.defineProperty(w.HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => canvasSize.width });
  w.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width: canvasSize.width, height: canvasSize.height, right: canvasSize.width, bottom: canvasSize.height });
  w.HTMLCanvasElement.prototype.setPointerCapture = function () {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.Math.random = () => random;
  const clock = { now: 1000 };
  w.performance.now = () => clock.now;
  let pending = null;
  w.requestAnimationFrame = cb => { pending = cb; return 1; };
  w.eval(threeSource);
  w.THREE.WebGLRenderer = function () { return { capabilities: { getMaxAnisotropy: () => 1 }, shadowMap: {}, setSize() {}, setPixelRatio() {}, render() {}, dispose() {} }; };
  w.AudioContext = undefined;
  w.Peer = function () { throw new Error('no network in parity tests'); };
  w.__PP_TEST = true;
  w.eval(gameSource);
  const P = () => w.__pp;
  assert.ok(P(), 'legacy test hook');
  w.document.getElementById('nm').value = 'Ana';
  w.document.getElementById('solo').click();
  assert.ok(await until(() => P().room && P().room.phase === 'lobby'), 'legacy solo lobby');
  return {
    w, errors, clock, P, until,
    $: id => w.document.getElementById(id),
    /** Runs one legacy animation frame at a time in ms (draw() records the aim sway time). */
    frame(now) { clock.now = now; const cb = pending; pending = null; assert.ok(cb, 'legacy requested a frame'); cb(now); },
    /** Puts the legacy room on a map/putt through its own room path and waits for play. */
    async play(map, putt = 0, mode = 'puttprac') {
      const R = P().R, r = R.room();
      R.setRoom({ phase: 'play', map, putt, mode, round: r.round + 1, startAt: R.now(), roster: [R.id()], card: {} });
      assert.ok(await until(() => P().active === r.round + 1 && P().me.mode === 'play'), `legacy plays map ${map} putt ${putt}`);
    },
  };
}

module.exports = { bootLegacy, sleep, until, root };
