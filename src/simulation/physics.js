/**
 * Pure physics and collision routines for Putt Pals.
 * Decoupled from DOM, Three.js, React, audio, and networking.
 *
 * Ground coordinate plane is (X, Y); Z is elevation/height.
 */

import {
  BALL_RADIUS,
  DEFAULT_CUP_RADIUS,
  MIN_CUP_RADIUS,
  TURF_FRICTION,
  FIXED_TIMESTEP,
} from '../shared/constants.js';
import { SimulationEventTypes } from '../shared/simulation.js';
import { calculateTimeoutScore } from '../shared/scoring.js';

export const GRAVITY = 700;
export const WALL_HEIGHT = 28;
export const CUP_DEPTH = 36;

/**
 * Checks if 2D point (x, y) is inside rectangle r: [x, y, w, h].
 *
 * @param {[number, number, number, number]} r
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function inside(r, x, y) {
  return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

/**
 * Computes ramp surface height at point (x, y).
 *
 * @param {[number, number, number, number, string, number, number, string?]} r
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function rampHeight(r, x, y) {
  let t = r[4][1] === 'x' ? (x - r[0]) / r[2] : (y - r[1]) / r[3];
  if (r[4][0] === '-') t = 1 - t;
  t = Math.max(0, Math.min(1, t));
  const e = r[7] === 'launch' ? t * t : t * t * (3 - 2 * t);
  return r[5] + (r[6] - r[5]) * e;
}

/**
 * Computes terrain surface elevation at point (x, y).
 * Returns -999 if out of bounds (off tiles or inside pit).
 *
 * @param {object} course Course definition
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function surfaceHeight(course, x, y) {
  if (course.tiles && !course.tiles.some(r => inside(r, x, y))) return -999;
  if (course.pit) {
    for (const p of course.pit) {
      if (x >= p[0] && x <= p[0] + p[2] && y >= p[1] && y <= p[1] + p[3]) return -999;
    }
  }
  let m = 0;
  if (course.pl) {
    for (const p of course.pl) {
      if (x >= p[0] && x <= p[0] + p[2] && y >= p[1] && y <= p[1] + p[3]) m = Math.max(m, p[4]);
    }
  }
  if (course.rp) {
    for (const r of course.rp) {
      if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) {
        m = Math.max(m, rampHeight(r, x, y));
      }
    }
  }
  return m;
}

/**
 * Returns cup radius for a course/putt, clamped to [MIN_CUP_RADIUS, DEFAULT_CUP_RADIUS].
 *
 * @param {object} course
 * @returns {number}
 */
export function cupOf(course) {
  const c = Number(course.cup);
  return c > 0 ? Math.max(MIN_CUP_RADIUS, Math.min(DEFAULT_CUP_RADIUS, c)) : DEFAULT_CUP_RADIUS;
}

/**
 * Computes contact height for the bottom of the ball at (x, y).
 * Accounts for cup depression.
 *
 * @param {object} course
 * @param {number} x
 * @param {number} y
 * @param {number} [ballRadius=BALL_RADIUS]
 * @returns {number}
 */
export function contactHeight(course, x, y, ballRadius = BALL_RADIUS) {
  const C = cupOf(course);
  const base = surfaceHeight(course, x, y);
  const top = surfaceHeight(course, course.hole[0], course.hole[1]);
  const d = Math.hypot(x - course.hole[0], y - course.hole[1]);
  if (d >= C || Math.abs(base - top) > 1) return base;
  const inset = C - d;
  return inset < ballRadius
    ? top + Math.sqrt(Math.max(0, ballRadius * ballRadius - inset * inset)) - ballRadius
    : top - CUP_DEPTH;
}

/**
 * Computes moving rectangle bounds at a given hazard time.
 *
 * @param {[number, number, number, number, number, number, number, number]} h
 * @param {number} hazardTime Time in seconds
 * @returns {[number, number, number, number]}
 */
export function movingRect(h, hazardTime = 0) {
  const v = Math.sin(hazardTime * h[7]) * h[6];
  return [h[0] + h[4] * v, h[1] + h[5] * v, h[2], h[3]];
}

/**
 * Resolves ball-rectangle bounce collision and reflects velocity.
 *
 * @param {object} player Player simulation state
 * @param {[number, number, number, number]} r Rectangle [x, y, w, h]
 * @param {number} [ballRadius=BALL_RADIUS]
 * @returns {boolean} Whether bounce occurred
 */
