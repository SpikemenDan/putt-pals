// Repeated join/leave in a real browser: five solo putt-practice cycles through the real UI, then three
// online cycles on the local Worker. A probe installed before the app loads counts window,
// document and canvas listeners, pending timers, pending animation frames and WebGL contexts; it
// only observes and never changes what the app does.
const { test, expect } = require('@playwright/test');
const { openApp, until, best } = require('./support/app.cjs');

function installProbe() {
  const tracked = target => target === window || target === document || target instanceof HTMLCanvasElement;
  const listeners = new Map(); // listener -> Set of "target#id|type|capture"
  const ids = new WeakMap(); let nextId = 0;
  const idOf = target => { if (!ids.has(target)) ids.set(target, ++nextId); return ids.get(target); };
  const keyOf = (target, type, options) => idOf(target) + '|' + type + '|' + (typeof options === 'boolean' ? options : !!options?.capture);
  const { addEventListener: add, removeEventListener: remove } = EventTarget.prototype;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (listener && tracked(this)) { if (!listeners.has(listener)) listeners.set(listener, new Set()); listeners.get(listener).add(keyOf(this, type, options)); }
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const keys = listeners.get(listener);
    if (keys && tracked(this)) { keys.delete(keyOf(this, type, options)); if (!keys.size) listeners.delete(listener); }
    return remove.call(this, type, listener, options);
  };
  const timers = new Set(), frames = new Set();
  const nativeSetTimeout = window.setTimeout, nativeSetInterval = window.setInterval;
  window.setTimeout = function (fn, ...rest) { const id = nativeSetTimeout.call(window, typeof fn === 'function' ? (...a) => { timers.delete('t' + id); fn(...a); } : fn, ...rest); timers.add('t' + id); return id; };
  window.setInterval = function (...args) { const id = nativeSetInterval.apply(window, args); timers.add('i' + id); return id; };
  const nativeClearTimeout = window.clearTimeout, nativeClearInterval = window.clearInterval;
  window.clearTimeout = id => { timers.delete('t' + id); return nativeClearTimeout.call(window, id); };
  window.clearInterval = id => { timers.delete('i' + id); return nativeClearInterval.call(window, id); };
  const nativeRaf = window.requestAnimationFrame, nativeCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = fn => { const id = nativeRaf.call(window, t => { frames.delete(id); fn(t); }); frames.add(id); return id; };
  window.cancelAnimationFrame = id => { frames.delete(id); return nativeCancel.call(window, id); };
  const webgl = new Set();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { if (/webgl/.test(type)) webgl.add(this); return getContext.call(this, type, ...rest); };
  window.__ppProbe = () => ({
    listeners: [...listeners.values()].reduce((n, keys) => n + keys.size, 0),
    timers: timers.size,
    frames: frames.size,
    webglCanvases: webgl.size,
  });
}

test('lifecycle: repeated join/leave keeps one loop and no leaked listeners, timers or WebGL contexts', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  await page.addInitScript(installProbe);
  const ana = await openApp(page, 'Ana');
  const probe = () => page.evaluate(() => window.__ppProbe());
  const settledAt = async (limit, label) => {
    // Banner and toast timers finish on their own; a leak is a count that never comes back down.
    await until(async () => { const p = await probe(); return p.listeners <= limit.listeners && p.timers <= limit.timers; }, { timeout: 20_000, label });
  };
  await page.waitForTimeout(1000);
  const base = await probe();
  testInfo.annotations.push({ type: 'baseline', description: JSON.stringify(base) });
  expect(base.frames, 'one animation loop').toBeLessThanOrEqual(1);

  for (let i = 0; i < 5; i++) {
    await ana.solo();
    // Putt practice is the mode with an in-game Exit; other modes leave from the lobby or map picker.
    await ana.ui('room-lobby').locator('select').selectOption('putt_practice');
    await ana.button('Start Game').click();
    await ana.ui('map-select').locator('button[data-v]').first().click();
    await ana.button('Putt 1 · Par 2').click();
    await until(() => ana.ready(), { label: `cycle ${i + 1}: ready` });
    const shot = best(0, 0);
    await ana.shoot(shot.deg, shot.power);
    await page.waitForTimeout(1000);
    await ana.button('Card').click();
    await expect(ana.ui('scorecard')).toBeVisible();
    await page.getByRole('button', { name: 'Close scorecard' }).click();
    await ana.button('Exit').click();
    await expect(ana.ui('room-lobby')).toBeVisible();
    await ana.button('Leave room').click();
    await expect(ana.ui('landing')).toBeVisible();
    expect(await page.evaluate(() => window.__ppApp.room === null && window.__ppApp.putt === null), `cycle ${i + 1}: room and putt released`).toBe(true);
    await settledAt(base, `cycle ${i + 1}: listeners and timers back to baseline`);
    const now = await probe();
    expect(now.frames, `cycle ${i + 1}: still one animation loop`).toBeLessThanOrEqual(1);
    expect(now.webglCanvases, `cycle ${i + 1}: the WebGL renderer is reused`).toBe(1);
    testInfo.annotations.push({ type: `cycle ${i + 1}`, description: JSON.stringify(now) });
  }

  // Each online room socket must close on explicit leave, without leaking app listeners.
  const sockets = new Set();
  page.on('websocket', ws => { sockets.add(ws); ws.on('close', () => sockets.delete(ws)); });
  for (let i = 0; i < 3; i++) {
    await ana.join('T1LC' + Date.now().toString(36).slice(-4).toUpperCase());
    await expect(ana.ui('room-lobby').locator('p').first()).toContainText('You control the room');
    await ana.button('Leave room').click();
    await expect(ana.ui('landing')).toBeVisible();
    await until(() => sockets.size === 0, { timeout: 10_000, label: `online cycle ${i + 1}: room socket closed` });
    await settledAt(base, `online cycle ${i + 1}: listeners and timers back to baseline`);
  }
  testInfo.annotations.push({ type: 'final', description: JSON.stringify(await probe()) });
  expect(ana.errors, 'no page or console errors').toEqual([]);
});
