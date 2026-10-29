// Cup capture comparison (P1 #17): the same approach grid through the shared custom engine (src/simulation,
// including the S2 capture rules) and through Rapier with a real cup: a trimesh floor with a circular hole,
// an open sleeve and a bottom. Writes cup-measurements.json. Run: npm run measure:cup
import { writeFileSync } from "node:fs";
import os from "node:os";
import { RAPIER, init, DT } from "./physics.mjs";
import { stepBall } from "../../src/simulation/physics.js";
import { createPlayerState } from "../../src/shared/simulation.js";

const CUP_DEPTH = 0.36; // CUP_DEPTH 36 game units
const BALL = 0.05; // BALL_RADIUS 5 game units
// The ball starts just outside the lip (cup radius + this gap), so turf drag in the custom engine barely slows it
// before the cup and the comparison isolates capture rather than rolling distance.
const GAP = 10;
const END = 60; // a ball 60 units past the cup has missed
const MAX_TICKS = 1200;
const RADII = [15, 8]; // default and smallest supported cup radius, game units
const SPEEDS = [40, 60, 80, 100, 150, 200, 300, 400, 600, 900]; // game units per second
const OFFSETS = [0, 3, 6, 9, 12, 15, 18]; // lateral miss distance of the ball centre, game units

function customTrial(radius, speed, offset) {
  const START = radius + GAP;
  const course = { hole: [0, 0], tee: [-START, offset], tiles: [[-2000, -2000, 4000, 4000]], w: [], cup: radius };
  const player = createPlayerState("Probe", 0, { x: -START, y: offset, z: 0 });
  Object.assign(player, { vx: speed, vy: 0, vz: 0, moving: true });
  for (let i = 0; i < MAX_TICKS && player.moving && player.mode === "play"; i++) {
    stepBall(player, course, 1 / 240);
    if (player.x > END) break;
  }
  return player.mode === "sunk";
}

/** Floor annulus with a circular hole, plus the sleeve and bottom, as one triangle mesh (metres). */
function cupMesh(rHole) {
  const v = [], ix = [], sectors = 96;
  const ring = (r, z) => { const start = v.length / 3; for (let j = 0; j < sectors; j++) { const a = (j / sectors) * 2 * Math.PI; v.push(r * Math.cos(a), r * Math.sin(a), z); } return start; };
  const link = (a, b) => { for (let j = 0; j < sectors; j++) { const k = (j + 1) % sectors; ix.push(a + j, a + k, b + j, a + k, b + k, b + j); } };
  // Floor: from the rim out to 2 m in a few rings so the triangles stay well shaped.
  const radii = [rHole, rHole * 1.5, rHole * 2.5, 0.6, 1.0, 2.0];
  const rings = radii.map(r => ring(r, 0));
  for (let i = 0; i < rings.length - 1; i++) link(rings[i], rings[i + 1]);
  // Sleeve and bottom.
  const sleeve = ring(rHole, -CUP_DEPTH);
  link(rings[0], sleeve);
  const centre = v.length / 3; v.push(0, 0, -CUP_DEPTH);
  for (let j = 0; j < sectors; j++) ix.push(centre, sleeve + j, sleeve + (j + 1) % sectors);
  return { v, ix };
}

function rapierTrial(radius, speed, offset) {
  const START = radius + GAP;
  const world = new RAPIER.World({ x: 0, y: 0, z: -7 });
  world.timestep = DT;
  try {
    const { v, ix } = cupMesh(radius / 100);
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(ix)).setFriction(0.18).setRestitution(0.25));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-START / 100, offset / 100, BALL).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.ball(BALL).setDensity(1).setFriction(0.18).setRestitution(0.25), body);
    body.setLinvel({ x: speed / 100, y: 0, z: 0 }, true);
    for (let i = 0; i < MAX_TICKS; i++) {
      world.step();
      const p = body.translation();
      if (p.z + BALL < 0 && Math.hypot(p.x, p.y) < radius / 100) return true; // ball fully below floor level, inside the cup
      if (p.x * 100 > END || p.z < -CUP_DEPTH - 1) break;
    }
    return false;
  } finally {
    world.free();
  }
}

await init();
const results = [];
for (const radius of RADII) {
  for (const speed of SPEEDS) {
    for (const offset of OFFSETS) {
      results.push({ radius, speed, offset, custom: customTrial(radius, speed, offset), rapier: rapierTrial(radius, speed, offset) });
    }
  }
}

const summary = RADII.map(radius => {
  const rows = results.filter(r => r.radius === radius);
  const count = f => rows.filter(f).length;
  return {
    radius,
    trials: rows.length,
    bothSink: count(r => r.custom && r.rapier),
    bothMiss: count(r => !r.custom && !r.rapier),
    customOnly: count(r => r.custom && !r.rapier),
    rapierOnly: count(r => !r.custom && r.rapier),
    customSinks: count(r => r.custom),
    rapierSinks: count(r => r.rapier),
    // Fastest centred shot that still sinks, per engine.
    fastestCentredSinkCustom: Math.max(0, ...rows.filter(r => r.offset === 0 && r.custom).map(r => r.speed)),
    fastestCentredSinkRapier: Math.max(0, ...rows.filter(r => r.offset === 0 && r.rapier).map(r => r.speed)),
  };
});

// A compact grid per radius: C = custom sinks, R = Rapier sinks, B = both, . = neither.
const grid = Object.fromEntries(RADII.map(radius => [radius, SPEEDS.map(speed => `${String(speed).padStart(3)}: ` + OFFSETS.map(offset => {
  const r = results.find(x => x.radius === radius && x.speed === speed && x.offset === offset);
  return r.custom && r.rapier ? "B" : r.custom ? "C" : r.rapier ? "R" : ".";
}).join(" "))]));

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model.trim(),
  rapier: "0.21.0",
  setup: {
    speedsUnitsPerSecond: SPEEDS, offsetsUnits: OFFSETS, radiiUnits: RADII, startGapUnitsOutsideLip: GAP, endUnits: END, maxTicks: MAX_TICKS,
    custom: "src/simulation stepBall on a flat tile with the cup, S2 capture rules, fixed 1/240 s step",
    rapier: "trimesh floor with a circular hole, open sleeve and bottom (36 units deep), friction 0.18, restitution 0.25, CCD, no drag, fixed 1/240 s step; sunk = ball fully below floor level inside the hole",
  },
  columns: `offset ${OFFSETS.join(" ")} (game units); rows are launch speeds`,
  summary,
  grid,
  results,
};
writeFileSync(new URL("./cup-measurements.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ columns: report.columns, summary, grid }, null, 2));
