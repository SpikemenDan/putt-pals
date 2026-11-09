/**
 * 3D cup rack rendering for Putt Pong mode (GM2c, issue #187).
 *
 * Builds Two independent 10-cup triangular racks (home and away) in the
 * scene using cup positions from `course.cups`. Each cup is a small
 * cylinder sleeve + torus rim, coloured by team. Eliminated cups play a
 * short scale-down animation and are removed from the scene.
 *
 * API:
 *   createPongCupRack(library, cups, transform, group) → { update, eliminateCup, syncActive, dispose }
 *
 * The caller (course-scene.js) adds the returned group to the scene and
 * calls update(dt) each frame. eliminateCup(cupId) is called by the renderer
 * when a CUP_ELIMINATION simulation event arrives.
 */

import { TUNING } from '../shared/tuning.js';

/** Cup sleeve depth (matches CUP_DEPTH from physics). */
const CUP_DEPTH = TUNING.cup.depth;

/** Duration of the shrink-out elimination animation (seconds). */
const ELIM_DURATION = 0.35;

/** Team colours in world space (toon palette friendly). */
const TEAM_COLORS = Object.freeze({
  home: 0xff4444,  // red
  away: 0x4488ff,  // blue
});

const ACTIVE_RIM_COLOR   = 0xffffff;
const INACTIVE_RIM_COLOR = 0x444444; // already-eliminated ghost tint

/**
 * Builds cup rack meshes for a multi-cup Putt Pong course.
 *
 * @param {object} library   createMaterialLibrary() result
 * @param {Array}  cups      course.cups array (validated, from GM2a schema)
 * @param {object} transform createWorldTransform() result
 * @param {object} group     THREE.Group to add meshes into (the course group)
 * @returns {{ update: (dt: number) => void, eliminateCup: (id: string) => void, syncActive: (activeCups: Array) => void, dispose: () => void }}
 */
export function createPongCupRack(library, cups, transform, group) {
  if (!cups || cups.length === 0) return _noop();

  const { THREE } = library;
  const toon = library.style === 'toon';

  /** Per-cup state keyed by id. */
  const entries = new Map();

  for (const cup of cups) {
    const hx = cup.x;
    const hy = cup.y;
    const hz = typeof cup.z === 'number' ? cup.z : 0;
    const r   = typeof cup.radius === 'number' && cup.radius > 0 ? cup.radius : TUNING.cup.defaultRadius;
    const team = typeof cup.team === 'string' ? cup.team : 'home';
    const teamColor = TEAM_COLORS[team] ?? 0xffffff;

    // Build in world space using the course transform.
    const [wx, wy, wz] = transform.local(hx, hy, hz);

    const sleeveGeo = new THREE.CylinderGeometry(r, r, CUP_DEPTH, 32, 1, true);
    const sleeveMat = toon
      ? library.toon(teamColor, { roughness: 0.85, side: THREE.BackSide, transparent: true, opacity: 0.85 })
      : new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.85, side: THREE.BackSide, transparent: true, opacity: 0.85 });
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
    sleeve.position.set(wx, wy - CUP_DEPTH / 2, wz);

    const rimGeo = new THREE.TorusGeometry(r + 0.7, 0.55, 8, 32);
    const rimMat = toon
      ? library.toon(ACTIVE_RIM_COLOR, { roughness: 0.3 })
      : new THREE.MeshStandardMaterial({ color: ACTIVE_RIM_COLOR, roughness: 0.3 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(wx, wy, wz);

    group.add(sleeve);
    group.add(rim);

    entries.set(cup.id, {
      id: cup.id,
      team,
      sleeve,
      rim,
      sleeveGeo, sleeveMat,
      rimGeo, rimMat,
      active: cup.active !== false,
      elimProgress: null, // null = idle; number 0→1 = animating elimination
    });

    // If the cup is already inactive when the scene is built, hide it immediately.
    if (cup.active === false) {
      sleeve.visible = false;
      rim.visible = false;
    }
  }

  /**
   * Triggers the shrink-out elimination animation for the given cup id.
   * Idempotent — calling it again on an already-eliminated cup is a no-op.
   */
  function eliminateCup(id) {
    const entry = entries.get(id);
    if (!entry || !entry.active || entry.elimProgress !== null) return;
    entry.active = false;
    entry.elimProgress = 0;
  }

  /**
   * Syncs active/inactive state from the authoritative pong session context
   * without animating. Used when restoring a snapshot (e.g. reconnect or
   * scene rebuild mid-match).
   *
   * @param {Array<{ id: string, active: boolean }>} activeCups
   */
  function syncActive(activeCups) {
    if (!Array.isArray(activeCups)) return;
    for (const cup of activeCups) {
      const entry = entries.get(cup.id);
      if (!entry) continue;
      entry.active = cup.active !== false;
      if (!entry.active && entry.elimProgress === null) {
        // Already gone — hide immediately without animating.
        entry.sleeve.visible = false;
        entry.rim.visible = false;
      }
    }
  }

  /**
   * Advances elimination animations. Call once per rendered frame.
   * @param {number} dt Seconds since last frame.
   */
  function update(dt) {
    for (const entry of entries.values()) {
      if (entry.elimProgress === null) continue;

      entry.elimProgress = Math.min(1, entry.elimProgress + dt / ELIM_DURATION);
      const scale = 1 - entry.elimProgress;
      // Ease in: start fast, slow near zero.
      const s = scale * scale;
      entry.sleeve.scale.setScalar(Math.max(s, 0.001));
      entry.rim.scale.setScalar(Math.max(s, 0.001));

      if (entry.elimProgress >= 1) {
        // Animation complete: hide the meshes.
        entry.sleeve.visible = false;
        entry.rim.visible = false;
        entry.elimProgress = null;
      }
    }
  }

  function dispose() {
    for (const entry of entries.values()) {
      group.remove(entry.sleeve);
      group.remove(entry.rim);
      entry.sleeveGeo.dispose();
      entry.rimGeo.dispose();
      // Only dispose materials if not shared from the library.
      if (!library.isShared(entry.sleeveMat)) entry.sleeveMat.dispose();
      if (!library.isShared(entry.rimMat)) entry.rimMat.dispose();
    }
    entries.clear();
  }

  return { update, eliminateCup, syncActive, dispose };
}

/** No-op variant when there are no cups (standard courses). */
function _noop() {
  return { update: () => {}, eliminateCup: () => {}, syncActive: () => {}, dispose: () => {} };
}
