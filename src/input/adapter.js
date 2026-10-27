/**
 * Desktop pointer and keyboard adapter.
 *
 * A port of the legacy game's input listeners with identical conditions,
 * clamps and ordering. Game and UI actions leave as typed commands through
 * `dispatch`; camera manipulation goes straight to the injected camera rig
 * (src/camera), which owns view state. Every listener is removed by dispose().
 */

import { InputCommands } from './commands.js';
import { AIM_STEP, DRAG_RADIANS_PER_PX, GUIDE_MIN_CHARGE, SHOT_MIN_CHARGE, chargeFromDrag, shotAngle, spread } from './aim.js';

const isTextEntry = target => !!(target && target.matches && target.matches('input,textarea'));

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas Game canvas (pointer, wheel and context-menu target)
 * @param {Window} [options.window] Keyboard, blur and user-gesture target; defaults to the canvas's window
 * @param {ReturnType<import('../camera/rig.js').createCameraRig>} options.camera
 * @param {(clientX: number, clientY: number) => ({x:number, z:number}|null)} options.pickGround
 *   World point under the pointer on the horizontal plane through the ball (legacy planePoint)
 * @param {() => {active:boolean, mode:string, moving:boolean, connected:boolean, transitioning:boolean, reverse?:boolean, steady?:boolean}} options.getState
 *   active: joined a room; mode: local simulation mode (play/sunk/wait/spectator/lobby)
 * @param {(command: object) => void} options.dispatch
 */