export function bounce(player, r, ballRadius = BALL_RADIUS) {
  const cx = Math.max(r[0], Math.min(player.x, r[0] + r[2]));
  const cy = Math.max(r[1], Math.min(player.y, r[1] + r[3]));
  const dx = player.x - cx;
  const dy = player.y - cy;
  const d = Math.hypot(dx, dy);

  if (d >= ballRadius) return false;

  let nx, ny, pen;
  if (d > 0) {
    nx = dx / d;
    ny = dy / d;
    pen = ballRadius - d;
  } else {
    const L = player.x - r[0];
    const Rt = r[0] + r[2] - player.x;
    const T = player.y - r[1];
    const Bt = r[1] + r[3] - player.y;
    const m = Math.min(L, Rt, T, Bt);
    if (m === L) {
      nx = -1;
      ny = 0;
    } else if (m === Rt) {
      nx = 1;
      ny = 0;
    } else if (m === T) {
      nx = 0;
      ny = -1;
    } else {
      nx = 0;
      ny = 1;
    }
    pen = m + ballRadius;
  }

  player.x += nx * pen;
  player.y += ny * pen;
  const vn = player.vx * nx + player.vy * ny;
  if (vn < 0) {
    player.vx -= 1.82 * vn * nx;
    player.vy -= 1.82 * vn * ny;
  }
  return true;
}

/**
 * Handles cup lip collisions, magnet powerup gravity pull, and sink trigger.
 *
 * @param {object} player Player simulation state
 * @param {object} course Course definition
 * @param {number} [dt=FIXED_TIMESTEP]
 * @param {Array<object>} [events=[]] Output domain events collector
 * @returns {boolean} Whether ball sank into cup
 */
export function cupCollision(player, course, dt = FIXED_TIMESTEP, events = []) {
  const C = cupOf(course);
  const lip = (DEFAULT_CUP_RADIUS - C) / (DEFAULT_CUP_RADIUS - MIN_CUP_RADIUS);
  const sc = C / DEFAULT_CUP_RADIUS;
  const top = surfaceHeight(course, course.hole[0], course.hole[1]);
  const dx = player.x - course.hole[0];
  const dy = player.y - course.hole[1];
  const d = Math.hypot(dx, dy);
  const center = player.z + BALL_RADIUS;

  if (player.armedPowerups?.mag && d > C && d < 90 * sc && Math.abs(player.z - top) < 5) {
    const gp = 300 * sc * sc;
    player.vx -= (dx / d) * gp * dt;
    player.vy -= (dy / d) * gp * dt;
  }

  if (center < top && d < C + BALL_RADIUS) {
    const limit = C - BALL_RADIUS;
    if (d > limit) {
      const nx = dx / d;
      const ny = dy / d;
      player.x = course.hole[0] + nx * limit;
      player.y = course.hole[1] + ny * limit;
      const vn = player.vx * nx + player.vy * ny;
      if (vn > 0) {
        const e = 1.15 + 0.6 * lip;
        player.vx -= e * vn * nx;
        player.vy -= e * vn * ny;
        events.push({
          type: SimulationEventTypes.CUP_LIP,
          distance: d,
          reboundVelocity: vn,
        });
      }
    }
    // Score only after the whole ball physically drops below the putting surface.
    if (player.z + 2 * BALL_RADIUS < top - 1.5) {
      sinkBall(player, course, false, events);
      return true;
    }
  }
  return false;
}

/**
 * Marks ball as sunk.
 *
 * @param {object} player
 * @param {object} course
 * @param {boolean} over
 * @param {Array<object>} [events=[]]
 */
export function sinkBall(player, course, over = false, events = []) {
  player.moving = false;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  if (!over) {
    player.x = course.hole[0];
    player.y = course.hole[1];
    player.z = surfaceHeight(course, player.x, player.y) - CUP_DEPTH + BALL_RADIUS;
  }
  const score = over
    ? calculateTimeoutScore(player.strokes, course.par, course.penalty)
    : player.strokes;
  player.scores = [score];
  player.mode = 'sunk';
  player.over = !!over;
  if (player.armedPowerups) player.armedPowerups.mag = 0;

  events.push({
    type: SimulationEventTypes.SINK,
    strokes: player.strokes,
    holeInOne: !over && player.strokes === 1,
    timedOut: !!over,
    score,
    position: [player.x, player.y, player.z],
  });
}

/**
 * Resets ball to previous shot location after out-of-bounds or water hazard.
 *
 * @param {object} player
 * @param {object} course
 * @param {Array<object>} [events=[]]
 */
export function outOfBounds(player, course, events = []) {
  const p = player.prevPosition || [course.tee[0], course.tee[1], 0];
  player.x = p[0];
  player.y = p[1];
  player.z = p[2];
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.moving = false;
  if (player.armedPowerups) player.armedPowerups.mag = 0;
  player.prevPosition = null;

  events.push({
    type: SimulationEventTypes.OUT_OF_BOUNDS,
    strokes: player.strokes,
    position: [player.x, player.y, player.z],
  });
}

