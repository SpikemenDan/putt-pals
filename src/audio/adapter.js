import { createRecipes } from './recipes.js';
import { simToWorld } from '../shared/coords.js';
import { SHOT_POWER } from '../shared/constants.js';

const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const point = p => p && [p.x, p.y, p.z].every(Number.isFinite);
const defaultContext = () => {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return Context ? new Context() : null;
};
const defaultStorage = () => { try { return globalThis.window?.localStorage ?? null; } catch { return null; } };

/** Application-owned audio: reuse across rooms; reset voices per room; dispose on app teardown. */
export function createAudioAdapter({ createContext = defaultContext, storage = defaultStorage(), random = Math.random,
  onError = () => {}, maxVoices = 32 } = {}) {
  if (typeof createContext !== 'function' || typeof random !== 'function' || typeof onError !== 'function'
    || !Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > 128) throw new Error('Invalid audio dependencies');
  let context = null, master = null, noise = null, muted = false, disposed = false, resumePending = null, closePending = null, failedClose = null;
  const voices = new Set(), bindings = new Map();
  const report = error => { try { onError(error); } catch { /* Diagnostics must not interrupt game teardown. */ } };
  try { muted = storage?.getItem('pp_mute') === '1'; } catch { /* Storage can be denied. */ }
  const disconnect = node => { try { node.disconnect(); } catch { /* Already disconnected. */ } };
  const closeContext = c => {
    try { return Promise.resolve(c?.close()).catch(report); } catch (error) { report(error); return Promise.resolve(); }
  };
  function finishVoice(voice, stop = false) {
    if (!voices.delete(voice)) return;
    for (const source of voice.sources) {
      source.onended = null;
      if (stop) { try { source.stop(); } catch { /* It may have already ended. */ } }
    }
    for (const node of voice.nodes) disconnect(node);
    voice.nodes.clear(); voice.sources.clear();
  }
  function source(voice, node, t, duration) {
    voice.sources.add(node);
    node.onended = () => { node.onended = null; voice.sources.delete(node); if (!voice.building && voice.sources.size === 0) finishVoice(voice); };
    node.start(t); node.stop(t + duration + .03);
  }
  function buildRecipes(voice) {
    const node = value => { voice.nodes.add(value); return value; };
    const tone = (c, out, type, f0, f1, t0, duration, volume) => {
      const oscillator = node(c.createOscillator()), gain = node(c.createGain());
      oscillator.type = type; oscillator.frequency.setValueAtTime(f0, t0);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + duration);
      gain.gain.setValueAtTime(.0001, t0); gain.gain.linearRampToValueAtTime(volume, t0 + .006);
      gain.gain.exponentialRampToValueAtTime(.0001, t0 + duration);
      oscillator.connect(gain); gain.connect(out); source(voice, oscillator, t0, duration);
    };
    const puff = (c, out, type, f0, f1, t0, duration, volume) => {
      const buffer = node(c.createBufferSource()), filter = node(c.createBiquadFilter()), gain = node(c.createGain());
      buffer.buffer = noise; filter.type = type; filter.frequency.setValueAtTime(f0, t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + duration);
      gain.gain.setValueAtTime(volume, t0); gain.gain.exponentialRampToValueAtTime(.0001, t0 + duration);
      buffer.connect(filter); filter.connect(gain); gain.connect(out); source(voice, buffer, t0, duration);
    };
    return createRecipes({ tone, puff, random });
  }
  function unlock() {
    if (disposed) return Promise.resolve(false);
    if (resumePending) return resumePending;
    if (!context) {
      let created, gain;
      try {
        created = createContext();
        if (!created) return Promise.resolve(false);
        gain = created.createGain(); gain.gain.value = muted ? 0 : .7; gain.connect(created.destination);
        const buffer = created.createBuffer(1, Math.floor(created.sampleRate * .5), created.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
        context = created; master = gain; noise = buffer;
      } catch (error) {
        report(error); if (gain) disconnect(gain);
        if (!created) return Promise.resolve(false);
        failedClose = closeContext(created);
        resumePending = failedClose.then(() => false).finally(() => { resumePending = null; });
        return resumePending;
      }
    }
    if (context.state === 'closed') return Promise.resolve(false);
    if (context.state === 'running') return Promise.resolve(true);
    try {
      // Call resume synchronously in the gesture handler; do not await before unlocking.
      resumePending = Promise.resolve(context.resume()).then(() => !disposed && context?.state === 'running', error => { report(error); return false; })
        .finally(() => { resumePending = null; });
      return resumePending;
    } catch (error) { report(error); return Promise.resolve(false); }
  }
  function play(name, position = null, volume = 1) {
    if (typeof name !== 'string' || disposed || muted || !context || context.state !== 'running' || voices.size >= maxVoices
      || (position !== null && !point(position)) || !Number.isFinite(volume) || volume < 0 || volume > 1) return false;
    const voice = { nodes: new Set(), sources: new Set(), building: true };
    const recipes = buildRecipes(voice);
    if (!Object.hasOwn(recipes, name)) return false;
    voices.add(voice);
    try {
      const gain = context.createGain(); voice.nodes.add(gain); gain.gain.value = volume;
      if (position && context.createPanner) {
        const panner = context.createPanner(); voice.nodes.add(panner);
        panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse';
        panner.refDistance = 250; panner.rolloffFactor = .6; panner.maxDistance = 4000;
        if (panner.positionX) { panner.positionX.value = position.x; panner.positionY.value = position.y; panner.positionZ.value = position.z; }
        else panner.setPosition(position.x, position.y, position.z);
        gain.connect(panner); panner.connect(master);
      } else gain.connect(master);
      recipes[name](context, context.currentTime, gain); voice.building = false;
      if (voice.sources.size === 0) finishVoice(voice);
      return true;
    } catch (error) { report(error); finishVoice(voice, true); return false; }
  }
  function setMuted(value) {
    if (disposed || typeof value !== 'boolean') return false;
    muted = value;
    try { storage?.setItem('pp_mute', muted ? '1' : '0'); } catch { /* Optional persistence. */ }
    if (master) master.gain.value = muted ? 0 : .7;
    // Stop scheduled tails so unmuting cannot revive a stale sink/banner.
    if (muted) for (const voice of [...voices]) finishVoice(voice, true);
    return true;
  }
  async function toggleMute() {
    if (!setMuted(!muted)) return false;
    if (!muted && await unlock()) play('event', null, .5);
    return muted;
  }
  function bindGestures(target) {
    if (disposed) return () => {};
    if (!target?.addEventListener || !target?.removeEventListener) throw new Error('Gesture EventTarget required');
    if (bindings.has(target)) return bindings.get(target);
    const events = ['pointerdown', 'keydown', 'click', 'touchstart'];
    const handler = () => { void unlock(); };
    for (const event of events) target.addEventListener(event, handler, { capture: true, passive: true });
    let bound = true;
    const unbind = () => { if (!bound) return; bound = false; for (const event of events) target.removeEventListener(event, handler, true); bindings.delete(target); };
    bindings.set(target, unbind); return unbind;
  }
  function updateListener({ position, forward, up = [0, 1, 0] } = {}) {
    if (disposed || !context?.listener || !vector(position) || !vector(forward) || !vector(up)
      || Math.hypot(...forward) === 0 || Math.hypot(...up) === 0) return false;
    try {
      const listener = context.listener;
      if (listener.positionX) {
        ['position', 'forward', 'up'].forEach((prefix, i) => {
          const values = [position, forward, up][i];
          ['X', 'Y', 'Z'].forEach((axis, j) => { listener[prefix + axis].value = values[j]; });
        });
      } else { listener.setPosition(...position); listener.setOrientation(...forward, ...up); }
      return true;
    } catch (error) { report(error); return false; }
  }
  function handleEvent(event, { origin = [0, 0], remote = false, speed } = {}) {
    if (!event || typeof event.type !== 'string' || !Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite)) return false;
    if (remote && !['shot', 'sink', 'timeout'].includes(event.type)) return false;
    if (event.type === 'banner') return ['hio', 'power', 'event'].includes(event.kind) && play(event.kind, null, .9);
    if (event.type === 'putt_change') return event.initial !== true && play('warp');
    if (event.type === 'ui') return ['hover', 'click'].includes(event.kind) && play('menu_' + event.kind, null, event.kind === 'hover' ? .5 : .8);
    if (event.type === 'turn_ready') return play('ready', null, .8);
    if (event.type === 'ring') return play('ring', null, .6);
    if (!vector(event.position)) return false;
    const position = simToWorld(...event.position, origin);
    switch (event.type) {
      case 'shot': return play('putt', position, remote ? .8 : Math.min(1, .4 + (Number.isFinite(speed) ? Math.max(0, speed) / SHOT_POWER : Math.max(0, Math.min(1, Number.isFinite(event.power) ? event.power : 0))) * .6));
      case 'bounce': return play('bounce', position, Number.isFinite(speed) ? Math.min(1, .3 + Math.max(0, speed) / 500) : .6);
      case 'sink': return play(event.timedOut ? 'sinkover' : 'sink', position, remote ? .9 : 1);
      case 'timeout': return play('sinkover', position, remote ? .9 : 1);
      case 'out_of_bounds': return play('splash', position);
      case 'hazard': return event.hazardType === 'pad' ? play('boing', position, .8) : event.hazardType === 'teleporter' && play('teleport', position, .8);
      default: return false;
    }
  }
  function resetSession() { for (const voice of [...voices]) finishVoice(voice, true); }
  function dispose() {
    if (disposed) return closePending;
    disposed = true; for (const unbind of [...bindings.values()]) unbind(); resetSession();
    if (master) disconnect(master);
    const old = context; context = null; master = null; noise = null;
    closePending = failedClose ? Promise.all([closeContext(old), failedClose]).then(() => {}) : closeContext(old); return closePending;
  }
  return { unlock, play, setMuted, toggleMute, bindGestures, updateListener, handleEvent, resetSession, dispose,
    getStatus: () => Object.freeze({ muted, disposed, contextState: context?.state ?? (disposed ? 'closed' : 'uninitialized'), activeVoices: voices.size }) };
}
