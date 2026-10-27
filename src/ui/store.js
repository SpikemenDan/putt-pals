/**
 * External UI store for React's useSyncExternalStore.
 *
 * Inputs: the latest room snapshot (L1 shape), local player/app state and the
 * room clock. Output: one deeply frozen view snapshot. Sections that did not
 * change keep their previous object identity, so components selecting a
 * section skip re-rendering. Publishing is driven by the application (room
 * updates, local changes and a ~100 ms tick, as the legacy setInterval did),
 * never by the 240 Hz simulation.
 *
 * The store also owns transient notifications with legacy timing: toasts
 * clear after 3 s; banners queue, show 1.9 s (2.8 s for hole-in-one style)
 * and leave a 0.35 s gap. Timers come from the injected clock.
 */

import { SessionPhases } from '../shared/session.js';
import { hudView, lobbyView, resultsView, scorecardView, screensView, votingView } from './model.js';

export const TOAST_MS = 3000;
export const BANNER_MS = 1900;
export const BANNER_HIO_MS = 2800;
export const BANNER_GAP_MS = 350;

const DEFAULT_LOCAL = Object.freeze({
  active: false, connecting: false, connected: true, id: null, isHost: false, roomCode: '',
  mode: 'lobby', strokes: 0, inventory: [], soundOn: true, qualityHigh: true, viewLabel: 'Ball cam', colors: null,
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * @param {object} options
 * @param {ReturnType<import('./model.js').createCourseInfo>} options.courses
 * @param {{setTimeout: Function, clearTimeout: Function}} [options.clock=globalThis] Notification timers
 */
export function createUiStore({ courses, clock = globalThis }) {
  if (!courses) throw new TypeError('courses are required (createCourseInfo)');
  let room = null, local = { ...DEFAULT_LOCAL }, now = 0, cardOpen = false;
  let toast = '', toastTimer = null;
  let banner = { text: '', sub: '', kind: '', show: false };
  const bannerQueue = [];
  let bannerBusy = false, bannerTimer = null;
  let announcedRound = null, lastPhase = null;
  const holeInOnes = new Set();
  const knownScores = new Map();
  const hio = (player, key) => { if (!holeInOnes.has(key)) { holeInOnes.add(key); announce(player.name, 'HOLE IN ONE', 'hio'); } };
  const listeners = new Set();
  const cache = new Map();
  let snapshot = null, disposed = false;

  const reuse = (key, value) => {
    const json = JSON.stringify(value);
    const previous = cache.get(key);
    if (previous && previous.json === json) return previous.value;
    const frozen = deepFreeze(value);
    cache.set(key, { json, value: frozen });
    return frozen;
  };

  function compute() {
    const screens = screensView(room, local, now);
    const hasRoom = !!room && local.active;
    const view = {
      screens: reuse('screens', screens),
      landing: reuse('landing', { connecting: !!local.connecting }),
      lobby: reuse('lobby', hasRoom && screens.lobby ? lobbyView(room, local, now, courses) : null),
      voting: reuse('voting', hasRoom && screens.voting ? votingView(room, local, now, courses) : null),
      hud: reuse('hud', hasRoom && screens.game ? hudView(room, local, now, courses) : null),
      cardOpen,
      scorecard: reuse('scorecard', hasRoom && (cardOpen || screens.results) && room.phase !== SessionPhases.LOBBY && room.phase !== SessionPhases.SELECT ? scorecardView(room, local, courses) : null),
      results: reuse('results', hasRoom && screens.results ? resultsView(room, local, courses) : null),
      toast,
      banner: reuse('banner', { ...banner }),
    };
    return Object.freeze(view);
  }

  function publish() {
    if (disposed) return;
    const next = compute();
    if (snapshot && Object.keys(next).every(k => next[k] === snapshot[k])) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }

  // ---- notifications ----
  function nextBanner() {
    const item = bannerQueue.shift();
    if (!item) { bannerBusy = false; return; }
    bannerBusy = true;
    banner = { text: item.text, sub: item.sub || '', kind: item.kind || '', show: true };
    publish();
    bannerTimer = clock.setTimeout(() => {
      banner = { ...banner, show: false };
      publish();
      bannerTimer = clock.setTimeout(nextBanner, BANNER_GAP_MS);
    }, item.kind === 'hio' ? BANNER_HIO_MS : BANNER_MS);
  }
  function announce(text, sub = '', kind = '') {
    if (disposed) return;
    bannerQueue.push({ text: String(text), sub: String(sub), kind });
    if (!bannerBusy) nextBanner();
  }
  function showToast(text) {
    if (disposed) return;
    toast = String(text);
    clock.clearTimeout(toastTimer);
    toastTimer = clock.setTimeout(() => { toast = ''; publish(); }, TOAST_MS);
    publish();
  }

  /** Banner and card side effects of room transitions (legacy syncRoom/tick). */
  function observe() {
    if (!room || !local.active) return;
    const phase = room.phase;
    if (phase === SessionPhases.LOBBY || phase === SessionPhases.SELECT) cardOpen = false;
    if (phase === SessionPhases.PLAY && now >= room.roundStartTime && announcedRound !== room.roundNumber) {
      announcedRound = room.roundNumber;
      cardOpen = false;
      const course = courses[room.mapIndex];
      if (course.putts.length > 1) announce('PUTT ' + ((room.puttIndex | 0) + 1) + ' / ' + course.putts.length, course.name.toUpperCase(), 'event');
    }
    // Hole-in-one banners: from a live finished putt, or from a newly recorded score when the session
    // records the putt and starts the next one in the same update (e.g. the last player to finish).
    // At results the finished map is already in completedMaps; keep counting it as the current map.
    const mapNo = (room.completedMaps?.length | 0) - (phase === SessionPhases.RESULTS ? 1 : 0);
    for (const id of room.roster || []) {
      const p = room.players?.[id];
      if (!p) continue;
      const scores = p.scores || [];
      const known = knownScores.get(id);
      if (!known || known.mapNo !== mapNo || known.length > scores.length) knownScores.set(id, { mapNo, length: known && known.mapNo === mapNo ? Math.min(known.length, scores.length) : scores.length });
      const fresh = knownScores.get(id);
      for (let k = fresh.length; k < scores.length; k++) {
        if (scores[k]?.score === 1 && !scores[k].timedOut) hio(p, mapNo + ':' + k + ':' + id);
      }
      fresh.length = scores.length;
      if (phase === SessionPhases.PLAY && p.done && p.score === 1 && !p.timedOut) hio(p, mapNo + ':' + room.puttIndex + ':' + id);
    }
    if (phase === SessionPhases.RESULTS && lastPhase !== SessionPhases.RESULTS) {
      cardOpen = false;
      for (const b of resultsView(room, local, courses).banners) announce(b.text, b.sub, b.kind);
    }
    lastPhase = phase;
  }

  function openCard() { if (room && local.active) { cardOpen = true; publish(); } }
  function closeCard() { cardOpen = false; publish(); }

  snapshot = compute();

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    /** Latest room snapshot plus the room-clock time it applies at. */
    setRoom(next, at = now) { room = next; now = at; observe(); publish(); },
    /** Local player/app state: active, connecting, connected, id, isHost, roomCode, mode, strokes, inventory, soundOn, qualityHigh, viewLabel, colors. */
    setLocal(partial) {
      local = { ...local, ...partial };
      if (!local.active) {
        room = null; cardOpen = false; announcedRound = null; lastPhase = null; holeInOnes.clear(); knownScores.clear();
        // Leaving a room drops its pending toasts and banners.
        clock.clearTimeout(toastTimer); clock.clearTimeout(bannerTimer); toastTimer = bannerTimer = null;
        bannerQueue.length = 0; bannerBusy = false; toast = ''; banner = { ...banner, show: false };
      }
      observe(); publish();
    },
    /** Room-clock tick for countdowns and timers (legacy 100 ms interval). */
    tick(at) { now = at; observe(); publish(); },
    openCard,
    closeCard,
    toggleCard() { if (cardOpen) closeCard(); else openCard(); },
    toast: showToast,
    announce,
    dispose() {
      disposed = true;
      clock.clearTimeout(toastTimer);
      clock.clearTimeout(bannerTimer);
      bannerQueue.length = 0;
      listeners.clear();
    },
  };
}