/**
 * Stops ball movement on gentle resting slope.
 *
 * @param {object} player
 * @param {Array<object>} [events=[]]
 */
export function stopBall(player, events = []) {
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.moving = false;
  if (player.armedPowerups) player.armedPowerups.mag = 0;

  events.push({
    type: SimulationEventTypes.REST,
    strokes: player.strokes,
    position: [player.x, player.y, player.z],
  });
}

/**
 * Advances a single player ball by one fixed simulation timestep.
 * Returns an array of domain events emitted during the tick.
 *
 * @param {object} player Player simulation state
 * @param {object} course Course definition
 * @param {number} [dt=FIXED_TIMESTEP] Timestep in seconds
 * @param {number} [hazardTime=0] Time for moving obstacles in seconds
 * @returns {Array<object>} Emitted domain events
 */
export function stepBall(player, course, dt = FIXED_TIMESTEP, hazardTime = 0) {
  if (!player.moving || player.mode !== 'play') return [];

  const events = [];
  let f = contactHeight(course, player.x, player.y);
  const air = player.z > f + 0.8 || (player.vz > 5 && player.padCooldown > 0);

  if (air) {
    player.vz -= GRAVITY * dt;
  } else {
    player.z = f;
    let k = TURF_FRICTION;
    if (course.sand) {
      for (const s of course.sand) {
        if (player.x > s[0] && player.x < s[0] + s[2] && player.y > s[1] && player.y < s[1] + s[3]) {
          k = 3.2;
        }
      }
    }
    if (course.pl) {
      for (const p of course.pl) {
        if (player.x > p[0] && player.x < p[0] + p[2] && player.y > p[1] && player.y < p[1] + p[3]) {
          k = TURF_FRICTION + 0.05;
        }
      }
    }
    let cd = 30; // Coulomb constant drag
    if (course.ice) {
      for (const s of course.ice) {
        if (player.x > s[0] && player.x < s[0] + s[2] && player.y > s[1] && player.y < s[1] + s[3]) {
          k = 0.12;
          cd = 4;
        }
      }
    }
    if (course.slime) {
      for (const s of course.slime) {
        if (player.x > s[0] && player.x < s[0] + s[2] && player.y > s[1] && player.y < s[1] + s[3]) {
          k = 5.5;
          cd = 45;
        }
      }
    }

    // Velocity-dependent friction
    const v = Math.hypot(player.vx, player.vy);
    const k_eff = k * (1 + 0.15 * Math.min(1, v / 200));
    const decay = Math.exp(-k_eff * dt);
    player.vx *= decay;
    player.vy *= decay;

    const gx =
      (contactHeight(course, player.x + 0.2, player.y) -
        contactHeight(course, player.x - 0.2, player.y)) /
      0.4;
    const gy =
      (contactHeight(course, player.x, player.y + 0.2) -
        contactHeight(course, player.x, player.y - 0.2)) /
      0.4;

    if (Math.abs(gx) < 20 && Math.abs(gy) < 20) {
      const den = 1 + 0.6 * (gx * gx + gy * gy);
      player.vx -= (gx * GRAVITY * dt) / den;
      player.vy -= (gy * GRAVITY * dt) / den;
      player.vz = gx * player.vx + gy * player.vy;
    }

    const s0 = Math.hypot(player.vx, player.vy);
    if (s0 > 0) {
      const d = Math.min(s0, cd * dt);
      player.vx -= (player.vx / s0) * d;
      player.vy -= (player.vy / s0) * d;
    }
  }

  // Fans
  if (course.fan) {
    for (const fa of course.fan) {
      if (
        player.x > fa[0] &&
        player.x < fa[0] + fa[2] &&
        player.y > fa[1] &&
        player.y < fa[1] + fa[3] &&
        player.z < 80
      ) {
        player.vx += fa[4] * fa[6] * dt;
        player.vy += fa[5] * fa[6] * dt;
        if (air) player.vz += fa[6] * 0.2 * dt;
      }
    }
  }

  // Tornados
  if (course.tornado) {
    for (const v of course.tornado) {
      const dx = player.x - v[0];
      const dy = player.y - v[1];
      const d = Math.hypot(dx, dy);
      if (d < v[2] && d > 1 && player.z < 130) {
        const fall = 1 - d / v[2];
        const a = Math.abs(v[3]) * fall;
        const spin = Math.sign(v[3]);
        player.vx += ((-dx / d) * 0.4 - (dy / d) * spin) * a * dt;
        player.vy += ((-dy / d) * 0.4 + (dx / d) * spin) * a * dt;
        if (d < v[2] * 0.4) {
          if (player.z <= f + 0.8) {
            player.z = f + 1;
            player.vz = Math.max(player.vz, 10);
          }
          player.vz += GRAVITY * 1.6 * dt;
          player.padCooldown = 0.05;
        }
      }
    }
  }

  // Moving obstacles
  if (course.movers) {
    for (const h of course.movers) {
      if (player.z < surfaceHeight(course, h[0], h[1]) + WALL_HEIGHT) {
        const r = movingRect(h, hazardTime);
        if (bounce(player, r)) {
          events.push({
            type: SimulationEventTypes.BOUNCE,
            target: 'mover',
            position: [player.x, player.y, player.z],
          });
        }
      }
    }
  }

  // Step X and check terrain ledge collision
  const nx = player.x + player.vx * dt;
  if (contactHeight(course, nx, player.y) > player.z + 5) {
    player.vx *= -0.8;
  } else {
    player.x = nx;
  }

  // Step Y and check terrain ledge collision
  const ny = player.y + player.vy * dt;
  if (contactHeight(course, player.x, ny) > player.z + 5) {
    player.vy *= -0.8;
  } else {
    player.y = ny;
  }

  // Walls
  if (player.z < WALL_HEIGHT && course.w) {
    for (const r of course.w) {
      if (bounce(player, r)) {
        events.push({
          type: SimulationEventTypes.BOUNCE,
          target: 'wall',
          position: [player.x, player.y, player.z],
        });
      }
    }
  }

  // Step Z
  player.z += player.vz * dt;

  // Cup collision and sink check
  if (cupCollision(player, course, dt, events)) {
    return events;
  }

  if (player.mode !== 'play') return events;

  f = contactHeight(course, player.x, player.y);
  if (player.z <= f) {
    const gx =
      (surfaceHeight(course, player.x + 0.1, player.y) -
        surfaceHeight(course, player.x - 0.1, player.y)) /
      0.2;
    const gy =
      (surfaceHeight(course, player.x, player.y + 0.1) -
        surfaceHeight(course, player.x, player.y - 0.1)) /
      0.2;
    const tangent = Math.abs(gx) < 3 && Math.abs(gy) < 3 ? gx * player.vx + gy * player.vy : 0;
    player.vz =
      air && player.vz - tangent < -180
        ? tangent - (player.vz - tangent) * 0.25
        : tangent;
    player.z = f;
  }

  // Water / pit splash
  if (
    player.z < 14 &&
    course.pit &&
    course.pit.some(
      p => player.x >= p[0] && player.x <= p[0] + p[2] && player.y >= p[1] && player.y <= p[1] + p[3]
    )
  ) {
    outOfBounds(player, course, events);
    return events;
  }

  // Out of bounds / NaN check
  if (player.z < -70 || !Number.isFinite(player.x + player.y + player.z)) {
    outOfBounds(player, course, events);
    return events;
  }

  const gnd = player.z <= f + 0.6;

  // Jump pads
  if (player.padCooldown > 0) {
    player.padCooldown -= dt;
  } else if (gnd && course.pd) {
    for (const p of course.pd) {
      if (Math.hypot(player.x - p[0], player.y - p[1]) < 18) {
        player.vz = 400;
        player.z = f + 1;
        player.padCooldown = 0.6;
        events.push({
          type: SimulationEventTypes.HAZARD,
          hazardType: 'pad',
          position: [player.x, player.y, player.z],
        });
        break;
      }
    }
  }

  // Teleporters
  if (player.teleporterCooldown > 0) {
    player.teleporterCooldown -= dt;
  } else if (gnd && course.tp) {
    tpLoop: for (const t of course.tp) {
      for (let k = 0; k < 2; k++) {
        const a = k ? [t[2], t[3]] : [t[0], t[1]];
        const b = k ? [t[0], t[1]] : [t[2], t[3]];
        if (Math.hypot(player.x - a[0], player.y - a[1]) < 16) {
          player.x = b[0];
          player.y = b[1];
          player.z = surfaceHeight(course, b[0], b[1]);
          player.teleporterCooldown = 0.8;
          events.push({
            type: SimulationEventTypes.HAZARD,
            hazardType: 'teleporter',
            from: a,
            to: b,
            position: [player.x, player.y, player.z],
          });
          break tpLoop;
        }
      }
    }
  }

  // Rest stop check on gentle slope
  const slope =
    Math.abs(surfaceHeight(course, player.x + 0.2, player.y) - surfaceHeight(course, player.x - 0.2, player.y)) +
    Math.abs(surfaceHeight(course, player.x, player.y + 0.2) - surfaceHeight(course, player.x, player.y - 0.2));

  if (
    gnd &&
    slope < 0.015 &&
    Math.hypot(player.x - course.hole[0], player.y - course.hole[1]) > cupOf(course) &&
    Math.hypot(player.vx, player.vy) < 6 &&
    Math.abs(player.vz) < 5
  ) {
    stopBall(player, events);
  }

  return events;
}
