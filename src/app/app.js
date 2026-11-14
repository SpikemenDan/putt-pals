/**
 * The modular Putt Pals application: composes courses (D1), simulation (S1),
 * session (L1), transports (N1), audio (A1), renderer/camera (R1) and the
 * React UI and input (U1). It owns exactly one animation-frame loop and one
 * HUD tick, and dispose() releases every listener, timer, room, GPU and audio
 * resource it created.
 */

import { createAudioAdapter } from '../audio/index.js';
import { CAMERA_VIEW_LABELS } from '../camera/index.js';
import { loadCosmetics, saveCosmetics, selectCosmetic } from '../cosmetics/index.js';
import { createCourseData } from '../courses/index.js';
import { createInputAdapter } from '../input/index.js';
import { DISPLAY } from '../shared/display.js';
import { createRemoteInterpolator } from '../network/interpolation.js';
import { createGameRenderer, createGameView, resolveRenderCourse } from '../render/index.js';
import { DEPLOYABLE_PARAMS, activeDeployables, addToInventory, placementClear, placementFloor, aimModeOf, auraSourcesOf, ballRadiusOf, coursePlace, getPowerup, hazardVariant, powerupPolicy, startingInventory } from '../gameplay/index.js';
import { BALL_RADIUS, MAX_DEPLOYABLES } from '../shared/constants.js';
import { isColorIndex } from '../shared/colors.js';
import { GameModes, SessionPhases } from '../shared/session.js';
import { worldGravity, courseWorld } from '../shared/worlds.js';
import { AIM_WOBBLE, DEFAULT_RULES, rulesTuning, seriesMaps, validateRules, validRules } from '../shared/rules.js';
import { createAtlasScene } from '../render/atlas-scene.js';
import { createPlanetScene } from '../render/planet-scene.js';
import { colorOf, connectErrorMessage, createCourseInfo, createUiDispatcher, createUiStore, initialRoomCode, MESSAGES, mountUi, parseJoinRequest, UiCommands } from '../ui/index.js';
import { createPutt } from './putt.js';
import { openRoom } from './room.js';
import { frameSounds, PRESENCE_INTERVAL_MS, TICK_MS } from './rules.js';


const PRESENCE_MODES = { play: 'play', sunk: 'sunk', wait: 'sunk', spectator: 'spectator' };
/** Per-tab room identity for each code, so a reload can resume the same seat. */
const RESUME_KEY = code => 'putt-pals:server-resume:' + code;

/**
 * @param {object} options
 * @param {HTMLElement} options.root Element the UI mounts into
 * @param {object} options.THREE Three.js namespace (0.128.0, the version the game shipped with)
 * @param {Window} [options.window]
 * @param {() => number} [options.random=Math.random]
 * @param {Function} [options.createWebGLRenderer] Renderer seam (tests)
 * @param {() => object} [options.createAudio] Audio seam (tests)
 * @param {typeof DISPLAY} [options.display] Presentation settings; development builds pass a live, tunable object
 * @param {(options: object) => object} [options.createTransport] Online transport seam (tests use the in-memory hub)
 * @param {{active: boolean, gravity: number}|null} [options.worldPreview] Development only (src/devtools/world-preview.js): world gravity used in solo rooms; parties always use Gaia's shipped gravity
 */