export function createInputAdapter({ canvas, window: win = canvas.ownerDocument.defaultView, camera, pickGround, getState, dispatch }) {
  if (!canvas || !camera || typeof pickGround !== 'function' || typeof getState !== 'function' || typeof dispatch !== 'function') {
    throw new TypeError('canvas, camera, pickGround, getState and dispatch are required');
  }
  const keys = new Set();
  const aimListeners = new Set();
  let pull = null, orbit = null, freeDrag = null, charging = false, charge = 0, aimAngle = 0, swayTime = 0, disposed = false;
  const bindings = [];
  const on = (target, type, handler, options) => { target.addEventListener(type, handler, options); bindings.push([target, type, handler, options]); };

  const notifyAim = () => { for (const listener of aimListeners) listener(charging, charge); };
  function cancel() {
    const changed = charging || charge !== 0;
    pull = null; orbit = null; charging = false; charge = 0;
    if (changed) notifyAim();
  }
  const canStartShot = s => s.active && s.mode === 'play' && !s.moving && !pull && !s.transitioning && s.connected;

  // ---- shot charge, orbit drag and release (legacy pointer handlers) ----
  on(canvas, 'contextmenu', e => e.preventDefault());
  on(canvas, 'pointerdown', e => {
    if (!canStartShot(getState())) return;
    canvas.setPointerCapture?.(e.pointerId);
    if (e.button === 2) { orbit = { x: e.clientX, y: e.clientY, azimuth: camera.state.azimuth, elevation: camera.state.elevation }; return; }
    if (e.button !== 0) return;
    const p = pickGround(e.clientX, e.clientY);
    if (!p) return;
    pull = { id: e.pointerId, x: e.clientX, y: e.clientY, p };
    charging = true; charge = 0;
    notifyAim();
  });
  on(canvas, 'pointermove', e => {
    if (orbit !== null) {
      // Legacy quirk preserved: non-orbit views add the whole drag distance on every move.
      if (!camera.orbitDrag(orbit, e.clientX, e.clientY)) aimAngle += (e.clientX - orbit.x) * DRAG_RADIANS_PER_PX;
      return;
    }
    if (!pull || pull.id !== e.pointerId) return;
    const p = pickGround(e.clientX, e.clientY);
    if (!p) return;
    const dx = pull.p.x - p.x, dz = pull.p.z - p.z;
    if (Math.hypot(dx, dz) > 0.1) aimAngle = Math.atan2(dz, dx);
    charge = chargeFromDrag(e.clientX - pull.x, e.clientY - pull.y, canvas.clientWidth);
    notifyAim();
  });
  on(canvas, 'pointerup', e => {
    const s = getState();
    if (s.connected && pull && pull.id === e.pointerId && charge > SHOT_MIN_CHARGE && s.mode === 'play' && !s.moving) {
      dispatch({ type: InputCommands.SHOT, angle: shotAngle({ aimAngle, charge, time: swayTime, reverse: !!s.reverse, steady: !!s.steady }), power: charge });
    }
    cancel();
  });
  on(canvas, 'pointercancel', cancel);
  on(canvas, 'lostpointercapture', cancel);
  on(win, 'blur', cancel);

  // ---- zoom (legacy canvas wheel handler; prevents page scroll over the canvas) ----
  on(canvas, 'wheel', e => { e.preventDefault(); if (!getState().active) return; camera.zoom(e.deltaY); }, { passive: false });

  // ---- game shortcuts ----
  on(win, 'keydown', e => {
    if (isTextEntry(e.target)) return;
    const s = getState();
    if (!s.active) return;
    if (e.key === 'c' || e.key === 'C') dispatch({ type: InputCommands.CYCLE_CAMERA });
    else if (e.key === 'Escape') { dispatch({ type: InputCommands.CLOSE_CARD }); cancel(); }
    else if (e.key === 'k' || e.key === 'K') dispatch({ type: InputCommands.TOGGLE_CARD });
    else if (e.key >= '1' && e.key <= '3') dispatch({ type: InputCommands.USE_ITEM, index: +e.key - 1 });
    else if (!charging && s.mode === 'play' && !s.moving) {
      if (!camera.orbitKey(e.key)) {
        if (e.key === 'ArrowLeft') aimAngle -= AIM_STEP;
        if (e.key === 'ArrowRight') aimAngle += AIM_STEP;
      }
    }
  });
  // ---- held keys for free roam, and the sound shortcut ----
  on(win, 'keydown', e => {
    if (isTextEntry(e.target)) return;
    keys.add(e.key.toLowerCase());
    if (camera.state.freeRoam && (e.key === ' ' || e.key.startsWith('Arrow'))) e.preventDefault();
    if (e.key === 'm' || e.key === 'M') dispatch({ type: InputCommands.TOGGLE_SOUND });
  });
  on(win, 'keyup', e => keys.delete(e.key.toLowerCase()));
  on(win, 'blur', () => keys.clear());

  // ---- free-roam look and dolly ----
  on(canvas, 'pointerdown', e => {
    if (!camera.state.freeRoam || (e.button !== 0 && e.button !== 2)) return;
    canvas.setPointerCapture?.(e.pointerId);
    freeDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: camera.state.freeYaw, pitch: camera.state.freePitch };
  });
  on(canvas, 'pointermove', e => { if (!freeDrag || freeDrag.id !== e.pointerId) return; camera.freeLook(freeDrag, e.clientX, e.clientY); });
  on(canvas, 'pointerup', () => { freeDrag = null; });
  on(canvas, 'pointercancel', () => { freeDrag = null; });
  on(canvas, 'wheel', e => { if (!camera.state.freeRoam) return; camera.freeDolly(e.deltaY); }, { passive: true });

  // ---- user gestures (the audio adapter unlocks on one) ----
  const gesture = () => dispatch({ type: InputCommands.USER_GESTURE });
  for (const type of ['pointerdown', 'keydown', 'click', 'touchstart']) on(win, type, gesture, { capture: true, passive: true });

  return {
    /** Lower-case keys currently held; pass to the game view for free-roam flight. */
    keys,
    get charging() { return charging; },
    get charge() { return charge; },
    get aimAngle() { return aimAngle; },
    /** Points the shot at an angle (legacy aim() at the start of each putt). */
    setAimAngle(angle) { aimAngle = angle; },
    /** Drops any shot or orbit in progress (room changes, leaving play, disconnects). */
    cancel,
    /**
     * Aim guide for this frame, or null when none is shown. Records the frame's
     * sway time, which a later release reuses (legacy swT): what you see is what you shoot.
     * @param {number} time Seconds (the renderer's animation clock)
     */
    frameAim(time) {
      const s = getState();
      if (!(s.mode === 'play' && !s.moving && charging && charge > GUIDE_MIN_CHARGE)) return null;
      swayTime = time;
      return { charge, aimAngle, angle: shotAngle({ aimAngle, charge, time, reverse: !!s.reverse, steady: !!s.steady }), spread: s.steady ? 0 : spread(charge), reverse: !!s.reverse };
    },
    /** Power meter updates (charging, charge) on pointer changes; keeps per-frame values out of React state. */
    subscribeAim(listener) { aimListeners.add(listener); listener(charging, charge); return () => aimListeners.delete(listener); },
    /** Removes every listener. Idempotent. */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [target, type, handler, options] of bindings) target.removeEventListener(type, handler, options);
      bindings.length = 0;
      aimListeners.clear();
      keys.clear();
      pull = orbit = freeDrag = null; charging = false; charge = 0;
    },
  };
}
