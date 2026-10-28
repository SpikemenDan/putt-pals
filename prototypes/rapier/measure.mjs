import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
import os from "node:os";
import {
  init,
  createWorld,
  shoot,
  advance,
  position,
  DT,
  scenes,
} from "./physics.mjs";
import { stepBall } from "../../src/simulation/physics.js";
import { createPlayerState, applyShot } from "../../src/shared/simulation.js";
const t = performance.now();
await init();
const initializationMs = performance.now() - t;
function course(s) {
  return {
    tiles: [[-100, -100, 10200, 200]],
    hole: [10000, 80],
    walls: [],
    sand: [],
    rp: s === "ramp" ? [[200, -100, 200, 200, "+x", 0, 60]] : [],
    pl:
      s === "ramp"
        ? [[400, -100, 9700, 200, 60]]
        : s === "drop"
          ? [[-100, -100, 350, 200, 120]]
          : [],
  };
}
function rapier(s, p, a = 0, sample = false) {
  const sim = createWorld(s);
  shoot(sim, a, p);
  const trace = [];
  let maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  try {
    for (let i = 0; i < 1440; i++) {
      advance(sim);
      const pos = position(sim);
      assert(pos.every(Number.isFinite));
      maxX = Math.max(maxX, pos[0]);
      minZ = Math.min(minZ, pos[2]);
      maxZ = Math.max(maxZ, pos[2]);
      if (sample && i % 120 === 119) trace.push({ t: (i + 1) * DT, p: pos });
    }
    return { final: position(sim), maxX, minZ, maxZ, trace };
  } finally {
    sim.world.free();
  }
}
function custom(s, p, a = 0, sample = false) {
  const c = course(s),
    b = createPlayerState("probe", 0, {
      x: 50,
      y: 0,
      z: s === "drop" ? 120 : 0,
    }),
    trace = [];
  applyShot(b, a, p);
  for (let i = 0; i < 1440; i++) {
    stepBall(b, c, DT, i * DT);
    if (sample && i % 120 === 119)
      trace.push({ t: (i + 1) * DT, p: [b.x, b.y, b.z] });
  }
  return { final: [b.x, b.y, b.z], mode: b.mode, trace };
}
const trajectories = Object.fromEntries(
  scenes.map((s) => [
    s,
    {
      rapier: rapier(s, 0.7, 0, true),
      custom:
        s === "tube"
          ? {
              unsupported:
                "No enclosed tube representation in custom heightfield.",
            }
          : custom(s, 0.7, 0, true),
    },
  ]),
);
assert(trajectories.ramp.rapier.maxZ > 55, "climb ramp");
assert(
  trajectories.drop.rapier.maxX > 260 && trajectories.drop.rapier.minZ < 5,
  "leave ledge and land",
);
assert(trajectories.tube.rapier.maxX > 800, "exit tube");
assert.deepEqual(
  rapier("ramp", 0.7).final,
  trajectories.ramp.rapier.final,
  "same-runtime repeatability",
);
for (let i = 0; i < 5; i++) {
  rapier("ramp", 0.4);
  custom("ramp", 0.4);
}
function sweep(fn) {
  const rounds = [];
  let best;
  for (let r = 0; r < 3; r++) {
    const t = performance.now();
    let distance = Infinity;
    for (let i = 0; i < 60; i++) {
      const power = 0.25 + (i % 20) * 0.035,
        angle = (Math.floor(i / 20) - 1) * 0.03,
        res = fn("ramp", power, angle),
        d = Math.hypot(res.final[0] - 600, res.final[1]);
      if (d < distance) {
        distance = d;
        best = { power, angle, distance: d };
      }
    }
    rounds.push(performance.now() - t);
  }
  return {
    candidates: 60,
    stepsPerCandidate: 1440,
    roundMs: rounds,
    medianMs: [...rounds].sort((a, b) => a - b)[1],
    lastRoundBest: best,
  };
}
const tubeProbe = createWorld("tube");
shoot(tubeProbe, 0.15, 0.7);
let tubeContactSamples = 0;
try {
  for (let i = 0; i < 480; i++) {
    advance(tubeProbe);
    const p = tubeProbe.body.translation();
    if (p.x > 2.3 && p.x < 7.9) {
      assert(
        Math.hypot(p.y, p.z - 0.5) < 0.415,
        "tube wall must contain off-axis shot",
      );
      tubeContactSamples++;
    }
  }
  assert(tubeContactSamples > 100, "exercise tube containment");
} finally {
  tubeProbe.world.free();
}
const bytes = readFileSync(
  new URL(
    "./node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs",
    import.meta.url,
  ),
);
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0].model,
  rapier: "0.21.0",
  dt: DT,
  initializationMs,
  tubeContactSamples,
  payload: {
    compatJsBytes: bytes.length,
    compatJsGzipBytes: gzipSync(bytes).length,
  },
  trajectories,
  solver: { rapier: sweep(rapier), custom: sweep(custom) },
  limitations: [
    "Six simulated seconds per candidate, not a full game solver or robust solution count.",
    "Native contact friction and rotation versus velocity drag; not tuned for parity.",
    "Tube has no custom equivalent; cup capture, powers, surface rules and events not ported.",
    "Node timings and same-runtime repeatability do not establish browser feel or cross-platform determinism.",
  ],
};
writeFileSync(
  new URL("./measurements.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, trajectories: undefined }, null, 2));
