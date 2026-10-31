/**
 * The modular Putt Pals application: composes courses (D1), simulation (S1),
 * session (L1), transports (N1), audio (A1), renderer/camera (R1) and the
 * React UI and input (U1). It owns exactly one animation-frame loop and one
 * HUD tick, and dispose() releases every listener, timer, room, GPU and audio
 * resource it created.
 */

import { createAudioAdapter } from '../audio/index.js';
import { CAMERA_VIEW_LABELS } from '../camera/index.js';
import { createCourseData } from '../courses/index.js';
import { createInputAdapter } from '../input/index.js';
import { createRemoteInterpolator } from '../network/index.js';
import { createGameRenderer, createGameView } from '../render/index.js';
import { ballRadiusOf, powerupPolicy, startingInventory } from '../gameplay/index.js';
import { BALL_RADIUS, STARTER_COURSE_INDICES } from '../shared/constants.js';
import { GameModes, SessionPhases } from '../shared/session.js';
import { colorOf, connectErrorMessage, createCourseInfo, createUiDispatcher, createUiStore, initialRoomCode, MESSAGES, mountUi, parseJoinRequest, UiCommands } from '../ui/index.js';
import { createPutt } from './putt.js';
import { openRoom } from './room.js';
import { frameSounds, PRESENCE_INTERVAL_MS, TICK_MS } from './rules.js';

/** Start-screen panorama (M1b): seconds per camera lap and the course it shows. */
const PANORAMA_LAP_SECONDS = 90;
const PANORAMA_MAP = STARTER_COURSE_INDICES[0];

const PRESENCE_MODES = { play: 'play', sunk: 'sunk', wait: 'sunk', spectator: 'spectator' };
/** Per-tab guest identity for each room code, so a reload can resume the same seat (N2). */
const RESUME_KEY = code => 'putt-pals:resume:' + code;

/**
 * @param {object} options
 * @param {HTMLElement} options.root Element the UI mounts into
 * @param {object} options.THREE Three.js namespace (0.128.0, the version the game shipped with)
 * @param {Function} [options.Peer] PeerJS constructor for online rooms
 * @param {Window} [options.window]
 * @param {() => number} [options.random=Math.random]
 * @param {Function} [options.createWebGLRenderer] Renderer seam (tests)
 * @param {() => object} [options.createAudio] Audio seam (tests)
 * @param {(options: object) => object} [options.createTransport] Online transport seam (tests use the in-memory hub)
 * @param {object} [options.peerServer] PeerJS signalling server options ({host, port, path, secure}); default is PeerJS's public server
 */
