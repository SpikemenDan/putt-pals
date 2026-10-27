/**
 * Input-independent camera state for the game view.
 *
 * A port of the camera section of the legacy draw() loop plus the camera
 * parts of its input handlers. It is plain arithmetic on {x, y, z} records
 * (no Three.js), evaluated in the same operation order as the legacy
 * THREE.Vector3 calls so that poses match the legacy renderer exactly.
 *
 * All positions are Three.js world coordinates (y up). Convert simulation
 * positions with src/render/transform.js before passing them in.
 */

export const CAMERA_VIEWS = Object.freeze(['follow', 'hole', 'strategic']);
export const CAMERA_VIEW_LABELS = Object.freeze(['Ball cam', 'Hole view', 'World view']);
export const FREE_ROAM = 'free';
export const CAMERA_SPRING = Object.freeze({ follow: 35, hole: 18, strategic: 12 });
export const CAMERA_DAMP = Object.freeze({ follow: 7, hole: 5, strategic: 4 });
export const CAMERA_MIN_DISTANCE = 15;
export const CAMERA_MAX_DISTANCE = 300;
/** Orbit input sign: +1 is look-style (drag right turns the view right), as in legacy P30. */
export const CAMERA_INVERT = 1;
export const PUTT_TRANSITION_MS = 1500;

const ELEVATION_MIN = 0.05, ELEVATION_MAX = Math.PI / 2 - 0.05;
const clampElevation = el => Math.max(ELEVATION_MIN, Math.min(ELEVATION_MAX, el));

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const copy = (out, v) => { out.x = v.x; out.y = v.y; out.z = v.z; return out; };
const length = v => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
// THREE.Vector3.normalize(): divideScalar(length || 1), i.e. multiply by the reciprocal.
const normalize = v => { const s = 1 / (length(v) || 1); v.x *= s; v.y *= s; v.z *= s; return v; };
const lerpVectors = (out, a, b, t) => { out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t; return out; };
const distance = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
const toVec = v => Array.isArray(v) ? vec(v[0], v[1], v[2]) : vec(v.x, v.y, v.z);
const out = v => [v.x, v.y, v.z];

/**
 * Creates camera state. Call update() once per rendered frame.
 */
