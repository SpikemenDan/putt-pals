// U1 React UI tests. The UI is compiled with Vite's production JSX/CSS Modules transforms
// (tests/support/build-ui.cjs) and rendered with React DOM in jsdom. Part A compares view text with the
// legacy game for the same state; part B drives the real L1 room session through complete flows with a
// fake clock; part C checks store caching, notifications, focus, the power meter and cleanup.
// Visual (pixel) parity is a separate real-browser check: scripts/ui-visual-parity.cjs.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildUi } = require('./support/build-ui.cjs');
const { bootLegacy } = require('./support/legacy-dom.cjs');

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
  async function setup({ localId = 'host', hostName = 'Ana', isHost = true, roomCode = 'abcd' } = {}) {
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
    await act(async () => { unmount = ui.mountUi(root, { store, dispatch, initialName: hostName, initialRoomCode: roomCode }); });
    await act(async () => { store.setLocal({ active: true, id: localId, isHost, roomCode, mode: 'lobby' }); store.setRoom(session.getSnapshot(), clock.now()); });
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
  await scenario('legacy parity: HUD line, scoreboard, scorecard and results text match the legacy game for the same state', async () => {
    const legacy = await bootLegacy();
    const { P } = legacy;
    await legacy.play(8, 2, 'tournament');
    const R = P().R, active = P().active, me = P().me;
    const meColor = me.c;
    // Legacy: putt 3 of Dune Serpent, second map of a 3-map tournament; Ben has a hole in one and a
    // timeout and is done; Cy is still putting and ties Ben; Dee spectates.
    R.setRoom({ series: 3, mapNo: 1, roster: [R.id(), 'b', 'c'], card: {
      solo: { n: 'Ana', s: [2, 4], o: [0, 0] }, b: { n: 'Ben', s: [1, 8], o: [0, 1] }, c: { n: 'Cy', s: [3, 3], o: [0, 0] } } });
    const presence = {
      b: { n: 'Ben', c: 1, h: 8, round: active, done: true, s: [2], str: 2, tot: 9, over: false, mode: 'sunk' },
      c: { n: 'Cy', c: 4, h: 8, round: active, done: false, s: [], str: 5, tot: 6, over: false, mode: 'play' },
      d: { n: 'Dee', c: 6, h: 8, round: active, done: false, s: [], str: 0, tot: 0, over: false, mode: 'spectator' },
    };
    const own = R.peers;
    R.peers = () => [...own(), ...Object.entries(presence).map(([peer, p]) => ({ peer, isMe: false, presence: p }))];
    me.str = 1; me.tot = 6; P().pub(true);
    await legacy.until(() => /STROKES 1/.test(legacy.$('info').textContent) && legacy.$('sb').children.length === 5);
    const legacyInfo = legacy.$('info').textContent;
    const legacyRows = [...legacy.$('sb').children].map(r => [...r.children].map(c => c.textContent));
    const legacyDots = [...legacy.$('sb').children].slice(1).map(r => r.querySelector('i').style.background);
    const cardEl = legacy.w.document.createElement('div');
    P().renderCard(cardEl);
    const legacyCard = [...cardEl.querySelectorAll('tr')].map(tr => [...tr.children].map(td => [td.textContent, td.className]));
    const legacyTitle = cardEl.querySelector('.ptitle').textContent;
    const legacyLead = [...cardEl.querySelectorAll('tbody tr')].map(tr => tr.className === 'lead');

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

    // Results: legacy finishMap() records the map, then showResults() writes the text.
    me.s = [2]; me.mode = 'sunk'; P().pub(true);
    presence.c = { ...presence.c, done: true, s: [4], mode: 'sunk' };
    const r = R.room();
    R.setRoom({ putt: 5, card: { solo: { n: 'Ana', s: [2, 4, 1, 2, 3], o: [0, 0, 0, 0, 0] }, b: { n: 'Ben', s: [1, 8, 2, 2, 2], o: [0, 1, 0, 0, 0] }, c: { n: 'Cy', s: [3, 3, 5, 2, 3], o: [0, 0, 0, 0, 0] } },
      totals: { solo: { n: 'Ana', t: 10, w: 1 }, b: { n: 'Ben', t: 13, w: 0 }, c: { n: 'Cy', t: 12, w: 0 } }, round: r.round });
    me.tot = 12; presence.b.tot = 15; presence.c.tot = 16;
    const winners = 'Ana';
    R.setRoom({ phase: 'results', mapNo: 2, totals: { solo: { n: 'Ana', t: 24, w: 2 }, b: { n: 'Ben', t: 30, w: 0 }, c: { n: 'Cy', t: 32, w: 0 } },
      last: { map: 8, sc: { solo: 14, b: 17, c: 20 }, names: { solo: 'Ana', b: 'Ben', c: 'Cy' }, win: ['solo'] } });
    await legacy.until(() => !legacy.$('end').hidden && legacy.$('endt').textContent.includes(winners));
    const legacyEnd = legacy.$('endt').textContent, legacyAgain = legacy.$('again').textContent;
    await act(async () => {
      t.store.setLocal({ mode: 'wait' });
      t.store.setRoom({ ...room, phase: 'results', puttIndex: 5, completedMaps: [0, 8], totals: { solo: { name: 'Ana', total: 24, wins: 2 }, b: { name: 'Ben', total: 30, wins: 0 }, c: { name: 'Cy', total: 32, wins: 0 } },
        last: { mapIndex: 8, scores: { solo: 14, b: 17, c: 20 }, winners: ['solo'] } }, 99999);
    });
    assert.equal(t.within('[data-ui=results] p').textContent, legacyEnd);
    assert.equal(t.within('[data-ui=results] button').textContent, legacyAgain);
    R.peers = own;
    assert.deepEqual(legacy.errors, []);
    await t.teardown();
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
    assert.equal(t.within('[data-ui=loading]'), null, 'gone once connected or failed');
    assert.ok(ui.TIPS.length >= 8 && new Set(ui.TIPS).size === ui.TIPS.length, 'enough distinct tips');
    assert.ok(ui.TIPS.every(x => typeof x === 'string' && x.length > 20 && x.length <= 110), 'tips are short text');
    for (const [start, step] of [[0, 0], [3, 100], [13, 1], [0, -1]]) assert.ok(ui.tipAt(start, step) >= 0 && ui.tipAt(start, step) < ui.TIPS.length);
    assert.equal(ui.tipAt(0, ui.TIPS.length), 0, 'wraps around');
    await t.teardown();
  });

  await scenario('landing: join needs a room code, both buttons dispatch, connecting disables them; join validation matches legacy', async () => {
    const t = await setup();
    await act(async () => t.store.setLocal({ active: false }));
    const landing = t.within('[data-ui=landing]');
    assert.ok(shown(landing));
    const [nameInput, codeInput] = landing.querySelectorAll('input');
    assert.equal(nameInput.maxLength, 14); assert.equal(codeInput.maxLength, 12);
    const join = [...landing.querySelectorAll('button')].find(b => b.textContent === 'Join room');
    const solo = [...landing.querySelectorAll('button')].find(b => b.textContent === 'Play solo');
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
    await click(solo);
    assert.deepEqual(t.commands, [{ type: 'join', name: '  Zed  ', roomCode: 'Fun-Room!' }, { type: 'play-solo', name: '  Zed  ' }]);
    await act(async () => t.store.setLocal({ connecting: true }));
    assert.equal(join.disabled, true); assert.equal(solo.disabled, true);
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
    assert.equal(results.querySelector('p').textContent, 'Dune Serpent: Ana 12 · Ben 16. Map winner: Ana. Standings after map 1/3: Ana 12 · Ben 16.');
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
    assert.match(text, /Standings after map 3\/3: Ana 36 · Ben 40\. OVERALL CHAMPION: Ana!$/);
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

  await scenario('practice: course practice and putt practice select, show the practice HUD and the putt-practice bar', async () => {
    const t = await setup({ roomCode: '' });
    await t.send({ type: 'SET_MODE', playerId: 'host', mode: 'practice' });
    await t.send({ type: 'START_VOTING', playerId: 'host' });
    assert.equal(t.within('[data-ui=map-select] p').textContent, 'Practice · pick any map to start. No voting, no opponents.');
    await click(t.within('[data-ui=map-select] button[data-v]'));
    await t.step(2600);
    await act(async () => t.store.setLocal({ mode: 'play', strokes: 1 }));
    assert.match(t.within('[data-ui=hud-info]').textContent, /^Switchback Garden · PUTT 1\/6 · PAR 2 · STROKES 1 · \d:\d\d$/);
    assert.equal(t.within('[data-ui=hud-info] + span > span').hidden, true, 'no putt-practice bar in course practice');
    for (let k = 0; k < 6; k++) {
      const s = t.session.getSnapshot();
      await t.send({ type: 'REPORT_SCORE', playerId: 'host', roundNumber: s.roundNumber, puttIndex: s.puttIndex, strokes: 2 });
      await t.step(5000);
    }
    assert.equal(t.within('[data-ui=results] p').textContent, 'Switchback Garden: Ana 12. Practice round finished.');
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
    const bar = p.within('[data-ui=hud-info] + span > span');
    assert.equal(bar.hidden, false, 'host sees the putt-practice bar');
    await click([...bar.children].find(b => b.textContent === 'Next putt ›'));
    assert.equal(p.session.getSnapshot().puttIndex, 4);
    await click([...bar.children].find(b => b.textContent === '‹ Prev putt'));
    await click([...bar.children].find(b => b.textContent === '‹ Prev putt'));
    assert.equal(p.session.getSnapshot().puttIndex, 2);
    await click([...bar.children].find(b => b.textContent === 'Maps'));
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
    assert.deepEqual(slots.map(b => b.textContent), ['1. Hole Magnet', '2. Steady Aim', '3. empty']);
    const ghostClass = button('Card').className;
    assert.equal(slots[2].className, ghostClass, 'empty slot uses the ghost style');
    assert.notEqual(slots[1].className, ghostClass); assert.equal(slots[1].className, slots[0].className, 'self power-ups share the item style');
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
