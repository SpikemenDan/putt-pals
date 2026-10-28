// Explicit S2 measurement command: writes NEW evidence, never the legacy fixtures.
import fs from "node:fs";
import {
  createCourseData,
  createCourseDocument,
} from "../src/courses/index.js";
import { solveCourse, SOLVER_CONFIG } from "../tools/cli/solver.mjs";
import {
  createDifficultyProvenance,
  hashSimulationSources,
} from "../tools/cli/provenance.mjs";
import { SimulationEngine } from "../src/simulation/index.js";
import { runShot } from "../tools/cli/commands.mjs";
function findNominal(map, putt) {
  for (let deg = 0; deg < 360; deg += 0.5)
    for (let power = 0.3; power <= 1.001; power += 0.05) {
      const out = runShot(definitions, map, putt, deg, Math.min(1, power));
      if (out.result.mode === "sunk")
        return { deg, power: +Math.min(1, power).toFixed(2) };
    }
  return null;
}
const { definitions } = createCourseData(),
  document = createCourseDocument();
const old = JSON.parse(
  fs.readFileSync(new URL("./fixtures/solver-baseline.json", import.meta.url)),
);
const results = [];
for (const ref of old.results) {
  const engine = new SimulationEngine(definitions[ref.map], ref.putt);
  const player = engine.addPlayer("p", "Probe");
  engine.launch("p", (ref.best.deg * Math.PI) / 180, ref.best.power);
  for (
    let t = 0;
    t < SOLVER_CONFIG.trialTicks && player.moving && player.mode !== "sunk";
    t++
  )
    engine.step();
  const oldShot = {
    best: ref.best,
    mode: player.mode,
    position: [player.x, player.y, player.z],
  };
  engine.dispose();
  const start = performance.now(),
    result = solveCourse(definitions[ref.map], ref.putt);
  results.push({
    map: ref.map,
    putt: ref.putt,
    name: ref.name,
    oldShot,
    ...result,
    nominal: result.best || findNominal(ref.map, ref.putt),
    elapsedMs: performance.now() - start,
    provenance: createDifficultyProvenance(document.courses[ref.map], ref.putt),
  });
  fs.writeFileSync(
    new URL("./fixtures/cup-capture/solutions.json", import.meta.url),
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        simulationSha256: hashSimulationSources(),
        configuration: SOLVER_CONFIG,
        description:
          "S2 first robust solutions, not full-grid difficulty counts. Legacy baselines retained unchanged.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `${ref.map}/${ref.putt}: old=${oldShot.mode}, new=${JSON.stringify(result.best)} (${Math.round(results.at(-1).elapsedMs)}ms)`,
  );
}
if (results.some((r) => !r.best)) process.exitCode = 1;