export function createCameraRig() {
  const position = vec(), look = vec(), velocity = vec(), lookVelocity = vec(), freePosition = vec();
  const state = { view: 0, azimuth: 0, elevation: Math.PI / 6, distance: 72, initialized: false, freeRoam: false, freeYaw: 0, freePitch: -0.5 };
  let transition = null;

  const resetVelocity = () => { velocity.x = velocity.y = velocity.z = 0; lookVelocity.x = lookVelocity.y = lookVelocity.z = 0; };
  const viewName = () => CAMERA_VIEWS[state.view];

  function updateTransition(now) {
    const T = transition;
    const k = Math.min(1, (now - T.startTime) / T.duration);
    const e = k * k * k * (k * (k * 6 - 15) + 10), sn = Math.sin(Math.PI * e);
    const ball = lerpVectors(vec(), T.from, T.to, e);
    ball.y += T.arc * sn;
    const d = vec(T.to.x - T.from.x, 0, T.to.z - T.from.z);
    if (length(d) < 1) { d.x = 1; d.y = 0; d.z = 0; }
    normalize(d);
    position.x = ball.x - d.x * (130 + 90 * sn); position.y = ball.y + 80 + 90 * sn; position.z = ball.z - d.z * (130 + 90 * sn);
    copy(look, ball);
    const q = Math.min(1, k / 0.3), w = q * q * (3 - 2 * q);
    if (w < 1) { lerpVectors(position, T.startPosition, position, w); lerpVectors(look, T.startLook, look, w); }
    const done = k >= 1;
    if (done) { transition = null; state.initialized = true; resetVelocity(); }
    return { position: out(position), look: out(look), sunTarget: out(ball), ball: out(ball), fadeTarget: null, mode: 'transition', transitioning: !done, events: done ? ['transition-end'] : [] };
  }

  return {
    state,
    get transitioning() { return !!transition; },
    get mode() { return state.freeRoam ? FREE_ROAM : viewName(); },
    get position() { return out(position); },
    get look() { return out(look); },

    /** Snap to the next pose instead of easing (legacy camInit=false after a map build). */
    reset() { state.initialized = false; },

    /**
     * Cycles Ball cam → Hole view → World view. Ignored in free roam.
     * @returns {{ changed: boolean, view: string, label: string }}
     */
    cycleView() {
      if (state.freeRoam) return { changed: false, view: FREE_ROAM, label: 'Free roam' };
      state.view = (state.view + 1) % CAMERA_VIEWS.length;
      resetVelocity();
      return { changed: true, view: viewName(), label: CAMERA_VIEW_LABELS[state.view] };
    },

    /** Mouse wheel zoom outside free roam (legacy canvas wheel handler). */
    zoom(deltaY) {
      if (['follow', 'orbit', 'strategic'].includes(viewName())) state.distance = Math.max(CAMERA_MIN_DISTANCE, Math.min(CAMERA_MAX_DISTANCE, state.distance + deltaY * 0.15));
    },
    /** Arrow keys while aiming; returns false when the current view does not orbit (input rotates aim instead). */
    orbitKey(key) {
      if (!['follow', 'orbit'].includes(viewName())) return false;
      if (key === 'ArrowLeft') state.azimuth -= 0.06;
      if (key === 'ArrowRight') state.azimuth += 0.06;
      if (key === 'ArrowUp') state.elevation = clampElevation(state.elevation - CAMERA_INVERT * 0.06);
      if (key === 'ArrowDown') state.elevation = clampElevation(state.elevation + CAMERA_INVERT * 0.06);
      return true;
    },
    /** Right-drag orbit from a drag start {x, y, azimuth, elevation}; returns false when the view does not orbit. */
    orbitDrag(start, clientX, clientY) {
      if (!['follow', 'orbit', 'strategic'].includes(viewName())) return false;
      state.azimuth = start.azimuth + CAMERA_INVERT * (clientX - start.x) * 0.006;
      state.elevation = clampElevation(start.elevation + CAMERA_INVERT * (clientY - start.y) * 0.006);
      return true;
    },
    /** Free-roam look drag from a start {x, y, yaw, pitch}. */
    freeLook(start, clientX, clientY) {
      state.freeYaw = start.yaw + (clientX - start.x) * 0.006;
      state.freePitch = Math.max(-1.5, Math.min(1.5, start.pitch - (clientY - start.y) * 0.006));
    },
    /** Free-roam wheel dolly. */
    freeDolly(deltaY) {
      if (!state.freeRoam) return;
      const k = -deltaY * 0.5, cpi = Math.cos(state.freePitch);
      freePosition.x += Math.cos(state.freeYaw) * cpi * k;
      freePosition.z += Math.sin(state.freeYaw) * cpi * k;
      freePosition.y = Math.max(10, Math.min(900, freePosition.y + Math.sin(state.freePitch) * k));
    },

    /**
     * Starts the putt-to-putt arc: the ball flies from the old cup to the next tee while the camera follows.
     * @param {object} options
     * @param {number[]|object} options.from World position of the previous cup (ball centre)
     * @param {number[]|object} options.to World position of the next tee (ball centre)
     * @param {number} options.now Same clock as update({ now })
     * @param {boolean} [options.reducedMotion=false]
     */
    startPuttTransition({ from, to, now, reducedMotion = false }) {
      const a = toVec(from), b = toVec(to);
      transition = { startTime: now, duration: reducedMotion ? 1 : PUTT_TRANSITION_MS, from: a, to: b, arc: Math.min(200, 70 + distance(a, b) * 0.18), startPosition: copy(vec(), position), startLook: copy(vec(), look) };
    },

    /**
     * Advances the camera one frame.
     *
     * @param {object} input
     * @param {number} input.now Monotonic milliseconds (transition clock)
     * @param {number} input.dt Seconds since the previous frame
     * @param {number[]} input.ball World ball centre
     * @param {number[]} input.hole World cup centre (surface height)
     * @param {[number, number]} [input.origin=[0, 0]] Course origin, for the strategic view centre
     * @param {boolean} [input.free=false] Waiting/spectating players fly freely
     * @param {Set<string>} [input.keys] Lower-case keys held (free roam)
     * @param {(worldX: number, worldZ: number) => number} [input.groundHeight] Course surface height for the follow-camera floor
     * @param {boolean} [input.ballVisible=true]
     * @returns {{ position: number[], look: number[], sunTarget: number[], ball: number[]|null, fadeTarget: number[]|null, mode: string, transitioning: boolean, events: string[] }}
     */
    update({ now, dt, ball, hole, origin = [0, 0], free = false, keys = new Set(), groundHeight = () => 0, ballVisible = true }) {
      if (transition) return updateTransition(now);
      const events = [];
      const bp = toVec(ball), holePos = toVec(hole), want = vec(), target = vec();
      if (free && !state.freeRoam) {
        state.freeRoam = true;
        copy(freePosition, position);
        const d0 = normalize(vec(look.x - position.x, look.y - position.y, look.z - position.z));
        state.freeYaw = Math.atan2(d0.z, d0.x);
        state.freePitch = Math.asin(Math.max(-1, Math.min(1, d0.y)));
        events.push('free-roam-start');
      }
      if (!free && state.freeRoam) { state.freeRoam = false; events.push('free-roam-end'); }
      const mode = free ? FREE_ROAM : viewName();
      const cx = origin[0] + 400, cz = origin[1] + 250;

      if (mode === FREE_ROAM) {
        const speed = (keys.has('shift') ? 600 : 240) * dt, cy = Math.cos(state.freeYaw), sy = Math.sin(state.freeYaw), cpi = Math.cos(state.freePitch), spi = Math.sin(state.freePitch);
        const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
        const r = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        const u = (keys.has('e') || keys.has(' ') ? 1 : 0) - (keys.has('q') ? 1 : 0);
        freePosition.x += (cy * cpi * f - sy * r) * speed;
        freePosition.z += (sy * cpi * f + cy * r) * speed;
        freePosition.y += (spi * f + u) * speed;
        freePosition.x = Math.max(-300, Math.min(1100, freePosition.x));
        freePosition.z = Math.max(-300, Math.min(800, freePosition.z));
        freePosition.y = Math.max(10, Math.min(900, freePosition.y));
        copy(want, freePosition);
        target.x = freePosition.x + cy * cpi; target.y = freePosition.y + spi; target.z = freePosition.z + sy * cpi;
        copy(position, want); copy(look, target); resetVelocity(); state.initialized = true;
      } else if (mode === 'follow') {
        const dx = Math.cos(state.azimuth), dz = Math.sin(state.azimuth);
        want.x = bp.x - dx * state.distance * Math.cos(state.elevation);
        want.y = bp.y + state.distance * Math.sin(state.elevation) + 10;
        want.z = bp.z - dz * state.distance * Math.cos(state.elevation);
        target.x = bp.x + dx * 10; target.y = bp.y + 2; target.z = bp.z + dz * 10;
        // The legacy wall-collision ray filtered on a material name no material had, so it never
        // moved the camera; that no-op is intentionally not ported. The terrain floor is.
        const floor = groundHeight(want.x - origin[0], want.z - origin[1]);
        if (want.y < floor + 15) want.y = floor + 15;
      } else if (mode === 'hole') {
        const toBall = vec(bp.x - holePos.x, bp.y - holePos.y, bp.z - holePos.z);
        const dist = length(toBall);
        const hd = vec(toBall.x, 0, toBall.z);
        if (length(hd) < 1) { hd.x = 0; hd.y = 0; hd.z = 1; }
        normalize(hd);
        const back = Math.max(70, Math.min(300, dist * 0.7 + 50)), up = Math.max(60, Math.min(220, dist * 0.5 + 50));
        want.x = holePos.x + hd.x * back; want.y = holePos.y + hd.y * back; want.z = holePos.z + hd.z * back;
        want.y += up;
        lerpVectors(target, holePos, bp, 0.3);
      } else {
        want.x = cx; want.y = 640; want.z = cz + 340;
        target.x = cx; target.y = 0; target.z = cz;
      }

      // Spring-damper smoothing (legacy: same order of operations as the Vector3 chain).
      if (!state.initialized) { copy(position, want); copy(look, target); resetVelocity(); state.initialized = true; }
      const spring = CAMERA_SPRING[mode] || 20, damp = CAMERA_DAMP[mode] || 5;
      for (const axis of ['x', 'y', 'z']) {
        const acc = (want[axis] - position[axis]) * spring - velocity[axis] * damp;
        velocity[axis] += acc * dt;
        position[axis] += velocity[axis] * dt;
        const lookAcc = (target[axis] - look[axis]) * (spring * 0.5) - lookVelocity[axis] * (damp * 0.5);
        lookVelocity[axis] += lookAcc * dt;
        look[axis] += lookVelocity[axis] * dt;
      }
      return { position: out(position), look: out(look), sunTarget: out(bp), ball: null, fadeTarget: free || !ballVisible ? null : out(bp), mode, transitioning: false, events };
    },
  };
}
