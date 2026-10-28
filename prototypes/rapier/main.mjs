import * as THREE from "three";
import measurements from "./measurements.json";
import { init, createWorld, shoot, advance, position, DT } from "./physics.mjs";
const canvas = document.querySelector("canvas"),
  status = document.querySelector("#status");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#101824");
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.up.set(0, 0, 1);
camera.position.set(7, -10, 8);
camera.lookAt(5, 0, 0.5);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const geometry = new THREE.BufferGeometry();
const wire = new THREE.LineSegments(
  geometry,
  new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
  }),
);
scene.add(wire);
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 20, 16),
  new THREE.MeshBasicMaterial({ color: 0xffe766 }),
);
scene.add(ball);
const trailGeometry = new THREE.BufferGeometry(),
  trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({ color: 0x62cbff }),
  );
scene.add(trail);
const comparisonGeometry = new THREE.BufferGeometry();
const comparison = new THREE.Line(
  comparisonGeometry,
  new THREE.LineBasicMaterial({ color: 0xff6b8b }),
);
scene.add(comparison);
let sim,
  accumulator = 0,
  last = 0,
  elapsed = 0,
  points = [],
  frameCount = 0,
  ready = false;
for (const id of ["angle", "power"])
  document.querySelector("#" + id).addEventListener("input", () => {
    document.querySelector("#" + id + "-value").textContent =
      document.querySelector("#" + id).value + (id === "angle" ? "°" : "%");
  });
function reset() {
  sim?.world.free();
  sim = createWorld(document.querySelector("#scene").value);
  shoot(
    sim,
    (Number(document.querySelector("#angle").value) * Math.PI) / 180,
    Number(document.querySelector("#power").value) / 100,
  );
  elapsed = 0;
  accumulator = 0;
  points = [];
  const trace = measurements.trajectories[sim.scene].custom.trace || [];
  comparisonGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      trace.flatMap((s) => [s.p[0] / 100, s.p[1] / 100, s.p[2] / 100 + 0.05]),
      3,
    ),
  );
  comparison.visible = trace.length > 0;
  const d = sim.world.debugRender();
  geometry.setAttribute("position", new THREE.BufferAttribute(d.vertices, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(d.colors, 4));
}
document.querySelector("#scene").addEventListener("change", reset);
document.querySelector("#shoot").addEventListener("click", reset);
try {
  const t = performance.now();
  await init();
  const initializationMs = performance.now() - t;
  reset();
  ready = true;
  document.querySelector("#shoot").disabled = false;
  // Read-only diagnostics for reproducible browser verification; never controls physics.
  window.p1Diagnostics = () => ({
    ready,
    scene: sim.scene,
    elapsed,
    position: position(sim),
    frameCount,
    initializationMs,
    colliders: sim.world.colliders.len(),
  });
} catch (e) {
  status.textContent = `Could not initialize: ${e.message}`;
  throw e;
}
function frame(now) {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (
    canvas.width !== Math.round(w * renderer.getPixelRatio()) ||
    canvas.height !== Math.round(h * renderer.getPixelRatio())
  ) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  accumulator += Math.min((now - (last || now)) / 1000, 0.1);
  last = now;
  if (ready) {
    while (accumulator >= DT && elapsed < 8) {
      advance(sim);
      accumulator -= DT;
      elapsed += DT;
    }
    const p = sim.body.translation();
    ball.position.set(p.x, p.y, p.z);
    if (elapsed < 8) {
      points.push(p.x, p.y, p.z);
      trailGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(points, 3),
      );
    }
    status.textContent = `${sim.scene} · ${elapsed.toFixed(2)} s · x ${p.x.toFixed(2)} m · height ${(p.z - 0.05).toFixed(2)} m${elapsed >= 8 ? " · Reset to shoot again" : ""}`;
  }
  renderer.render(scene, camera);
  frameCount++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener(
  "pagehide",
  () => {
    sim?.world.free();
    renderer.dispose();
    geometry.dispose();
    wire.material.dispose();
    ball.geometry.dispose();
    ball.material.dispose();
    trailGeometry.dispose();
    trail.material.dispose();
    comparisonGeometry.dispose();
    comparison.material.dispose();
  },
  { once: true },
);
