const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Param {
  constructor(value = 1) { this.value = value; this.calls = []; }
  setValueAtTime(value, time) { this.calls.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.calls.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.calls.push(['exponential', value, time]); }
}
class Node {
  constructor(kind, modern = true) {
    this.kind = kind; this.connections = []; this.disconnected = false; this.gain = new Param(); this.frequency = new Param();
    this.starts = []; this.stops = []; this.type = null;
    if (modern) for (const prefix of ['position', 'forward', 'up']) for (const axis of ['X', 'Y', 'Z']) this[prefix + axis] = new Param(0);
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
  start(time) { this.starts.push(time); }
  stop(time) { this.stops.push(time); }
  setPosition(...values) { this.position = values; }
  setOrientation(...values) { this.orientation = values; }
  end() { this.onended?.(); }
}
class Context {
  constructor({ modern = true, state = 'suspended', resume = 'resolve' } = {}) {
    this.state = state; this.resumeMode = resume; this.modern = modern; this.currentTime = 3; this.sampleRate = 8000;
    this.nodes = []; this.destination = new Node('destination'); this.listener = new Node('listener', modern);
    this.resumeCalls = 0; this.closeCalls = 0; this.buffers = [];
  }
  make(kind) { const n = new Node(kind, this.modern); this.nodes.push(n); return n; }
  createGain() { return this.make('gain'); }
  createOscillator() { return this.make('oscillator'); }
  createBufferSource() { return this.make('noise'); }
  createBiquadFilter() { return this.make('filter'); }
  createPanner() { return this.make('panner'); }
  createBuffer(channels, length, sampleRate) {
    const samples = new Float32Array(length), buffer = { channels, length, sampleRate, getChannelData: () => samples };
    this.buffers.push(buffer); return buffer;
  }
  resume() {
    this.resumeCalls++;
    if (this.resumeMode === 'reject') return Promise.reject(new Error('blocked'));
    if (this.resumeMode === 'pending') return new Promise(resolve => { this.resolveResume = () => { this.state = 'running'; resolve(); }; });
    this.state = 'running'; return Promise.resolve();
  }
  close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
  sources() { return this.nodes.filter(n => ['oscillator', 'noise'].includes(n.kind)); }
  endAll() { for (const n of this.sources()) n.end(); }
}
class Gestures {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type) { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(); }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
(async () => {
  const { createAudioAdapter } = await import('../src/audio/index.js');
  const { SimulationEngine } = await import('../src/simulation/index.js');
  const { createCourseDocument, toSimulationCourses } = await import('../src/courses/index.js');
  let passed = 0;
  const run = async (name, fn) => { await fn(); passed++; console.log('PASS:', name); };
  const make = (options = {}, contextOptions = {}) => {
    const contexts = [], errors = [], values = new Map();
    const adapter = createAudioAdapter({ createContext: () => { const c = new Context(contextOptions); contexts.push(c); return c; },
      random: () => .25, storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
      onError: error => errors.push(error.message), ...options });
    return { adapter, contexts, errors, values, get c() { return contexts[0]; } };
  };
  // Migration-only reference execution: production audio never reads or evaluates legacy source.
  const html = fs.readFileSync(require('node:path').join(__dirname, '../putt-pals.html'), 'utf8');
  const marker = 'function tone(c,out,type,f0,f1,t0,dur,vol){';
  assert.equal(html.split(marker).length, 2);
  const referenceSource = marker + html.split(marker)[1].split('\nfunction sfx(')[0] + '\nSFX;';
  const signature = c => c.sources().map(source => {
    const chain = []; let node = source;
    // Stop at the per-voice output gain; only synthesis nodes/envelopes belong to the recipe.
    while (node && (node === source || node.frequency.calls.length || node.gain.calls.length)) {
      chain.push({ kind: node.kind, type: node.type, frequency: node.frequency.calls, gain: node.gain.calls }); node = node.connections[0];
    }
    return { chain, starts: source.starts, stops: source.stops };
  });
  await run('every legacy sound preserves waveform, pitch, filters, envelopes and scheduling', async () => {
    const names = ['putt', 'bounce', 'sink', 'sinkover', 'hio', 'power', 'event', 'splash', 'teleport', 'warp', 'boing'];
    for (const name of names) {
      const f = make(); await f.adapter.unlock();
      const reference = new Context({ state: 'running' });
      const recipes = vm.runInNewContext(referenceSource, { aNoise: reference.createBuffer(1, 4000, 8000), Math: { random: () => .25, max: Math.max } });
      recipes[name](reference, reference.currentTime, reference.createGain());
      assert.equal(f.adapter.play(name), true);
      assert.deepEqual(signature(f.c), signature(reference), name);
      assert.equal(f.c.buffers[0].length, 4000); assert.equal(f.c.buffers[0].getChannelData(0)[0], -.5);
      f.c.endAll(); assert.equal(f.adapter.getStatus().activeVoices, 0);
      await f.adapter.dispose(); assert.equal(f.c.closeCalls, 1);
    }
  });
  await run('menu, turn-ready and ring cues (M1d) play as short voices and route through handleEvent', async () => {
    for (const [name, event] of [['menu_hover', { type: 'ui', kind: 'hover' }], ['menu_click', { type: 'ui', kind: 'click' }], ['ready', { type: 'turn_ready' }], ['ring', { type: 'ring' }]]) {
      const f = make(); await f.adapter.unlock();
      assert.equal(f.adapter.play(name), true, name + ' recipe exists');
      assert.ok(f.adapter.getStatus().activeVoices >= 1, name + ' builds a voice');
      f.c.endAll(); assert.equal(f.adapter.getStatus().activeVoices, 0, name + ' voice ends');
      assert.equal(f.adapter.handleEvent(event), true, name + ' event routes');
      f.c.endAll();
      assert.equal(f.adapter.handleEvent(event, { remote: true }), false, 'remote players never trigger local feedback');
      f.adapter.setMuted(true); assert.equal(f.adapter.handleEvent(event), false, 'muted is silent');
      await f.adapter.dispose();
    }
    const f = make(); await f.adapter.unlock();
    assert.equal(f.adapter.handleEvent({ type: 'ui', kind: 'drag' }), false, 'unknown ui kinds are ignored');
    await f.adapter.dispose();
  });
  await run('gesture unlock is lazy, duplicate bindings/resume are shared, and dispose removes listeners', async () => {
    const f = make({}, { resume: 'pending' }), target = new Gestures();
    assert.equal(f.adapter.play('putt'), false); assert.equal(f.contexts.length, 0);
    const unbind = f.adapter.bindGestures(target); assert.equal(f.adapter.bindGestures(target), unbind); assert.equal(target.count(), 4);
    target.emit('pointerdown'); target.emit('keydown'); target.emit('click');
    assert.equal(f.contexts.length, 1); assert.equal(f.c.resumeCalls, 1);
    f.c.resolveResume(); assert.equal(await f.adapter.unlock(), true);
    assert.equal(f.adapter.play('event'), true); unbind(); assert.equal(target.count(), 0);
    f.adapter.bindGestures(target); unbind(); assert.equal(target.count(), 4);
    await f.adapter.dispose(); await f.adapter.dispose(); assert.equal(f.c.closeCalls, 1);
    target.emit('click'); assert.equal(f.contexts.length, 1);
    assert.equal(await f.adapter.unlock(), false); assert.equal(f.adapter.play('event'), false);
  });
  await run('mute persists, stops scheduled tails, unmute previews once, and denied storage is harmless', async () => {
    const values = new Map([['pp_mute', '1']]);
    const f = make({ storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } });
    assert.equal(f.adapter.getStatus().muted, true); await f.adapter.unlock();
    assert.equal(f.c.nodes[0].gain.value, 0); assert.equal(f.adapter.play('sink'), false);
    assert.equal(await f.adapter.toggleMute(), false); assert.equal(values.get('pp_mute'), '0');
    assert.equal(f.c.nodes[0].gain.value, .7); assert.equal(f.adapter.getStatus().activeVoices, 1);
    f.adapter.setMuted(true); assert.equal(values.get('pp_mute'), '1'); assert.equal(f.adapter.getStatus().activeVoices, 0);
    assert.equal(f.c.sources()[0].onended, null); assert.equal(f.c.sources()[0].disconnected, true);
    await f.adapter.dispose();
    const denied = make({ storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } });
    assert.equal(denied.adapter.setMuted(true), true); assert.equal(await denied.adapter.unlock(), true); await denied.adapter.dispose();
  });
  await run('spatial panners and listener use world coordinates, including legacy WebAudio setters', async () => {
    for (const modern of [true, false]) {
      const f = make({}, { modern }); await f.adapter.unlock();
      f.adapter.handleEvent({ type: 'shot', position: [10, 20, 30], power: 1 }, { origin: [100, 200] });
      const panner = f.c.nodes.find(n => n.kind === 'panner');
      assert.equal(panner.panningModel, 'equalpower'); assert.equal(panner.distanceModel, 'inverse');
      assert.equal(panner.refDistance, 250); assert.equal(panner.rolloffFactor, .6); assert.equal(panner.maxDistance, 4000);
      assert.deepEqual(modern ? [panner.positionX.value, panner.positionY.value, panner.positionZ.value] : panner.position, [110, 35, 220]);
      assert.equal(f.adapter.updateListener({ position: [1, 2, 3], forward: [0, 0, -1] }), true);
      assert.deepEqual(modern ? [f.c.listener.positionX.value, f.c.listener.positionY.value, f.c.listener.positionZ.value] : f.c.listener.position, [1, 2, 3]);
      if (!modern) assert.deepEqual(f.c.listener.orientation, [0, 0, -1, 0, 1, 0]);
      assert.equal(f.adapter.updateListener({ position: [NaN, 0, 0], forward: [0, 0, -1] }), false);
      await f.adapter.dispose();
    }
  });
  await run('domain events select local/remote cues, banners and transitions without duplicating fanfare', async () => {
    const f = make(); await f.adapter.unlock();
    const event = (type, fields = {}, options) => { f.adapter.resetSession(); return f.adapter.handleEvent({ type, position: [1, 2, 0], ...fields }, options); };
    const sources = () => f.c.sources().length;
    const cases = [['shot', { power: .5 }, 2], ['bounce', {}, 2], ['sink', { timedOut: false, holeInOne: true }, 5],
      ['sink', { timedOut: true }, 2], ['timeout', {}, 2], ['out_of_bounds', {}, 2],
      ['hazard', { hazardType: 'pad' }, 2], ['hazard', { hazardType: 'teleporter' }, 2],
      ['banner', { kind: 'hio' }, 6], ['banner', { kind: 'power' }, 2], ['banner', { kind: 'event' }, 1], ['putt_change', {}, 3]];
    for (const [type, fields, expected] of cases) { const before = sources(); assert.equal(event(type, fields), true, type); assert.equal(sources() - before, expected, type); }
    for (const type of ['rest', 'cup_lip', 'surface_change', 'constructor', '__proto__']) assert.equal(event(type), false);
    assert.equal(event('hazard', { hazardType: 'unknown' }), false);
    assert.equal(event('putt_change', { initial: true }), false);
    assert.equal(event('bounce', {}, { remote: true }), false);
    assert.equal(event('shot', { power: .5 }, { remote: true }), true);
    assert.equal(f.c.nodes.filter(n => n.kind === 'gain' && n.gain.value === .8).length > 0, true);
    await f.adapter.dispose();
  });
  await run('actual simulation launch/step events drive audio while physics stays DOM-free', async () => {
    const f = make(); await f.adapter.unlock();
    const simulation = new SimulationEngine(toSimulationCourses(createCourseDocument())[0]);
    simulation.addPlayer('local', 'Player');
    // S2's separately measured cup-capture solution; legacy 31° now lips out.
    const shot = simulation.launch('local', 32 * Math.PI / 180, .8);
    assert.equal(f.adapter.handleEvent(shot), true);
    let heardSink = false;
    for (let i = 0; i < 1000 && !heardSink; i++) for (const event of simulation.step().events) {
      const played = f.adapter.handleEvent(event);
      if (event.type === 'sink') { assert.equal(played, true); heardSink = true; }
      f.c.endAll();
    }
    assert.equal(heardSink, true); simulation.dispose(); await f.adapter.dispose();
  });
  await run('ended voices, reset, capacity and repeated room cycles release all owned nodes', async () => {
    const f = make({ maxVoices: 2 }); await f.adapter.unlock();
    assert.equal(f.adapter.play('sink', { x: 1, y: 2, z: 3 }), true);
    assert.equal(f.adapter.play('hio'), true); assert.equal(f.adapter.play('event'), false);
    f.c.endAll(); assert.equal(f.adapter.getStatus().activeVoices, 0);
    for (let i = 0; i < 20; i++) { await f.adapter.unlock(); f.adapter.play('warp'); f.adapter.resetSession(); }
    assert.equal(f.contexts.length, 1); assert.equal(f.c.resumeCalls, 1);
    assert.equal(f.adapter.getStatus().activeVoices, 0);
    for (const node of f.c.nodes.slice(1)) assert.equal(node.disconnected, true, node.kind);
    const pending = f.adapter.play('sink'); assert.equal(pending, true);
    const disposed = f.adapter.dispose(); assert.equal(f.adapter.dispose(), disposed); await disposed;
    for (const node of f.c.nodes) assert.equal(node.disconnected, true, node.kind);
    for (const source of f.c.sources()) assert.equal(source.onended, null);
  });
  await run('unsupported/failed/resume-denied contexts and dispose-during-unlock remain safe', async () => {
    const unsupported = createAudioAdapter({ createContext: () => null }); assert.equal(await unsupported.unlock(), false); await unsupported.dispose();
    const broken = make({ createContext: () => { throw new Error('unavailable'); } });
    assert.equal(await broken.adapter.unlock(), false); assert.deepEqual(broken.errors, ['unavailable']); await broken.adapter.dispose();
    const denied = make({}, { resume: 'reject' }); assert.equal(await denied.adapter.unlock(), false); assert.equal(denied.adapter.play('event'), false);
    denied.c.resumeMode = 'resolve'; assert.equal(await denied.adapter.unlock(), true); assert.equal(denied.contexts.length, 1); await denied.adapter.dispose();
    const race = make({}, { resume: 'pending' }); const unlock = race.adapter.unlock(); await race.adapter.dispose(); race.c.resolveResume();
    assert.equal(await unlock, false); assert.equal(race.adapter.getStatus().disposed, true); assert.equal(race.c.closeCalls, 1);
    const partial = new Context(); partial.createBuffer = () => { throw new Error('allocation failed'); };
    const failed = make({ createContext: () => partial }); assert.equal(await failed.adapter.unlock(), false); assert.equal(partial.closeCalls, 1); await failed.adapter.dispose();
  });
  await run('invalid cues and failed voice construction do not allocate or retain audio graphs', async () => {
    const f = make(); await f.adapter.unlock(); const before = f.c.nodes.length;
    for (const name of ['constructor', '__proto__', 'unknown', {}, null]) assert.equal(f.adapter.play(name), false);
    assert.equal(f.adapter.play('event', { x: Infinity, y: 0, z: 0 }), false);
    assert.equal(f.adapter.play('event', null, -1), false);
    assert.equal(f.c.nodes.length, before);
    f.c.createOscillator = () => { throw new Error('node creation failed'); };
    assert.equal(f.adapter.play('putt', { x: 0, y: 0, z: 0 }), false);
    assert.equal(f.adapter.getStatus().activeVoices, 0);
    for (const node of f.c.nodes.slice(before)) assert.equal(node.disconnected, true);
    assert.deepEqual(f.errors, ['node creation failed']); await f.adapter.dispose();
    const partial = new Context(); let resolveClose;
    partial.createBuffer = () => { throw new Error('allocation'); };
    partial.close = () => { partial.closeCalls++; return new Promise(resolve => { resolveClose = resolve; }); };
    let creates = 0;
    const failed = createAudioAdapter({ storage: null, createContext: () => { creates++; return partial; } });
    const first = failed.unlock(); assert.equal(failed.unlock(), first); assert.equal(creates, 1);
    assert.equal(partial.nodes[0].disconnected, true);
    let disposed = false; const disposing = failed.dispose().then(() => { disposed = true; });
    await Promise.resolve(); assert.equal(disposed, false); resolveClose(); assert.equal(await first, false); await disposing; assert.equal(disposed, true);
  });
  console.log(`Audio: ${passed} scenarios passed (instrumented nodes; no listening claim).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
