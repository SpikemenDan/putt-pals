// I1 integration tests: the composed app (UI, input, renderer, simulation, session, transports, audio)
// runs in jsdom clients on one virtual clock. WebGL output and audio are recorded stubs; rooms use the
// N1 in-memory hub. Real-browser rendering/WebRTC evidence is recorded separately (docs/reviews/I1_APP.md).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildApp } = require('./support/build-ui.cjs');
const { createScheduler, createStubRenderers, createAudioRecorder, createWindow } = require('./support/app-harness.cjs');

const root = path.resolve(__dirname, '..');
const solver = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/cup-capture/solutions.json'), 'utf8'));
const best = (map, putt) => solver.results.find(r => r.map === map && r.putt === putt).best;

let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

(async () => {
  const host = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: host.window, document: host.window.document, HTMLElement: host.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { modulePath, moduleUrl } = await buildApp();
  const appModule = await import(moduleUrl);
  const { createApp } = appModule;
  const { act } = (await import('react')).default;
  const THREE = await import('three');
  const { MemoryRoomHub } = await import('../src/network/index.js');

  /** A test world: one clock, one network hub, any number of clients. */
  function world() {
    const scheduler = createScheduler({ frameMs: 50 });
    const hub = new MemoryRoomHub();
    const renderers = createStubRenderers();
    const clients = [];
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    async function settle() { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); }
    async function run(ms) { for (let t = 0; t < ms; t += 500) { await act(async () => { scheduler.advance(Math.min(500, ms - t)); }); await settle(); } }
    async function until(fn, ms = 60000, label = 'condition') { for (let t = 0; t <= ms; t += 100) { if (fn()) return; await run(100); } assert.fail('timed out waiting for ' + label); }
    async function client(name, { url, createWebGLRenderer = renderers.factory, memoryTransport = true, storage = {} } = {}) {
      const win = createWindow(scheduler, { url });
      for (const [k, v] of Object.entries(storage)) win.w.sessionStorage.setItem(k, v); // a reloaded tab keeps its sessionStorage
      const audio = createAudioRecorder();
      let app;
      await act(async () => { app = createApp({ root: win.w.document.getElementById('root'), THREE, window: win.w, random, createWebGLRenderer, createAudio: () => audio, createTransport: memoryTransport ? options => hub.create(options) : undefined }); });
      await settle();
      const doc = win.w.document;
      const shown = el => !!el && !el.closest('[hidden]');
      const c = {
        name, app, win, audio, doc,
        $: sel => doc.querySelector(sel),
        text: sel => doc.querySelector(sel)?.textContent ?? '',
        shown: sel => shown(doc.querySelector(sel)),
        button: label => [...doc.querySelectorAll('button')].find(b => b.textContent === label && shown(b)),
        async click(target) { const el = typeof target === 'string' ? c.button(target) : target; assert.ok(el, `${name}: button ${target}`); await act(async () => { el.click(); }); await settle(); },
        async fill(input, value) {
          const setter = Object.getOwnPropertyDescriptor(win.w.HTMLInputElement.prototype, 'value').set;
          await act(async () => { setter.call(input, value); input.dispatchEvent(new win.w.Event('input', { bubbles: true })); });
        },
        async select(value) { const s = doc.querySelector('[data-ui=room-lobby] select'); await act(async () => { s.value = value; s.dispatchEvent(new win.w.Event('change', { bubbles: true })); }); },
        async solo() { await c.fill(doc.querySelector('[data-ui=landing] input'), name); await c.click('Play solo'); await until(() => c.shown('[data-ui=room-lobby]'), 2000, name + ' lobby'); },
        async join(code) {
          const [n, r] = doc.querySelectorAll('[data-ui=landing] input');
          await c.fill(n, name); await c.fill(r, code); await c.click('Join room');
          await until(() => c.shown('[data-ui=room-lobby]') || c.shown('[data-ui=map-select]') || c.shown('[data-ui=game]'), 3000, name + ' joined');
        },
        get snapshot() { return app.room?.snapshot; },
        get putt() { return app.putt; },
        ready: () => app.putt && app.putt.player.mode === 'play' && !app.putt.player.moving && !app.view.rig.transitioning && c.shown('[data-ui=game]'),
        async shoot(deg, power) { await act(async () => { app.dispatch({ type: 'shot', angle: deg * Math.PI / 180, power }); }); },
        async useItem(index) { await act(async () => { app.dispatch({ type: 'use-item', index }); }); },
        async dispose() { await act(async () => { await app.dispose(); }); },
      };
      clients.push(c);
      return c;
    }
    /** Every listed client shoots the recorded robust shot for the current putt once it can. */
    async function playPutt(list, { skip = [] } = {}) {
      const s = list[0].snapshot;
      const { mapIndex, puttIndex, roundNumber } = s;
      for (const c of list) {
        if (skip.includes(c)) continue;
        await until(() => c.ready() && c.snapshot.roundNumber === roundNumber, 20000, `${c.name} ready for putt ${puttIndex}`);
        const shot = best(mapIndex, puttIndex);
        await c.shoot(shot.deg, shot.power);
      }
      return { mapIndex, puttIndex, roundNumber };
    }
    return { scheduler, hub, renderers, client, run, until, settle, clients, playPutt };
  }

  const tracked = c => c.audio.log.map(e => e.type + (e.kind ? ':' + e.kind : '') + (e.hazardType ? ':' + e.hazardType : '') + (e.remote ? ':remote' : ''));

  // ---------------------------------------------------------------------------------------------
  await scenario('start screen: a 3D panorama orbits behind the menu, then hands the canvas to the game', async () => {
    const W = world();
    const ana = await W.client('Ana');
    await W.run(1000);
    assert.ok(ana.app.renderer.course, 'a course is built for the panorama');
    assert.ok(ana.shown('[data-ui=landing]') && ana.shown('[data-ui=backdrop]'), 'the canvas stays visible behind the menu');
    assert.ok(!ana.shown('[data-ui=game]'), 'the backdrop is not the game screen');
    assert.equal(ana.$('[data-ui=backdrop]').getAttribute('aria-hidden'), 'true');
    const first = ana.app.renderer.camera.position.clone();
    await W.run(5000);
    assert.ok(ana.app.renderer.camera.position.distanceTo(first) > 1, 'the camera orbits');
    assert.equal(ana.app.putt, null, 'no putt or input is involved');
    await ana.solo();
    assert.ok(ana.shown('[data-ui=room-lobby]') && !ana.shown('[data-ui=landing]'), 'the menu is gone');
    assert.ok(!ana.shown('[data-ui=backdrop]'), 'the panorama backdrop is gone with the menu');
  });

  await scenario('solo: a full six-putt map through the real UI scores six holes in one with transitions, banners and audio', async () => {
    const W = world();
    const ana = await W.client('Ana');
    assert.ok(ana.shown('[data-ui=landing]'));
    await ana.solo();
    assert.equal(ana.text('[data-ui=room-lobby] p'), 'Solo practice');
    assert.equal(ana.button('Copy invite'), undefined, 'no invite in solo');
    await ana.click('Start Game');
    assert.ok(ana.shown('[data-ui=map-select]'));
    await ana.click(ana.$('[data-ui=map-select] button[data-v]'));
    await W.run(100);
    assert.equal(ana.text('[data-ui=room-lobby] p:nth-of-type(2)'), 'Switchback Garden · putt 1/6 starts in 3…');
    await W.until(() => ana.shown('[data-ui=game]'), 5000, 'game screen');
    assert.equal(ana.text('[data-ui=hud-info]'), 'Switchback Garden · PUTT 1/6 · PAR 2 · STROKES 0 · 2:00');
    assert.equal(W.renderers.instances.length, 1, 'one WebGL renderer for the app');
    let transitions = 0;
    for (let k = 0; k < 6; k++) {
      await W.until(() => ana.putt?.puttIndex === k, 10000, 'putt ' + k);
      if (k > 0) { assert.equal(ana.app.view.rig.transitioning, true, 'putt-to-putt arc'); transitions++; }
      const before = ana.app.renderer.course;
      await W.playPutt([ana]);
      assert.equal(ana.app.renderer.course, before, 'shooting does not rebuild the course');
      // The session records the putt, then (solo) advances at once, so watch the recorded scores.
      await W.until(() => ana.snapshot.players.solo.scores.length > k, 30000, 'sink ' + k);
      assert.equal(ana.snapshot.players.solo.scores[k].score, 1, `putt ${k + 1} is a hole in one`);
      if (k === 0) {
        assert.equal(ana.text('[data-ui=game] [role=status]'), 'Hole in one!');
        assert.equal(ana.app.store.getSnapshot().cardOpen, true, 'scorecard opens on sinking (legacy)');
        await W.run(1300);
        assert.equal(ana.putt.mode, 'wait', 'sunk → waiting after 1.2 s');
        assert.equal(ana.app.view.rig.state.freeRoam, true, 'waiting players fly free');
      }
    }
    await W.until(() => ana.shown('[data-ui=results]'), 10000, 'results');
    assert.equal(ana.text('[data-ui=results] p'), 'Switchback Garden: Ana 6. Map winner: Ana.');
    assert.equal(ana.text('[data-ui=results] button'), 'Back to lobby');
    assert.equal(transitions, 5);
    await W.run(20000);
    const sounds = tracked(ana);
    const count = t => sounds.filter(s => s === t).length;
    assert.equal(count('shot'), 6); assert.equal(count('sink'), 6); assert.equal(count('putt_change'), 5);
    assert.equal(count('banner:hio'), 6, 'hole-in-one fanfare per putt');
    assert.ok(count('banner:event') >= 7, 'putt banners and the map winner banner');
    assert.ok(W.renderers.instances[0].renders > 100, 'frames rendered');
    await ana.click('Back to lobby');
    assert.ok(ana.shown('[data-ui=room-lobby]'));
    await ana.click('Leave room');
    assert.ok(ana.shown('[data-ui=landing]'));
    await ana.dispose();
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('input: a real drag through the canvas shoots through the input adapter and counts the stroke', async () => {
    const W = world();
    const ana = await W.client('Ana');
    await ana.solo();
    await ana.click('Start Game');
    await ana.click(ana.$('[data-ui=map-select] button[data-v]'));
    await W.until(() => ana.ready(), 10000, 'ready');
    await W.run(500);
    const canvas = ana.$('canvas');
    const ev = (type, x, y) => canvas.dispatchEvent(new ana.win.w.PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
    await act(async () => { ev('pointerdown', 400, 250); ev('pointermove', 330, 300); });
    await W.run(100);
    assert.ok(ana.$('[role=meter] i').style.width.endsWith('%') && ana.$('[role=meter] i').style.width !== '0%', 'power meter follows the pull');
    await act(async () => { ev('pointerup', 330, 300); });
    assert.equal(ana.putt.player.strokes, 1);
    assert.equal(ana.putt.player.moving, true);
    await W.run(200);
    assert.match(ana.text('[data-ui=hud-info]'), /STROKES 1/);
    assert.ok(tracked(ana).includes('shot'));
    // Keyboard: C cycles the camera view, K toggles the scorecard.
    await act(async () => { ana.doc.body.dispatchEvent(new ana.win.w.KeyboardEvent('keydown', { key: 'c', bubbles: true })); });
    assert.equal(ana.button('View: Hole view')?.textContent, 'View: Hole view');
    await act(async () => { ana.doc.body.dispatchEvent(new ana.win.w.KeyboardEvent('keydown', { key: 'k', bubbles: true })); });
    assert.equal(ana.app.store.getSnapshot().cardOpen, true);
    await ana.dispose();
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('practice: a timeout scores par + penalty, the rest of the map finishes, results offer another map', async () => {
    const W = world();
    const ana = await W.client('Ana');
    await ana.solo();
    await ana.select('practice');
    await ana.click('Start Game');
    assert.equal(ana.text('[data-ui=map-select] p'), 'Practice · pick any map to start. No voting, no opponents.');
    await ana.click(ana.$('[data-ui=map-select] button[data-v]'));
    await W.until(() => ana.ready(), 10000, 'ready');
    await W.run(110000);
    assert.equal(ana.app.store.getSnapshot().hud.warn, true, 'last ten seconds warning');
    await W.until(() => ana.snapshot.players.solo.scores.length > 0, 15000, 'timeout');
    assert.deepEqual(ana.snapshot.players.solo.scores[0], { score: 5, timedOut: true, par: 2, penalty: 3 }, 'timeout scores par 2 + penalty 3');
    assert.ok(tracked(ana).includes('sink'), 'timeout sink cue');
    assert.equal(ana.audio.log.find(e => e.type === 'sink').timedOut, true);
    for (let k = 1; k < 6; k++) {
      await W.until(() => ana.putt?.puttIndex === k, 10000, 'putt ' + k);
      await W.playPutt([ana]);
      await W.until(() => ana.snapshot.players.solo.scores.length > k, 30000, 'sink');
    }
    await W.until(() => ana.shown('[data-ui=results]'), 10000, 'results');
    assert.equal(ana.text('[data-ui=results] p'), 'Switchback Garden: Ana 10. Practice round finished.');
    // Cells 5* 1 1 1 1 1, total 10, −2 against par 12, five holes in one, one timeout.
    assert.equal(ana.$('[data-ui=results] table tbody tr').textContent.replace(/\s/g, ''), '1.Ana(you)5*1111110-251');
    await ana.click('Pick another map');
    assert.ok(ana.shown('[data-ui=map-select]'));
    await ana.dispose();
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('putt practice: the picker starts a putt, completion replays it, the bar steps putts and returns to maps', async () => {
    const W = world();
    const ana = await W.client('Ana');
    await ana.solo();
    await ana.select('putt_practice');
    await ana.click('Start Game');
    await ana.click(ana.$('[data-ui=map-select] button[data-v]'));
    await ana.click('Putt 3 · Par 2');
    await W.until(() => ana.ready() && ana.putt.puttIndex === 2, 10000, 'putt 3');
    assert.equal(ana.text('[data-ui=hud-info]'), 'Switchback Garden · PUTT 3/6 · PAR 2 · STROKES 0 · PRACTICE');
    assert.equal(ana.app.view.rig.transitioning, false, 'no arc in putt practice');
    const round = ana.snapshot.roundNumber;
    await W.playPutt([ana]);
    await W.until(() => ana.putt.player.mode === 'sunk', 30000, 'sink');
    assert.equal(ana.app.store.getSnapshot().cardOpen, false, 'no scorecard in putt practice');
    await W.until(() => ana.snapshot.roundNumber === round + 1, 10000, 'replay');
    await W.until(() => ana.ready(), 5000, 'ready again');
    assert.equal(ana.putt.puttIndex, 2); assert.equal(ana.putt.player.strokes, 0, 'replay starts fresh at the tee');
    await ana.click('Next putt ›');
    await W.until(() => ana.putt?.puttIndex === 3, 5000, 'next putt');
    await ana.click('Maps');
    await W.until(() => ana.shown('[data-ui=map-select]'), 5000, 'maps');
    assert.equal(ana.putt, null, 'leaving play ends the putt');
    await ana.dispose();
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('four clients: a three-map tournament with an attack, a guest leaving and rejoining as a spectator, and host loss', async () => {
    const W = world();
    const ana = await W.client('Ana');
    await ana.join('party');
    assert.equal(ana.app.room.isHost, true);
    const guests = [];
    for (const n of ['Ben', 'Cy', 'Dee']) { const g = await W.client(n); await g.join('party'); guests.push(g); }
    const [ben, cy, dee] = guests;
    await W.run(300);
    assert.equal(ana.text('[data-ui=room-lobby] p'), 'Room PARTY · 4 players · You are the host');
    assert.equal(ben.text('[data-ui=room-lobby] p'), 'Room PARTY · 4 players · Waiting for host');
    assert.equal(ben.$('[data-ui=room-lobby] label').hidden, true, 'guests cannot choose the mode');
    await ana.select('tournament_3');
    await ana.click('Start Game');
    await W.until(() => guests.every(g => g.shown('[data-ui=map-select]')), 3000, 'guests voting');
    const vote = async (c, i) => c.click([...c.doc.querySelectorAll('[data-ui=map-select] button[data-v]')][i]);
    const all = [ana, ben, cy, dee];
    for (const c of all) await vote(c, 0);
    await W.until(() => all.every(c => c.ready()), 10000, 'map 1 start');
    // Remote balls and live scoreboards.
    await W.run(500);
    assert.ok(ana.app.renderer.remoteCount >= 3, 'host renders the three guests');
    assert.ok(dee.app.renderer.remoteCount >= 3, 'guests render each other');
    assert.equal([...dee.$('[data-ui=scoreboard]').children].length, 5, 'four players on the scoreboard');
    // Ben arms Steady Aim from his inventory; the activation toast and aura show locally.
    ben.putt.player.inventory.push('steady');
    await ben.useItem(0);
    assert.equal(ben.text('[data-ui=game] [role=status]'), 'Your next shot has no wobble.');
    assert.equal(ben.putt.effect, 'steady');
    assert.deepEqual(ben.putt.player.inventory, []);
    await W.run(200);
    assert.ok(ana.app.renderer.remoteCount >= 3);
    // Map 1: everyone holes out.
    await W.playPutt(all);
    await W.until(() => ana.snapshot.puttIndex === 1, 160000, 'putt 2 after Cy finishes');
    assert.equal(ana.snapshot.players[cy.app.room.localId].scores[0].score >= 1, true);
    assert.ok(tracked(dee).includes('shot:remote'), 'remote shots are audible');
    for (let k = 1; k < 6; k++) { await W.playPutt(all); await W.until(() => ana.snapshot.puttIndex === k + 1 || ana.snapshot.phase === 'results', 60000, 'advance'); }
    await W.until(() => all.every(c => c.shown('[data-ui=results]')), 10000, 'map 1 results');
    assert.match(ben.text('[data-ui=results] p'), /^Switchback Garden: .*Standings after map 1\/3: .*\. Waiting for the host to return to the lobby\.$/);
    assert.equal(ben.$('[data-ui=results] button').hidden, true);
    assert.equal(ana.text('[data-ui=results] button'), 'Next map vote');
    // Dee leaves from map selection (as in legacy, Leave room is on the lobby and voting cards); the others play map 2 without her.
    await ana.click('Next map vote');
    await W.until(() => dee.shown('[data-ui=map-select]'), 3000, 'Dee voting');
    await dee.click('Leave room');
    assert.ok(dee.shown('[data-ui=landing]'));
    for (const c of [ana, ben, cy]) await vote(c, 1);
    await W.until(() => [ana, ben, cy].every(c => c.ready() && c.snapshot.mapIndex === 8), 10000, 'map 2 start');
    assert.equal(ana.snapshot.roster.length, 3, 'Dee is no longer in the roster');
    // Dee rejoins mid-map and spectates.
    await dee.join('party');
    await W.until(() => dee.shown('[data-ui=game]'), 10000, 'Dee watches');
    assert.equal(dee.putt.player.mode, 'spectator');
    assert.match(dee.text('[data-ui=hud-info]'), /SPECTATING$/);
    for (let k = 0; k < 6; k++) { await W.playPutt([ana, ben, cy]); await W.until(() => ana.snapshot.puttIndex === k + 1 || ana.snapshot.phase === 'results', 60000, 'advance'); }
    await W.until(() => ana.shown('[data-ui=results]'), 10000, 'map 2 results');
    assert.equal(dee.text('[data-ui=results] p'), 'Round finished. You joined as a spectator; join the next map to play. Waiting for the host to return to the lobby.');
    // Map 3 with all four, then the champion.
    await ana.click('Next map vote');
    for (const c of all) await vote(c, 2);
    await W.until(() => all.every(c => c.ready() && c.snapshot.mapIndex === 20), 10000, 'map 3 start');
    for (let k = 0; k < 6; k++) { await W.playPutt(all); await W.until(() => ana.snapshot.puttIndex === k + 1 || ana.snapshot.phase === 'results', 60000, 'advance'); }
    await W.until(() => all.every(c => c.shown('[data-ui=results]')), 10000, 'final results');
    assert.match(ana.text('[data-ui=results] p'), /OVERALL CHAMPION: .+!$/);
    assert.equal(ana.text('[data-ui=results] button'), 'Back to lobby');
    const totals = ana.snapshot.totals;
    // Dee rejoined with a new peer identity, so she has two totals entries (resume identity is N2's scope).
    assert.equal(Object.keys(totals).length, 5);
    assert.equal(Object.values(totals).filter(t => t.name === 'Dee').length, 2);
    for (const c of [ben, cy, dee]) assert.deepEqual(c.snapshot.totals, totals, `${c.name} sees the same totals`);
    // Host loss: guests first try to reconnect (as guests only), then get the explicit disconnect notice.
    await ana.click('Back to lobby');
    await ana.click('Leave room');
    await W.run(300);
    for (const g of guests) {
      assert.equal(g.$('[role=alert]').hidden, false, `${g.name} sees the reconnecting notice`);
      assert.equal(g.text('[role=alert]'), 'Connection dropped. Reconnecting… your place in the room is kept for 30 seconds.');
    }
    await W.run(32000);
    for (const g of guests) {
      assert.equal(g.$('[role=alert]').hidden, false, `${g.name} sees the disconnect notice`);
      assert.equal(g.text('[role=alert]'), 'Connection lost. Gameplay paused. Reload and rejoin a new room; host migration is not supported.');
      assert.equal(g.app.room.isHost, false, 'no guest took over as host');
    }
    assert.equal(W.hub.rooms.has('puttpals-circuit-v6-party'), false, 'nobody claimed the host ID');
    for (const c of all) await c.dispose();
    assert.equal(W.hub.rooms.size, 0, 'every transport left the hub');
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('cleanup: ten join/leave cycles keep one loop, no leaked listeners, timers or rooms; dispose releases everything', async () => {
    const W = world();
    const ana = await W.client('Ana');
    const baseListeners = ana.win.listenerCount(), baseTimers = W.scheduler.timerCount();
    assert.equal(W.scheduler.frameCount(), 1, 'one animation loop');
    for (let i = 0; i < 10; i++) {
      await ana.solo();
      await ana.click('Start Game');
      await ana.click(ana.$('[data-ui=map-select] button[data-v]'));
      await W.until(() => ana.ready(), 10000, 'ready');
      const shot = best(0, 0);
      await ana.shoot(shot.deg, shot.power);
      await W.run(1000);
      await ana.click('Card');
      await ana.click(ana.button('×') || ana.$('[aria-label="Close scorecard"]'));
      await act(async () => { ana.app.dispatch({ type: 'leave' }); });
      await W.settle();
      assert.ok(ana.shown('[data-ui=landing]'));
      assert.equal(ana.app.room, null);
      assert.equal(ana.app.putt, null);
      assert.equal(W.hub.rooms.size, 0, `cycle ${i}: transport closed`);
      assert.equal(W.scheduler.frameCount(), 1, `cycle ${i}: still one animation loop`);
      assert.equal(ana.win.listenerCount(), baseListeners, `cycle ${i}: no extra window/canvas listeners`);
      assert.equal(W.scheduler.timerCount(), baseTimers, `cycle ${i}: no leftover timers`);
    }
    assert.equal(ana.audio.resets, 10, 'audio voices reset on every leave');
    assert.equal(W.renderers.instances.length, 1, 'the renderer is reused, not recreated');
    await ana.dispose();
    assert.equal(ana.win.listenerCount(), 0, 'dispose removes every window/document/canvas listener');
    assert.equal(W.scheduler.frameCount(), 0, 'animation loop stopped');
    assert.equal(W.scheduler.timerCount(), 0, 'no timers left');
    assert.equal(W.renderers.instances[0].disposed, true, 'WebGL renderer disposed');
    assert.equal(ana.audio.disposed, true); assert.equal(ana.audio.bound, 0, 'audio gesture bindings removed');
    assert.equal(ana.$('#root').children.length, 0, 'UI unmounted');
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('runtime: the app bundle imports modules directly; no legacy source extraction, VM or HTML markers', async () => {
    // Code only: doc comments may name the legacy page they were ported from.
    const bundle = fs.readFileSync(modulePath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const marker of ['runInContext', 'node:vm', 'legacy-adapter', "'putt-pals.html'", '"putt-pals.html"', "'tools.js'", '<script id="game">', 'CLI_BOUNDARY', 'readFileSync', 'new Function(']) {
      assert.equal(bundle.includes(marker), false, `bundle code contains ${marker}`);
    }
    const sources = fs.readdirSync(path.join(root, 'src/app')).map(f => fs.readFileSync(path.join(root, 'src/app', f), 'utf8')).join('\n');
    assert.equal(/from ['"]\.\.\/\.\.\/tools|legacy-adapter|readFileSync/.test(sources), false, 'app sources read no legacy files');
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('library: pinned Three.js preserves legacy course object topology and transforms', async () => {
    const html = fs.readFileSync(path.join(root, 'putt-pals.html'), 'utf8');
    const embedded = new JSDOM('', { runScripts: 'outside-only' }).window;
    embedded.eval(html.match(/<script>\/\* three\.js \(inlined\) \*\/([\s\S]*?)<\/script>/)[1]);
    assert.equal(embedded.THREE.REVISION, '128');
    const pinned = require('../package.json').dependencies.three;
    assert.equal(THREE.REVISION, pinned.split('.')[1], 'runtime uses the pinned Three.js revision');
    const { buildCourseScene, createMaterialLibrary } = await import('../src/render/index.js');
    const { createCourseData } = await import('../src/courses/index.js');
    const { definitions } = createCourseData();
    const ctx = new Proxy(function () {}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : ctx), set: () => true, apply: () => ctx });
    const canvas = () => ({ width: 0, height: 0, getContext: () => ctx });
    // Current TorusGeometry exposes tube-angle defaults that r128 did not record.
    const dimensions = geometry => ({
      ...(geometry.type === 'TorusGeometry' ? { thetaStart: 0, thetaLength: Math.PI * 2 } : {}),
      ...Object.fromEntries(Object.entries(geometry.parameters || {}).filter(([key]) => !/Segments$/.test(key))),
    });
    // R2c #57: displayColor() materials hold raw sRGB components, so read them back unconverted.
    const describe = o => ({
      type: o.type, p: o.position.toArray(), r: o.rotation.toArray().slice(0, 3), s: o.scale.toArray(),
      // Segment defaults can change between Three.js releases; authored dimensions must not.
      g: o.geometry && !o.isSprite ? { type: o.geometry.type, dimensions: dimensions(o.geometry) } : null,
      m: o.material ? { t: o.material.type, c: o.material.color?.getHex(o.material.userData.displayColor ? 'srgb-linear' : undefined), tr: o.material.transparent, side: o.material.side, shader: !!o.material.isShaderMaterial } : null,
      c: o.children.map(describe),
    });
    let builds = 0;
    for (let map = 0; map < definitions.length; map++) {
      const scenes = [THREE, embedded.THREE].map(T => {
        // V1a #58: the legacy style, as on r128; the toon layout is compared with it in render-modern.test.cjs.
        const library = createMaterialLibrary({ THREE: T, createCanvas: canvas, random: () => 0.5, style: 'legacy' });
        const build = buildCourseScene({ library, course: definitions[map], puttIndex: 0 });
        const d = describe(build.group);
        build.dispose(); library.dispose();
        return JSON.parse(JSON.stringify(d)); // same-realm plain data (the embedded build lives in a jsdom realm)
      });
      assert.deepEqual(scenes[0], scenes[1], `course ${map}`);
      builds++;
    }
    assert.equal(builds, 22);
  });

  await scenario('webgl unavailable: a throwing renderer factory leaves the start screen usable, shows the notice and solo play does not crash', async () => {
    const w = world();
    const c = await w.client('Ana', { createWebGLRenderer: () => { throw new Error('Error creating WebGL context.'); } });
    assert.equal(c.shown('[data-ui=landing]'), true);
    assert.equal(c.shown('[data-ui=webgl-notice]'), true);
    const text = c.text('[data-ui=webgl-notice]');
    assert.equal(text.includes('WebGL'), true);
    assert.equal(text.includes('hardware acceleration'), true);
    assert.equal(text.includes('another desktop browser'), true);
    assert.equal(c.app.renderer, null);
    assert.equal(c.app.view, null);
    assert.equal(c.app.input, null);
    await c.solo();
    await c.click('Start Game');
    await c.click(c.$('[data-ui=map-select] button[data-v]'));
    await w.until(() => c.shown('[data-ui=game]'), 5000, 'game screen');
    assert.equal(c.text('[data-ui=hud-info]'), 'Switchback Garden · PUTT 1/6 · PAR 2 · STROKES 0 · 2:00');
    assert.ok(c.putt, 'the round starts without a 3D view');
    await c.shoot(0, 0.5);
    for (const label of ['View: Ball cam', 'Quality: High']) await c.click(label);
    await w.run(2000);
    assert.equal(c.shown('[data-ui=webgl-notice]'), true, 'the notice stays visible in game');
    assert.equal(w.renderers.instances.length, 0);
    const ok = await world().client('Ok');
    assert.equal(ok.shown('[data-ui=webgl-notice]'), false);
    assert.equal(ok.text('[data-ui=webgl-notice]'), '');
    assert.equal(Boolean(ok.app.renderer), true);
    await c.dispose();
    await ok.dispose();
  });

  await scenario('guest recovery: a dropped guest reconnects to the same seat mid-round, and a reload resumes it with its scores', async () => {
    const W = world();
    const ana = await W.client('Ana'); await ana.join('resume');
    const ben = await W.client('Ben'); await ben.join('resume');
    const benId = ben.app.room.localId, hostId = ana.app.room.localId;
    await ana.click('Start Game');
    await W.until(() => ben.shown('[data-ui=map-select]'), 3000, 'voting');
    for (const c of [ana, ben]) await c.click(c.$('[data-ui=map-select] button[data-v]'));
    await W.until(() => ana.ready() && ben.ready(), 10000, 'map start');
    // Network loss (no LEAVE): Ben sees a reconnecting notice, the host keeps his seat.
    await act(async () => { W.hub.rooms.get(hostId).detach(benId); });
    await W.settle();
    assert.equal(ben.text('[role=alert]'), 'Connection dropped. Reconnecting… your place in the room is kept for 30 seconds.');
    assert.equal(ana.snapshot.players[benId].connected, true, 'the seat is held during grace');
    await W.until(() => ben.app.room.connected, 5000, 'automatic reconnect');
    assert.equal(ben.app.room.localId, benId, 'same identity'); assert.equal(ben.$('[role=alert]').hidden, true);
    assert.equal(ben.snapshot.players[benId].connected, true); assert.equal(ben.snapshot.roster.includes(benId), true);
    await W.playPutt([ana, ben]);
    await W.until(() => ana.snapshot.players[benId].scores.length === 1, 30000, 'putt recorded for both');
    assert.equal(ana.snapshot.players[benId].scores[0].score, 1, "Ben's hole in one after reconnecting counts");
    // Reload: pagehide disposes the app (sending LEAVE), sessionStorage survives in the tab.
    const stored = ben.win.w.sessionStorage.getItem('putt-pals:resume:resume');
    assert.ok(stored && JSON.parse(stored).peerId === benId, 'identity stored per room code');
    await ben.dispose();
    await W.run(100);
    assert.equal(ana.snapshot.players[benId].connected, false);
    const reloaded = await W.client('Ben3', { url: 'http://localhost/#room=resume', storage: { 'putt-pals:resume:resume': stored } });
    const [n, r] = reloaded.doc.querySelectorAll('[data-ui=landing] input');
    assert.equal(n.value, 'Ben', 'the name is prefilled after reload'); assert.equal(r.value, 'resume');
    await reloaded.click('Join room');
    await W.until(() => reloaded.app.room?.connected && reloaded.snapshot?.players[benId]?.connected, 5000, 'resumed seat');
    assert.equal(reloaded.app.room.localId, benId);
    assert.equal(reloaded.snapshot.players[benId].scores[0].score, 1, 'scores survive the reload');
    // An explicit Leave forgets the identity: the next join is a fresh seat.
    await act(async () => { reloaded.app.dispatch({ type: 'leave' }); });
    assert.equal(reloaded.win.w.sessionStorage.getItem('putt-pals:resume:resume'), null);
    for (const c of [ana, reloaded]) await c.dispose();
  });

  await scenario('capacity: eight clients fill a room and play; a ninth is told the room is full; no WebRTC is explained up front', async () => {
    const W = world();
    const names = ['Ana', 'Ben', 'Cy', 'Dee', 'Eve', 'Fin', 'Gus', 'Hal'];
    const all = [];
    for (const n of names) { const c = await W.client(n); await c.join('crowd'); all.push(c); }
    await W.run(300);
    assert.equal(all[0].text('[data-ui=room-lobby] p'), 'Room CROWD · 8 players · You are the host');
    assert.equal(all[7].text('[data-ui=room-lobby] p'), 'Room CROWD · 8 players · Waiting for host');
    const late = await W.client('Ivy');
    const [n, r] = late.doc.querySelectorAll('[data-ui=landing] input');
    await late.fill(n, 'Ivy'); await late.fill(r, 'crowd'); await late.click('Join room');
    await W.run(200);
    assert.equal(late.shown('[data-ui=landing]'), true, 'the ninth player stays on the start screen');
    assert.equal(late.text('[data-ui=connect-error]'), 'That room is full (8 players). Ask someone to leave, or use a different room code.');
    assert.equal(late.app.room, null);
    assert.equal(late.button('Join room').disabled, false, 'the player can try again');
    await all[0].click('Start Game');
    await W.until(() => all.slice(1).every(c => c.shown('[data-ui=map-select]')), 3000, 'guests voting');
    for (const c of all) await c.click(c.$('[data-ui=map-select] button[data-v]'));
    await W.until(() => all.every(c => c.ready()), 10000, 'eight-player map start');
    await W.run(500);
    assert.equal([...all[3].$('[data-ui=scoreboard]').children].length, 9, 'eight players on the scoreboard');
    assert.ok(all[0].app.renderer.remoteCount >= 7, 'the host renders seven guests');
    const offline = await W.client('Joe', { memoryTransport: false });
    const [n2, r2] = offline.doc.querySelectorAll('[data-ui=landing] input');
    await offline.fill(n2, 'Joe'); await offline.fill(r2, 'crowd'); await offline.click('Join room');
    assert.match(offline.text('[data-ui=connect-error]'), /WebRTC is unavailable/);
    assert.equal(offline.shown('[data-ui=landing]'), true);
    for (const c of [...all, late, offline]) await c.dispose();
  });

  await scenario('protocol: presence carries validated, optional aura and attack fields', async () => {
    const { validPresence, PRESENCE_EFFECTS } = await import('../src/network/protocol.js');
    const base = { x: 1, y: 2, z: 0, mode: 'play', strokes: 1 };
    assert.equal(validPresence(base), true, 'fields stay optional');
    for (const effect of PRESENCE_EFFECTS) assert.equal(validPresence({ ...base, effect }), true);
    assert.equal(validPresence({ ...base, effect: 'nuke' }), false);
    for (const t of ['rev', 'zany', 'rew']) assert.equal(validPresence({ ...base, effect: t }), false, 'removed power-up ' + t);
    for (const fx of [{ id: 3, t: 'zany' }, { id: 3, t: 'rev' }, { id: 3, t: 'mag' }, { id: -1, t: 'mag' }, { id: 1, t: 'steady', extra: 1 }, 'mag', null]) assert.equal(validPresence({ ...base, fx }), false, JSON.stringify(fx));
    assert.equal(validPresence({ ...base, colour: 1 }), false, 'unknown fields are still rejected');
  });

  console.log(`App: ${passed} scenarios passed (jsdom clients with stub WebGL/audio and the in-memory transport; real-browser evidence is separate).`);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
