import RAPIER from "@dimforge/rapier3d-compat";
export { RAPIER };
export const DT = 1 / 240,
  scenes = ["flat", "ramp", "drop", "tube"];
export const init = () => RAPIER.init();
export function rampZ(x) {
  const t = Math.max(0, Math.min(1, (x - 2) / 2));
  return 0.6 * t * t * (3 - 2 * t);
}
// Metres, x/y horizontal and z vertical; game uses 100 units/metre.
export function createWorld(scene, { friction = 0.18, damping = 0 } = {}) {
  if (!scenes.includes(scene)) throw Error(`Unknown scene ${scene}`);
  const world = new RAPIER.World({ x: 0, y: 0, z: -7 });
  world.timestep = DT;
  function box(x, y, z, hx, hy, hz) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setFriction(friction)
        .setRestitution(0.25),
    );
  }
  function mesh(v, ix) {
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(ix))
        .setFriction(friction)
        .setRestitution(0.25),
    );
  }
  box(50, 0, -0.1, 51, 1, 0.1);
  box(50, -1.05, 0.4, 51, 0.05, 0.5);
  box(50, 1.05, 0.4, 51, 0.05, 0.5);
  if (scene === "ramp") {
    const v = [],
      ix = [];
    for (let i = 0; i <= 80; i++) {
      const x = 2 + i / 40;
      v.push(x, -1, rampZ(x), x, 1, rampZ(x));
      if (i < 80) {
        const n = i * 2;
        ix.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
    mesh(v, ix);
    box(52.5, 0, 0.5, 48.5, 1, 0.1);
  }
  if (scene === "drop") box(0.75, 0, 1.1, 1.75, 1, 0.1);
  if (scene === "tube") {
    // Open ends, closed circumference: continuous collision, no teleport.
    const v = [],
      ix = [],
      n = 48;
    for (let ring = 0; ring < 2; ring++)
      for (let j = 0; j < n; j++) {
        const a = (j * 2 * Math.PI) / n;
        v.push(2 + ring * 6, 0.45 * Math.cos(a), 0.5 + 0.45 * Math.sin(a));
      }
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      ix.push(j, k, j + n, k, k + n, j + n);
    }
    mesh(v, ix);
  }
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(
        scene === "tube" ? 2.2 : 0.5,
        0,
        scene === "drop" ? 1.25 : scene === "tube" ? 0.101 : 0.05,
      )
      .setCcdEnabled(true)
      .setLinearDamping(damping),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(0.05)
      .setDensity(1)
      .setFriction(friction)
      .setRestitution(0.25),
    body,
  );
  return { world, body, scene };
}
export function shoot(s, a, p) {
  s.body.setLinvel(
    { x: 9 * p * Math.cos(a), y: 9 * p * Math.sin(a), z: 0 },
    true,
  );
  s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}
export function position(s) {
  const p = s.body.translation();
  return [p.x * 100, p.y * 100, (p.z - 0.05) * 100];
}
export function advance(s) {
  s.world.step();
}
