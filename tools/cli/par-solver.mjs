import { SHOT_POWER } from '../../src/shared/constants.js';
import { TUNING } from '../../src/shared/tuning.js';
import { SimulationEventTypes } from '../../src/shared/simulation.js';
import { SimulationEngine } from '../../src/simulation/index.js';

/**
 * SV1 par-route solver (issue #87).
 *
 * Proves that a putt has a ROBUST route of at most `maxStrokes` strokes, and reports the
 * shortest one the search finds. A hole-in-one is just a one-stroke route; it is never required.
 *
 * Robustness (the owner rule: every putt completable within par 2..6):
 *  - A finishing stroke is robust when it sinks for every angle/power offset in
 *    angleOffsets x powerOffsets (the S2 margin: +-0.007 rad, +-0.025 power).
 *  - A stroke that does not sink is robust when, for every one of those offsets, the ball comes
 *    to rest in play (no out-of-bounds, no hazard reset, not still moving) AND the player can
 *    still finish from that landing. The continuation from a perturbed landing is a LOCAL
 *    re-aim: the nominal continuation's angle or its re-aimed bearing +-localAngle, over
 *    localPower of the nominal power. The hole-in-one tee search stays on the S2 half-degree grid.
 *
 * Negative answers are search-bounded (candidate grid + trial budget), not proofs of impossibility.
 * Positive answers are real: every stroke of the returned route is replayed through the shared
 * SimulationEngine and `verifyRoute` re-checks it independently.
 */
export const PAR_SOLVER_CONFIG = Object.freeze({
  version: 2,
  minPar: 2, maxStrokes: 6,
  trialTicks: 4800, hazardTime: 0,
  angleOffsets: Object.freeze([-0.007, 0, 0.007]),
  powerOffsets: Object.freeze([-0.025, 0, 0.025]),
  powerStart: 0.3, powerStep: 0.05, powerEndInclusive: 1.001,
  finishAngleStepDeg: 0.5,      // tee hole-in-one probe (S2 grid)
  screenAngleStepDeg: 2, screenPowerStep: 0.1, // finishing screen from waypoints; hits are re-checked robustly
  waypointAngleStepDeg: 3, waypointPowerStep: 0.1,
  waypointCell: 8, maxWaypoints: 24,
  local: Object.freeze({ angleDeg: 4, angleStepDeg: 0.5, power: 0.15 }),
  marginScales: Object.freeze([1, 1.5, 2, 3]),
  budgetTrials: 1500000, fullBudgetTrials: 6000000,
  fullWaypointAngleStepDeg: 1.5, fullMaxWaypoints: 60,
});

export class BudgetExhausted extends Error {}

const DEG = Math.PI / 180;
const key = (x, y) => `${x.toFixed(3)},${y.toFixed(3)}`;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const round = (n, d = 1) => +n.toFixed(d);

/**
 * Gravity is a solver parameter so per-world runs (Gaia/Ares/Luna, #164) need no solver
 * rewrite. The shared simulation currently binds gravity once from src/shared/tuning.js, so only
 * the loaded value can be simulated; any other value is refused instead of silently solving the
 * wrong world. Injecting gravity into SimulationEngine is tracked with #164.
 */
export function assertWorldGravity(gravity) {
  if (gravity !== TUNING.gravity) {
    throw new Error(`Solver requested gravity ${gravity} but the loaded simulation uses ${TUNING.gravity}; per-world gravity injection is pending (#164)`);
  }
}

/** One stroke from a rest state; returns the resting position or the sink. */
function createRunner(course, puttIndex, config, counter) {
  return (state, angle, power) => {
    if (++counter.trials > counter.budget) throw new BudgetExhausted('trial budget exhausted');
    const engine = new SimulationEngine(course, puttIndex, { hazardTime: config.hazardTime });
    try {
      const player = engine.addPlayer('s', 'Solver', 0, { x: state.x, y: state.y, z: state.z });
      engine.launch('s', angle, 1, Math.min(1, power) * SHOT_POWER);
      let invalid = false;
      for (let tick = 0; tick < config.trialTicks && player.moving && player.mode !== 'sunk'; tick++) {
        for (const event of engine.step().events) if (event.type === SimulationEventTypes.OUT_OF_BOUNDS) invalid = true;
        if (invalid) break;
      }
      if (player.mode === 'sunk') return { sunk: !player.over, invalid: !!player.over };
      if (invalid || player.moving || !Number.isFinite(player.x + player.y + player.z)) return { sunk: false, invalid: true };
      return { sunk: false, invalid: false, x: player.x, y: player.y, z: player.z };
    } finally { engine.dispose(); }
  };
}

