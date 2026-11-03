/**
 * Deployed Bumpers and Orbital Bumpers, and the placement ghost (G1e). Presentation only: sizes come from the
 * `deployables.*` tuning block, positions from the synced records, and nothing here touches simulation state.
 * Meshes are pooled by record id and released when the record disappears or the layer is disposed.
 */
import { TUNING } from '../shared/tuning.js';
import { surfaceHeight } from '../simulation/physics.js';

export const DEPLOYABLE_COLORS = Object.freeze({ bumper: 0xff5fa2, orbital: 0x6c8bff });
const BODY_HEIGHT = 9;

export function createDeployableLayer({ THREE, scene }) {
  const group = new THREE.Group();
  const entries = new Map(); // id (or 'ghost') -> { kind, root, ring, mats }
  let ghostKind = '';

  function build(kind, ghost) {
    const p = TUNING.deployables, color = DEPLOYABLE_COLORS[kind] ?? 0xffffff;
    const root = new THREE.Group();
    const mats = [];
    const mat = (opts) => { const m = new THREE.MeshBasicMaterial({ color, ...opts, transparent: !!(ghost || opts.transparent), opacity: ghost ? Math.min(opts.opacity ?? 1, 0.45) : (opts.opacity ?? 1) }); mats.push(m); return m; };
    const geos = [];
    const geo = g => { geos.push(g); return g; };
    const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(p.bumperRadius, p.bumperRadius, BODY_HEIGHT, 24)), mat({}));
    body.position.y = BODY_HEIGHT / 2;
    const cap = new THREE.Mesh(geo(new THREE.TorusGeometry(p.bumperRadius * 0.7, 1.6, 8, 24)), mat({ color: 0xffffff }));
    cap.rotation.x = Math.PI / 2; cap.position.y = BODY_HEIGHT + 0.5;
    root.add(body, cap);
    let ring = null;
    if (kind === 'orbital') {
      ring = new THREE.Mesh(geo(new THREE.RingGeometry(p.orbitalRange - 2, p.orbitalRange, 48)), mat({ transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 1;
      const disc = new THREE.Mesh(geo(new THREE.CircleGeometry(p.orbitalRange, 48)), mat({ transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.6;
      root.add(ring, disc);
    }
    group.add(root);
    return { kind, root, ring, mats, geos };
  }
  const release = entry => { group.remove(entry.root); entry.geos.forEach(g => g.dispose()); entry.mats.forEach(m => m.dispose()); };

  return {
    group,
    /**
     * @param {{id:string,kind:string,x:number,y:number}[]} list Active records for this putt
     * @param {{kind:string,x:number,y:number}|null} placing Ghost under the cursor while the owner picks a spot
     * @param {{ground:(x:number,y:number,h:number)=>number[]}} transform
     * @param {object} course
     * @param {number} t Seconds (animation clock)
     */
    update(list, placing, transform, course, t) {
      const wanted = new Map(list.map(d => [d.id, d]));
      if (placing) wanted.set('ghost', { id: 'ghost', ...placing });
      for (const [id, entry] of [...entries]) {
        const d = wanted.get(id);
        if (!d || d.kind !== entry.kind) { release(entry); entries.delete(id); }
      }
      if (!wanted.size && group.parent) scene.remove(group);
      for (const [id, d] of wanted) {
        let entry = entries.get(id);
        if (!entry) { entry = build(d.kind, id === 'ghost'); entries.set(id, entry); }
        const [wx, wy, wz] = transform.ground(d.x, d.y, surfaceHeight(course, d.x, d.y));
        if (!group.parent) scene.add(group); // attached only while something is shown, so an empty layer leaves the scene untouched
        entry.root.position.set(wx, wy, wz);
        entry.root.rotation.y = id === 'ghost' ? 0 : t * 0.8;
        if (entry.ring) entry.ring.material.opacity = (id === 'ghost' ? 0.4 : 0.55) + Math.sin(t * 3) * 0.2;
      }
    },
    count: () => entries.size,
    dispose() { for (const entry of entries.values()) release(entry); entries.clear(); scene.remove(group); },
  };
}
