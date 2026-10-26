import { SHOT_POWER } from '../../src/shared/constants.js';
import { SimulationEngine } from '../../src/simulation/index.js';

export const SOLVER_CONFIG = Object.freeze({
  version: 1, angleSteps: 720, angleDivisor: 360,
  powerStart: 0.3, powerStep: 0.05, powerEndInclusive: 1.001,
  trialTicks: 4800, hazardTime: 0,
  angleOffsets: Object.freeze([-0.007, 0, 0.007]),
  powerOffsets: Object.freeze([-0.025, 0, 0.025]),
});

/** Same grid, robustness offsets and 20-second trial window as the legacy solver. */
export function solveCourse(course, putt, { full = false } = {}) {
  const trial = (angle, power) => {
    const engine = new SimulationEngine(course, putt, { hazardTime: SOLVER_CONFIG.hazardTime });
    try {
      const player = engine.addPlayer('solver', 'Solver', 0);
      // The legacy floating-point grid ends at 1.0000000000000002. Preserve
      // its exact speed through the existing multiplier port; normalized input
      // clamping would otherwise change a marginal sink at the endpoint.
      engine.launch('solver', angle, 1, power * SHOT_POWER);
      for (let tick = 0; tick < SOLVER_CONFIG.trialTicks && player.moving && player.mode !== 'sunk'; tick++) engine.step();
      return player.mode === 'sunk' && !player.over && player.strokes === 1;
    } finally { engine.dispose(); }
  };
  const robust = (angle, power) => SOLVER_CONFIG.angleOffsets.every(da =>
    SOLVER_CONFIG.powerOffsets.every(dp => trial(angle + da, Math.min(1, power + dp))));
  let hits = 0;
  let best = null;
  for (let degreeStep = 0; degreeStep < SOLVER_CONFIG.angleSteps && (full || !best); degreeStep++) {
    const angle = degreeStep * Math.PI / SOLVER_CONFIG.angleDivisor;
    for (let power = SOLVER_CONFIG.powerStart; power <= SOLVER_CONFIG.powerEndInclusive; power += SOLVER_CONFIG.powerStep) {
      if (!trial(angle, power)) continue;
      hits++;
      if (!best && robust(angle, power)) {
        best = { deg: +(angle * 180 / Math.PI).toFixed(1), power: +power.toFixed(2) };
        if (!full) break;
      }
    }
  }
  return { hits, best };
}