export function createApp({ root, THREE, Peer, window: win = root.ownerDocument.defaultView, random = Math.random, createWebGLRenderer, createAudio = () => createAudioAdapter(), createTransport, peerServer = {} }) {
  const clock = { now: () => win.performance.now(), setTimeout: (f, d) => win.setTimeout(f, d), clearTimeout: id => win.clearTimeout(id) };
  const data = createCourseData();
  const courses = createCourseInfo(data);
  const store = createUiStore({ courses, clock });
  const audio = createAudio();
  const unbindGestures = audio.bindGestures(win);
  let room = null, putt = null, puttPolicy = null, carriedInventory = [], activeRound = null, lastPhase = null, renderer = null, view = null, input = null;
  let quality = true, leaving = false, disposed = false, frameId = null, lastFrame = 0, lastPresence = -Infinity, lastSound = null, lastLocal = '';
  const remoteSeen = new Map(); // id -> {strokes, done, fx}
  const smooth = createRemoteInterpolator(); // remote balls are drawn slightly behind, between samples
  let presence = {};
  const roomStops = [];
  const aimListeners = new Set();
  let unsubscribeInputAim = null;

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
  async function join({ multi, name, roomCode, iceText }) {
    const request = parseJoinRequest({ multi, name, roomCode, iceText });
    if (!request.ok) { alert(request.message); return; }
    if (room) leave();
    // Online rooms run on WebRTC; say so up front instead of failing silently (the in-memory test transport needs none).
    if (multi && !createTransport && typeof win.RTCPeerConnection !== 'function') { setLocal({ connectError: connectErrorMessage('no-webrtc') }); return; }
    setLocal({ connecting: true, connectError: '' });
    try {
      const stored = multi ? resume.read(request.roomCode) : null;
      const opened = await openRoom({ multi, name: request.name, roomCode: request.roomCode, peerOptions: { ...peerServer, ...request.peerOptions }, Peer, clock, random, createTransport, identity: stored });
      if (disposed) { opened.close(); return; }
      if (opened.identity) resume.write(request.roomCode, { ...opened.identity, name: request.name });
      room = opened; leaving = false;
      remoteSeen.clear(); presence = {}; activeRound = null; lastPhase = null; carriedInventory = [];
      setLocal({ active: true, connecting: false, connected: true, id: room.localId, isHost: room.isHost, roomCode: room.roomCode, mode: 'lobby', strokes: 0, inventory: [], name: request.name });
      roomStops.push(room.onSnapshot(onSnapshot), room.onPresence(onPresence), room.onStatus(onStatus));
      if (room.isHost) publish(true);
    } catch (error) {
      setLocal({ connecting: false, connectError: connectErrorMessage(error?.message) });
    }
  }

  /** @param {boolean} [forget] An explicit Leave also forgets this tab's identity for the room, so rejoining is a fresh seat. */
  function leave(forget = false) {
    if (!room) return;
    if (forget && room.roomCode) resume.forget(room.roomCode);
    leaving = true;
    for (const stop of roomStops.splice(0)) stop();
    room.close(); room = null;
    endPutt(); carriedInventory = [];
    activeRound = null; lastPhase = null; presence = {}; remoteSeen.clear(); smooth.clear();
    audio.resetSession();
    setLocal({ active: false, connecting: false, connected: true, reconnecting: false, mode: 'lobby', strokes: 0, inventory: [] });
  }

  function onStatus({ state }) {
    if (leaving || !room) return;
    if (state === 'reconnecting') { input?.cancel(); setLocal({ connected: false, reconnecting: true }); }
    else if (state === 'connected') setLocal({ connected: true, reconnecting: false });
    else if (state === 'disconnected' || state === 'closed') { input?.cancel(); setLocal({ connected: false, reconnecting: false }); }
  }

  /** Session snapshot for the UI, with live stroke counts from presence (as the legacy scoreboard). */
  function uiSnapshot(s) {
    const players = {};
    for (const [id, p] of Object.entries(s.players)) {
      const live = id === room.localId ? null : presence[id];
      players[id] = live && !p.done && Number.isSafeInteger(live.strokes) && s.phase === SessionPhases.PLAY ? { ...p, strokes: live.strokes } : p;
    }
    return { ...s, players };
  }

  function onSnapshot(s) {
    if (!room) return;
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
    panoramaBuilt = false;
    const definition = data.definitions[s.mapIndex];
    const playing = !spectate && s.roster.includes(room.localId);
    puttPolicy = powerupPolicy({ mode: s.mode, rosterSize: s.roster.length, powerups: s.powerups !== false });
    putt = createPutt({
      definition, rule: data.rules[s.mapIndex].putts[s.puttIndex], puttIndex: s.puttIndex, id: room.localId, name: s.players[room.localId]?.name || 'Player',
      playing, timed: s.mode !== GameModes.PUTT_PRACTICE, roundStartTime: s.roundStartTime, limitSeconds: s.roundLimitSeconds, roomNow: () => room.now(), random, now: () => win.performance.now(),
      inventory: startingInventory(puttPolicy, carriedInventory), powerups: puttPolicy,
    });
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
    setLocalIfChanged({ mode: putt.mode, strokes: 0, inventory: [...putt.player.inventory] });
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

  /** Which course the start-screen panorama has built; reset whenever a game round replaces the scene. */
  let panoramaBuilt = false;

  /** Slowly orbits a course behind the start screen (M1b). Pure view work: no room, putt or input is involved. */
  function drawPanorama(t, dt) {
    if (!panoramaBuilt) {
      view.setCourse(data.definitions[PANORAMA_MAP], 0);
      panoramaBuilt = true;
    }
    const { course, transform } = renderer.course;
    const tiles = course.tiles?.length ? course.tiles : [[0, 0, 800, 500]];
    const x0 = Math.min(...tiles.map(r => r[0])), x1 = Math.max(...tiles.map(r => r[0] + r[2]));
    const y0 = Math.min(...tiles.map(r => r[1])), y1 = Math.max(...tiles.map(r => r[1] + r[3]));
    const [cx, cy, cz] = transform.ground((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const span = Math.max(x1 - x0, y1 - y0);
    const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const angle = reducedMotion ? 0.6 : t / 1000 / PANORAMA_LAP_SECONDS * Math.PI * 2;
    const radius = span * 0.5 + 110, height = span * 0.26 + 70;
    renderer.resize(renderer.canvasWidth());
    renderer.render({
      now: t, dt, hazardTime: t / 1000, local: null, remotes: [], aim: null,
      camera: { position: [cx + Math.cos(angle) * radius, height, cz + Math.sin(angle) * radius], look: [cx, 10, cz], sunTarget: [cx, 0, cz], ball: null, fadeTarget: null },
    });
  }

  function frame(t) {
    frameId = null;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (t - lastFrame) / 1000));
    lastFrame = t;
    const screens = store.getSnapshot().screens;
    if (view && renderer && screens.landing && !screens.game && !room) drawPanorama(t, dt);
    else if (room && putt && view && screens.game) {
      panoramaBuilt = false;
      if (room.connected) {
        const out = putt.frame(t, dt);
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
      case UiCommands.JOIN: join({ multi: true, name: command.name, roomCode: command.roomCode, iceText: command.iceText }); break;
      case UiCommands.PLAY_SOLO: join({ multi: false, name: command.name }); break;
      case UiCommands.LEAVE: leave(true); break;
      case UiCommands.SESSION: room?.command(command.event); break;
      case UiCommands.SHOT: if (putt?.shoot(command.angle, command.power)) publish(true); break;
      case UiCommands.USE_ITEM: {
        if (!putt || !room?.connected) break;
        const out = putt.useItem(command.index, win.performance.now());
        for (const [text, sub, kind, powerup] of out.banners) { store.announce(text, sub, kind); if (powerup) audio.handleEvent({ type: 'powerup', id: powerup }); }
        for (const message of out.toasts) toast(message);
        setLocalIfChanged({ mode: putt.mode, strokes: putt.player.strokes, inventory: [...putt.player.inventory] });
        publish(true);
        break;
      }
      case UiCommands.CYCLE_CAMERA: {
        if (!view) break;
        const r = view.rig.cycleView();
        if (!r.changed) { toast(MESSAGES.freeRoamHint); break; }
        setLocal({ viewLabel: r.label });
        toast(r.label);
        break;
      }
      case UiCommands.TOGGLE_QUALITY:
        quality = !quality;
        renderer?.setQuality(quality, win.devicePixelRatio);
        setLocal({ qualityHigh: quality });
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

  let webglFailed = false;
  function onCanvas(canvas) {
    if (!canvas || renderer || webglFailed || disposed) return;
    // Without WebGL (disabled, blocklisted driver, GPU-less machine) the UI keeps working without the 3D view.
    try {
      renderer = createGameRenderer({ THREE, canvas, random, devicePixelRatio: win.devicePixelRatio || 1, ...(createWebGLRenderer ? { createWebGLRenderer } : {}) });
    } catch (error) {
      webglFailed = true;
      win.console?.warn('Putt Pals: 3D view unavailable.', error);
      setLocal({ webglUnavailable: true });
      return;
    }
    renderer.canvasWidth = () => Math.floor(canvas.parentNode?.clientWidth || 0);
    view = createGameView({ renderer });
    const ray = new THREE.Raycaster();
    input = createInputAdapter({
      canvas, window: win, camera: view.rig, dispatch,
      pickGround(clientX, clientY) {
        if (!putt) return null;
        const r = canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), renderer.camera);
        return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(putt.player.z + BALL_RADIUS)), new THREE.Vector3());
      },
      getState: () => ({
        active: !!room, mode: putt ? putt.mode : 'lobby', moving: !!putt?.player.moving, connected: !!room?.connected,
        transitioning: view.rig.transitioning, steady: !!putt?.player.armedPowerups.steady,
      }),
    });
    unsubscribeInputAim = input.subscribeAim((charging, charge) => { for (const l of [...aimListeners]) l(charging, charge); });
    if (putt && room?.snapshot) { view.setCourse(data.definitions[room.snapshot.mapIndex], putt.puttIndex); input.setAimAngle(putt.aimAngle()); }
    lastFrame = win.performance.now();
    frameId = win.requestAnimationFrame(frame);
  }

  const startCode = initialRoomCode(win.location?.hash || '', random);
  // Menu feedback (M1d): a soft tick when the pointer enters an enabled button and a click cue when one is pressed.
  let hovered = null;
  const buttonOf = event => { const b = event.target?.closest?.('button'); return b && !b.disabled ? b : null; };
  const onHover = event => { const b = buttonOf(event); if (b === hovered) return; hovered = b; if (b) audio.handleEvent({ type: 'ui', kind: 'hover' }); };
  const onPress = event => { if (buttonOf(event)) audio.handleEvent({ type: 'ui', kind: 'click' }); };
  root.addEventListener('pointerover', onHover);
  root.addEventListener('click', onPress);
  const unmount = mountUi(root, { store, dispatch, aim, onCanvas, initialRoomCode: startCode, initialName: resume.read(startCode)?.name || '' });

  return {
    store,
    get room() { return room; },
    get putt() { return putt; },
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
      input?.dispose();
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
