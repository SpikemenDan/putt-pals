// U1 React UI tests. The UI is compiled with Vite's production JSX/CSS Modules transforms
// (tests/support/build-ui.cjs) and rendered with React DOM in jsdom. Part A compares view text with the
// recorded legacy strings for the same state; part B drives the real L1 room session through complete flows with a
// fake clock; part C checks store caching, notifications, focus, the power meter and cleanup.
// Visual (pixel) parity with the retired legacy page is no longer checked; see ARCHITECTURE.md.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildUi } = require('./support/build-ui.cjs');
const recorded = require('./fixtures/legacy-reference/ui.json');

let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

function fakeClock() {
  let t = 0, seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (f, d = 0) => { const id = ++seq; timers.set(id, { f, at: t + d }); return id; },
    clearTimeout: id => { timers.delete(id); },
    pending: () => timers.size,
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [id, x];
        if (!next) break;
        timers.delete(next[0]); t = next[1].at; next[1].f();
      }
      t = end;
    },
  };
}

(async () => {
  const { moduleUrl } = await buildUi();
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
  dom.window.HTMLCanvasElement.prototype.getContext = () => null; // jsdom has no 2D canvas; the loading scene draws nothing without one
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const ui = await import(moduleUrl);
  const React = (await import('react')).default;
  const { act } = React;
  const { createCourseData } = await import('../src/courses/index.js');
  const { createRoomSession } = await import('../src/session/index.js');
  const courses = ui.createCourseInfo(createCourseData());
  const doc = dom.window.document;
  const $ = sel => doc.querySelector(sel);
  const $$ = sel => [...doc.querySelectorAll(sel)];
  const shown = el => !!el && !el.closest('[hidden]');
  const button = label => $$('button').find(b => b.textContent === label && shown(b));
  const click = async el => { assert.ok(el, 'element to click'); await act(async () => { el.click(); }); };

  /** Mounts the UI with a host L1 session; session events from the UI are bound to the local player. */
  async function setup({ localId = 'host', hostName = 'Ana', isHost = true, roomCode = 'abcd', createAtlasScene = null, mountProps = {}, inRoom = true } = {}) {
    const clock = fakeClock();
    const store = ui.createUiStore({ courses, clock });
    let listeners = 0;
    const subscribe = store.subscribe;
    store.subscribe = l => { listeners++; const off = subscribe(l); return () => { listeners--; off(); }; };
    const session = createRoomSession({ hostId: 'host', hostName, clock });
    const commands = [];
    const appDispatch = c => { commands.push(c); if (c.type === ui.UiCommands.SESSION) session.send({ ...c.event, playerId: localId }); };
    const dispatch = ui.createUiDispatcher(store, appDispatch);
    const stop = session.subscribe(s => store.setRoom(s, clock.now()));
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    let unmount;
    await act(async () => { unmount = ui.mountUi(root, { store, dispatch, initialName: hostName, initialRoomCode: roomCode, createAtlasScene, ...mountProps }); });
    // `inRoom: false` leaves the player on the menu, as on a fresh page load (no room opened yet).
    if (inRoom) await act(async () => { store.setLocal({ active: true, id: localId, isHost, roomCode, mode: 'lobby' }); store.setRoom(session.getSnapshot(), clock.now()); });
    const step = async ms => { await act(async () => { clock.advance(ms); store.tick(clock.now()); }); };
    const send = async event => { let r; await act(async () => { r = session.send(event); }); return r; };
    const within = sel => root.querySelector(sel);
    return {
      clock, store, session, commands, dispatch, root, step, send, within,
      get listeners() { return listeners; },
      async teardown() { await act(async () => unmount()); root.remove(); stop(); session.dispose(); store.dispose(); },
    };
  }

  // ------------------------------------------------------------------ Part A: legacy text parity
  await scenario('legacy parity: HUD line, scoreboard, scorecard and results text match the strings recorded from the legacy game for the same state', async () => {
    // Legacy output for this state was recorded from the legacy game (tests/fixtures/legacy-reference/ui.json):
    // putt 3 of Dune Serpent, second map of a 3-map tournament; Ben has a hole in one and a timeout and is
    // done; Cy is still putting and ties Ben; Dee spectates.
    const { meColor } = recorded;
    const legacyInfo = recorded.hud, legacyRows = recorded.scoreboard, legacyDots = recorded.dots, legacyCard = recorded.card;
    const legacyTitle = recorded.title, legacyLead = recorded.leaders, legacyAgain = recorded.againLabel;
    assert.deepEqual(recorded.errors, [], 'the recording itself saw no legacy errors');

    // The same state as an L1 snapshot.
    const t = await setup({ localId: 'solo', hostName: 'Ana' });
    const left = (m => +m[1] * 60 + +m[2])(legacyInfo.match(/(\d+):(\d\d)$/));
    const sc = (score, timedOut = false) => ({ score, timedOut, par: 0, penalty: 3 });
    const room = { phase: 'play', mode: 'tournament_3', mapIndex: 8, puttIndex: 2, roundNumber: 7, roundLimitSeconds: courses[8].putts[2].limitSeconds, roundStartTime: 50000, votingDeadline: 0, votes: {},
      roster: ['solo', 'b', 'c'], completedMaps: [0], hostId: 'solo', totals: {}, last: null, players: {
        solo: { id: 'solo', name: 'Ana', connected: true, strokes: 0, done: false, timedOut: false, score: null, scores: [sc(2), sc(4)] },
        b: { id: 'b', name: 'Ben', connected: true, strokes: 2, done: true, timedOut: false, score: 2, scores: [sc(1), sc(8, true)] },
        c: { id: 'c', name: 'Cy', connected: true, strokes: 5, done: false, timedOut: false, score: null, scores: [sc(3), sc(3)] },
        d: { id: 'd', name: 'Dee', connected: true, strokes: 0, done: false, timedOut: false, score: null, scores: [] } } };
    await act(async () => {
      t.store.setLocal({ mode: 'play', strokes: 1, isHost: true, roomCode: '', colors: { solo: meColor, b: 1, c: 4, d: 6 } });
      t.store.setRoom(room, 50000 + (courses[8].putts[2].limitSeconds - left) * 1000 + 500);
    });
    assert.equal(t.within('[data-ui=hud-info]').textContent, legacyInfo);
    const rows = [...t.within('[data-ui=scoreboard]').children].map(r => [...r.children].map(c => c.textContent));
    assert.deepEqual(rows, legacyRows);
    const dots = [...t.within('[data-ui=scoreboard]').children].slice(1).map(r => r.querySelector('i').style.background);
    assert.deepEqual(dots, legacyDots, 'player colours');

    await act(async () => t.store.openCard());
    const kind = c => ({ lv: 'lv', hio: 'hio', u: 'u', o: 'o' }[c] || '');
    const card = t.within('[role=dialog] table');
    const classOf = td => { for (const k of ['lv', 'hio', 'u', 'o', 'st', 'nm']) if ([...td.classList].some(c => c.startsWith('_' + k + '_'))) return k; return ''; };
    const mine = [...card.querySelectorAll('tr')].map(tr => [...tr.children].map(td => [td.textContent, classOf(td)]));
    assert.deepEqual(mine.map(r => r.map(c => c[0])), legacyCard.map(r => r.map(c => c[0])), 'scorecard cell text');
    assert.deepEqual(mine.map(r => r.map(c => kind(c[1]))), legacyCard.map(r => r.map(c => kind(c[1]))), 'scorecard cell kinds (live/hio/under/over)');
    assert.equal(t.within('[role=dialog] [data-ui=scorecard] div').textContent, legacyTitle);
    assert.deepEqual([...card.querySelectorAll('tbody tr')].map(tr => [...tr.classList].some(c => c.startsWith('_lead_'))), legacyLead, 'leader highlight');

    // Results (the recorded legacy button label is compared; the text was deliberately reworded by C3).
    await act(async () => {
      t.store.setLocal({ mode: 'wait' });
      t.store.setRoom({ ...room, phase: 'results', puttIndex: 5, completedMaps: [0, 8], totals: { solo: { name: 'Ana', total: 24, par: 18, wins: 2 }, b: { name: 'Ben', total: 30, par: 18, wins: 0 }, c: { name: 'Cy', total: 32, par: 18, wins: 0 } },
        last: { mapIndex: 8, scores: { solo: 14, b: 17, c: 20 }, pars: { solo: 10, b: 10, c: 10 }, winners: ['solo'] } }, 99999);
    });
    // C3: results now lead with strokes minus par, so the text deliberately differs from the legacy strokes-only wording.
    assert.equal(t.within('[data-ui=results] p').textContent, 'Dune Serpent: Ana 14 (+4) · Ben 17 (+7) · Cy 20 (+10). Map winner: Ana. Standings after map 2/3: Ana +6 · Ben +12 · Cy +14.');
    assert.equal(t.within('[data-ui=results] button').textContent, legacyAgain);
    await t.teardown();
  });

  /** The loading screen stays lit for a moment once the game is ready; wait (real time) for it to close. */
  async function waitGone(t, limitMs = 4000) {
    const start = Date.now();
    while (t.within('[data-ui=loading]') && Date.now() - start < limitMs) await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    assert.equal(t.within('[data-ui=loading]'), null, 'gone after the finish pause');
  }

  await scenario('loading screen: Putt Planet title over the planet scene, three balls, a pause when ready', async () => {
    const t = await setup();
    await act(async () => t.store.setLocal({ active: false, connecting: true }));
    const loading = t.within('[data-ui=loading]');
    assert.equal(loading.querySelector('[data-ui=loading-title]').textContent, 'Putt Planet', 'the game name on screen');
    assert.match(loading.textContent, /Setting up your game/);
    const stage = t.within('[data-ui=planet-stage]');
    assert.ok(stage?.querySelector('canvas[data-ui=loading-planet]'), 'the planet stands behind it');
    assert.equal(stage.getAttribute('aria-hidden'), 'true', 'decorative art is hidden from assistive tech');
    assert.equal(loading.querySelectorAll('[data-ui=loading-balls] i').length, 3, 'three balls, no putts or cups');
    await act(async () => t.store.setLocal({ connecting: false }));
    assert.equal(t.within('[data-ui=loading]').dataset.state, 'done', 'stays up, all lit, for the finish pause');
    await act(async () => { await new Promise(r => setTimeout(r, 400)); });
    assert.ok(t.within('[data-ui=loading]'), 'still up partway through the default 0.8 s');
    await waitGone(t, 1500);
    await t.teardown();
  });

  await scenario('main menu (VIS-M2): Solo, Party, Custom and Settings, Escape steps back, version label, display.menu look', async () => {
    const { createDisplay } = await import('../src/shared/display.js');
    const live = structuredClone(createDisplay());
    live.menu.buttonScale = 1.3; live.menu.tilt = 4; live.menu.stagger = 0.2; live.menu.bob = 5;
    const t = await setup({ mountProps: { display: live } });
    await act(async () => t.store.setLocal({ active: false, connecting: false }));
    const landing = t.within('[data-ui=landing]');
    assert.equal(landing.dataset.view, 'home');
    const nav = landing.querySelector('nav[aria-label="Main menu"]');
    assert.deepEqual([...nav.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent), ['Solo', 'Party', 'Custom', 'Settings'], 'three main buttons, then Settings');
    assert.ok([...nav.querySelectorAll('button')].every(b => !b.disabled && b.tabIndex === 0), 'every button is reachable by keyboard');
    assert.equal(landing.querySelectorAll('input').length, 0, 'the home view asks nothing yet');
    assert.match(t.within('[data-ui=version]').textContent, /^v\S/, 'the version shows bottom-left');
    assert.equal(landing.style.getPropertyValue('--menu-scale'), '1.3', 'display.menu reaches the buttons');
    assert.equal(landing.style.getPropertyValue('--menu-tilt'), '4deg');
    assert.equal(landing.style.getPropertyValue('--menu-stagger'), '0.2s');
    assert.equal(landing.style.getPropertyValue('--menu-bob'), '5px');
    live.menu.buttonScale = 0.8; // the dev tuner edits the live object in place: the menu follows on the next frame
    await act(async () => { await new Promise(r => setTimeout(r, 40)); });
    assert.equal(landing.style.getPropertyValue('--menu-scale'), '0.8', 'a live display object updates the menu without a re-render');
    await click(nav.querySelector('[data-menu=custom]'));
    assert.equal(landing.dataset.view, 'custom');
    assert.ok(landing.querySelector('[data-ui=custom-rules]'), 'Custom opens the rules editor (VIS-U)');
    assert.equal(doc.activeElement?.closest('[data-menu-view]')?.dataset.menuView, 'custom', 'focus moves into the sub-menu');
    await act(async () => { doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    assert.equal(landing.dataset.view, 'home', 'Escape steps back');
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    assert.equal(doc.activeElement?.dataset.menu, 'custom', 'focus returns to the button that opened it');
    await click(landing.querySelector('[data-menu=solo]'));
    assert.equal($('[data-ui=solo-steps]').dataset.step, 'mode', 'Solo opens on its first step');
    assert.ok(!button('Play solo'), 'Play solo waits for the last step');
    assert.ok(!button('Join room'), 'and not the party one');
    await t.teardown();
    const invited = await setup({ mountProps: { initialView: 'party' }, inRoom: false });
    await act(async () => invited.store.setLocal({ active: false, connecting: false }));
    assert.equal(invited.within('[data-ui=landing]').dataset.view, 'party', 'an invite link opens on Party');
    assert.ok(button('Join room'));
    await invited.teardown();
  });

  await scenario('solo steps (VIS-M4): mode, world, ready; Back steps back; chosen mode reaches play-solo', async () => {
    const views = [];
    const createLoadingScene = () => ({ start() {}, dispose() {}, setView: v => views.push({ space: v.space, target: v.target }) });
    const t = await setup({ mountProps: { createLoadingScene } });
    await act(async () => t.store.setLocal({ active: false, connecting: false }));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); }); // the scene attaches after the first paint
    const landing = t.within('[data-ui=landing]');
    const steps = () => $('[data-ui=solo-steps]');
    const step = () => steps().dataset.step;
    const inSteps = label => [...steps().querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent).startsWith(label));
    const labels = () => [...steps().querySelectorAll('button:not([data-ui=menu-back])')].map(b => b.getAttribute('aria-label') || b.querySelector('span')?.textContent || b.textContent);
    const first = () => steps().querySelector('button:not(:disabled), input');

    await click(landing.querySelector('[data-menu=solo]'));
    assert.equal(step(), 'mode');
    assert.deepEqual(labels(), ['Casual', 'Tournament', 'Practice'], 'Casual, Tournament and the smaller Practice button');
    assert.ok(inSteps('Practice').className !== inSteps('Casual').className, 'Practice is styled smaller than the main options');
    assert.equal(doc.activeElement, first(), 'focus starts on the first button');
    assert.ok(!button('Play solo'), 'no name or Play yet');

    // Tournament lengths
    await click(inSteps('Tournament'));
    assert.equal(step(), 'mode:tournament');
    assert.deepEqual([...steps().querySelectorAll('button[aria-label$=" maps"]')].map(b => b.getAttribute('aria-label')), ['3 maps', '5 maps', '7 maps']);
    assert.equal(doc.activeElement, first());
    await click(steps().querySelector('[data-ui=menu-back]'));
    assert.equal(step(), 'mode', 'Back from the lengths returns to the first step');
    assert.deepEqual(labels(), ['Casual', 'Tournament', 'Practice']);

    // Practice kinds
    await click(inSteps('Practice'));
    assert.equal(step(), 'mode:practice');
    assert.deepEqual(labels(), ['Whole map', 'One putt', 'Putt Pong'], 'Pong practice lives under Solo > Practice (owner, 2026-11-11)');
    await click(steps().querySelector('[data-ui=menu-back]'));
    assert.equal(step(), 'mode');

    // World step: a carousel of planets; Ares and Luna cannot be chosen yet
    await click(inSteps('Tournament'));
    await click(inSteps('5 maps'));
    assert.equal(step(), 'world');
    assert.deepEqual(views.at(-1), { space: true, target: 'gaia' }, 'the stage flies to space, focused on Gaia');
    const choose = () => steps().querySelector('[data-ui=world-choose]');
    const carousel = () => landing.querySelector('[data-ui=world-carousel]');
    const key = async k => act(async () => { doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true })); });
    assert.equal(carousel().dataset.world, 'gaia');
    assert.equal(choose().dataset.world, 'gaia');
    assert.equal(choose().textContent, 'Choose Gaia');
    assert.equal(choose().disabled, false);
    assert.equal(doc.activeElement, choose(), 'focus lands on the choose button');
    const arrow = id => landing.querySelector(`[data-ui=world-${id}]`);
    const seen = [];
    for (let k = 0; k < 3; k++) { await click(arrow('left')); seen.push(carousel().dataset.world); }
    assert.deepEqual(seen, ['luna', 'ares', 'gaia'], 'left cycles gaia, luna, ares, gaia');
    seen.length = 0;
    for (let k = 0; k < 3; k++) { await click(arrow('right')); seen.push(carousel().dataset.world); }
    assert.deepEqual(seen, ['ares', 'luna', 'gaia'], 'right goes the other way');
    await click(arrow('left'));
    assert.equal(choose().dataset.world, 'luna');
    assert.equal(choose().textContent, 'Luna: coming soon');
    assert.equal(choose().disabled, true, 'Luna cannot be chosen');
    assert.deepEqual(views.at(-1), { space: true, target: 'luna' }, 'the stage follows the focused planet');
    await click(choose());
    assert.equal(step(), 'world', 'a disabled planet does not advance');
    await click(arrow('left'));
    assert.equal(choose().textContent, 'Ares: coming soon');
    assert.equal(choose().disabled, true);
    assert.deepEqual(views.at(-1), { space: true, target: 'ares' });
    await act(async () => { choose().focus(); });
    await key('ArrowRight');
    assert.equal(carousel().dataset.world, 'luna', 'ArrowRight turns right');
    await key('ArrowLeft'); await key('ArrowLeft');
    assert.equal(carousel().dataset.world, 'gaia', 'ArrowLeft turns left');
    assert.equal(choose().textContent, 'Choose Gaia');

    // Ready step: summary, name, colour, Play solo
    await click(choose());
    assert.equal(step(), 'ready');
    assert.deepEqual(views.at(-1), { space: true, target: 'gaia' }, 'the ready step stays in space');
    assert.equal($('[data-ui=solo-summary]').textContent, 'Tournament · 5 maps on Gaia');
    assert.equal(doc.activeElement, first(), 'focus lands on the first field');
    assert.ok(button('Play solo'));
    await click(steps().querySelector('[data-ui=menu-back]'));
    assert.equal(step(), 'world', 'Back from ready returns to the world');
    await click(steps().querySelector('[data-ui=menu-back]'));
    assert.equal(step(), 'mode', 'and then to the mode');
    assert.equal(doc.activeElement, first());

    // Casual summary, then each mode reaches the command
    const expected = [
      [['Casual'], 'standard', 'Casual · 1 map on Gaia'],
      [['Tournament', '3 maps'], 'tournament_3', 'Tournament · 3 maps on Gaia'],
      [['Tournament', '5 maps'], 'tournament_5', 'Tournament · 5 maps on Gaia'],
      [['Tournament', '7 maps'], 'tournament_7', 'Tournament · 7 maps on Gaia'],
      [['Practice', 'Whole map'], 'practice', 'Practice · whole map on Gaia'],
      [['Practice', 'One putt'], 'putt_practice', 'Practice · one putt on Gaia'],
      [['Practice', 'Putt Pong'], 'pong', 'Practice · Putt Pong on Gaia'],
    ];
    for (const [path, mode, summary] of expected) {
      for (const label of path) await click(inSteps(label));
      await click(choose());
      assert.equal($('[data-ui=solo-summary]').textContent, summary);
      const typed = steps().querySelector('input').value;
      t.commands.length = 0;
      await click(button('Play solo'));
      assert.deepEqual(t.commands, [{ type: 'play-solo', name: typed, mode, world: 'gaia' }], mode);
      for (let i = 0; i < 2; i++) await click(steps().querySelector('[data-ui=menu-back]'));
      assert.equal(step(), 'mode');
    }

    // Back from the first step leaves Solo
    assert.deepEqual(views.at(-1), { space: false, target: 'gaia' }, 'the first step brings the horizon back');
    await click(steps().querySelector('[data-ui=menu-back]'));
    assert.equal(landing.dataset.view, 'home');
    assert.equal($('[data-ui=solo-steps]'), null);
    assert.deepEqual(views.at(-1), { space: false, target: 'gaia' }, 'leaving Solo keeps the horizon');
    await t.teardown();
  });

  await scenario('custom rules (VIS-U): values shown, per-rule and full reset, draft remembered, Play solo and Host party carry the rules', async () => {
    const { DEFAULT_RULES } = await import('../src/shared/rules.js');
    dom.window.localStorage.removeItem('puttplanet.customRules');
    const t = await setup({ mountProps: { initialView: 'custom' }, inRoom: false });
    await act(async () => t.store.setLocal({ active: false, connecting: false }));
    const landing = t.within('[data-ui=landing]');
    const editor = landing.querySelector('[data-ui=custom-rules]');
    const row = id => editor.querySelector('[data-rule=' + id + ']');
    const summary = () => editor.querySelector('[data-ui=rules-changed]').textContent;
    assert.deepEqual([...editor.querySelectorAll('h3')].map(h => h.textContent), ['Match', 'Shots', 'Worlds']);
    assert.equal(editor.querySelectorAll('[data-rule]').length, 9);
    assert.equal(summary(), 'Standard rules');
    assert.equal(row('gaiaGravity').querySelector('output').textContent, '100%', 'sliders show their value');
    assert.ok(editor.querySelectorAll('[data-rule] button[aria-label^=Reset]').length === 9 && [...editor.querySelectorAll('[data-rule] button[aria-label^=Reset]')].every(b => b.tabIndex === -1), 'reset buttons stay hidden until a rule changes');
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    const slide = async (el, value) => act(async () => { setter.call(el, String(value)); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    await slide(row('lunaGravity').querySelector('input'), 60);
    assert.equal(row('lunaGravity').querySelector('output').textContent, '60%');
    assert.equal(row('lunaGravity').dataset.changed, 'true');
    await click([...row('aimWobble').querySelectorAll('[role=radio]')].find(b => b.textContent === 'Off'));
    assert.equal(row('aimWobble').querySelector('[aria-checked=true]').textContent, 'Off');
    await click(row('powerups').querySelector('[role=switch]'));
    assert.equal(row('powerups').querySelector('[role=switch]').getAttribute('aria-checked'), 'false');
    await click([...row('holeTimer').querySelectorAll('[role=radio]')].find(b => b.textContent === '5 min'));
    assert.equal(summary(), '4 rules changed');
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('puttplanet.customRules')), { ...DEFAULT_RULES, lunaGravity: 60, aimWobble: 'off', powerups: false, holeTimer: 300 }, 'the draft is remembered locally');
    // Game length: a typed entry starting at 1 Map; above 10 warns, out of range or blank is refused
    const mapsBox = row('maps').querySelector('input');
    const note = () => row('maps').querySelector('[data-ui=rule-maps-note]').textContent;
    assert.equal(mapsBox.value, '1');
    assert.equal(row('maps').querySelector('output').textContent, '1 Map');
    const unit = () => mapsBox.nextElementSibling.textContent;
    assert.equal(unit(), 'Map', 'the unit sits right after the box');
    await slide(mapsBox, '2');
    assert.equal(row('maps').querySelector('output').textContent, '2 Maps');
    assert.equal(unit(), 'Maps');
    await slide(mapsBox, '6');
    assert.equal(row('maps').querySelector('output').textContent, '6 Maps');
    assert.equal(note(), '', 'no warning up to 10 maps');
    await slide(mapsBox, '12');
    assert.equal(row('maps').querySelector('output').textContent, '12 Maps');
    assert.match(note(), /might make the game too long/, 'more than 10 maps warns');
    await slide(mapsBox, '25');
    assert.match(note(), /whole number from 1 to 20/);
    assert.equal(mapsBox.getAttribute('aria-invalid'), 'true');
    assert.equal(row('maps').querySelector('output').textContent, '12 Maps', 'an out-of-range entry is not applied');
    for (const junk of ['x', '', '0']) {
      await slide(mapsBox, junk);
      assert.equal(row('maps').querySelector('output').textContent, '12 Maps', JSON.stringify(junk) + ' is not applied');
    }
    await act(async () => { mapsBox.dispatchEvent(new dom.window.FocusEvent('blur')); mapsBox.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); });
    assert.equal(mapsBox.value, '12', 'leaving the box restores the current value');
    await click(row('maps').querySelector('button[aria-label="Reset Game Length"]'));
    assert.equal(mapsBox.value, '1', 'reset goes back to 1');
    assert.equal(row('maps').querySelector('output').textContent, '1 Map');
    assert.equal(note(), '');
    await click(row('holeTimer').querySelector('button[aria-label="Reset Time Per Hole"]'));
    assert.equal(row('holeTimer').querySelector('[aria-checked=true]').textContent, 'Course', 'per-rule reset restores the standard value');
    assert.equal(summary(), '3 rules changed');
    t.commands.length = 0;
    await click(editor.querySelector('[data-ui=rules-play-solo]'));
    const chosen = { ...DEFAULT_RULES, lunaGravity: 60, aimWobble: 'off', powerups: false };
    assert.deepEqual(t.commands, [{ type: 'play-solo', name: 'Ana', rules: chosen }]);
    await click(editor.querySelector('[data-ui=rules-host-party]'));
    assert.equal(landing.dataset.view, 'party', 'Host party continues to the Party room code');
    assert.match(t.within('[data-ui=party-custom-rules]').textContent, /Custom rules \(3 changed\)/);
    t.commands.length = 0;
    await click(button('Join room'));
    assert.deepEqual(t.commands.map(c => c.rules), [chosen], 'the room is created with the edited rules');
    await click(t.within('[data-ui=party-custom-rules] button'));
    assert.equal(landing.querySelector('[data-ui=party-custom-rules]'), null, 'Use standard drops them');
    await t.teardown();
    const again = await setup({ mountProps: { initialView: 'custom' }, inRoom: false });
    await act(async () => again.store.setLocal({ active: false, connecting: false }));
    const editor2 = again.within('[data-ui=custom-rules]');
    assert.equal(editor2.querySelector('[data-rule=lunaGravity] output').textContent, '60%', 'the draft comes back next time');
    await click(editor2.querySelector('[data-ui=rules-reset-all]'));
    assert.equal(editor2.querySelector('[data-ui=rules-changed]').textContent, 'Standard rules', 'Reset all restores every default');
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('puttplanet.customRules')), { ...DEFAULT_RULES });
    dom.window.localStorage.setItem('puttplanet.customRules', '{"shotPower":9999,"evil":true}');
    await again.teardown();
    const tampered = await setup({ mountProps: { initialView: 'custom' }, inRoom: false });
    await act(async () => tampered.store.setLocal({ active: false, connecting: false }));
    assert.equal(tampered.within('[data-ui=custom-rules] [data-ui=rules-changed]').textContent, 'Standard rules', 'a tampered draft is ignored');
    await tampered.teardown();
    dom.window.localStorage.removeItem('puttplanet.customRules');
  });

  await scenario('main menu: the planet stays up from the menu through the loading screen', async () => {
    const t = await setup();
    await act(async () => t.store.setLocal({ active: false, connecting: false }));
    assert.ok(t.within('[data-ui=landing]').querySelector('h1').textContent === 'Putt Planet', 'the big title');
    const canvas = t.within('[data-ui=planet-stage] canvas');
    assert.ok(canvas, 'the menu stands on the planet');
    await act(async () => t.store.setLocal({ connecting: true }));
    assert.ok(t.within('[data-ui=planet-stage] canvas') === canvas, 'the same canvas carries on into the loading screen: no reload');
    await t.teardown();
  });

  await scenario('reference world: every course has a site on land, in its region', async () => {
    const { REFERENCE_REGIONS } = await import('../src/shared/gaia-reference-regions.js'), { GAIA_REGIONS, REGION_COURSES } = await import('../src/shared/gaia-map.js');
    const { LAND, LAKES, MAP_WIDTH, MAP_HEIGHT } = await import('../src/shared/gaia-reference.js');
    const inside = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i] / 10, yi = r[i + 1] / 10, xj = r[j] / 10, yj = r[j + 1] / 10; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    assert.deepEqual(Object.keys(REFERENCE_REGIONS).sort(), GAIA_REGIONS.map(r => r.id).sort(), 'one placement per region');
    for (const [id, place] of Object.entries(REFERENCE_REGIONS)) {
      assert.equal(place.sites.length, REGION_COURSES[id].length, id + ': one site per course');
      for (const [x, y] of [...place.sites, place.label]) assert.ok(x > 0 && x < MAP_WIDTH && y > 0 && y < MAP_HEIGHT, id + ' inside the map');
      for (const [x, y] of place.sites) assert.ok(LAND.some(r => inside(r, x, y)) && !LAKES.some(r => inside(r, x, y)), `${id} site ${x},${y} is on land`);
      for (const [x, y] of place.sites) assert.ok(Math.hypot(x - place.label[0], y - place.label[1]) < 160, `${id} site ${x},${y} sits near its region label`);
    }
    const all = Object.values(REFERENCE_REGIONS).flatMap(p => p.sites);
    all.forEach((a, i) => all.slice(i + 1).forEach(b => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 20, 'sites are apart enough to read')));
  });

  await scenario('flat map name tags never collide, with the real courses and a crowded cluster', async () => {
    const { layoutMapLabels, boxesOverlap } = await import('../src/render/map-labels.js'), { REFERENCE_REGIONS } = await import('../src/shared/gaia-reference-regions.js');
    const { GAIA_REGIONS, REGION_COURSES } = await import('../src/shared/gaia-map.js'), { createCourseData } = await import('../src/courses/index.js');
    const names = createCourseData().definitions.map(c => c.name), k = 4096 / 1536, ky = 2048 / 730, size = (text, px) => ({ w: text.length * px * 0.72 + px, h: px * 1.5 }); // wider than Titan One, so the test is the harder case
    const regions = GAIA_REGIONS.map(r => ({ x: REFERENCE_REGIONS[r.id].label[0] * k, y: REFERENCE_REGIONS[r.id].label[1] * ky, ...size(r.name, 54) }));
    const pins = GAIA_REGIONS.flatMap(r => REGION_COURSES[r.id].map((index, n) => ({ x: REFERENCE_REGIONS[r.id].sites[n][0] * k, y: REFERENCE_REGIONS[r.id].sites[n][1] * ky, r: 35, ...size(names[index], 26) })));
    const real = layoutMapLabels({ regions, pins, width: 4096, height: 2048, gap: 12 });
    assert.equal(real.overlaps, 0, 'no caption, pin or tag touches another on the real map');
    real.regions.forEach((r, i) => assert.ok(Math.hypot(r.x - regions[i].x, r.y - regions[i].y) < 220, 'region captions stay close to where they were placed'));
    real.tags.forEach((t, i) => assert.ok(t.x - pins[i].w / 2 >= 0 && t.x + pins[i].w / 2 <= 4096, 'every tag stays on the map'));
    let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const crowd = Array.from({ length: 14 }, (_, i) => ({ x: 2000 + rand() * 260, y: 1000 + rand() * 200, r: 35, ...size('Course name ' + i, 26) }));
    const busy = layoutMapLabels({ regions: [{ x: 2100, y: 900, w: 400, h: 80 }], pins: crowd, width: 4096, height: 2048, gap: 12 });
    const pinOverlaps = crowd.some((a, i) => crowd.slice(i + 1).some(b => Math.hypot(a.x - b.x, a.y - b.y) < 70));
    const tagBoxes = busy.tags.map((t, i) => [t.x - crowd[i].w / 2, t.y - crowd[i].h / 2, crowd[i].w, crowd[i].h]);
    assert.ok(tagBoxes.every((a, i) => tagBoxes.slice(i + 1).every(b => !boxesOverlap(a, b))), 'tags in a crowded cluster still never overlap each other');
    assert.ok(busy.tags.some(t => t.leader), 'crowded tags move out and are marked for a leader line');
    assert.ok(pinOverlaps || busy.overlaps === 0, 'with separate pins, nothing overlaps at all');
  });

  await scenario('level select: world, region, course and back, with the real vote', async () => {
    const data = await import('../src/render/planet-data.js'), { GAIA_REGIONS, REGION_COURSES } = await import('../src/shared/gaia-map.js');
    assert.deepEqual(Object.values(REGION_COURSES).flat().sort((a, b) => a - b), Array.from({ length: 22 }, (_, i) => i), 'all 22 course ids appear once');
    const foot = data.gaiaRegions();
    for (const r of GAIA_REGIONS) {
      assert.ok(foot.byId[r.id].area > 40, `${r.name} has terrain`);
      for (const m of r.maps) assert.equal(foot.at(m.u, m.lat), r.id, `${m.name} lies inside the ${r.name} footprint`);
    }
    assert.equal(foot.at(0.02, 0), null, 'open sea belongs to no region');
    { // a region lights up all of its ground, however far it runs: every texel of it connected to the region's sites
      const gaia = data.gaiaPlanet(), W = data.TEX_W, n = gaia.land.length, kinds = { polar: ['alpine', 'polar'], desert: ['desert', 'savanna'], volcanic: null };
      for (const [id, allowed] of Object.entries(kinds)) {
        const ok = i => gaia.land[i] >= data.SEA && (!allowed || allowed.includes(data.BIOMES[gaia.biome[i]])), seen = new Uint8Array(n), stack = [];
        for (const m of GAIA_REGIONS.find(r => r.id === id).maps) { const i = Math.floor((0.5 - m.lat / 180) * data.TEX_H) * W + Math.floor(m.u * W); if (ok(i)) { seen[i] = 1; stack.push(i); } }
        while (stack.length) { const i = stack.pop(); for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < n && !seen[j] && ok(j)) { seen[j] = 1; stack.push(j); } }
        let inside = 0, total = 0;
        for (let i = 0; i < n; i++) if (seen[i]) { total++; if (foot.at((i % W + 0.5) / W, 90 - (Math.floor(i / W) + 0.5) / data.TEX_H * 180) === id) inside++; }
        assert.ok(total > 200 && inside / total > 0.97, `${id} lights up all its connected ground (${inside} of ${total})`);
      }
    }
    const spots = ui.spreadPins([{ x: 400, y: 300 }, { x: 410, y: 305 }, { x: 405, y: 310 }, { x: 395, y: 300 }], 1280, 720);
    spots.forEach((a, i) => spots.slice(i + 1).forEach(b => assert.ok(Math.abs(a.x - b.x) >= 170 || Math.abs(a.y - b.y) >= 60, 'pins and labels never overlap')));
    assert.ok(ui.spreadPins([{ x: 400, y: 20 }, { x: 600, y: 140 }], 1280, 720, 180).every(s => s.y >= 180), 'course tags stay below a tall header');
    let builds = 0;
    const calls = [], scene = { onFrame() {}, start() {}, step() {}, dispose() { calls.push('disposed'); }, highlight(id) { calls.push('light:' + id); }, project: () => ({ x: 300, y: 200 }), hit: () => 'desert', size: { width: 1280, height: 720 }, openRegion: async id => { calls.push('open:' + id); }, openWorld: async () => { calls.push('world'); } };
    const t = await setup({ createAtlasScene: () => { builds++; return scene; } });
    await t.send({ type: 'JOIN_ROOM', playerId: 'g1', name: 'Ben' });
    await t.send({ type: 'SET_MODE', playerId: 'host', mode: 'tournament_3' });
    await t.send({ type: 'START_VOTING', playerId: 'host' });
    const region = id => t.within(`[data-region=${id}]`), pause = () => act(async () => { await new Promise(q => setTimeout(q, 30)); });
    assert.ok(t.within('[data-ui=world-select]'), 'the atlas replaces the list');
    assert.equal(t.root.querySelectorAll('[data-region]').length, 6, 'every region reads on the world');
    assert.ok(region('tropical').disabled, 'a region with no course in this set cannot open');
    await act(async () => { region('desert').focus(); });
    assert.ok(calls.includes('light:desert'), 'keyboard focus lights the terrain');
    await act(async () => { region('desert').click(); });
    await pause();
    assert.ok(calls.includes('open:desert'));
    const built = builds, gone = calls.filter(c => c === 'disposed').length;
    const pin = t.within('[data-map="8"]');
    assert.ok(pin && pin.textContent.includes('Dune Serpent'), 'the real course, by its real id');
    await act(async () => { pin.click(); });
    assert.equal(t.within('[data-map="8"]').dataset.v, '1', 'the pin casts the real vote');
    assert.equal(t.within('[data-map="8"]').getAttribute('aria-pressed'), 'true');
    assert.match(t.within('[data-ui=map-select] p').textContent, /Voting ends in/, 'the countdown starts as with the list');
    assert.equal(builds, built, 'a vote never rebuilds the world');
    assert.ok(calls.filter(c => c === 'disposed').length === gone && !calls.includes('world'), 'and the camera stays in the region');
    await act(async () => { t.within('[data-ui=back-to-world]').click(); });
    await pause();
    assert.ok(calls.includes('world'));
    assert.equal(doc.activeElement, region('desert'), 'Back to world returns focus to the region');
    { // a fly-in that rejects must leave the world view usable, not a half-opened region
      const failing = { ...scene, openRegion: async () => { throw new Error('fly-in failed'); } }, logged = [], realError = console.error;
      const t2 = await setup({ createAtlasScene: () => failing });
      await t2.send({ type: 'JOIN_ROOM', playerId: 'g1', name: 'Ben' });
      await t2.send({ type: 'SET_MODE', playerId: 'host', mode: 'tournament_3' });
      await t2.send({ type: 'START_VOTING', playerId: 'host' });
      console.error = (...args) => logged.push(args);
      try {
        await act(async () => { t2.within('[data-region=desert]').click(); });
        await pause();
      } finally { console.error = realError; }
      assert.ok(logged.length >= 1, 'the failure is reported');
      assert.equal(t2.within('[data-ui=world-select]').dataset.view, 'world', 'the menu returns to the world view');
      assert.ok(!t2.within('[data-region=desert]').disabled, 'regions can be opened again');
      await t2.teardown();
    }
    await t.teardown();
  });

  await scenario('planet scene: climate colours, cities and traffic, reduced motion, live settings, disposal', async () => {
    const scene = await import('../src/render/planet-data.js');
    const { createPlanetScene, frameCamera, PLANET_RADIUS } = await import('../src/render/planet-scene.js');
    const models = await import('../src/render/sky-models.js');
    const THREE = await import('three');
    const { DEFAULT_DISPLAY, createDisplay } = await import('../src/shared/display.js');
    // Gaia is the owner's reference world: blue seas freezing toward the poles, the flat map's comic colours on land.
    const sea = scene.seaColour, white = c => c.every(q => q > 225), blue = c => c[2] > c[0] + 60 && c[2] > c[1];
    assert.ok(blue(sea(10, 0.3)) && blue(sea(-30, 0.1)), 'open water is blue');
    assert.ok(white(sea(88, 0.3)) && white(sea(-86, 0.3)), 'the polar seas are ice');
    const planet = scene.buildPlanet(scene.mulberry32(5));
    assert.deepEqual(planet.rgb, scene.buildPlanet(scene.mulberry32(5)).rgb, 'same seed, same planet');
    const px = i => [planet.rgb[i * 3], planet.rgb[i * 3 + 1], planet.rgb[i * 3 + 2]];
    let polar = 0, seas = 0, greens = 0, sands = 0;
    for (let x = 0; x < scene.TEX_W; x++) { if (white(px(x))) polar++; }
    for (let i = 0; i < scene.TEX_W * scene.TEX_H; i++) { const c = px(i); if (blue(c)) seas++; else if (c[1] > c[0] + 30 && c[1] > c[2] + 40) greens++; else if (c[0] > 200 && c[2] < 150 && c[0] >= c[1] - 5) sands++; }
    assert.ok(polar > scene.TEX_W * 0.9, 'the pole row is ice');
    const total = scene.TEX_W * scene.TEX_H;
    assert.ok(seas / total > 0.35 && seas / total < 0.8, 'mostly sea, like Earth');
    assert.ok(greens / total > 0.04 && sands / total > 0.01, 'forests and deserts both exist');
    // The distant worlds: textures are deterministic, detailed and distinct.
    const worlds = await import('../src/render/worlds.js');
    const ares = worlds.buildAresTexture(scene.mulberry32(2)), luna = worlds.buildLunaTexture(scene.mulberry32(2));
    assert.deepEqual(ares, worlds.buildAresTexture(scene.mulberry32(2)));
    const avg = t => { let r = 0, g = 0, b = 0; for (let k = 0; k < t.length; k += 3) { r += t[k]; g += t[k + 1]; b += t[k + 2]; } const n = t.length / 3; return [r / n, g / n, b / n]; };
    const a1 = avg(ares), l1 = avg(luna);
    assert.ok(a1[0] > a1[2] + 40, 'Ares is rust-coloured');
    assert.ok(Math.abs(l1[0] - l1[2]) < 15, 'Luna is grey');
    const row = (t, y) => { let s = 0; for (let x = 0; x < worlds.WORLD_TEX_W; x++) s += Math.min(t[(y * worlds.WORLD_TEX_W + x) * 3], t[(y * worlds.WORLD_TEX_W + x) * 3 + 2]); return s / worlds.WORLD_TEX_W; };
    assert.ok(row(ares, 2) > 225 && row(luna, 2) > 225, 'both have polar ice');
    const greenish = t => { let n = 0; for (let k = 0; k < t.length; k += 3) if (t[k + 1] > t[k] + 18) n++; return n; };
    assert.ok(greenish(ares) > 100 && greenish(luna) > 100, 'both show a hint of life');
    const spread = t => { const xs = []; for (let k = 0; k < t.length; k += 3 * 97) xs.push(t[k]); const m = xs.reduce((q, v) => q + v, 0) / xs.length; return Math.sqrt(xs.reduce((q, v) => q + (v - m) ** 2, 0) / xs.length); };
    assert.ok(spread(ares) > 15 && spread(luna) > 15, 'both have real surface detail (craters, plains), not flat colour');
    // Sites and routes: a place maps to the same texel both ways; sea routes never touch land, all the way round.
    assert.ok(planet.cities.length >= 15 && planet.cities.every(c => c.u >= 0 && c.u < 1 && Math.abs(c.lat) < 70), 'many cities, none at the poles');
    assert.ok(planet.cities.every(c => scene.landUnder(planet, scene.surfaceDir(c.u, c.lat)) >= scene.SEA), 'every city stands on land');
    const routes = scene.shipRoutes(planet, scene.mulberry32(8));
    assert.ok(routes.length >= 9, 'enough sea routes for the default fleet');
    const between = (a, b) => Math.acos(Math.min(1, a.centre.reduce((q, v, k) => q + v * b.centre[k], 0)));
    routes.forEach((a, i) => routes.slice(i + 1).forEach(b => assert.ok(between(a, b) > a.rho + b.rho, 'no two sea routes touch, so ships cannot meet')));
    for (const route of routes) for (let k = 0; k < 90; k++) assert.ok(scene.landUnder(planet, scene.circlePoint(route.centre, route.rho, k / 90 * Math.PI * 2)) < scene.SEA, 'a ship never sails onto land');
    assert.ok(planet.towns.length >= 20 && planet.villages.length >= 30 && planet.ports.length >= 6 && planet.plants.length >= 5000, 'a lived-in world: towns, villages, ports and dense foliage');
    assert.ok(planet.lighthouses.length >= 1 && planet.lighthouses.length <= 2, 'one or two lighthouses');
    // The world map: six regions, one named site per course; the fixed planet has each site on land in its region's biome, so globe and map agree.
    const { GAIA_REGIONS, REGION_COURSES } = await import('../src/shared/gaia-map.js');
    assert.equal(GAIA_REGIONS.length, 6);
    assert.ok(GAIA_REGIONS.every(r => r.maps.length === REGION_COURSES[r.id].length), 'one site per course in every region');
    assert.equal(new Set(GAIA_REGIONS.flatMap(r => r.maps.map(m => m.name))).size, 22, 'every site has its own name');
    assert.equal(new Set(GAIA_REGIONS.flatMap(r => r.maps.map(m => m.id))).size, 22, 'every site has its own id');
    const gaia = scene.gaiaPlanet();
    assert.equal(gaia, scene.gaiaPlanet(), 'Gaia is built once and kept');
    // The globe's land is the reference coast: the shoreline of the field runs along it, lakes included.
    const { REFERENCE_COAST, REFERENCE_LAKES } = await import('../src/shared/gaia-reference-regions.js');
    assert.ok(REFERENCE_COAST.length >= 7 && [...REFERENCE_COAST, ...REFERENCE_LAKES].every(r => r.length >= 3 && r.every(([u]) => u > 0 && u < 1)), 'closed rings that stay off the seam');
    const texelOf = ([u, lat]) => Math.min(scene.TEX_H - 1, Math.floor((0.5 - lat / 180) * scene.TEX_H)) * scene.TEX_W + Math.floor(u * scene.TEX_W);
    const off = REFERENCE_COAST.flat().map(p => Math.abs(gaia.land[texelOf(p)] - scene.SEA));
    assert.ok(off.filter(v => v < 0.03).length / off.length > 0.98, 'map and globe share one coast');
    const smallest = (() => { const seen = new Uint8Array(gaia.biome.length), W2 = scene.TEX_W; let least = Infinity; for (let s = 0; s < seen.length; s++) { if (seen[s] || gaia.land[s] < scene.SEA) continue; const stack = [s]; seen[s] = 1; let size = 0, touches = false; while (stack.length) { const i = stack.pop(); size++; for (const j of [i - 1, i + 1, i - W2, i + W2]) { if (j < 0 || j >= seen.length || gaia.land[j] < scene.SEA) continue; if (gaia.biome[j] !== gaia.biome[s]) touches = true; else if (!seen[j]) { seen[j] = 1; stack.push(j); } } } if (touches && scene.BIOMES[gaia.biome[s]] !== 'volcanic') least = Math.min(least, size); } return least; })();
    assert.ok(smallest >= 4, `no specks of stray biome (smallest patch ${smallest} texels)`);
    const fits = { polar: ['polar', 'alpine', 'tundra'], temperate: ['temperate'], desert: ['desert', 'savanna'], tropical: ['tropical'], wetland: ['wetland'], volcanic: null };
    const biomeOf = (p, m) => { const row = Math.min(scene.TEX_H - 1, Math.floor((0.5 - m.lat / 180) * scene.TEX_H)), col = Math.floor((((m.u % 1) + 1) % 1) * scene.TEX_W) % scene.TEX_W; return scene.BIOMES[p.biome[row * scene.TEX_W + col]]; };
    for (const r of GAIA_REGIONS) for (const m of r.maps) {
      assert.ok(scene.landUnder(gaia, scene.surfaceDir(m.u, m.lat)) >= scene.SEA, `${m.name} is on land`);
      if (fits[r.id]) assert.ok(fits[r.id].includes(biomeOf(gaia, m)), `${m.name} lies in ${r.biome}, found ${biomeOf(gaia, m)}`);
    }
    // Biomes: every one in the vision exists, and the globe's biomes are the reference's, area for area.
    const shares = {};
    for (let i = 0; i < planet.biome.length; i++) if (planet.land[i] >= scene.SEA) { const b = scene.BIOMES[planet.biome[i]]; shares[b] = (shares[b] || 0) + 1; }
    const landTexels = Object.values(shares).reduce((q, v) => q + v, 0);
    for (const b of ['polar', 'alpine', 'desert', 'tropical', 'temperate', 'wetland', 'volcanic']) assert.ok(shares[b] > 0, `Gaia has ${b} land`);
    const green = ['temperate', 'tropical', 'grassland', 'boreal', 'savanna', 'wetland', 'mediterranean'].reduce((q, b) => q + (shares[b] || 0), 0), iceFree = landTexels - (shares.polar || 0);
    assert.ok(green / iceFree > 0.55 && (shares.desert || 0) / landTexels < 0.15, `ice-free land is mostly green (${Math.round(green / iceFree * 100)}%)`);
    const reference = await import('../src/shared/gaia-reference.js'), named = [null, 'desert', 'tundra', 'savanna', 'grassland', 'tropical', 'temperate', 'tropical', 'temperate', 'boreal', 'tundra', 'polar', 'wetland'];
    const within = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i] / 10, yi = r[i + 1] / 10, xj = r[j] / 10, yj = r[j + 1] / 10; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    let sampled = 0, agree = 0;
    for (let i = 0; i < gaia.land.length; i += 37) {
      const b = scene.BIOMES[gaia.biome[i]];
      if (gaia.land[i] < scene.SEA + 0.02 || b === 'alpine' || b === 'volcanic') continue;
      const x = ((i % scene.TEX_W) + 0.5) / scene.TEX_W * reference.MAP_WIDTH, y = (Math.floor(i / scene.TEX_W) + 0.5) / scene.TEX_H * reference.MAP_HEIGHT;
      const source = reference.BIOMES.find(s => s.rings.some(r => within(r, x, y)));
      if (!source) continue;
      sampled++; if (named[source.id] === b) agree++;
    }
    assert.ok(sampled > 500 && agree / sampled > 0.95, `the globe's biomes are the reference's (${Math.round(agree / sampled * 100)}% of ${sampled} samples)`);
    assert.ok(planet.cities.every(c => !['polar', 'alpine', 'desert', 'volcanic', 'wetland', 'tundra'].includes(c.biome)), 'no cities on ice, peaks, lava or in the desert');
    // People: the reference's capitals are the cities, biggest first, and hardly anyone lives in desert, tundra, peaks or ice.
    const earth = gaia;
    assert.ok([...earth.towns, ...earth.villages].filter(c => ['desert', 'tundra', 'alpine', 'polar'].includes(c.biome)).length < 8, 'hardly anyone lives in desert, tundra, peaks or ice');
    assert.ok(earth.cities[0].tier > earth.cities[earth.cities.length - 1].tier, 'a few giant cities, many small ones');
    assert.ok(new Set(earth.cities.map(c => c.culture)).size >= 6, 'cities of many cultures');
    const texel = p => { const row = Math.min(scene.TEX_H - 1, Math.floor((0.5 - p.lat / 180) * scene.TEX_H)), col = Math.floor(p.u * scene.TEX_W) % scene.TEX_W; return scene.BIOMES[planet.biome[row * scene.TEX_W + col]]; };
    const homes = { palm: ['tropical'], jungle: ['tropical'], cactus: ['desert'], mangrove: ['wetland'], pine: ['boreal', 'temperate'], snowpine: ['boreal'], baobab: ['savanna'] };
    const strays = planet.plants.filter(p => homes[p.kind] && !homes[p.kind].includes(texel(p))).length;
    assert.ok(strays / planet.plants.length < 0.02, 'plants grow in their own biomes');
    assert.ok(new Set(planet.plants.map(p => p.kind)).size >= 9, 'many kinds of plant');
    assert.ok([...planet.towns, ...planet.villages].every(c => scene.landUnder(planet, scene.surfaceDir(c.u, c.lat)) >= scene.SEA), 'settlements stand on land');
    for (const port of planet.ports) {
      assert.ok(scene.landUnder(planet, scene.surfaceDir(port.u, port.lat)) >= scene.SEA, 'a port stands on the shore');
      assert.ok(scene.landUnder(planet, port.sea) < scene.SEA, 'and its pier faces the sea');
    }
    // Models: a plane's nose is at +x; a ship's hull crosses the waterline; a tower is much taller than it is wide.
    const box = g => { g.computeBoundingBox(); return g.boundingBox; };
    const jet = box(models.makePlane(THREE)), hull = box(models.makeShip(THREE));
    assert.ok(jet.max.x > 2.5 && jet.min.x < -3 && jet.max.y > 1.2, 'a jet, nose forward, with a tail fin');
    assert.ok(hull.min.y < -0.3 && hull.max.y > 1, 'a ship is partly under the water line');
    for (const k of models.SHIP_KINDS) assert.ok(box(models.makeShip(THREE, k)).min.y < 0, `the ${k} sits in the water`);
    const size = g => g.attributes.position.count;
    const peak = box(models.makePeak(THREE, scene.mulberry32(2), 0)), cone = box(models.makeVolcano(THREE, scene.mulberry32(2)));
    assert.ok(Math.abs(peak.max.y - 1) < 0.05 && peak.max.x - peak.min.x > 1.2, 'a massif is one unit tall and wider than a spike');
    assert.ok(Math.abs(cone.max.y - 1) < 0.05 && cone.max.x > 0.9, 'a volcano is a broad cone');
    const footRadii = g => { const p = g.attributes.position, r = []; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.02) r.push(Math.hypot(p.getX(i), p.getZ(i))); return r; };
    for (const [name, g] of [['volcano', models.makeVolcano(THREE, scene.mulberry32(3))], ['mountain', models.makePeak(THREE, scene.mulberry32(3), 0)]]) {
      const r = footRadii(g).filter(v => v > 0.3); // the main cone's foot, not the shoulders' centres
      assert.ok(Math.max(...r) / Math.min(...r) > 1.3, `a ${name}'s foot is rugged, not a circle`);
      assert.ok(Math.max(...footRadii(g)) <= models.MODEL_REACH[name === 'volcano' ? 'volcano' : 'peak'] + 0.05, `a ${name} reaches no further than MODEL_REACH says`);
    }
    // Every volcano and mountain has room on its own land: a circle of its room stays ashore all the way round.
    for (const site of [...gaia.volcanoes, ...gaia.peaks]) {
      const deg = site.room * 180 / scene.TEX_H * 0.9;
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, lat = site.lat + Math.sin(a) * deg, u = site.u + Math.cos(a) * deg / 360; assert.ok(scene.landUnder(gaia, scene.surfaceDir(u, lat)) >= scene.SEA, 'a model sized to its room stays on its island'); }
    }
    assert.ok(gaia.volcanoes.every(v => v.room * 180 / scene.TEX_H > 3), 'each volcano stands well inland');
    const { BASALT_TEXELS, basaltShape } = await import('../src/shared/gaia-reference-regions.js');
    gaia.volcanoes.forEach((v, k) => { const widest = Math.max(...Array.from({ length: 72 }, (_, a) => basaltShape(k, a / 72 * Math.PI * 2))); assert.ok(BASALT_TEXELS[k] * widest / Math.max(0.3, Math.cos(v.lat * Math.PI / 180)) <= v.room, `volcano ${k}'s basalt stays inside its island`); });
    assert.equal(new Set(models.PLANE_KINDS.map(k => size(models.makePlane(THREE, k)))).size, models.PLANE_KINDS.length, 'each plane is its own design');
    assert.equal(new Set(models.PLANT_KINDS.map(k => { const g = models.makePlant(THREE, k), c = g.attributes.color; return [size(g), c.getX(c.count - 1).toFixed(3), c.getY(c.count - 1).toFixed(3)].join(); })).size, models.PLANT_KINDS.length, 'each plant is its own design');
    assert.notEqual(size(models.makeTown(THREE, scene.mulberry32(1), 'desert')), size(models.makeTown(THREE, scene.mulberry32(1), 'oldworld')), 'towns differ by culture');
    const skyline = culture => models.makeCity(THREE, scene.mulberry32(6), [120, 140, 100], culture);
    assert.equal(new Set(['oldworld', 'mediterranean', 'northern', 'metro', 'desert', 'palace', 'eastern', 'canal', 'carnival'].map(k => size(skyline(k)))).size, 9, 'every culture builds its own skyline');
    const city = models.makeCity(THREE, scene.mulberry32(4));
    assert.ok(city.userData.top > 12 && city.userData.top <= models.CITY_TOP + 3 && box(city).max.x - box(city).min.x < 20, 'cities are tall for their width');
    assert.deepEqual([...city.attributes.position.array.slice(0, 30)], [...models.makeCity(THREE, scene.mulberry32(4)).attributes.position.array.slice(0, 30)], 'a city is the same for the same seed');
    const puff = models.makeCumulus(THREE, scene.mulberry32(4), { puffs: 8, detail: 1 });
    assert.ok(box(puff).min.y > -0.3 && puff.attributes.soft.count === puff.attributes.position.count, 'clouds have flat bases and a whole-cloud normal for volume');
    // Camera framing: the limb sits where horizonHeight asks.
    const limb = (w, h, height) => {
      const { y, z } = frameCamera(w, h, height), angle = Math.asin(PLANET_RADIUS / Math.hypot(y, z)) - Math.atan2(y, z);
      return Math.tan(angle) / Math.tan(16 * Math.PI / 180);
    };
    assert.ok(Math.abs(limb(1280, 720, 0.48) - 0.04) < 1e-6 && Math.abs(limb(800, 800, 0.7) + 0.4) < 1e-6, 'the limb lands on the asked height');
    // Running scene, on a real scene graph with a stand-in renderer.
    const make = (display, reducedMotion = false) => {
      const sd = new JSDOM('<canvas></canvas>', { pretendToBeVisual: true });
      sd.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
      const canvas = sd.window.document.querySelector('canvas');
      let frames = 0;
      const createWebGLRenderer = () => ({ render() { frames++; }, setPixelRatio() {}, getPixelRatio: () => 1, setSize() {}, setClearColor() {}, dispose() {}, capabilities: { getMaxAnisotropy: () => 1 } });
      return { sd, frames: () => frames, scene: createPlanetScene({ THREE, canvas, display, random: scene.mulberry32(3), planet, reducedMotion, win: sd.window, createWebGLRenderer }) };
    };
    const a = make(createDisplay({ loading: { spinSpeed: 0, planes: 3, boats: 4, satellites: 2 } })); // ground held still, so a ship's motion is its own
    a.scene.start();
    for (const kind of ['planes', 'ships']) { // nose first, always: the body moves the way it points, and keeps doing so all the way round
      for (let lap = 0; lap < 4; lap++) {
        const before = a.scene.bodies(kind);
        a.scene.step(0.1);
        a.scene.bodies(kind).forEach((now, i) => {
          const move = now.position.map((q, k) => q - before[i].position[k]);
          assert.ok(move.reduce((q, v, k) => q + v * now.forward[k], 0) > 0, `${kind} travel nose first`);
          const radial = now.position.map(q => q / Math.hypot(...now.position));
          assert.ok(radial.reduce((q, v, k) => q + v * now.up[k], 0) > 0.99, `${kind} stay upright on the sphere`);
        });
      }
      for (let k = 0; k < 400; k++) a.scene.step(0.1);
    }
    for (const ship of a.scene.bodies('ships')) assert.ok(Math.abs(Math.hypot(...ship.position) - PLANET_RADIUS) < 1e-6, 'ships sit at sea level, hull in the water');
    for (const plane of a.scene.bodies('planes')) assert.ok(Math.hypot(...plane.position) > PLANET_RADIUS + 20, 'planes fly above the ground and the clouds');
    assert.deepEqual(a.scene.traffic, { planes: 3, boats: 4, satellites: 2 }, 'traffic follows the settings');
    const full = make(createDisplay({ loading: { planes: 12, satellites: 8 } }));
    for (let s = 0; s < 120; s++) { // even at the maximum, a long watch never brings two flyers near each other
      full.scene.step(0.5);
      for (const kind of ['planes', 'satellites']) {
        const list = full.scene.bodies(kind);
        list.forEach((p, i) => list.slice(i + 1).forEach(q => assert.ok(Math.hypot(...p.position.map((v, k) => v - q.position[k])) > 8, `${kind} keep well apart`)));
      }
    }
    const alt = kind => full.scene.bodies(kind).map(b => Math.hypot(...b.position));
    assert.ok(Math.min(...alt('planes')) > PLANET_RADIUS + 23 && Math.min(...alt('satellites')) > PLANET_RADIUS + 40, 'each has its own layer, above the clouds');
    full.scene.dispose();
    assert.ok(a.frames() > 400, 'each step draws');
    assert.ok(a.scene.stats.places.ports === planet.ports.length && a.scene.stats.places.turbines > 3 && a.scene.stats.places.balloons > 3 && a.scene.stats.places.volcanoes >= 2 && a.scene.stats.places.flags === 22, 'the living world is in the scene');
    // The size audit, measured from the real models: a sensible order from trees up.
    const sz = a.scene.sizes;
    assert.ok(sz.tree < sz.house * 1.3 && sz.house < sz.mill && sz.mill < sz.lighthouse + 1 && sz.lighthouse < sz.city && sz.city <= sz.peak, `trees < houses < mills < lighthouses < cities <= mountains (${JSON.stringify(sz)})`);
    assert.ok(sz.city < sz.peakMedian && sz.city > sz.peakMedian * 0.6, `the tallest city stands below a typical mountain, but not far below (${sz.city.toFixed(1)} against ${sz.peakMedian.toFixed(1)})`);
    assert.ok(sz.ship < sz.city && sz.plane < 7 && sz.balloon < 5 && sz.city < 16, 'nothing dwarfs the planet');
    a.scene.dispose();
    const fresh = make(createDisplay({ loading: { spinSpeed: 10 } }));
    fresh.scene.start();
    fresh.scene.step(0);
    const eye = fresh.scene.cameraPosition, cloudsBefore = fresh.scene.deck, gap = cloud => Math.hypot(...cloud.map((q, k) => q - eye[k]));
    for (let i = 0; i < 10; i++) fresh.scene.step(0.1); // 1 s
    assert.ok(Math.abs(fresh.scene.spin - 10) < 1e-6, 'spins at spinSpeed degrees per second');
    assert.deepEqual(fresh.scene.cameraPosition, eye, 'the camera stays put');
    const orbit = fresh.scene.deck;
    orbit.forEach((cloud, i) => { // each cloud moves along its circle round the globe: same height, no rush at the lens
      assert.ok(Math.abs(Math.hypot(...cloud) - Math.hypot(...cloudsBefore[i])) < 1e-6, 'clouds keep their height as they circle');
      assert.ok(gap(cloud) > 60, 'and never come close to the camera');
    });
    assert.ok(orbit.some((cloud, i) => Math.hypot(...cloud.map((q, k) => q - cloudsBefore[i][k])) > 1), 'clouds move');
    let streaks = 0;
    for (let i = 0; i < 6000; i++) fresh.scene.step(0.1); // 10 minutes
    streaks = fresh.scene.stats.shootingStars;
    assert.ok(streaks >= 3 && streaks <= 20, `shooting stars are rare but real (${streaks} in 10 minutes)`);
    fresh.scene.dispose();
    const none = make(createDisplay({ loading: { spinSpeed: 0, planes: 0, boats: 0, satellites: 0 } }));
    none.scene.start();
    for (let i = 0; i < 20; i++) none.scene.step(0.1);
    assert.equal(none.scene.spin, 0, 'spinSpeed 0 holds the planet still');
    assert.deepEqual(none.scene.traffic, { planes: 0, boats: 0, satellites: 0 }, '0 hides all traffic');
    none.scene.dispose();
    const still = make(DEFAULT_DISPLAY, true);
    still.scene.start();
    const parked = still.scene.bodies('planes')[0].position;
    for (let i = 0; i < 600; i++) still.scene.step(0.1);
    assert.equal(still.scene.spin, 0, 'reduced motion: planet does not turn');
    assert.deepEqual(still.scene.bodies('planes')[0].position, parked, 'and nothing flies');
    assert.equal(still.scene.stats.shootingStars, 0, 'and no shooting stars');
    still.scene.dispose();
    const noGl = createPlanetScene({ THREE, canvas: make(DEFAULT_DISPLAY).sd.window.document.querySelector('canvas'), display: DEFAULT_DISPLAY, random: scene.mulberry32(3), planet, createWebGLRenderer: () => { throw new Error('no WebGL'); } });
    noGl.step(0.1);
    noGl.dispose();
  });

  // ------------------------------------------------------------------ Part B: flows through the real session
  await scenario('loading screen: shown with a tip only while connecting; tips are short, unique and rotate in range', async () => {
    const t = await setup();
    await act(async () => t.store.setLocal({ active: false, connecting: false }));
    assert.equal(t.within('[data-ui=loading]'), null, 'nothing to load, no loading screen');
    await act(async () => t.store.setLocal({ connecting: true }));
    const loading = t.within('[data-ui=loading]');
    assert.ok(loading && shown(loading));
    assert.equal(loading.getAttribute('role'), 'status');
    const tip = loading.querySelector('[data-ui=loading-tip]').textContent.replace(/^TIP\s*/, '');
    assert.ok(ui.TIPS.includes(tip), 'shows one of the tips');
    await act(async () => t.store.setLocal({ connecting: false }));
    await waitGone(t);
    await act(async () => t.store.setLocal({ connecting: true }));
    await act(async () => t.store.setLocal({ connecting: false, connectError: 'nope' }));
    assert.equal(t.within('[data-ui=loading]'), null, 'a failed connection closes the screen at once');
    assert.ok(ui.TIPS.length >= 8 && new Set(ui.TIPS).size === ui.TIPS.length, 'enough distinct tips');
    assert.ok(ui.TIPS.every(x => typeof x === 'string' && x.length > 20 && x.length <= 110), 'tips are short text');
    for (const [start, step] of [[0, 0], [3, 100], [13, 1], [0, -1]]) assert.ok(ui.tipAt(start, step) >= 0 && ui.tipAt(start, step) < ui.TIPS.length);
    assert.equal(ui.tipAt(0, ui.TIPS.length), 0, 'wraps around');
    await t.teardown();
  });

  await scenario('landing: the style picker lists the cosmetics catalog and dispatches validated ids', async () => {
    const t = await setup();
    await act(async () => t.store.setLocal({ active: false }));
    await click(t.within('[data-menu=settings]'));
    const selects = [...t.within('[data-ui=landing]').querySelectorAll('[data-ui=cosmetics] select')];
    assert.equal(selects.length, 3, 'ball, trail and celebration');
    assert.deepEqual(selects.map(s => s.value), ['classic', 'classic', 'confetti'], 'defaults selected');
    assert.ok(selects.every(s => s.options.length >= 3));
    t.commands.length = 0;
    await act(async () => { selects[1].value = 'rainbow'; selects[1].dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    assert.deepEqual(t.commands, [{ type: 'set-cosmetic', kind: 'trail', id: 'rainbow' }]);
    await act(async () => t.store.setLocal({ cosmetics: { ball: 'ember', trail: 'rainbow', celebration: 'gold' } }));
    assert.deepEqual([...t.within('[data-ui=landing]').querySelectorAll('[data-ui=cosmetics] select')].map(s => s.value), ['ember', 'rainbow', 'gold'], 'the view follows the stored choice');
    await t.teardown();
  });

  await scenario('copy: map and power-up counts come from the course data and power-up catalog; no engine-roadmap text', async () => {
    const { POWERUP_CATALOG } = await import('../src/gameplay/catalog.js');
    const t = await setup();
    const maps = createCourseData().catalog.length;
    const boxPowerups = POWERUP_CATALOG.filter(e => e.weight > 0).length; // retired entries are absent from the catalog
    assert.ok(maps > 20 && boxPowerups > 5, 'sanity: not the old hard-coded numbers');
    assert.equal(t.within('[data-ui=landing] h1').textContent, 'Putt Planet', 'the start screen shows the title, with no hard-coded counts');
    const text = t.root.textContent;
    assert.ok(text.includes(maps + ' original course layouts'), 'help map count');
    assert.ok(text.includes(boxPowerups + ' collectible power-ups'), 'help power-up count');
    for (const stale of ['Future engine version', 'Godot', 'Unity', 'Unreal', 'Putt_Pals_Architecture', '20 MAPS', 'Twenty original', 'five collectible']) assert.ok(!text.includes(stale), 'removed: ' + stale);
    await t.teardown();
  });

  await scenario('landing: join needs a room code, both buttons dispatch, connecting disables them; join validation matches legacy', async () => {
    const t = await setup();
    await act(async () => t.store.setLocal({ active: false }));
    const landing = t.within('[data-ui=landing]');
    assert.ok(shown(landing));
    await click(landing.querySelector('[data-menu=party]'));
    const [nameInput, codeInput] = landing.querySelectorAll('input');
    assert.equal(nameInput.maxLength, 14); assert.equal(codeInput.maxLength, 12);
    const join = [...landing.querySelectorAll('button')].find(b => b.textContent === 'Join room');
    assert.equal(join.disabled, false, 'prefilled room code enables Join');
    const setValue = async (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
      await act(async () => { setter.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    };
    await setValue(codeInput, '   ');
    assert.equal(join.disabled, true, 'blank code disables Join');
    await setValue(codeInput, 'Fun-Room!');
    await setValue(nameInput, '  Zed  ');
    t.commands.length = 0;
    await click(join);
    await click(landing.querySelector('[data-ui=menu-back]'));
    await click(landing.querySelector('[data-menu=solo]'));
    await click([...landing.querySelectorAll('button')].find(b => b.textContent.startsWith('Casual')));
    await click(landing.querySelector('[data-ui=world-choose]'));
    assert.equal(landing.querySelector('input').value, '  Zed  ', 'the name carries from Party to Solo');
    const solo = [...landing.querySelectorAll('button')].find(b => b.textContent === 'Play solo');
    await click(solo);
    assert.deepEqual(t.commands, [{ type: 'join', name: '  Zed  ', roomCode: 'Fun-Room!', rules: null }, { type: 'play-solo', name: '  Zed  ', mode: 'standard', world: 'gaia' }], 'Party from the home menu creates rooms with standard rules');
    await act(async () => t.store.setLocal({ connecting: true }));
    assert.equal(solo.disabled, true);
    assert.deepEqual(ui.parseJoinRequest({ multi: true, name: '  Zed  ', roomCode: 'Fun-Room!' }), { ok: true, multi: true, name: 'Zed', roomCode: 'funroom' });
    assert.deepEqual(ui.parseJoinRequest({ multi: true, roomCode: '!!' }), { ok: false, message: 'Enter a room code.' });
    assert.equal(ui.parseJoinRequest({ multi: false, name: '' }).name, 'Player');
    assert.equal(ui.initialRoomCode('#room=AB-cd9'), 'abcd9');
    assert.equal(ui.parseJoinRequest({ multi: true, roomCode: 'abcdefghijklmnop' }).roomCode, 'abcdefghijkl', 'room codes keep 12 characters');
    assert.equal(ui.sanitizeName('abcdefghijklmnopq'), 'abcdefghijklmn', 'names keep 14 characters');
    assert.equal(ui.initialRoomCode('', () => 0.3), 'kkkkkkkk');
    await t.teardown();
  });

  await scenario('lobby: roster, host-only controls, solo-only modes disable for two players, Start sends SET_MODE then START_VOTING', async () => {
    const t = await setup();
    const lobby = t.within('[data-ui=room-lobby]');
    assert.ok(shown(lobby));
    assert.equal(lobby.querySelector('p').textContent, 'Room ABCD · 1 player · You are the host');
    assert.equal(lobby.querySelector('.' + [...lobby.querySelector('p + div').children[0].classList][0]).textContent, 'Ana (you)Joined');
    const select = lobby.querySelector('select');
    const setMode = async v => { await act(async () => { select.value = v; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); };
    await setMode('practice');
    assert.equal(select.value, 'practice');
    await t.send({ type: 'JOIN_ROOM', playerId: 'g1', name: 'Ben' });
    assert.equal(lobby.querySelector('p').textContent, 'Room ABCD · 2 players · You are the host');
    assert.equal(select.value, 'standard', 'a second player resets a solo-only mode');
    assert.deepEqual([...select.options].filter(o => o.disabled).map(o => o.value), ['practice', 'putt_practice']);
    assert.ok(button('Copy invite'));
    // Ball colour picker (#161): the room's colours, taken ones disabled with the holder's name, picks sent as a command.
    {
      const picker = lobby.querySelector('[data-ui=color-picker]');
      assert.ok(picker, 'the lobby shows a colour picker');
      const swatches = [...picker.querySelectorAll('button')];
      assert.equal(swatches.length, 30, 'one swatch per palette colour');
      const players = t.session.getSnapshot().players;
      assert.notEqual(players.host.color, players.g1.color, 'room colours are unique');
      assert.equal(swatches[players.host.color].getAttribute('aria-checked'), 'true', 'my colour is marked selected');
      assert.equal(swatches[players.g1.color].disabled, true, "another player's colour is unavailable");
      assert.match(swatches[players.g1.color].getAttribute('aria-label'), /taken by Ben/);
      assert.equal(swatches.filter(b => b.disabled).length, 1, 'only colours held by other players are disabled');
      const pick = swatches.findIndex((b, i) => !b.disabled && i !== players.host.color);
      t.commands.length = 0;
      await click(swatches[pick]);
      assert.deepEqual(t.commands, [{ type: ui.UiCommands.SET_COLOR, color: pick }], 'clicking a free swatch asks for that colour');
      await click(swatches[players.g1.color]);
      assert.equal(t.commands.length, 1, 'a taken swatch sends nothing');
    }
    await setMode('tournament_3');
    t.commands.length = 0;
    await click(button('Start Game'));
    assert.deepEqual(t.commands.map(c => c.event), [{ type: 'SET_MODE', mode: 'tournament_3' }, { type: 'START_VOTING' }]);
    assert.equal(t.session.getSnapshot().phase, 'select');
    t.commands.length = 0;
    await click(button('Leave room'));
    assert.deepEqual(t.commands, [{ type: 'leave' }], 'Leave room on the voting screen');
    await t.teardown();
    // Guest view: no mode choice, no Start; solo: no invite.
    const g = await setup({ localId: 'host', isHost: false });
    assert.equal(g.within('[data-ui=room-lobby] label').hidden, true);
    assert.equal(button('Start Game'), undefined);
    assert.equal(g.within('[data-ui=room-lobby] p:nth-of-type(2)').textContent, 'The host will pick the mode and start map voting.');
    await act(async () => g.store.setLocal({ roomCode: '' }));
    assert.equal(button('Copy invite'), undefined);
    assert.equal(g.within('[data-ui=room-lobby] p').textContent, 'Solo practice');
    await g.teardown();
  });

  await scenario('lobby: the No power-ups box (host only, not for practice) is sent with Start only when it changes, and the status says so', async () => {
    const t = await setup();
    const lobby = t.within('[data-ui=room-lobby]');
    const box = lobby.querySelector('[data-ui=no-powerups]');
    assert.equal(box.checked, false, 'power-ups are on by default');
    t.commands.length = 0;
    await click(button('Start Game'));
    assert.deepEqual(t.commands.map(c => c.event.type), ['SET_MODE', 'START_VOTING'], 'unchanged: no extra command');
    await t.teardown();
    const u = await setup();
    const check = u.within('[data-ui=room-lobby]').querySelector('[data-ui=no-powerups]');
    await act(async () => { check.click(); });
    assert.equal(check.checked, true);
    u.commands.length = 0;
    await click(button('Start Game'));
    assert.deepEqual(u.commands.map(c => c.event), [{ type: 'SET_MODE', mode: 'standard' }, { type: 'SET_POWERUPS', enabled: false }, { type: 'START_VOTING' }]);
    await u.teardown();
    const p = await setup();
    await act(async () => { p.within('[data-ui=room-lobby]').querySelector('[data-ui=no-powerups]').click(); });
    const sel = p.within('[data-ui=room-lobby]').querySelector('select');
    await act(async () => { sel.value = 'practice'; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    assert.equal(p.within('[data-ui=room-lobby]').querySelector('[data-ui=no-powerups]').closest('label').hidden, true, 'practice is solo and never has the box');
    p.commands.length = 0;
    await click(button('Start Game'));
    assert.deepEqual(p.commands.map(c => c.event.type), ['SET_MODE', 'START_VOTING'], 'practice keeps power-ups on');
    await p.teardown();
    const g = await setup({ localId: 'host', isHost: false });
    assert.equal(g.within('[data-ui=room-lobby]').querySelector('[data-ui=no-powerups]').closest('label').hidden, true, 'guests do not see it');
    await g.teardown();
  });

  await scenario('tournament: voting countdown, votes, start countdown, putt banners, HUD, hole in one, map results and the champion', async () => {
    const t = await setup();
    await t.send({ type: 'JOIN_ROOM', playerId: 'g1', name: 'Ben' });
    await t.send({ type: 'SET_MODE', playerId: 'host', mode: 'tournament_3' });
    await t.send({ type: 'START_VOTING', playerId: 'host' });
    const status = () => t.within('[data-ui=map-select] p').textContent;
    assert.equal(status(), 'Map 1/3 · Vote for a map. The first vote starts a 15s countdown.');
    const cards = [...t.within('[data-ui=map-select]').querySelectorAll('button[data-v]')];
    assert.deepEqual(cards.map(c => c.querySelector('strong').textContent), ['01 · Switchback Garden', '02 · Dune Serpent', '03 · Frost Hollow', '04 · Slime Springs', '05 · Cyclone Ring', '06 · Grand Finale']);
    assert.equal(cards[1].querySelectorAll('svg rect').length > 0, true, 'course preview drawn as SVG');
    await click(cards[1]);
    assert.equal(cards[1].dataset.v, '1'); assert.equal(cards[1].getAttribute('aria-pressed'), 'true');
    assert.equal(status(), 'Map 1/3 · Voting ends in 15s · 1/2 voted');
    await t.step(5200);
    assert.equal(status(), 'Map 1/3 · Voting ends in 10s · 1/2 voted');
    await t.send({ type: 'CAST_VOTE', playerId: 'g1', mapIndex: 8 });
    assert.equal(t.session.getSnapshot().phase, 'play');
    assert.ok(shown(t.within('[data-ui=room-lobby]')), 'countdown shows on the lobby card');
    assert.equal(t.within('[data-ui=room-lobby] p:nth-of-type(2)').textContent, 'Dune Serpent · putt 1/6 starts in 3…');
    await act(async () => t.store.setLocal({ mode: 'play', strokes: 0 }));
    await t.step(2600);
    assert.ok(shown(t.within('[data-ui=game]')));
    assert.equal(t.within('[data-ui=hud-info]').textContent, 'Dune Serpent · PUTT 1/6 · PAR 2 · STROKES 0 · 2:30');
    // The info pill turns red in the last 10 seconds of play (legacy #info.warn), not for spectators.
    const info = t.within('[data-ui=hud-info]');
    const baseClass = info.className;
    const start = t.session.getSnapshot().roundStartTime;
    const at = async ms => { await act(async () => t.store.tick(start + ms)); };
    await at(150000 - 10001);
    assert.equal(info.className, baseClass, '11 s left: normal');
    await at(150000 - 10000);
    assert.notEqual(info.className, baseClass, '10 s left: warning');
    assert.match(info.textContent, /0:10$/);
    await act(async () => t.store.setLocal({ mode: 'spectator' }));
    assert.equal(info.className, baseClass, 'spectators get no warning');
    assert.match(info.textContent, /SPECTATING$/);
    await act(async () => { t.store.setLocal({ mode: 'play' }); t.store.tick(t.clock.now()); });
    const banner = () => [t.within('[data-ui=banner]').textContent, t.within('[data-ui=banner]').className.includes('_show_')];
    assert.deepEqual(banner(), ['PUTT 1 / 6DUNE SERPENT', true]);
    await t.step(1900);
    assert.deepEqual(banner(), ['PUTT 1 / 6DUNE SERPENT', false], 'banner fades but keeps its text');
    // Six putts: Ben holes in one on the first putt.
    for (let k = 0; k < 6; k++) {
      const s = t.session.getSnapshot();
      await act(async () => t.store.setLocal({ mode: 'play', strokes: 2 }));
      await t.send({ type: 'REPORT_SCORE', playerId: 'g1', roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: k === 0 ? 1 : 3 });
      if (k === 0) {
        // Queued behind the faded putt banner's 350 ms gap, as in legacy.
        assert.equal(t.within('[data-ui=banner]').textContent, 'PUTT 1 / 6DUNE SERPENT');
        await t.step(350);
        assert.equal(t.within('[data-ui=banner]').textContent, 'BenHOLE IN ONE');
        const rows = [...t.within('[data-ui=scoreboard]').children].map(r => r.textContent);
        assert.deepEqual(rows, ['SCOREBOARDPuttTotal', '1. Ben✔ 11', '2. Ana (you)22']);
      }
      await t.send({ type: 'REPORT_SCORE', playerId: 'host', roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: 2 });
      await t.step(5000);
    }
    let snap = t.session.getSnapshot();
    assert.equal(snap.phase, 'results');
    await act(async () => t.store.setLocal({ mode: 'wait' }));
    const results = t.within('[data-ui=results]');
    assert.ok(shown(results));
    assert.equal(results.querySelector('p').textContent, 'Dune Serpent: Ana 12 (-3) · Ben 16 (+1). Map winner: Ana. Standings after map 1/3: Ana -3 · Ben +1.');
    assert.equal(results.querySelector('button').textContent, 'Next map vote');
    assert.ok(results.querySelector('table'), 'final scorecard on the results card');
    assert.equal(results.querySelector('[data-ui=scorecard] div').textContent, 'SCORECARDDune Serpent · Map 1/3', 'results title counts the finished map');
    assert.deepEqual([...t.within('[data-ui=scoreboard]').children].map(r => r.textContent), ['SCOREBOARDPuttTotal', '1. Ana (you)✔ 212', '2. Ben✔ 316'], 'results scoreboard counts each putt once');
    await click(results.querySelector('button'));
    assert.equal(t.session.getSnapshot().phase, 'select');
    assert.equal(status(), 'Map 2/3 · Vote for a map. The first vote starts a 15s countdown.');
    // Maps 2 and 3, then the champion.
    for (const map of [0, 20]) {
      if (t.session.getSnapshot().phase !== 'select') await click(t.within('[data-ui=results] button'));
      await t.send({ type: 'CAST_VOTE', playerId: 'host', mapIndex: map });
      await t.send({ type: 'CAST_VOTE', playerId: 'g1', mapIndex: map });
      await t.step(2600);
      for (let k = 0; k < courses[map].putts.length; k++) {
        const s = t.session.getSnapshot();
        for (const id of ['host', 'g1']) await t.send({ type: 'REPORT_SCORE', playerId: id, roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: 2 });
        await t.step(5000);
      }
    }
    snap = t.session.getSnapshot();
    assert.equal(snap.phase, 'results');
    const text = t.within('[data-ui=results] p').textContent;
    assert.match(text, /Standings after map 3\/3: Ana -9 · Ben -5\. OVERALL CHAMPION: Ana!$/);
    assert.equal(t.within('[data-ui=results] button').textContent, 'Back to lobby');
    const seen = [];
    for (let i = 0; i < 10; i++) { seen.push(t.within('[data-ui=banner]').textContent); await t.step(1000); }
    assert.ok(seen.includes('AnaTOURNAMENT CHAMPION'), 'champion banner follows the map winner banner');
    assert.equal(seen.indexOf('AnaMAP WINNER · FROST HOLLOW') < seen.indexOf('AnaTOURNAMENT CHAMPION'), true);
    // Guest view of the same results, then a guest who only spectated.
    await act(async () => t.store.setLocal({ isHost: false }));
    assert.ok(t.within('[data-ui=results] p').textContent.endsWith(' Waiting for the host to return to the lobby.'));
    await act(async () => t.store.setLocal({ mode: 'spectator' }));
    assert.equal(t.within('[data-ui=results] p').textContent, 'Round finished. You joined as a spectator; join the next map to play. Waiting for the host to return to the lobby.');
    await act(async () => t.store.setLocal({ mode: 'wait' }));
    assert.equal(t.within('[data-ui=results] button').hidden, true);
    await act(async () => t.store.setLocal({ isHost: true }));
    await click(t.within('[data-ui=results] button'));
    assert.equal(t.session.getSnapshot().phase, 'lobby');
    assert.ok(shown(t.within('[data-ui=room-lobby]')));
    await t.teardown();
  });

  await scenario('level select planet switcher: left/right order, an empty message on Luna and Ares, and Gaia restores the cards', async () => {
    const t = await setup({ roomCode: '' });
    await t.send({ type: 'SET_MODE', playerId: 'host', mode: 'practice' });
    await t.send({ type: 'START_VOTING', playerId: 'host' });
    const select = () => t.within('[data-ui=map-select]');
    const sw = () => select().querySelector('[data-ui=planet-switcher]');
    const cards = () => select().querySelectorAll('button[data-v]').length;
    assert.equal(sw().dataset.world, 'gaia', 'starts on Gaia');
    const gaiaCards = cards();
    assert.ok(gaiaCards > 0 && !select().querySelector('[data-ui=planet-empty]'));
    const seen = [];
    for (const id of ['left', 'left', 'left']) { await click(sw().querySelector(`[data-ui=planet-${id}]`)); seen.push(sw().dataset.world); }
    assert.deepEqual(seen, ['luna', 'ares', 'gaia'], 'left cycles gaia, luna, ares, gaia');
    seen.length = 0;
    for (const id of ['right', 'right', 'right']) { await click(sw().querySelector(`[data-ui=planet-${id}]`)); seen.push(sw().dataset.world); }
    assert.deepEqual(seen, ['ares', 'luna', 'gaia'], 'right goes the other way');
    for (const [dir, id] of [['left', 'luna'], ['left', 'ares']]) {
      await click(sw().querySelector(`[data-ui=planet-${dir}]`));
      assert.equal(sw().dataset.world, id);
      assert.equal(cards(), 0, id + ' has no course cards');
      assert.match(select().querySelector('[data-ui=planet-empty]').textContent, /No courses on/, id + ' says so');
    }
    await click(sw().querySelector('[data-ui=planet-left]'));
    assert.equal(sw().dataset.world, 'gaia');
    assert.equal(cards(), gaiaCards, 'back on Gaia the cards return');
    assert.equal(select().querySelector('[data-ui=planet-empty]'), null);
    await t.teardown();
  });

  await scenario('practice: course practice and putt practice select, show the practice HUD and the putt-practice bar', async () => {
    const t = await setup({ roomCode: '' });
    await t.send({ type: 'SET_MODE', playerId: 'host', mode: 'practice' });
    await t.send({ type: 'START_VOTING', playerId: 'host' });
    assert.equal(t.within('[data-ui=map-select] p').textContent, 'Practice · pick any map to start. No voting, no opponents.');
    await click(t.within('[data-ui=map-select] button[data-v]'));
    await t.step(2600);
    await act(async () => t.store.setLocal({ mode: 'play', strokes: 1 }));
    assert.match(t.within('[data-ui=hud-info]').textContent, /^Switchback Garden · PUTT 1\/6 · PAR 2 · STROKES 1 · \d:\d\d$/);
    assert.equal(t.within('[data-ui=practice-bar]').hidden, true, 'no putt-practice bar in course practice');
    for (let k = 0; k < 6; k++) {
      const s = t.session.getSnapshot();
      await t.send({ type: 'REPORT_SCORE', playerId: 'host', roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: 2 });
      await t.step(5000);
    }
    assert.equal(t.within('[data-ui=results] p').textContent, 'Switchback Garden: Ana 12 (E). Practice round finished.');
    assert.equal(t.within('[data-ui=results] button').textContent, 'Pick another map');
    assert.equal(t.within('[data-ui=banner]').textContent, 'PRACTICE DONESWITCHBACK GARDEN');
    await click(t.within('[data-ui=results] button'));
    assert.equal(t.session.getSnapshot().phase, 'select');
    await t.teardown();

    const p = await setup({ roomCode: '' });
    await p.send({ type: 'SET_MODE', playerId: 'host', mode: 'putt_practice' });
    await p.send({ type: 'START_VOTING', playerId: 'host' });
    assert.equal(p.within('[data-ui=map-select] p').textContent, 'Practice · pick a map, then the putt to replay. No scoring, no timer.');
    const picker = () => p.within('[data-ui=map-select] p + div');
    assert.equal(picker().hidden, true);
    await click(p.within('[data-ui=map-select] button[data-v="0"]:nth-of-type(2)') || [...p.within('[data-ui=map-select]').querySelectorAll('button[data-v]')][1]);
    assert.equal(picker().hidden, false);
    assert.deepEqual([...picker().children].map(b => b.textContent), ['Putt 1 · Par 2', 'Putt 2 · Par 3', 'Putt 3 · Par 2', 'Putt 4 · Par 3', 'Putt 5 · Par 3', 'Putt 6 · Par 2']);
    await click(picker().children[3]);
    let s = p.session.getSnapshot();
    assert.equal(s.phase, 'play'); assert.equal(s.mapIndex, 8); assert.equal(s.puttIndex, 3);
    await act(async () => p.store.setLocal({ mode: 'play', strokes: 4 }));
    await p.step(100);
    assert.equal(p.within('[data-ui=hud-info]').textContent, 'Dune Serpent · PUTT 4/6 · PAR 3 · STROKES 4 · PRACTICE');
    const bar = p.within('[data-ui=practice-bar]');
    assert.equal(bar.hidden, false, 'host sees the putt-practice bar');
    await click([...bar.querySelectorAll('button')].find(b => b.textContent === 'Next putt ›'));
    assert.equal(p.session.getSnapshot().puttIndex, 4);
    await click([...bar.querySelectorAll('button')].find(b => b.textContent === '‹ Prev putt'));
    await click([...bar.querySelectorAll('button')].find(b => b.textContent === '‹ Prev putt'));
    assert.equal(p.session.getSnapshot().puttIndex, 2);
    await click([...bar.querySelectorAll('button')].find(b => b.textContent === 'Maps'));
    assert.equal(p.session.getSnapshot().phase, 'select');
    await p.teardown();
  });

  await scenario('scorecard: Card button and K toggle it, Escape closes it, focus moves to Close and returns; a new putt closes it', async () => {
    const t = await setup({ roomCode: '' });
    await t.send({ type: 'SET_MODE', playerId: 'host', mode: 'practice' });
    await t.send({ type: 'START_VOTING', playerId: 'host' });
    await click(t.within('[data-ui=map-select] button[data-v]'));
    await t.step(2600);
    await act(async () => t.store.setLocal({ mode: 'play', strokes: 3 }));
    const dialog = t.within('[role=dialog]');
    const cardButton = button('Card');
    cardButton.focus();
    await click(cardButton);
    assert.equal(dialog.hidden, false);
    assert.equal(doc.activeElement.getAttribute('aria-label'), 'Close scorecard', 'focus moves to Close');
    assert.equal(dialog.querySelector('tbody tr').textContent.replace(/\s/g, ''), '1.Ana(you)33+1');
    await act(async () => t.dispatch({ type: 'close-card' }));
    assert.equal(dialog.hidden, true);
    assert.equal(doc.activeElement, cardButton, 'focus returns to the opener');
    await act(async () => t.dispatch({ type: 'toggle-card' }));
    assert.equal(dialog.hidden, false);
    await act(async () => t.dispatch({ type: 'toggle-card' }));
    assert.equal(dialog.hidden, true, 'a second toggle closes it');
    await act(async () => t.dispatch({ type: 'toggle-card' }));
    assert.equal(dialog.hidden, false);
    const s = t.session.getSnapshot();
    await t.send({ type: 'REPORT_SCORE', playerId: 'host', roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: 3 });
    await t.step(5000);
    assert.equal(dialog.hidden, true, 'starting the next putt closes the card (legacy)');
    await click(dialog.querySelector('button'));
    assert.equal(dialog.hidden, true);
    // Open at results, then the host returns to map selection: the card closes (legacy syncRoom).
    for (let k = 1; k < 6; k++) {
      const x = t.session.getSnapshot();
      await t.send({ type: 'REPORT_SCORE', playerId: 'host', roundNumber: x.roundNumber, puttIndex: x.puttIndex, strokes: 3 });
      await t.step(5000);
    }
    assert.equal(t.session.getSnapshot().phase, 'results');
    await act(async () => t.dispatch({ type: 'toggle-card' }));
    assert.equal(dialog.hidden, false);
    await click(t.within('[data-ui=results] button'));
    assert.equal(t.session.getSnapshot().phase, 'select');
    assert.equal(dialog.hidden, true, 'map selection closes the card');
    await t.teardown();
  });

  await scenario('HUD controls: inventory, view/sound/quality labels, invite and the disconnect notice', async () => {
    const t = await setup({ roomCode: '' });
    await t.send({ type: 'SET_MODE', playerId: 'host', mode: 'practice' });
    await t.send({ type: 'START_VOTING', playerId: 'host' });
    await click(t.within('[data-ui=map-select] button[data-v]'));
    await t.step(2600);
    await act(async () => t.store.setLocal({ mode: 'play', inventory: ['mag', 'steady'], soundOn: false, qualityHigh: false, viewLabel: 'Hole view' }));
    const inv = [...t.within('[data-ui=game]').querySelectorAll('canvas ~ div')].find(d => d.textContent.includes('empty'));
    const slots = [...inv.children];
    assert.deepEqual(slots.map(b => b.firstChild.textContent), ['1. Hole Magnet', '2. Steady Aim', '3. empty'], 'each slot keeps a screen-reader label');
    assert.notEqual(slots[2].className, slots[1].className, 'an empty slot is drawn as an empty box');
    assert.equal(slots[1].className, slots[0].className, 'self power-ups share the item style');
    assert.ok(slots[0].querySelector('svg') && !slots[2].querySelector('svg'), 'a held power-up shows its icon; an empty box shows none');
    assert.match(slots[0].textContent, /Hole Magnet armed for this shot/, 'the hover tip gives the name and ability');
    assert.doesNotMatch(slots[2].textContent.replace('3. empty', ''), /empty/i, 'no visible empty wording');
    await click(button('Settings')); // sound and quality live in the settings panel
    assert.ok(button('View: Hole view') && button('Sound: Off') && button('Quality: Low'));
    t.commands.length = 0;
    for (const b of [slots[1], button('View: Hole view'), button('Sound: Off'), button('Quality: Low'), button('Invite')]) await click(b);
    assert.deepEqual(t.commands, [{ type: 'use-item', index: 1 }, { type: 'cycle-camera' }, { type: 'toggle-sound' }, { type: 'toggle-quality' }, { type: 'invite' }]);
    await act(async () => t.store.toast('Hole Magnet armed for this shot.'));
    assert.equal(t.within('[data-ui=game] [role=status]').textContent, 'Hole Magnet armed for this shot.');
    await t.step(2999);
    assert.equal(t.within('[data-ui=game] [role=status]').textContent, 'Hole Magnet armed for this shot.');
    await t.step(1);
    assert.equal(t.within('[data-ui=game] [role=status]').textContent, '', 'toasts clear after 3 s');
    await act(async () => t.store.setLocal({ connected: false }));
    assert.equal(t.root.querySelector('[role=alert]').textContent, 'Connection lost. Gameplay is paused. Leave and rejoin the room, or try again when the service is available.');
    assert.equal(t.root.querySelector('[role=alert]').hidden, false);
    await act(async () => t.store.setLocal({ connected: true }));
    assert.equal(t.root.querySelector('[role=alert]').hidden, true);
    await t.teardown();
  });

  await scenario('safety: player names render as text only', async () => {
    const t = await setup({ hostName: '<img src=x>' });
    await t.send({ type: 'JOIN_ROOM', playerId: 'g1', name: '<b>Ben</b>' });
    assert.equal(t.root.querySelectorAll('img, b b').length, 0);
    assert.ok(t.within('[data-ui=room-lobby]').textContent.includes('<img src=x> (you)'));
    assert.ok(t.within('[data-ui=room-lobby]').textContent.includes('<b>Ben</b>'));
    await t.teardown();
  });

  await scenario('model: a roster row with no counted putts never gets the leader highlight', async () => {
    const room = { phase: 'results', mode: 'standard', mapIndex: 1, puttIndex: 0, roster: ['a', 'b'], completedMaps: [1], totals: {}, players: {
      a: { id: 'a', name: 'Ann', connected: true, scores: [{ score: 4, timedOut: false }], done: true, score: 4, strokes: 4 },
      b: { id: 'b', name: 'Bo', connected: true, scores: [], done: false, score: null, strokes: 0 } } };
    const card = ui.scorecardView(room, { id: 'a' }, courses);
    assert.deepEqual(card.rows.map(r => [r.label, r.lead, r.total]), [['1. Bo', false, ''], ['2. Ann (you)', false, '4']]);
  });

  // ------------------------------------------------------------------ Part C: store, power meter, cleanup
  await scenario('store: cached immutable snapshots; unchanged sections keep identity; notifications follow legacy timing', async () => {
    const clock = fakeClock();
    const store = ui.createUiStore({ courses, clock });
    let notified = 0;
    store.subscribe(() => notified++);
    const a = store.getSnapshot();
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.screens) && Object.isFrozen(a.banner));
    store.tick(0);
    assert.equal(store.getSnapshot(), a, 'no change, same snapshot');
    assert.equal(notified, 0);
    const session = createRoomSession({ hostId: 'h', hostName: 'Ana', clock });
    store.setLocal({ active: true, id: 'h', isHost: true, roomCode: 'abcd' });
    store.setRoom(session.getSnapshot(), 0);
    const b = store.getSnapshot();
    assert.notEqual(b, a);
    assert.ok(Object.isFrozen(b.lobby.roster[0]), 'deeply frozen');
    assert.throws(() => { 'use strict'; b.lobby.roster.push(1); });
    store.toast('hi');
    const c = store.getSnapshot();
    assert.equal(c.lobby, b.lobby, 'unrelated sections keep identity');
    assert.notEqual(c.toast, b.toast);
    // Banner queue: 1.9 s, 2.8 s for hole-in-one style, 0.35 s gaps, in order.
    store.announce('ONE', 'a', 'event'); store.announce('TWO', 'b', 'hio'); store.announce('THREE');
    const timeline = [];
    for (let t = 0; t <= 6200; t += 50) { const bn = store.getSnapshot().banner; timeline.push([clock.now(), bn.text, bn.show]); clock.advance(50); }
    const firstShown = text => timeline.find(([, x, s]) => x === text && s)[0];
    const lastShown = text => timeline.filter(([, x, s]) => x === text && s).pop()[0];
    assert.equal(firstShown('ONE'), 0);
    assert.equal(lastShown('ONE'), 1850);
    assert.equal(firstShown('TWO'), 1900 + 350);
    assert.equal(lastShown('TWO') - firstShown('TWO'), 2750);
    assert.equal(firstShown('THREE'), 2250 + 2800 + 350);
    store.dispose();
    session.dispose();
    assert.equal(clock.pending(), 0, 'dispose cancels toast and banner timers');
    store.setLocal({ strokes: 99 });
    assert.equal(store.getSnapshot(), store.getSnapshot());
  });

  await scenario('power meter: aim updates write the DOM directly and cause no React commits or store publishes', async () => {
    const clock = fakeClock();
    const store = ui.createUiStore({ courses, clock });
    const listeners = new Set();
    const aim = { subscribeAim(l) { listeners.add(l); l(false, 0); return () => listeners.delete(l); } };
    let commits = 0;
    const root = doc.createElement('div'); doc.body.appendChild(root);
    const { createRoot } = (await import('react-dom/client')).default;
    const reactRoot = createRoot(root);
    await act(async () => {
      reactRoot.render(React.createElement(React.Profiler, { id: 'ui', onRender: () => { commits++; } },
        React.createElement(ui.PuttPalsUi, { store, dispatch: () => {}, aim })));
    });
    const before = commits, snapshot = store.getSnapshot();
    const meter = root.querySelector('[role=meter]');
    for (const [charging, charge] of [[true, 0.1], [true, 0.55], [true, 1]]) for (const l of listeners) l(charging, charge);
    assert.equal(meter.firstChild.style.width, '100%');
    assert.equal(meter.getAttribute('aria-valuenow'), '100');
    assert.equal(meter.nextSibling.textContent.startsWith('100% power · ±'), true);
    for (const l of listeners) l(false, 0);
    assert.equal(meter.nextSibling.textContent, 'Pull to set power');
    assert.equal(commits, before, 'no React commits for per-frame aim values');
    assert.equal(store.getSnapshot(), snapshot, 'no store publishes');
    await act(async () => reactRoot.unmount());
    assert.equal(listeners.size, 0, 'unmount unsubscribes the power meter');
    root.remove(); store.dispose();
  });

  await scenario('lobby: random tie picker animates when votes are tied (VIS-V #163)', async () => {
    const t = await setup();
    await t.send({ type: 'JOIN_ROOM', playerId: 'g1', name: 'Ben' });
    await t.send({ type: 'START_VOTING', playerId: 'host' });
    await t.send({ type: 'CAST_VOTE', playerId: 'host', mapIndex: 0 });
    await t.send({ type: 'CAST_VOTE', playerId: 'g1', mapIndex: 8 });
    assert.equal(t.session.getSnapshot().phase, 'play');
    assert.ok(t.session.getSnapshot().tie, 'tie exists');
    assert.ok(t.within('[data-ui=tie-picker]'), 'tie picker mounted in lobby');
    const options = [...t.within('[data-ui=tie-picker]').querySelectorAll('[data-ui=tie-option]')];
    assert.equal(options.length, 2);
    assert.match(t.within('[data-ui=room-lobby] p:nth-of-type(2)').textContent, /^Vote tied! Random pick: /);
    await t.step(2600);
    await t.teardown();
  });

  await scenario('cleanup: repeated mount/unmount leaves no store subscriptions, DOM or pending timers', async () => {
    for (let i = 0; i < 5; i++) {
      const t = await setup();
      assert.ok(t.listeners > 0);
      await act(async () => t.store.toast('x'));
      await t.teardown();
      assert.equal(t.listeners, 0, `round ${i}: all subscriptions released`);
      assert.equal(t.clock.pending(), 0, `round ${i}: no pending timers`);
    }
    assert.equal(doc.body.children.length, 1, 'only the original root remains');
  });

  console.log(`UI: ${passed} scenarios passed (React DOM in jsdom with the real L1 session; pixel parity is checked separately in Chromium).`);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
