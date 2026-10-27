// Helpers for driving the built modular app in a real browser page.
//
// Players act through the real UI (buttons, inputs, canvas). Full-map flows fire each putt as the same
// `shot` command the input adapter emits on release, with the solver's recorded robust aim, because
// a mouse drag cannot hit an exact angle through the time-based sway. tests/browser/input.spec.cjs
// covers the real drag path. window.__ppApp (enabled by __PP_APP_HOOK) is read for state and never
// written.
const { expect } = require('@playwright/test');
const solver = require('../../fixtures/solver-baseline.json');

const PEER_PORT = 9310;
const PEER_PATH = '/pp';
// Loopback signalling and no STUN, so tests never touch the public network.
const PEER_SERVER = { host: '127.0.0.1', port: PEER_PORT, path: PEER_PATH, secure: false, config: { iceServers: [] } };

const best = (map, putt) => solver.results.find(r => r.map === map && r.putt === putt).best;

/** Fails with the page's console output attached, so CI-only failures explain themselves. */
async function explained(log, label, fn) {
  try { await fn(); } catch (error) { error.message += `\n--- ${label}: page console ---\n` + (log.join('\n') || '(empty)'); throw error; }
}

/** Opens the app in a page and returns a player handle. Collects page errors for assertions. */
async function openApp(page, name) {
  const errors = [], log = [];
  page.on('pageerror', error => { errors.push(error.message); log.push('pageerror: ' + error.message); });
  page.on('console', message => { log.push(message.type() + ': ' + message.text()); if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(peer => {
    window.__PP_APP_HOOK = true; window.__PP_PEER_SERVER = peer;
    // Every banner the page shows, so short-lived banners can be asserted after the fact.
    window.__ppBanners = [];
    new MutationObserver(() => {
      const text = document.querySelector('[data-ui=banner]')?.textContent;
      if (text && text !== window.__ppBanners.at(-1)) window.__ppBanners.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, PEER_SERVER);
  await page.goto('/');
  await explained(log, name + ' start screen', () => expect(page.locator('[data-ui=landing]')).toBeVisible());

  const visible = ui => page.locator(`[data-ui=${ui}]`);
  const p = {
    name, page, errors, log,
    banners: () => page.evaluate(() => window.__ppBanners),
    ui: visible,
    button: label => page.getByRole('button', { name: label, exact: true }),
    async solo() {
      await visible('landing').getByLabel('Your name').fill(name);
      await p.button('Play solo').click();
      await expect(visible('room-lobby')).toBeVisible();
    },
    async join(code) {
      await visible('landing').getByLabel('Your name').fill(name);
      await visible('landing').getByLabel(/room code/i).fill(code);
      await p.button('Join room').click();
      await explained(log, name + ' join', () => expect(page.locator('[data-ui=room-lobby], [data-ui=map-select], [data-ui=game]').locator('visible=true').first()).toBeVisible());
    },
    /** Room snapshot fields the specs compare, read from the running app. */
    snapshot: () => page.evaluate(() => {
      const s = window.__ppApp.room?.snapshot;
      if (!s) return null;
      const players = Object.fromEntries(Object.entries(s.players).map(([id, v]) => [id, { name: v.name, scores: v.scores.map(x => x.score) }]));
      return { mapIndex: s.mapIndex, puttIndex: s.puttIndex, roundNumber: s.roundNumber, players };
    }),
    /** True when this player can putt: in play, ball at rest, no putt-to-putt arc, game screen shown. */
    ready: () => page.evaluate(() => {
      const a = window.__ppApp, game = document.querySelector('[data-ui=game]');
      return !!a.putt && a.putt.player.mode === 'play' && !a.putt.player.moving && !a.view.rig.transitioning && !!game && !game.closest('[hidden]');
    }),
    shoot: (deg, power) => page.evaluate(([d, w]) => { window.__ppApp.dispatch({ type: 'shot', angle: d * Math.PI / 180, power: w }); }, [deg, power]),
    /** Distinct colours in the WebGL canvas, sampled right after the app's own frame. */
    canvasColours: () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
      const gl = document.querySelector('[data-ui=game] canvas');
      const probe = document.createElement('canvas');
      probe.width = 64; probe.height = 40;
      const ctx = probe.getContext('2d');
      ctx.drawImage(gl, 0, 0, probe.width, probe.height);
      const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
      const colours = new Set();
      for (let i = 0; i < data.length; i += 4) colours.add((data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | data[i + 2] >> 4);
      resolve(colours.size);
    }))),
  };
  return p;
}

/** Waits until `fn` resolves truthy, polling the page. */
async function until(fn, { timeout = 60_000, label = 'condition' } = {}) {
  await expect.poll(fn, { timeout, message: 'waiting for ' + label }).toBeTruthy();
}

/** Every listed player shoots the recorded robust shot for the current putt once they can. */
async function playPutt(players) {
  const s = await players[0].snapshot();
  for (const p of players) {
    await until(async () => (await p.ready()) && (await p.snapshot()).roundNumber === s.roundNumber, { timeout: 60_000, label: `${p.name} ready for putt ${s.puttIndex + 1}` });
    const shot = best(s.mapIndex, s.puttIndex);
    await p.shoot(shot.deg, shot.power);
  }
  return s;
}

module.exports = { PEER_PORT, PEER_PATH, PEER_SERVER, best, openApp, until, playPutt };
