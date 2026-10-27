/**
 * Game view: composes the renderer with the camera rig the way the legacy
 * draw() loop did. Application code supplies plain snapshots; this module
 * converts simulation positions to world space and returns camera events
 * (free-roam start/end, transition end) for the UI to announce.
 */

import { surfaceHeight } from '../simulation/physics.js';
import { createCameraRig } from '../camera/rig.js';

/**
 * @param {object} options
 * @param {ReturnType<import('./renderer.js').createGameRenderer>} options.renderer
 * @param {ReturnType<typeof createCameraRig>} [options.rig]
 */
export function createGameView({ renderer, rig = createCameraRig() }) {
  const requireCourse = () => {
    const build = renderer.course;
    if (!build) throw new Error('setCourse() must be called before drawing a course frame');
    return build;
  };

  return {
    renderer,
    rig,
    /** Builds the putt's scene; the next frame snaps the camera instead of easing. */
    setCourse(course, puttIndex = 0) {
      const build = renderer.setCourse(course, puttIndex);
      rig.reset();
      return build;
    },
    /**
     * Arc the ball from the previous cup to the next tee (legacy putt advance).
     * Call after setCourse() for the new putt.
     */
    startPuttTransition({ previousHole, nextTee, now, reducedMotion = false }) {
      const { course, transform } = requireCourse();
      rig.startPuttTransition({
        from: transform.ball(previousHole[0], previousHole[1], surfaceHeight(course, previousHole[0], previousHole[1])),
        to: transform.ball(nextTee[0], nextTee[1], surfaceHeight(course, nextTee[0], nextTee[1])),
        now,
        reducedMotion,
      });
    },
    /**
     * Draws one frame.
     * @param {object} frame See renderer.render(); plus `free` (spectating/waiting) and `keys` (held keys, lower case).
     * @returns {{ events: string[], mode: string, transitioning: boolean }}
     */
    frame({ now, dt, hazardTime = 0, local, remotes = [], aim = null, free = false, keys }) {
      const { course, transform, holePosition } = requireCourse();
      const me = local || { x: 0, y: 0, z: 0, mode: 'lobby' };
      const ballVisible = me.mode === 'play' || me.mode === 'sunk';
      const pose = rig.update({
        now,
        dt,
        ball: transform.ball(me.x, me.y, me.z),
        hole: holePosition,
        origin: transform.origin,
        free,
        keys,
        groundHeight: (x, y) => surfaceHeight(course, x, y),
        ballVisible,
      });
      renderer.render({ now, dt, hazardTime, local, remotes, aim, camera: pose });
      return { events: pose.events, mode: pose.mode, transitioning: pose.transitioning };
    },
    dispose() { renderer.dispose(); },
  };
}
