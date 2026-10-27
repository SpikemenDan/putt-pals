// Harness for I1 app tests: every client gets its own jsdom window, all driven by one virtual clock
// (timers, intervals, animation frames and performance.now()). WebGL output and audio are recorded
// stubs; networking uses the N1 in-memory hub through the app's transport seam.
const { JSDOM } = require('jsdom');

function createScheduler({ frameMs = 50 } = {}) {
  let now = 1000, seq = 0;
  const timers = new Map(), frames = new Map();
  const due = () => { let next = null; for (const [id, t] of timers) if (t.at <= now && (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0]))) next = [id, t]; return next; };
  const scheduler = {
    get now() { return now; },
    frameMs,
    timerCount: () => timers.size,
    frameCount: () => frames.size,
    setTimeout(fn, delay = 0) { const id = ++seq; timers.set(id, { fn, at: now + Math.max(0, delay), interval: 0 }); return id; },
    setInterval(fn, delay = 0) { const id = ++seq; timers.set(id, { fn, at: now + Math.max(1, delay), interval: Math.max(1, delay) }); return id; },
    clear(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = ++seq; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    /** Advances virtual time, firing timers in order and one animation frame every frameMs. */
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        const step = Math.min(frameMs, end - now);
        const target = now + step;
        for (;;) {
          let next = null;
          for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
          if (!next) break;
          const [id, t] = next;
          now = Math.max(now, t.at);
          if (t.interval) t.at += t.interval; else timers.delete(id);
          t.fn();
        }
        now = target;
        if (step === frameMs) {
          const callbacks = [...frames.values()]; frames.clear();
          for (const fn of callbacks) fn(now);
        }
      }
    },
    due,
  };
  return scheduler;
}

/** WebGL renderer stand-in (the app injects it through createGameRenderer). */
function createStubRenderers() {
  const instances = [];
  const factory = () => {
    const r = { renders: 0, disposed: false, capabilities: { getMaxAnisotropy: () => 1 }, shadowMap: {}, setSize() {}, setPixelRatio() {}, render() { r.renders++; }, dispose() { r.disposed = true; } };
    instances.push(r);
    return r;
  };
  return { factory, instances };
}

/** Records audio events; mirrors the A1 adapter surface the app uses. */
function createAudioRecorder() {
  const log = [];
  let muted = false, bound = 0, disposed = false, resets = 0;
  return {
    log,
    get bound() { return bound; },
    get disposed() { return disposed; },
    get resets() { return resets; },
    bindGestures() { bound++; let done = false; return () => { if (!done) { done = true; bound--; } }; },
    handleEvent(event, options = {}) { log.push({ type: event.type, kind: event.kind, hazardType: event.hazardType, timedOut: event.timedOut, remote: !!options.remote, speed: options.speed }); return true; },
    updateListener() {},
    resetSession() { resets++; },
    toggleMute() { muted = !muted; return Promise.resolve(!muted); },
    getStatus() { return { muted, disposed, activeVoices: 0 }; },
    dispose() { disposed = true; return Promise.resolve(); },
  };
}

/**
 * Creates a jsdom window wired to the scheduler, with layout and canvas stubs.
 * Every add/removeEventListener is tracked so tests can prove cleanup.
 */
function createWindow(scheduler, { url = 'http://localhost/' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url });
  const w = dom.window;
  const alerts = [], clipboard = [];
  w.performance.now = () => scheduler.now;
  w.setTimeout = (f, d) => scheduler.setTimeout(f, d);
  w.clearTimeout = id => scheduler.clear(id);
  w.setInterval = (f, d) => scheduler.setInterval(f, d);
  w.clearInterval = id => scheduler.clear(id);
  w.requestAnimationFrame = f => scheduler.requestAnimationFrame(f);
  w.cancelAnimationFrame = id => scheduler.cancelAnimationFrame(id);
  w.alert = m => alerts.push(m);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: text => { clipboard.push(text); return Promise.resolve(); } } });
  const ctx = new Proxy(function () {}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : ctx), set: () => true, apply: () => ctx });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  w.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width: 800, height: 500, right: 800, bottom: 500 });
  w.HTMLCanvasElement.prototype.setPointerCapture = function () {};
  Object.defineProperty(w.HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  const listeners = new Map();
  const add = w.EventTarget.prototype.addEventListener, remove = w.EventTarget.prototype.removeEventListener;
  const capture = o => (typeof o === 'boolean' ? o : !!(o && o.capture));
  w.EventTarget.prototype.addEventListener = function (type, fn, o) {
    // Track listeners registered by application code on the window, document and canvas
    // (jsdom registers its own native handlers lazily; those are not the app's to remove).
    if (fn && typeof fn === 'function' && !/\[native code\]/.test(Function.prototype.toString.call(fn)) && (this === w || this === w.document || this instanceof w.HTMLCanvasElement)) {
      const key = [this, type, fn, capture(o)];
      if (![...listeners.values()].some(v => v[0] === key[0] && v[1] === key[1] && v[2] === key[2] && v[3] === key[3])) listeners.set(Symbol(), key);
    }
    return add.call(this, type, fn, o);
  };
  w.EventTarget.prototype.removeEventListener = function (type, fn, o) {
    for (const [k, v] of listeners) if (v[0] === this && v[1] === type && v[2] === fn && v[3] === capture(o)) listeners.delete(k);
    return remove.call(this, type, fn, o);
  };
  return { w, dom, alerts, clipboard, listenerCount: () => listeners.size, listeners };
}

module.exports = { createScheduler, createStubRenderers, createAudioRecorder, createWindow };