function powers(config, step = config.powerStep) {
  const list = [];
  for (let power = config.powerStart; power <= config.powerEndInclusive; power += step) list.push(+power.toFixed(4));
  return list;
}

/**
 * Walking-distance field to the cup (coarse grid BFS over tiles minus walls, with teleporter
 * links). Only an ordering heuristic for waypoint candidates; routes are always simulated.
 */
export function distanceField(course, hole, cell = 10) {
  const inRect = (r, x, y) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
  const open = (x, y) => (course.tiles ?? []).some(t => inRect(t, x, y)) && !(course.w ?? []).some(w => inRect(w, x, y));
  const key2 = (cx, cy) => `${cx},${cy}`;
  const dist = new Map();
  const queue = [[Math.round(hole[0] / cell), Math.round(hole[1] / cell)]];
  dist.set(key2(...queue[0]), 0);
  const links = new Map();
  for (const t of course.tp ?? []) {
    const a = key2(Math.round(t[0] / cell), Math.round(t[1] / cell));
    const b = key2(Math.round(t[2] / cell), Math.round(t[3] / cell));
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  }
  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head];
    const here = dist.get(key2(cx, cy));
    const next = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1], [cx + 1, cy + 1], [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1],
      ...(links.get(key2(cx, cy)) ?? []).map(id => id.split(',').map(Number))];
    for (const [nx, ny] of next) {
      const id = key2(nx, ny);
      if (dist.has(id) || !open(nx * cell, ny * cell)) continue;
      dist.set(id, here + 1);
      queue.push([nx, ny]);
    }
  }
  return (x, y) => dist.get(key2(Math.round(x / cell), Math.round(y / cell))) ?? Infinity;
}

