/** Visual rings for deterministic roaming global hazards (G1f). */
import { courseBounds, globalHazardCenter } from '../gameplay/global-hazards.js';
import { TUNING } from '../shared/tuning.js';
import { surfaceHeight } from '../simulation/physics.js';

export function createGlobalHazardLayer({ THREE, scene }) {
  let group = null;
  const entries = new Map();
  const palette = { tornado: 0xc16cff, hurricane: 0x5ddcff };
  const build = kind => {
    const geometry = new THREE.TorusGeometry(1, 0.025, 8, 72);
    const material = new THREE.MeshBasicMaterial({ color: palette[kind], transparent: true, opacity: 0.7, depthWrite: false });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), material);
    group.add(ring, marker);
    return { kind, ring, marker, geometry, material };
  };
  const release = entry => {
    group.remove(entry.ring, entry.marker);
    entry.geometry.dispose(); entry.marker.geometry.dispose(); entry.material.dispose();
  };
  return {
    update(records, time, transform, course) {
      const wanted = new Map((records || []).filter(h => ['tornado', 'hurricane'].includes(h.kind)
        && time >= h.startTime && time < h.endTime).map(h => [h.id, h]));
      const bounds = courseBounds(course);
      for (const [id, entry] of [...entries]) if (!wanted.has(id)) { release(entry); entries.delete(id); }
      if (!wanted.size && group?.parent) scene.remove(group);
      if (wanted.size && !group) group = new THREE.Group();
      for (const [id, hazard] of wanted) {
        const center = bounds && globalHazardCenter(hazard, time, bounds);
        if (!center) continue;
        let entry = entries.get(id);
        if (!entry) { entry = build(hazard.kind); entries.set(id, entry); }
        if (!group.parent) scene.add(group);
        let floor = surfaceHeight(course, center.x, center.y);
        if (!(floor > -900)) floor = surfaceHeight(course, course.tee[0], course.tee[1]);
        const [x, y, z] = transform.ground(center.x, center.y, floor);
        entry.ring.position.set(x, y + 1.2, z);
        entry.ring.scale.set(TUNING.globalHazards.vortexRange, TUNING.globalHazards.vortexRange, TUNING.globalHazards.vortexRange);
        entry.marker.position.set(x, y + 2, z);
        entry.ring.material.opacity = 0.52 + Math.sin(time * 3.2) * 0.16;
      }
    },
    dispose() { for (const entry of entries.values()) release(entry); entries.clear(); if (group) scene.remove(group); },
  };
}
