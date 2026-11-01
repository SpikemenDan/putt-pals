/**
 * Walls and platforms between the camera and the ball fade out, as does the
 * one the camera sits inside (legacy P31 updateWallFade). Static boxes only.
 */

import { BALL_RADIUS } from '../shared/constants.js';

export const FADE_MIN = 0.16;

/** @param {object} THREE Three.js namespace */
export function createWallFade(THREE) {
  const ray = new THREE.Raycaster();
  const blocked = new Set();
  const V = THREE.Vector3;

  /**
   * @param {Array<{mesh: object, alpha: number, box: object|null}>} entries
   * @param {number} dt Seconds since the last frame
   * @param {object} from Camera position (THREE.Vector3)
   * @param {object|null} to Ball position, or null to fade only the wall containing the camera
   */
  return function updateWallFade(entries, dt, from, to) {
    if (!entries.length) return;
    blocked.clear();
    if (to) {
      const dir = new V().subVectors(to, from), len = dir.length();
      if (len > 2) {
        dir.multiplyScalar(1 / len);
        const right = new V().crossVectors(dir, new V(0, 1, 0));
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
        right.normalize();
        const up = new V().crossVectors(right, dir).normalize(), meshes = entries.map(w => w.mesh), target = new V(), d = new V();
        // Centre, left, right and above for every entry; never below for platforms, so the platform
        // under the ball is not hit. Walls also get a ray to the ball's lower half (CL2 #103), or a
        // wall edge in front of the ball could hide it without fading.
        for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          target.copy(to).addScaledVector(right, a * BALL_RADIUS * 1.5).addScaledVector(up, b * BALL_RADIUS * 1.5);
          d.subVectors(target, from);
          const l = d.length();
          if (l < 2) continue;
          d.multiplyScalar(1 / l);
          ray.set(from, d); ray.near = 0; ray.far = Math.max(0, l - 1);
          for (const hit of ray.intersectObjects(meshes, false)) if (b >= 0 || hit.object.userData.wall) blocked.add(hit.object);
        }
      }
    }
    // Free roam and the putt transition pass no ball; the wall around the camera still fades (CL2 #103).
    for (const w of entries) {
      if (!w.box) { w.mesh.updateWorldMatrix(true, false); w.box = new THREE.Box3().setFromObject(w.mesh).expandByScalar(3); }
      if (w.box.containsPoint(from)) blocked.add(w.mesh);
    }
    const k = Math.min(1, dt * 10);
    for (const w of entries) {
      const target = blocked.has(w.mesh) ? FADE_MIN : 1;
      w.alpha += (target - w.alpha) * k;
      if (Math.abs(w.alpha - target) < 0.01) w.alpha = target;
      const material = w.mesh.material;
      material.opacity = w.alpha;
      material.depthWrite = w.alpha > 0.98;
    }
  };
}
