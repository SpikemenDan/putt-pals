import * as THREE from "three";
import { createGameRenderer, createGameView } from "/src/render/index.js";
import { createCourseData } from "/src/courses/index.js";
import { SimulationEngine } from "/src/simulation/index.js";
const renderer = createGameRenderer({
  THREE,
  canvas: document.querySelector("canvas"),
  random: () => 0.37,
  devicePixelRatio: 1,
});
const view = createGameView({ renderer });
renderer.resize(1280);
const definition = createCourseData().definitions[0];
for (const key of [
  "w",
  "sand",
  "ice",
  "slime",
  "pit",
  "q",
  "pl",
  "rp",
  "pd",
  "tp",
  "fan",
  "tornado",
  "movers",
])
  definition[key] = [];
definition.name = "Cup behaviour";
definition.tiles = [[0, 0, 2000, 500]];
const shots = {
  slow: { speed: 80, offset: 0, height: 0 },
  fast: { speed: 900, offset: 0, height: 0 },
  airborne: { speed: 600, offset: 0, height: 30 },
  lip: { speed: 95, offset: 9.5, height: 0 },
};
let engine;
function select(name, time = 0.2) {
  const shot = shots[name];
  if (!shot) throw Error("Unknown shot");
  document.querySelector("#shot").value = name;
  document.querySelector("#time").value = String(time);
  engine?.dispose();
  definition.putts = [
    {
      tee: [370, 250 + shot.offset],
      hole: [400, 250],
      par: 2,
      pen: 3,
      cup: 15,
    },
  ];
  view.setCourse(definition, 0);
  engine = new SimulationEngine(definition, 0);
  const p = engine.addPlayer("probe", "Probe", 0, { z: shot.height });
  engine.launch("probe", 0, shot.speed / 900);
  const events = [],
    trace = [];
  for (let i = 0; i < Math.round(time * 240); i++) {
    events.push(...engine.step().events);
    trace.push({ x: p.x, y: p.y, z: p.z, mode: p.mode });
  }
  const local = { ...p, color: 0, effect: null, collected: {} };
  // Give the game camera time to settle on the sampled state without advancing physics.
  for (let i = 0; i < 90; i++)
    view.frame({
      now: (i * 1000) / 60,
      dt: 1 / 60,
      hazardTime: time,
      local,
      remotes: [],
      aim: null,
    });
  document.querySelector("#status").textContent =
    `${time.toFixed(3)} s · ${p.mode} · z=${p.z.toFixed(2)} · ${events.map((e) => e.type).join(", ")}`;
  return { name, time, position: [p.x, p.y, p.z], mode: p.mode, events, trace };
}
document
  .querySelector("#shot")
  .addEventListener("change", () =>
    select(
      document.querySelector("#shot").value,
      +document.querySelector("#time").value,
    ),
  );
document
  .querySelector("#time")
  .addEventListener("input", () =>
    select(
      document.querySelector("#shot").value,
      +document.querySelector("#time").value,
    ),
  );
select("slow");
window.cupProbe = { select };
window.addEventListener(
  "pagehide",
  () => {
    engine.dispose();
    view.dispose();
  },
  { once: true },
);