export function createApp({ worldPreview = null, soloHazards = false, root, THREE, window: win = root.ownerDocument.defaultView, random = Math.random, createWebGLRenderer, createAudio = () => createAudioAdapter(), createTransport, serverEndpoint, WebSocket = win.WebSocket, display = DISPLAY }) {
  const clock = { now: () => win.performance.now(), setTimeout: (f, d) => win.setTimeout(f, d), clearTimeout: id => win.clearTimeout(id) };
  const data = createCourseData();
  const courses = createCourseInfo(data);
  const store = createUiStore({ courses, clock });
  // localStorage can be missing or throw (privacy modes); the choice then simply does not persist.
  const cosmeticsStorage = (() => { try { return win.localStorage ?? null; } catch { return null; } })();
  let cosmetics = loadCosmetics(cosmeticsStorage);
  // Preferred ball colour (palette index), kept locally; the room confirms or replaces it if taken.
  let colorPref = (() => { try { const n = Number(cosmeticsStorage?.getItem('putt-planet.color')); return cosmeticsStorage?.getItem('putt-planet.color') != null && isColorIndex(n) ? n : null; } catch { return null; } })();
  store.setLocal({ cosmetics, colorPref });
  const audio = createAudio();
  const unbindGestures = audio.bindGestures(win);
  let aimWobble = 1; // aim sway multiple from the current room's Custom rules (VIS-U)
  let room = null, putt = null, puttPolicy = null, carriedInventory = [], activeRound = null, lastPhase = null, renderer = null, view = null, input = null;
  let quality = true, leaving = false, disposed = false, frameId = null, lastFrame = 0, lastPresence = -Infinity, lastSound = null, lastLocal = '';
  const remoteSeen = new Map(); // id -> {strokes, done, fx}
  const smooth = createRemoteInterpolator(); // remote balls are drawn slightly behind, between samples
  let presence = {};
  const roomStops = [];
  let joining = null, joinGeneration = 0, reloadRecovery = false;
  const aimListeners = new Set();
  let unsubscribeInputAim = null;
  // Bumper / Orbital Bumper placement (G1e): `placing` while the player picks a spot, `awaiting` while a guest's DEPLOY_OBJECT is in flight.
  let placing = null, awaiting = null, hazardAwaiting = null, targeting = null, cursor = null, unbindPlacement = null;
  const AWAIT_MS = 3000;
  let seenKey = '', seenKinds = new Map();

  // The power meter subscribes before the canvas exists; forward to the input adapter once it does.
  const aim = { subscribeAim(listener) { aimListeners.add(listener); listener(false, 0); return () => aimListeners.delete(listener); } };

  const setLocal = partial => store.setLocal(partial);
  const toast = text => store.toast(text);
  const alert = message => { try { win.alert(message); } catch { /* no dialog support */ } };
  // sessionStorage can be missing or throw (privacy modes); resuming is then simply unavailable.
  const resume = {
    read(code) { try { return JSON.parse(win.sessionStorage.getItem(RESUME_KEY(code)) || 'null'); } catch { return null; } },
    write(code, value) { try { win.sessionStorage.setItem(RESUME_KEY(code), JSON.stringify(value)); } catch { /* not resumable */ } },
    forget(code) { try { win.sessionStorage.removeItem(RESUME_KEY(code)); } catch { /* nothing stored */ } },
  };

  // ---------------------------------------------------------------- rooms
  async function join({ multi, name, roomCode, rules = null }) {
    const request = parseJoinRequest({ multi, name, roomCode });
    if (!request.ok) { alert(request.message); return; }
    // Custom rules (VIS-U) from the menu are validated here, at the UI boundary; null plays standard rules.
    if (rules !== null && !validRules(rules)) { alert('Those custom rules are not valid. Reset them and try again.'); return; }
    if (room) leave(true);
    joining?.abort();
    const generation = ++joinGeneration;
    const controller = new AbortController();
    joining = controller;
    setLocal({ connecting: true, connectError: '' });
    try {
      const stored = multi ? resume.read(request.roomCode) : null;
      const opened = await openRoom({ multi, name: request.name, color: colorPref, roomCode: request.roomCode, rules: rules === null ? null : validateRules(rules), clock, random, createTransport, identity: stored, soloHazards, floorAt: (map, puttIndex, x, y) => placementFloor(resolveRenderCourse(data.definitions[map], puttIndex), x, y), endpoint: serverEndpoint, location: win.location, WebSocket, crypto: win.crypto, signal: controller.signal });
      if (disposed || controller.signal.aborted || generation !== joinGeneration) { opened.close({ leave: true }); return; }
      joining = null;
      reloadRecovery = !!opened.resumed;
      if (opened.identity) resume.write(request.roomCode, { ...opened.identity, name: request.name });
      room = opened; leaving = false;
      remoteSeen.clear(); presence = {}; activeRound = null; lastPhase = null; carriedInventory = [];
      setLocal({ active: true, connecting: false, connected: true, id: room.localId, isHost: room.isHost, serverOwned: !!room.serverOwned, roomCode: room.roomCode, mode: 'lobby', strokes: 0, inventory: [], name: request.name });
      roomStops.push(room.onSnapshot(onSnapshot), room.onPresence(onPresence), room.onStatus(onStatus));
      if (room.isHost) publish(true);
    } catch (error) {
      if (disposed || controller.signal.aborted || generation !== joinGeneration) return;
      joining = null;
      if (multi && error?.message === 'session-expired') resume.forget(request.roomCode);
      setLocal({ connecting: false, connectError: connectErrorMessage(error?.message) });
    }
  }

  /** @param {boolean} [forget] An explicit Leave also forgets this tab's identity for the room, so rejoining is a fresh seat. */
  function leave(forget = false) {
    joinGeneration++; joining?.abort(); joining = null;
    setLocal({ connecting: false });
    if (!room) return;
    if (forget && room.roomCode) resume.forget(room.roomCode);
    leaving = true;
    for (const stop of roomStops.splice(0)) stop();
    room.close({ leave: forget }); room = null;
    endPutt(); carriedInventory = [];
    activeRound = null; lastPhase = null; presence = {}; remoteSeen.clear(); smooth.clear();
    audio.resetSession();
    setLocal({ active: false, connecting: false, connected: true, reconnecting: false, mode: 'lobby', strokes: 0, inventory: [] });
  }

  function onStatus({ state, reason }) {
    if (leaving || !room) return;
    if (state === 'reconnecting') { input?.cancel(); setLocal({ connected: false, reconnecting: true, isHost: false }); }
    else if (state === 'connected') {
      setLocal({ connected: true, reconnecting: false, isHost: room.isHost, connectionReason: reason ? connectErrorMessage(reason) : '' });
      if (room.identity) resume.write(room.roomCode, { ...room.identity, name: room.snapshot?.players[room.localId]?.name });
      const s = room.snapshot;
      if (room.serverOwned && putt?.completion && s?.roundNumber === activeRound && !s.players[room.localId]?.done) {
        room.command({ type: 'REPORT_SCORE', ...putt.completion, roundNumber: s.roundNumber, puttIndex: s.puttIndex });
      }
    }
    else if (state === 'disconnected' || state === 'closed') { input?.cancel(); setLocal({ connected: false, reconnecting: false, connectionReason: connectErrorMessage(reason) }); }
  }

  /** Session snapshot for the UI, with live stroke counts from presence (as the legacy scoreboard). */
  function uiSnapshot(s) {
    const players = {};
    for (const [id, p] of Object.entries(s.players)) {
      const live = id === room.localId ? null : presence[id];
      players[id] = live && !p.done && Number.isSafeInteger(live.strokes) && s.phase === SessionPhases.PLAY ? { ...p, strokes: live.strokes } : p;
    }
    return { ...s, players, globalHazards: room.globalHazards };
  }

  function onSnapshot(s) {
    if (!room) return;
    setLocal({ isHost: room.isHost });
    store.setRoom(uiSnapshot(s), room.now());
    syncRound(s);
  }

  function onPresence(map) {
    presence = map;
    const t = win.performance.now();
    for (const [id, p] of Object.entries(map)) smooth.push(id, t, p);
    smooth.retain(Object.keys(map));
    const s = room?.snapshot;
    if (s) store.setRoom(uiSnapshot(s), room.now());
    remoteEffects();
  }

  // ---------------------------------------------------------------- rounds
  function endPutt() {
    if (putt && puttPolicy?.carryover) carriedInventory = [...putt.player.inventory];
    putt?.dispose(); putt = null;
    stopPlacing(); stopTargeting(); awaiting = null; hazardAwaiting = null; setLocal({ hazardPrompt: null });
    input?.cancel();
    lastSound = null;
  }

  function syncRound(s = room?.snapshot) {
    if (!room || !s) return;
    const now = room.now();
    if (s.phase === SessionPhases.LOBBY || s.phase === SessionPhases.SELECT) {
      if (putt || activeRound !== null) { endPutt(); activeRound = null; }
      if (s.phase === SessionPhases.LOBBY) carriedInventory = []; // a tournament keeps its inventory through map selection only
      setLocalIfChanged({ mode: 'lobby', strokes: 0, inventory: s.phase === SessionPhases.SELECT ? [...carriedInventory] : [] });
    } else if (s.phase === SessionPhases.PLAY && now >= s.roundStartTime && activeRound !== s.roundNumber) {
      startRound(s);
    } else if (s.phase === SessionPhases.RESULTS && lastPhase !== SessionPhases.RESULTS) {
      if (activeRound !== s.roundNumber) startRound(s, true);
      input?.cancel();
    }
    lastPhase = s.phase;
  }

  function startRound(s, spectate = false) {
    const previous = putt && activeRound !== null ? { mapIndex: putt.mapIndex, puttIndex: putt.puttIndex } : null;
    endPutt();
    smooth.clear(); // new tee positions must not glide from the previous hole
    activeRound = s.roundNumber;
    const definition = data.definitions[s.mapIndex];
    const ownState = s.players[room.localId];
    const playing = !spectate && s.roster.includes(room.localId) && !ownState?.done;
    // VIS-E #166: the map's place (world and biome) picks how Precipitation and Lightning show; the ?world preview stands in for the world in solo rooms.
    const place = { ...coursePlace(definition), ...(worldPreview?.active && s.roster.length <= 1 ? { world: worldPreview.world } : {}) };
    puttPolicy = powerupPolicy({ mode: s.mode, rosterSize: s.roster.length, powerups: s.powerups !== false, maps: seriesMaps(s.mode, s.rules), place });
    setLocal({ place });
    // The room's Custom rules (VIS-U): fixed at room creation and the same for every participant.
    const ruleTuning = rulesTuning(validRules(s.rules) ? s.rules : DEFAULT_RULES);
    aimWobble = AIM_WOBBLE[validRules(s.rules) ? s.rules.aimWobble : 'normal'];
    // Every player must simulate the same gravity, so the development world preview applies to solo rooms only.
    const previewGravity = worldPreview?.active && s.roster.length <= 1 ? worldPreview.gravity : null;
    if (worldPreview?.active && previewGravity === null) toast('World gravity preview is off in party rooms: everyone plays Gaia gravity.');
    putt = createPutt({
      definition, rule: data.rules[s.mapIndex].putts[s.puttIndex], puttIndex: s.puttIndex, id: room.localId, name: s.players[room.localId]?.name || 'Player',
      playing, timed: s.mode !== GameModes.PUTT_PRACTICE, roundStartTime: s.roundStartTime, limitSeconds: s.roundLimitSeconds, roomNow: () => room.now(), random, now: () => win.performance.now(),
      inventory: reloadRecovery ? [] : startingInventory(puttPolicy, carriedInventory), powerups: puttPolicy,
      gravity: previewGravity ?? worldGravity(undefined, ruleTuning), shotPower: ruleTuning.shotPower,
    });
    if (room.serverOwned) {
      putt.player.strokes = ownState?.strokes ?? 0;
      if (ownState?.done) putt.player.mode = 'sunk';
      if (reloadRecovery && playing) toast('Rejoined: your ball starts at the tee. Strokes and the timer are kept; temporary items are cleared.');
    }
    reloadRecovery = false;
    putt.mapIndex = s.mapIndex; putt.puttIndex = s.puttIndex;
    if (view) {
      view.setCourse(definition, s.puttIndex);
      if (s.puttIndex > 0 && s.mode !== GameModes.PUTT_PRACTICE && previous && previous.mapIndex === s.mapIndex && definition.putts) {
        const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        view.startPuttTransition({ previousHole: definition.putts[s.puttIndex - 1].hole, nextTee: definition.putts[s.puttIndex].tee, now: win.performance.now(), reducedMotion });
        audio.handleEvent({ type: 'putt_change' });
      }
    }
    if (playing && !(previous && previous.mapIndex === s.mapIndex)) audio.handleEvent({ type: 'turn_ready' });
    input?.setAimAngle(putt.aimAngle());
    setLocalIfChanged({ mode: putt.mode, strokes: putt.player.strokes, inventory: [...putt.player.inventory] });
    publish(true);
  }

  // ---------------------------------------------------------------- presence and remote players
  function publish(force) {
    if (!room || !putt) return;
    const now = win.performance.now();
    if (!force && now - lastPresence < PRESENCE_INTERVAL_MS) return;
    lastPresence = now;
    const p = putt.player;
    const payload = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), mode: PRESENCE_MODES[putt.mode] || 'spectator', strokes: p.strokes, effect: putt.effect };
    if (putt.fx) payload.fx = putt.fx;
    room.presence(payload);
  }

  function remoteEffects() {
    const s = room?.snapshot;
    if (!s || !putt) return;
    const origin = [0, 0];
    for (const [id, p] of Object.entries(presence)) {
      if (id === room.localId) continue;
      const seen = remoteSeen.get(id);
      const done = p.mode === 'sunk' || p.mode === 'timeout';
      if (seen) {
        if (p.strokes > seen.strokes) audio.handleEvent({ type: 'shot', position: [p.x, p.y, p.z] }, { origin, remote: true });
        if (done && !seen.done) audio.handleEvent({ type: 'sink', timedOut: !!s.players[id]?.timedOut, position: [p.x, p.y, p.z] }, { origin, remote: true });
        if (p.fx && p.fx.id !== seen.fx) {
          const message = putt.receiveAttack(p.fx.t, s.players[id]?.name);
          if (message) { toast(message); publish(true); }
        }
      }
      remoteSeen.set(id, { strokes: p.strokes, done, fx: p.fx ? p.fx.id : (seen ? seen.fx : 0) });
    }
  }

  /** Other connected players' raw presence positions and auras, for the aura hook (G1d). */
  function remoteBalls() {
    const s = room?.snapshot;
    if (!s) return [];
    return Object.entries(presence).filter(([id, p]) => id !== room.localId && s.players[id]?.connected && s.roster.includes(id) && p.mode === 'play').map(([, p]) => p);
  }

  function remotesForRender(now) {
    const s = room?.snapshot;
    if (!s || !putt) return [];
    const out = [];
    for (const [id, p] of Object.entries(presence)) {
      if (id === room.localId || !s.players[id]?.connected || !s.roster.includes(id) || p.mode !== 'play') continue;
      const at = smooth.sample(id, now) || p;
      out.push({ id, name: s.players[id].name, x: at.x, y: at.y, z: at.z, color: colorOf(s, {}, id), effect: p.effect || '', radius: ballRadiusOf({ armedPowerups: { [p.effect]: 1 } }) });
    }
    return out;
  }

  // ---------------------------------------------------------------- loop
  function setLocalIfChanged(partial) {
    const key = JSON.stringify(partial);
    if (key === lastLocal) return;
    lastLocal = key;
    setLocal(partial);
  }

  // ---------------------------------------------------------------- deployable placement (G1e)
  function startPlacing(kind) {
    placing = kind; cursor = null;
  }
  function stopPlacing() {
    if (placing === null) return;
    placing = null; cursor = null;
  }
  /** The owner's slot is spent only once the host has accepted the placement. */
  function acceptPlacement(kind) {
    awaiting = null;
    if (!putt?.consumeItem(kind)) return;
    const entry = getPowerup(kind);
    store.announce(s0name(), (entry?.banner || kind) + ' PLACED', 'power');
    audio.handleEvent({ type: 'powerup', id: kind });
    setLocalIfChanged({ mode: putt.mode, strokes: putt.player.strokes, inventory: [...putt.player.inventory] });
    publish(true);
  }
  const s0name = () => room?.snapshot?.players?.[room.localId]?.name || 'Player';
  /** Whether a bumper fits at this spot right now: the hologram is green exactly when this is true, and an invalid click does nothing. */
  function placeable(point) {
    const s = room?.snapshot;
    if (!point || !putt || !s || !placementClear(putt.course, point.x, point.y)) return false;
    const list = room.deployables;
    return list.length < MAX_DEPLOYABLES
      && !activeDeployables(list, s.mapIndex, s.puttIndex).some(d => Math.hypot(d.x - point.x, d.y - point.y) < 2 * DEPLOYABLE_PARAMS.bumperRadius);
  }
  function confirmPlacing(point) {
    const kind = placing;
    if (!kind || !point || !room || !placeable(point)) return;
    const known = new Set(room.deployables.map(d => d.id));
    stopPlacing();
    const sent = room.deploy(kind, point.x, point.y);
    if (!sent) return; // refused (it changed since the hologram last showed green): the item is simply kept
    if (room.isHost && !room.serverOwned) acceptPlacement(kind); // the peer-to-peer host applied it synchronously; a server room answers in its next snapshot
    else awaiting = { kind, known, deadline: win.performance.now() + AWAIT_MS };
  }
  function checkAwaiting(now) {
    if (!awaiting) return;
    if (room.deployables.some(d => d.owner === room.localId && d.kind === awaiting.kind && !awaiting.known.has(d.id))) acceptPlacement(awaiting.kind);
    else if (now > awaiting.deadline) awaiting = null; // not accepted: the item is simply kept
  }

  // Wind and the vortices are aimed on the course with the placement pointer capture; `targeting` holds the pending item.
  function stopTargeting() { targeting = null; cursor = null; }
  function aimFor(point) {
    const pending = targeting;
    if (!pending || !point || !putt) return;
    const extra = pending.kind === 'wind' ? { direction: Math.atan2(point.y - putt.player.y, point.x - putt.player.x) } : { x: Math.round(point.x), y: Math.round(point.y) };
    stopTargeting();
    activateGlobalHazard({ kind: pending.kind, ...extra });
  }
  const ballAt = id => { const b = id === room.localId ? putt?.player : presence[id]; return b ? { x: b.x, y: b.y, z: b.z } : null; };

  function confirmGlobalHazard(command) {
    const prompt = store.getSnapshot().local.hazardPrompt;
    if (!prompt || prompt.kind !== command.kind || prompt.index !== command.index) return;
    activateGlobalHazard({ kind: command.kind, ...(command.kind === 'lightning' ? { targetId: command.targetId } : {}) });
  }

  function activateGlobalHazard(activation) {
    if (!room || !putt || !room.connected) return;
    const known = new Set(room.globalHazards.map(h => h.id));
    if (!room.activateGlobalHazard(activation)) { toast('That hazard could not be activated. Your item is still in inventory.'); setLocal({ hazardPrompt: null }); return; }
    setLocal({ hazardPrompt: null });
    if (!room.serverOwned && room.isHost) {
      const record = room.globalHazards.find(h => h.owner === room.localId && h.kind === activation.kind && !known.has(h.id));
      if (record) acceptGlobalHazard(record.kind);
    } else hazardAwaiting = { kind: activation.kind, known, deadline: win.performance.now() + AWAIT_MS };
  }

  function acceptGlobalHazard(kind) {
    hazardAwaiting = null;
    if (!putt?.consumeItem(kind)) return;
    const entry = hazardVariant(kind, puttPolicy?.place);
    store.announce(s0name(), (entry?.banner || kind) + ' ACTIVATED', 'power');
    audio.handleEvent({ type: 'powerup', id: kind });
    setLocalIfChanged({ mode: putt.mode, strokes: putt.player.strokes, inventory: [...putt.player.inventory] });
    store.setRoom(uiSnapshot(room.snapshot), room.now()); // the hazard chip shows at once, also for a host
    publish(true);
  }

  function checkGlobalHazardAwaiting(now) {
    if (!hazardAwaiting || !room) return;
    const record = room.globalHazards.find(h => h.owner === room.localId && h.kind === hazardAwaiting.kind && !hazardAwaiting.known.has(h.id));
    if (record) acceptGlobalHazard(record.kind);
    else if (now > hazardAwaiting.deadline) { hazardAwaiting = null; toast('Hazard activation was not confirmed. Your item is still in inventory.'); }
  }

  function frame(t) {
    frameId = null;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (t - lastFrame) / 1000));
    lastFrame = t;
    const screens = store.getSnapshot().screens;
    if (room && putt && view && screens.game) {
      if (room.connected) {
        putt.setAuras(auraSourcesOf(remoteBalls()));
        const placed = activeDeployables(room.deployables, room.snapshot.mapIndex, room.snapshot.puttIndex);
        putt.setDeployables(placed);
        for (const event of putt.setGlobalHazards(room.globalHazards)) audio.handleEvent({ type: 'lightning', id: event.id });
        // Sounds: the hit uses the list from before the host counted it (the last hit removes the object at once), and
        // an object that disappears from the same putt broke, which every player hears.
        const key = room.snapshot.roundNumber + ':' + room.snapshot.mapIndex + ':' + room.snapshot.puttIndex;
        if (key === seenKey) for (const [id, kind] of seenKinds) if (!placed.some(d => d.id === id)) audio.handleEvent({ type: 'deployable_break', kind });
        seenKey = key; seenKinds = new Map(placed.map(d => [d.id, d.kind]));
        const out = putt.frame(t, dt);
        checkGlobalHazardAwaiting(t);
        for (const id of out.deployHits) { audio.handleEvent({ type: 'deployable_hit', kind: seenKinds.get(id) }, { speed: 300 }); room.deployHit(id); }
        for (const cupId of (out.cupEliminations || [])) renderer?.eliminatePongCup(cupId);
        checkAwaiting(t);
        if (out.cancelInput) input?.cancel();
        if (out.aim !== null) input?.setAimAngle(out.aim);
        for (const message of out.toasts) toast(message);
        if (out.completed) {
          const s = room.snapshot;
          room.command({ type: 'REPORT_SCORE', strokes: out.completed.strokes, timedOut: out.completed.timedOut, roundNumber: s.roundNumber, puttIndex: s.puttIndex });
          publish(true);
          if (out.openCard) store.openCard();
        }
        publish(false);
      }
      const state = putt.view(t);
      const cur = { round: activeRound, strokes: putt.player.strokes, mode: putt.player.mode, moving: state.moving, x: state.x, y: state.y, z: state.z, vx: state.vx, vy: state.vy, vz: putt.player.vz || 0, over: !!putt.player.over };
      for (const { event, speed } of frameSounds(lastSound, cur)) audio.handleEvent(event, { origin: [0, 0], speed });
      lastSound = cur;
      setLocalIfChanged({ mode: state.mode, strokes: putt.player.strokes, inventory: [...putt.player.inventory] });
      renderer.resize(renderer.canvasWidth());
      const s = room.snapshot;
      const color = colorOf(s, {}, room.localId);
      const result = view.frame({
        now: t, dt, hazardTime: putt.hazardTime(),
        local: { ...state, color },
        remotes: remotesForRender(t),
        aim: input.frameAim(t / 1000),
        deployables: activeDeployables(room.deployables, s.mapIndex, s.puttIndex).map(d => ({ ...d, color: colorOf(s, {}, d.owner) })), // each bumper wears its owner's colour
        globalHazards: room.globalHazards.map(h => (h.kind === 'lightning' ? { ...h, at: ballAt(h.targetId) } : h)), // the bolt lands on the struck ball
        targeting: targeting && cursor ? { kind: targeting.kind, from: { x: putt.player.x, y: putt.player.y }, x: cursor.x, y: cursor.y } : null,
        placing: placing && cursor ? { kind: placing, x: cursor.x, y: cursor.y, valid: placeable(cursor) } : null,
        free: state.mode === 'wait' || state.mode === 'spectator',
        keys: input.keys,
      });
      for (const event of result.events) {
        if (event === 'free-roam-start') { setLocal({ viewLabel: 'Free roam' }); toast(MESSAGES.freeRoamHint); }
        if (event === 'free-roam-end') setLocal({ viewLabel: CAMERA_VIEW_LABELS[view.rig.state.view] });
      }
      const cam = renderer.camera, dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      audio.updateListener({ position: [cam.position.x, cam.position.y, cam.position.z], forward: [dir.x, dir.y, dir.z] });
    }
    frameId = win.requestAnimationFrame(frame);
  }

  const tick = win.setInterval(() => { if (room) { store.tick(room.now()); syncRound(); } }, TICK_MS);

  // Banner cues sound when a banner shows (the legacy page watched the banner's class).
  let lastBanner = null;
  const stopBannerAudio = store.subscribe(() => {
    const banner = store.getSnapshot().banner;
    if (banner !== lastBanner && banner.show && !(lastBanner && lastBanner.show && lastBanner.text === banner.text && lastBanner.sub === banner.sub)) {
      audio.handleEvent({ type: 'banner', kind: banner.kind === 'hio' || banner.kind === 'power' ? banner.kind : 'event' });
    }
    lastBanner = banner;
  });

  // ---------------------------------------------------------------- commands
  function handle(command) {
    switch (command.type) {
      case UiCommands.JOIN: join({ multi: true, name: command.name, roomCode: command.roomCode, iceText: command.iceText, rules: command.rules ?? null }); break;
      case UiCommands.PLAY_SOLO: join({ multi: false, name: command.name, rules: command.rules ?? null }); break;
      case UiCommands.LEAVE: leave(true); break;
      case UiCommands.SESSION: room?.command(command.event); break;
      case UiCommands.SHOT:
        if (room?.connected && putt?.shoot(command.angle, command.power)) {
          if (room.serverOwned) room.command({ type: 'UPDATE_STROKES', strokes: putt.player.strokes });
          publish(true);
        }
        break;
      case UiCommands.USE_ITEM: {
        if (!putt || !room?.connected) break;
        setLocal({ hazardPrompt: null });
        stopPlacing(); stopTargeting();
        const out = putt.useItem(command.index, win.performance.now());
        if (out.placement) startPlacing(out.placement.kind);
        if (out.globalHazard?.kind === 'lightning') setLocal({ hazardPrompt: out.globalHazard }); // pick an opponent
        else if (out.globalHazard?.kind === 'rain' || out.globalHazard?.kind === 'snow') activateGlobalHazard({ kind: out.globalHazard.kind });
        else if (out.globalHazard) { targeting = out.globalHazard; cursor = null; toast(out.globalHazard.kind === 'wind' ? 'Click the course to choose the direction of the gust.' : 'Click the course to place it.'); }
        for (const [text, sub, kind, powerup] of out.banners) { store.announce(text, sub, kind); if (powerup) audio.handleEvent({ type: 'powerup', id: powerup }); }
        for (const message of out.toasts) toast(message);
        setLocalIfChanged({ mode: putt.mode, strokes: putt.player.strokes, inventory: [...putt.player.inventory] });
        publish(true);
        break;
      }
      case UiCommands.CONFIRM_HAZARD: confirmGlobalHazard(command); break;
      case UiCommands.CANCEL_HAZARD: setLocal({ hazardPrompt: null }); break;
      case UiCommands.CYCLE_CAMERA: {
        if (!view) break;
        const r = view.rig.cycleView();
        if (!r.changed) { toast(MESSAGES.freeRoamHint); break; }
        setLocal({ viewLabel: r.label });
        toast(r.label);
        break;
      }
      case UiCommands.SET_COLOR:
        if (!isColorIndex(command.color)) break;
        colorPref = command.color;
        try { cosmeticsStorage?.setItem('putt-planet.color', String(colorPref)); } catch { /* storage unavailable */ }
        setLocal({ colorPref });
        room?.command({ type: 'SET_COLOR', color: colorPref });
        break;
      case UiCommands.SET_COSMETIC:
        cosmetics = selectCosmetic(cosmetics, command.kind, command.id);
        if (cosmeticsStorage) saveCosmetics(cosmeticsStorage, cosmetics);
        renderer?.setCosmetics(cosmetics);
        setLocal({ cosmetics });
        break;
      case UiCommands.TOGGLE_QUALITY:
        quality = !quality;
        renderer?.setQuality(quality, win.devicePixelRatio);
        setLocal({ qualityHigh: quality });
        break;
      case UiCommands.SET_VOLUME:
        if (!(command.volume >= 0 && command.volume <= 1)) break;
        audio.setVolume?.(command.volume);
        setLocal({ volume: command.volume });
        break;
      case UiCommands.TOGGLE_SOUND:
        Promise.resolve(audio.toggleMute()).finally(() => setLocal({ soundOn: !audio.getStatus().muted }));
        setLocal({ soundOn: audio.getStatus().muted });
        break;
      case UiCommands.INVITE: invite(); break;
      default: break; // card toggles are applied by the UI dispatcher; user gestures by the audio adapter
    }
  }

  async function invite() {
    const code = room?.roomCode;
    if (!code) { toast(MESSAGES.inviteSolo); return; }
    const url = new URL(win.location.href);
    url.hash = 'room=' + code;
    try {
      await win.navigator.clipboard.writeText(win.location.protocol === 'file:' ? 'Putt Pals room: ' + code : url.href);
      toast(MESSAGES.inviteCopied);
    } catch {
      toast('Share room code: ' + code);
    }
  }

  const dispatch = createUiDispatcher(store, handle);

  let webglFailed = false, stopScenery = null;
  function onCanvas(canvas) {
    if (!canvas || renderer || webglFailed || disposed) return;
    // Without WebGL (disabled, blocklisted driver, GPU-less machine) the UI keeps working without the 3D view.
    try {
      renderer = createGameRenderer({ THREE, canvas, random, devicePixelRatio: win.devicePixelRatio || 1, ...(createWebGLRenderer ? { createWebGLRenderer } : {}), display });
    } catch (error) {
      webglFailed = true;
      win.console?.warn('Putt Pals: 3D view unavailable.', error);
      setLocal({ webglUnavailable: true });
      return;
    }
    renderer.setCosmetics(cosmetics);
    renderer.canvasWidth = () => Math.floor(canvas.parentNode?.clientWidth || 0);
    // VIS-E #166: the ?world preview also draws that world's scenery. Visual only, so it follows the world buttons at once.
    if (worldPreview) { const scenery = () => renderer?.setSceneryWorld(worldPreview.active ? worldPreview.world : null); scenery(); stopScenery = worldPreview.subscribe(scenery); }
    view = createGameView({ renderer });
    const ray = new THREE.Raycaster();
    input = createInputAdapter({
      canvas, window: win, camera: view.rig, dispatch, display,
      pickGround(clientX, clientY) {
        if (!putt) return null;
        const r = canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), renderer.camera);
        return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(putt.player.z + BALL_RADIUS)), new THREE.Vector3());
      },
      getState: () => ({
        active: !!room, mode: putt ? putt.mode : 'lobby', moving: !!putt?.player.moving, connected: !!room?.connected,
        transitioning: view.rig.transitioning, steady: !!putt?.player.armedPowerups.steady, aimMode: putt ? aimModeOf(putt.player) : '', wobble: aimWobble,
      }),
    });
    // Placement mode takes the pointer before the shot handlers see it (capture phase).
    const planeNormal = new THREE.Vector3(0, 1, 0);
    const simPoint = (clientX, clientY) => {
      if (!putt || !renderer.course) return null;
      const r = canvas.getBoundingClientRect(), { transform } = renderer.course;
      ray.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), renderer.camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(planeNormal, -transform.ground(putt.player.x, putt.player.y, putt.player.z)[1]), new THREE.Vector3());
      if (!hit) return null;
      const p = transform.toSim(hit.x, hit.y, hit.z);
      return { x: p.x, y: p.y };
    };
    const onPlacementDown = e => {
      if (placing === null && targeting === null) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.button === 2) { stopPlacing(); stopTargeting(); }
      else if (e.button === 0) { const point = simPoint(e.clientX, e.clientY) || cursor; if (placing !== null) confirmPlacing(point); else aimFor(point); }
    };
    const onPlacementMove = e => { if (placing !== null || targeting !== null) cursor = simPoint(e.clientX, e.clientY) || cursor; };
    const onPlacementKey = e => { if ((placing !== null || targeting !== null) && e.key === 'Escape') { stopPlacing(); stopTargeting(); } };
    canvas.addEventListener('pointerdown', onPlacementDown, true);
    canvas.addEventListener('pointermove', onPlacementMove, true);
    win.addEventListener('keydown', onPlacementKey, true);
    unbindPlacement = () => { canvas.removeEventListener('pointerdown', onPlacementDown, true); canvas.removeEventListener('pointermove', onPlacementMove, true); win.removeEventListener('keydown', onPlacementKey, true); };
    unsubscribeInputAim = input.subscribeAim((charging, charge) => { for (const l of [...aimListeners]) l(charging, charge); });
    if (putt && room?.snapshot) { view.setCourse(data.definitions[room.snapshot.mapIndex], putt.puttIndex); input.setAimAngle(putt.aimAngle()); }
    lastFrame = win.performance.now();
    frameId = win.requestAnimationFrame(frame);
  }

  const startCode = initialRoomCode(win.location?.hash || '', random);
  const inviteLink = /(^#|&)room=[^&]/.test(win.location?.hash || ''); // a #room= link opens the menu on Party
  // Menu feedback (M1d): a soft tick when the pointer enters an enabled button and a click cue when one is pressed.
  let hovered = null;
  const buttonOf = event => { const b = event.target?.closest?.('button'); return b && !b.disabled ? b : null; };
  const onHover = event => { const b = buttonOf(event); if (b === hovered) return; hovered = b; if (b) audio.handleEvent({ type: 'ui', kind: 'hover' }); };
  const onPress = event => { if (buttonOf(event)) audio.handleEvent({ type: 'ui', kind: 'click' }); };
  root.addEventListener('pointerover', onHover);
  root.addEventListener('click', onPress);
  setLocal({ volume: audio.getStatus?.().volume ?? 1 });
  const unmount = mountUi(root, { store, dispatch, aim, onCanvas, initialRoomCode: startCode, initialView: inviteLink ? 'party' : 'home', initialName: resume.read(startCode)?.name || '', display, createLoadingScene: options => createPlanetScene({ THREE, ...options }), createAtlasScene: options => createAtlasScene({ THREE, ...options }) });

  return {
    store,
    get room() { return room; },
    get putt() { return putt; },
    /** Development preview only (src/devtools/powerup-catalog.js): puts a power-up in the local inventory. Returns whether it fit. */
    grantItem(kind) {
      if (!putt || !room?.connected || putt.player.mode !== 'play' || !addToInventory(putt.player.inventory, kind)) return false;
      setLocalIfChanged({ mode: putt.mode, strokes: putt.player.strokes, inventory: [...putt.player.inventory] });
      return true;
    },
    /** Development preview only (src/devtools/world-preview.js): rebuilds the current putt from its tee so a staged gravity applies. Returns whether a putt restarted. */
    restartPutt() {
      const s = room?.snapshot;
      if (!putt || !s || s.phase !== SessionPhases.PLAY || activeRound !== s.roundNumber) return false;
      startRound(s);
      return true;
    },
    get view() { return view; },
    get input() { return input; },
    get renderer() { return renderer; },
    audio,
    dispatch,
    /** Leaves any room and releases every resource. Resolves when audio has closed. */
    async dispose() {
      if (disposed) return;
      disposed = true;
      leave();
      if (frameId !== null) win.cancelAnimationFrame(frameId);
      win.clearInterval(tick);
      stopBannerAudio();
      unsubscribeInputAim?.();
      unbindPlacement?.();
      input?.dispose();
      stopScenery?.();
      view?.dispose();
      root.removeEventListener('pointerover', onHover);
      root.removeEventListener('click', onPress);
      unmount();
      store.dispose();
      unbindGestures();
      await audio.dispose();
    },
  };
}
