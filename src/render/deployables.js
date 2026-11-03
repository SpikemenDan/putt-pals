/**
 * Deployed Bumpers and Orbital Bumpers, and the placement ghost (G1e). Presentation only: sizes come from the
 * `deployables.*` tuning block, positions from the synced records, and nothing here touches simulation state.
 *
 * The body is a pinball pop bumper: a wide base lip, an indented waist low on the body, a flared barrel and a
 * plain domed cap. In the toon style it uses the shared cel-shaded material and ink outline, so it
 * reads like the rest of the comic-book course; the legacy style falls back to plain standard materials.
 * Meshes are pooled by record id and released when the record disappears or the layer is disposed.
 */
import { TUNING } from '../shared/tuning.js';
import { surfaceHeight } from '../simulation/physics.js';
import { addInk } from './outline.js';

/** body: main colour, accent: waist band, cap ring and orbital moon. */
export const DEPLOYABLE_COLORS = Object.freeze({
  bumper: { body: 0xff4d6d, accent: 0xffe14d },
  orbital: { body: 0x4d7dff, accent: 0x7ff0ff },
});

/** Hologram colours for the placement ghost: green where it can go, red where it cannot. */
export const HOLO_OK = 0x2dff6e, HOLO_BLOCKED = 0xff2d2d;
/** Dots above a bumper: one per hit it has left. */
const DOT_HEIGHT = 22, DOT_SPACING = 6;

/** Lathe profile [radius multiple, height] from the floor up: base lip, indented waist, flared barrel, domed cap. */
export const BUMPER_PROFILE = Object.freeze([
  [0.0, 0], [1.0, 0], [1.0, 1.3], [0.9, 2.0], [0.74, 3.0], [0.7, 4.2], [0.78, 5.2], [0.94, 6.6], [1.0, 8.2],
  [0.98, 9.8], [0.84, 11.0], [0.6, 11.8], [0.3, 12.2], [0.0, 12.3],
]);

