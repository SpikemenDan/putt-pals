// Helpers for driving the built modular app in a real browser page.
//
// Players act through the real UI (buttons, inputs, canvas). Full-map flows fire each putt as the same
// `shot` command the input adapter emits on release, with the solver's recorded robust aim, because
// a mouse drag cannot hit an exact angle through the time-based sway. tests/browser/input.spec.cjs
// covers the real drag path. window.__ppApp (enabled by __PP_APP_HOOK) is read for state and never
// written.
const { expect } = require('@playwright/test');
const solver = require('../../fixtures/cup-capture/solutions.json');

const best = (map, putt) => solver.results.find(r => r.map === map && r.putt === putt).best;

/** Fails with the page's console output attached, so CI-only failures explain themselves. */
async function explained(log, label, fn) {
  try { await fn(); } catch (error) { error.message += `\n--- ${label}: page console ---\n` + (log.join('\n') || '(empty)'); throw error; }
}

const ROOM_SOCKET_UNLOAD = /The connection to wss?:\/\/[^\s"]+\/api\/rooms\/[a-z0-9]+\/socket was interrupted while the page was loading/;

/** Party codes by the label a spec gave its party (VIS-M3: the server picks codes; only Create makes a party). */
const parties = new Map();
/** The real code of a spec's named party, upper case as the lobby shows it. */
const partyCode = label => parties.get(label)?.toUpperCase();

/** Opens the app in a page and returns a player handle. Collects page errors for assertions. */
async function openApp(page, name) {
  const errors = [], log = [];
  page.on('pageerror', error => { errors.push(error.message); log.push('pageerror: ' + error.message); });
  page.on('console', message => {
    log.push(message.type() + ': ' + message.text());
    // Headed browsers request /favicon.ico, which the app does not ship; that 404 is not an app error.
    // Firefox reports an open room socket cut by a navigation (a spec's own page.reload()) as a console error; the
    // browser writes it, not the app, and whether it appears depends on timing. Only that exact message is ignored.
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico') && !ROOM_SOCKET_UNLOAD.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__PP_APP_HOOK = true;
    // Every banner the page shows, so short-lived banners can be asserted after the fact.
    window.__ppBanners = [];
    new MutationObserver(() => {
      const text = document.querySelector('[data-ui=banner]')?.textContent;
      if (text && text !== window.__ppBanners.at(-1)) window.__ppBanners.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto('/');
  await explained(log, name + ' start screen', () => expect(page.locator('[data-ui=landing]')).toBeVisible());

  const visible = ui => page.locator(`[data-ui=${ui}]`);
  const p = {
    name, page, errors, log,
    banners: () => page.evaluate(() => window.__ppBanners),
    ui: visible,
    button: label => page.getByRole('button', { name: label, exact: true }),
    /** Main menu (VIS-M2): open Solo, Party, Custom or Settings, stepping back first from another sub-menu. */
    async menu(id) {
      const view = await visible('landing').getAttribute('data-view');
      if (view === id) return;
      if (view !== 'home') await page.locator('[data-ui=menu-back]').click();
      // The main buttons bob while idle (display.menu.bob), so they are never "stable" for Playwright's
      // actionability wait. Check what a player needs (visible, enabled), then click without that wait.
      const button = page.locator(`[data-menu=${id}]`);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      await button.click({ force: true });
    },
    /** Solo steps (VIS-M4): pick the mode and Gaia, name, Play solo; lands on the map select with no lobby. */
    async solo(mode = 'standard') {
      await p.menu('solo');
      const [kind, sub] = { standard: ['Casual'], tournament_3: ['Tournament', '3 maps'], tournament_5: ['Tournament', '5 maps'], tournament_7: ['Tournament', '7 maps'], practice: ['Practice', 'Whole map'], putt_practice: ['Practice', 'One putt'], pong: ['Practice', 'Putt Pong'] }[mode];
      const steps = visible('solo-steps');
      while (await steps.getAttribute('data-step') !== 'mode') await page.locator('[data-ui=menu-back]').click();
      await steps.getByRole('button', { name: new RegExp('^' + kind) }).click();
      if (sub) await steps.getByRole('button', { name: new RegExp('^' + sub) }).click();
      await steps.locator('[data-ui=world-choose]').click();
      await visible('landing').getByLabel('Your name').fill(name);
      await p.button('Play solo').click();
      await expect(visible('map-select')).toBeVisible();
      await p.loaded();
    },
    /**
     * Waits for the loading screen to close. Opening a room from the menu shows it over the lobby while the planet renders;
     * on slow (software) WebGL that keeps the page too busy for Playwright's actionability checks until it closes.
     */
    async loaded() {
      await expect(page.locator('[data-ui=loading]')).toHaveCount(0, { timeout: 60_000 });
    },
    /** Party menu (VIS-M3): Create, then pick nothing new on the colour step and enter the lobby. Returns the party code. */
    async create() {
      await p.menu('party');
      await visible('landing').getByLabel('Your name').fill(name);
      await p.button('Create party').click();
      await p.enter();
      return page.evaluate(() => window.__ppApp.room.roomCode);
    },
    /** Party menu (VIS-M3): type the code in the Join box, Join, then the colour step (while the party is in its lobby). */
    async joinCode(code) {
      await p.menu('party');
      await visible('landing').getByLabel('Your name').fill(name);
      await visible('landing').getByLabel('Party code').fill(code);
      await p.button('Join').click();
      await p.enter();
    },
    /** Waits for the colour step (or a party already past its lobby), then enters the lobby. */
    async enter() {
      await explained(log, name + ' join', () => expect(page.locator('[data-ui=party-colour], [data-ui=map-select], [data-ui=game]').locator('visible=true').first()).toBeVisible());
      await p.loaded();
      if (await visible('party-colour').isVisible()) await p.button('Enter lobby').click();
      await explained(log, name + ' lobby', () => expect(page.locator('[data-ui=room-lobby], [data-ui=map-select], [data-ui=game]').locator('visible=true').first()).toBeVisible());
    },
    /**
     * A named party (`label`, any text a spec chooses): the first player to ask creates it and later players join it by
     * the code the room service generated. `partyCode(label)` gives that code.
     */
    async join(label) {
      if (parties.has(label)) await p.joinCode(parties.get(label));
      else parties.set(label, await p.create());
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

module.exports = { best, openApp, until, playPutt, partyCode };