/** Create a solver bound to one course/putt and a gravity (world). */
export function createParSolver(course, puttIndex, { gravity = TUNING.gravity, full = false, config = PAR_SOLVER_CONFIG, budget } = {}) {
  assertWorldGravity(gravity);
  const counter = { trials: 0, budget: budget ?? (full ? config.fullBudgetTrials : config.budgetTrials) };
  const run = createRunner(course, puttIndex, config, counter);
  const cup = [course.putts?.[puttIndex]?.hole ?? course.hole][0] ?? course.hole;
  const hole = Array.isArray(cup) ? cup : course.hole;
  const wpStep = full ? config.fullWaypointAngleStepDeg : config.waypointAngleStepDeg;
  const maxWaypoints = full ? config.fullMaxWaypoints : config.maxWaypoints;
  const memo = new Map();
  const walk = distanceField(course, hole);

  const bearingToHole = s => Math.atan2(hole[1] - s.y, hole[0] - s.x);
  const perturbations = (angle, power, scale = 1) => config.angleOffsets.flatMap(da =>
    config.powerOffsets.map(dp => [angle + da * scale, Math.min(1, Math.max(0.05, power + dp * scale))]));

  const robustSink = (state, angle, power, scale = 1) => perturbations(angle, power, scale).every(([a, p]) => run(state, a, p).sunk);

  /** Angles ordered by closeness to a preferred bearing, so successes exit early. */
  const orderedAngles = (center, stepDeg) => {
    const count = Math.round(360 / stepDeg);
    return Array.from({ length: count }, (_, i) => wrap(i * stepDeg * DEG)).sort((a, b) => Math.abs(wrap(a - center)) - Math.abs(wrap(b - center)));
  };

  /**
   * First robust one-stroke finish from `state`, or null. `screen` scans a coarse grid
   * (screenAngleStepDeg x screenPowerStep) and refines only around nominal sinks, so waypoint
   * evaluation is ~7x cheaper than the S2 grid; its misses are conservative (never false routes).
   */
  const finishFailures = new Set();
  const planFailures = new Set();
  const robustFinish = (state, screen) => {
    const cellId = `${Math.round(state.x / config.waypointCell)},${Math.round(state.y / config.waypointCell)}`;
    if (screen && finishFailures.has(cellId)) return null;
    const stepDeg = screen ? config.screenAngleStepDeg : config.finishAngleStepDeg;
    const powerStep = screen ? config.screenPowerStep : config.powerStep;
    for (const angle of orderedAngles(bearingToHole(state), stepDeg)) {
      for (const power of powers(config, powerStep)) {
        if (!run(state, angle, power).sunk) continue;
        if (robustSink(state, angle, power)) return { angle, power };
        if (!screen) continue;
        for (const da of [-0.5, 0.5, -0.25, 0.25]) for (const dp of [0, -0.05, 0.05]) {
          const a = angle + da * stepDeg * DEG;
          const p = +(power + dp).toFixed(4);
          if (p >= config.powerStart && p <= 1 && run(state, a, p).sunk && robustSink(state, a, p)) return { angle: a, power: p };
        }
      }
    }
    if (screen) finishFailures.add(cellId);
    return null;
  };

  /** Candidate waypoint strokes: distinct, valid rest cells ordered by walking distance to the cup. */
  const waypoints = state => {
    const cells = new Map();
    const count = Math.round(360 / wpStep);
    for (let i = 0; i < count; i++) {
      const angle = i * wpStep * DEG;
      for (const power of powers(config, config.waypointPowerStep)) {
        const out = run(state, angle, power);
        if (out.sunk || out.invalid) continue;
        if (Math.hypot(out.x - state.x, out.y - state.y) < config.waypointCell) continue;
        const cell = `${Math.round(out.x / config.waypointCell)},${Math.round(out.y / config.waypointCell)}`;
        if (!cells.has(cell)) cells.set(cell, { angle, power, to: { x: out.x, y: out.y, z: out.z } });
      }
    }
    return [...cells.values()].sort((a, b) => walk(a.to.x, a.to.y) - walk(b.to.x, b.to.y) || Math.hypot(a.to.x - hole[0], a.to.y - hole[1]) - Math.hypot(b.to.x - hole[0], b.to.y - hole[1])).slice(0, maxWaypoints);
  };

  const targetOf = stroke => (stroke.to === 'cup' ? { x: hole[0], y: hole[1] } : stroke.to);

  /** Local re-aim shots from `state` around the nominal stroke `seed` (its angle, or the bearing to its target). */
  const localShots = (state, seed) => {
    const target = targetOf(seed);
    const nominalLength = Math.hypot(target.x - seed.from.x, target.y - seed.from.y);
    const ratio = Math.hypot(target.x - state.x, target.y - state.y) / Math.max(1, nominalLength);
    const bases = [seed.power, Math.min(1, seed.power * Math.sqrt(ratio))];
    const seen = new Set();
    const shots = [];
    for (const center of [seed.angle, Math.atan2(target.y - state.y, target.x - state.x)]) {
      for (let d = 0; d <= config.local.angleDeg + 1e-9; d += config.local.angleStepDeg) {
        for (const sign of d === 0 ? [1] : [1, -1]) {
          const angle = center + sign * d * DEG;
          for (const base of bases) {
            for (let dp = -config.local.power; dp <= config.local.power + 1e-9; dp += config.powerStep) {
              const power = +(base + dp).toFixed(4);
              const id = `${angle.toFixed(5)}:${power}`;
              if (power < 0.2 || power > 1 || seen.has(id)) continue;
              seen.add(id);
              shots.push([angle, power]);
            }
          }
        }
      }
    }
    return shots;
  };

  /** True when, from `state`, a local re-plan along `route` finishes robustly at the given offset scale. */
  const followRoute = (state, route, scale) => {
    const [seed, ...rest] = route;
    for (const [angle, power] of localShots(state, seed)) {
      const nominal = run(state, angle, power);
      if (rest.length === 0) { if (nominal.sunk && robustSink(state, angle, power, scale)) return true; continue; }
      if (nominal.sunk || nominal.invalid) continue;
      const next = rest.map((stroke, i) => (i === 0 ? { ...stroke, from: nominal } : stroke));
      if (perturbations(angle, power, scale).every(([a, p]) => {
        const landing = run(state, a, p);
        return !landing.sunk && !landing.invalid && followRoute(landing, next, scale);
      })) return true;
    }
    return false;
  };

  /** Strokes 2..n of a route, re-anchored at the landing of the stroke before them. */
  const tail = (route, landing) => route.slice(1).map((stroke, i) => (i === 0 ? { ...stroke, from: landing } : stroke));

  /** Shortest robust route (<= strokes) from `state`; null when none is found. */
  const plan = (state, strokes, screen = false) => {
    const id = `${strokes}:${key(state.x, state.y)}`;
    if (memo.has(id)) return memo.get(id);
    // Heuristic negative cache: a sub-plan that failed from this 8-unit cell is not retried from a neighbour.
    const cellId = `${strokes}:${Math.round(state.x / config.waypointCell)},${Math.round(state.y / config.waypointCell)}`;
    if (screen && planFailures.has(cellId)) return null;
    let result = null;
    const finish = robustFinish(state, screen);
    if (finish) result = [{ angle: finish.angle, power: finish.power, from: { x: state.x, y: state.y }, to: 'cup' }];
    else if (strokes > 1) {
      for (const wp of waypoints(state)) {
        const rest = plan(wp.to, strokes - 1, true);
        if (!rest) continue;
        const route = [{ angle: wp.angle, power: wp.power, from: { x: state.x, y: state.y }, to: wp.to }, ...rest];
        const continuation = tail(route, wp.to);
        if (perturbations(wp.angle, wp.power).every(([a, p]) => {
          const landing = run(state, a, p);
          return !landing.sunk && !landing.invalid && followRoute(landing, continuation, 1);
        })) { result = route; break; }
      }
    }
    memo.set(id, result);
    if (!result && screen) planFailures.add(cellId);
    return result;
  };

  /** Independent replay: every stroke lands where recorded and the last one sinks, at each margin scale. */
  const verifyRoute = route => {
    let state = { x: route[0].from.x, y: route[0].from.y, z: 0 };
    state = { ...state, z: createRunnerStartZ(course, puttIndex, config, state) };
    for (let i = 0; i < route.length; i++) {
      const out = run(state, route[i].angle, route[i].power);
      if (i === route.length - 1) return out.sunk && robustSink(state, route[i].angle, route[i].power);
      if (out.sunk || out.invalid) return false;
      state = out;
    }
    return false;
  };

  /** Robustness margin: the largest offset scale at which the route is still followed. */
  const marginOf = (route, start) => {
    let margin = 0;
    for (const scale of config.marginScales) {
      const ok = route.length === 1 ? robustSink(start, route[0].angle, route[0].power, scale)
        : perturbations(route[0].angle, route[0].power, scale).every(([a, p]) => {
          const landing = run(start, a, p);
          return !landing.sunk && !landing.invalid && followRoute(landing, tail(route, route[0].to), scale);
        });
      if (!ok) break;
      margin = scale;
    }
    return margin;
  };

  return { plan, verifyRoute, marginOf, counter, hole };
}