export function createDeployableLayer({ THREE, scene, library = null, toon = false }) {
  const group = new THREE.Group();
  const entries = new Map(); // id (or 'ghost') -> { kind, root, spin, ring, owned, holo, dots, lives }
  const dotGeometry = new THREE.SphereGeometry(2, 14, 10);
  
  function build(kind, ghost) {
    const p = TUNING.deployables, palette = DEPLOYABLE_COLORS[kind] ?? DEPLOYABLE_COLORS.bumper;
    const root = new THREE.Group(), owned = [], inked = [], holo = [];
    const geo = g => { owned.push(g); return g; };
    const mat = (color, opts = {}) => {
      const transparent = ghost || !!opts.transparent, opacity = ghost ? Math.min(opts.opacity ?? 1, 0.45) : (opts.opacity ?? 1);
      let m;
      if (ghost) { m = new THREE.MeshBasicMaterial({ color: HOLO_OK, transparent: true, opacity: Math.min(opts.opacity ?? 1, 0.5), depthWrite: false, ...(opts.side ? { side: opts.side } : {}) }); holo.push(m); owned.push(m); return m; }
      if (library && toon) m = library.toon(color, { transparent, opacity, ...(opts.side ? { side: opts.side } : {}) });
      else m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, transparent, opacity, ...(opts.side ? { side: opts.side } : {}) });
      if (opts.depthWrite === false) m.depthWrite = false;
      owned.push(m);
      return m;
    };
    const solid = (geometry, material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo(geometry), material);
      mesh.position.set(x, y, z); mesh.castShadow = !ghost; mesh.receiveShadow = false;
      root.add(mesh);
      if (toon && library && !ghost) inked.push(mesh);
      return mesh;
    };
    const R = p.bumperRadius, s = R * 1.0;
    // Pinball body: one lathe with the indented waist, then an accent band in the waist and a cap ring.
    const lathe = new THREE.LatheGeometry(BUMPER_PROFILE.map(([r, y]) => new THREE.Vector2(r * s, y)), 32);
    solid(lathe, mat(palette.body));
    const waist = solid(new THREE.TorusGeometry(s * 0.72, 0.9, 8, 32), mat(palette.accent), 0, 3.7, 0);
    waist.rotation.x = Math.PI / 2;
    const capRing = solid(new THREE.TorusGeometry(s * 0.9, 0.8, 8, 32), mat(palette.accent), 0, 10.2, 0);
    capRing.rotation.x = Math.PI / 2;
    let ring = null, spin = null;
    if (kind === 'orbital') {
      // A little moon circles the cap; the floor ring shows the pull range.
      spin = new THREE.Group(); spin.position.y = 7; root.add(spin);
      const moon = new THREE.Mesh(geo(new THREE.SphereGeometry(3.2, 16, 12)), mat(palette.accent));
      moon.position.set(s * 1.25, 0, 0); moon.castShadow = !ghost; spin.add(moon);
      if (toon && library && !ghost) inked.push(moon);
      const track = new THREE.Mesh(geo(new THREE.TorusGeometry(s * 1.25, 0.35, 6, 40)), mat(palette.accent, { transparent: true, opacity: 0.6 }));
      track.rotation.x = Math.PI / 2; spin.add(track);
      ring = new THREE.Mesh(geo(new THREE.RingGeometry(p.orbitalRange - 2.5, p.orbitalRange, 56)), mat(palette.accent, { transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.8; root.add(ring);
      const disc = new THREE.Mesh(geo(new THREE.CircleGeometry(p.orbitalRange, 56)), mat(palette.body, { transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.5; root.add(disc);
    }
    for (const mesh of inked) { const hull = addInk(THREE, mesh, library.ink.solid); hull.geometry && owned.push(hull.geometry); }
    group.add(root);
    return { kind, root, spin, ring, owned, holo, dots: null, lives: -1 };
  }
  /** One dot per remaining hit, in a row above the cap; rebuilt only when the count changes. */
  function showLives(entry, lives) {
    if (entry.lives === lives) return;
    if (entry.dots) { entry.root.remove(entry.dots.group); for (const m of entry.dots.mats) m.dispose(); }
    const dotGroup = new THREE.Group(), mats = [];
    for (let i = 0; i < lives; i++) {
      const m = library && toon ? library.toon(0xffe14d) : new THREE.MeshStandardMaterial({ color: 0xffe14d, roughness: 0.5 });
      mats.push(m);
      const dot = new THREE.Mesh(dotGeometry, m);
      dot.position.set((i - (lives - 1) / 2) * DOT_SPACING, DOT_HEIGHT, 0);
      dotGroup.add(dot);
      if (library && toon) addInk(THREE, dot, library.ink.solid);
    }
    entry.root.add(dotGroup); entry.dots = { group: dotGroup, mats }; entry.lives = lives;
  }
  const release = entry => {
    group.remove(entry.root);
    if (entry.dots) for (const m of entry.dots.mats) m.dispose();
    for (const r of entry.owned) if (!library?.isShared?.(r)) r.dispose?.();
  };

  return {
    group,
    /**
     * @param {{id:string,kind:string,x:number,y:number}[]} list Active records for this putt
     * @param {{kind:string,x:number,y:number}|null} placing Ghost under the cursor while the owner picks a spot
     * @param {{ground:(x:number,y:number,h:number)=>number[]}} transform
     * @param {object} course
     * @param {number} t Seconds (animation clock)
     */
    update(list, placing, transform, course, t, camera = null) {
      const wanted = new Map(list.map(d => [d.id, d]));
      if (placing) wanted.set('ghost', { id: 'ghost', ...placing });
      for (const [id, entry] of [...entries]) {
        const d = wanted.get(id);
        if (!d || d.kind !== entry.kind) { release(entry); entries.delete(id); }
      }
      if (!wanted.size && group.parent) scene.remove(group); // attached only while something is shown, so an empty layer leaves the scene untouched
      for (const [id, d] of wanted) {
        let entry = entries.get(id);
        if (!entry) { entry = build(d.kind, id === 'ghost'); entries.set(id, entry); }
        if (!group.parent) scene.add(group);
        const [wx, wy, wz] = transform.ground(d.x, d.y, surfaceHeight(course, d.x, d.y));
        entry.root.position.set(wx, wy, wz);
        if (entry.spin) entry.spin.rotation.y = t * 1.6;
        if (id === 'ghost') { const c = d.valid === false ? HOLO_BLOCKED : HOLO_OK; for (const m of entry.holo) m.color.setHex(c); }
        else {
          showLives(entry, Math.max(0, TUNING.deployables.maxImpacts - (d.impacts || 0)));
          if (camera && entry.dots) entry.dots.group.rotation.y = Math.atan2(camera.position.x - wx, camera.position.z - wz); // the row faces the camera
        }
        if (entry.ring) entry.ring.material.opacity = (id === 'ghost' ? 0.4 : 0.6) + Math.sin(t * 3) * 0.2;
      }
    },
    count: () => entries.size,
    /** Dots shown over each placed object (id -> number), for tests. */
    dotCounts: () => new Map([...entries].filter(([id]) => id !== 'ghost').map(([id, e]) => [id, e.lives])),
    dispose() { for (const entry of entries.values()) release(entry); entries.clear(); dotGeometry.dispose(); scene.remove(group); },
  };
}