function createRunnerStartZ(course, puttIndex, config, state) {
  const engine = new SimulationEngine(course, puttIndex, { hazardTime: config.hazardTime });
  try { return engine.addPlayer('s', 'Solver', 0, { x: state.x, y: state.y }).z; } finally { engine.dispose(); }
}

/**
 * Solve one putt. status: 'route' (robust route found, strokes <= 6), 'none' (search exhausted
 * its candidate grid with no robust route within 6 strokes) or 'budget' (trial budget ran out).
 */
export function solvePar(course, puttIndex, { gravity = TUNING.gravity, full = false, config = PAR_SOLVER_CONFIG, budget } = {}) {
  const solver = createParSolver(course, puttIndex, { gravity, full, config, budget });
  const start = (() => {
    const engine = new SimulationEngine(course, puttIndex, { hazardTime: config.hazardTime });
    try { const p = engine.addPlayer('s', 'Solver', 0); return { x: p.x, y: p.y, z: p.z }; } finally { engine.dispose(); }
  })();
  let status = 'none';
  let route = null;
  try {
    for (let strokes = 1; strokes <= config.maxStrokes && !route; strokes++) route = solver.plan(start, strokes);
    if (route) status = 'route';
  } catch (error) {
    if (!(error instanceof BudgetExhausted)) throw error;
    status = 'budget';
  }
  const result = { gravity, status, trials: solver.counter.trials };
  if (route) {
    solver.counter.budget = Infinity;
    const margin = solver.marginOf(route, start);
    const strokes = route.length;
    result.strokes = strokes;
    result.par = Math.max(config.minPar, strokes);
    result.holeInOne = strokes === 1;
    result.margin = margin;
    result.difficulty = +(strokes + 1 - Math.min(1, margin / config.marginScales.at(-1))).toFixed(3);
    result.route = route.map(s => ({
      deg: round(wrap(s.angle) / DEG < 0 ? wrap(s.angle) / DEG + 360 : wrap(s.angle) / DEG, 2),
      power: round(s.power, 3),
      to: s.to === 'cup' ? 'cup' : [round(s.to.x), round(s.to.y)],
    }));
    result.verified = solver.verifyRoute(route);
  }
  return result;
}
