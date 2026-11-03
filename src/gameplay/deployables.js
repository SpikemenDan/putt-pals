/** Deterministic bumper collisions. Coordinates are simulation x/y horizontal, z vertical. */
import { TUNING } from '../shared/tuning.js';

export const DEPLOYABLE_KINDS = Object.freeze(['bumper', 'orbital']);
export const MAX_DEPLOYABLES = 12;
export const MAX_DEPLOYABLES_PER_PLAYER = 2;
const D = TUNING.deployables;

/** Mutates only this client's ball; reports impacts as domain events for room authority. */
export function stepDeployables(player, objects, dt, now, events, ballRadius = TUNING.ball.radius) {
  const settings = player.deployableSettings ?? D;
  if (!objects?.length || player.mode !== 'play') return;
  player.deployableContacts ??= {};
  const near = new Set();
  for (const o of objects) {
    const dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy);
    if (Math.abs(player.z - o.z) > settings.height) continue;
    const radius = settings.bumperRadius + ballRadius;
    if (o.kind === 'orbital' && d > radius && d < settings.orbitalRange) {
      const pull = settings.orbitalPull * (1 - d / settings.orbitalRange) * dt;
      player.vx -= dx / d * pull; player.vy -= dy / d * pull;
    }
    if (player.armedPowerups?.ghost) continue;
    if (d > radius + settings.contactRelease) continue;
    near.add(o.id);
    if (d > radius) continue;
    // Coincident centres use the opposite travel direction, with a fixed fallback.
    const speed = Math.hypot(player.vx, player.vy);
    const nx = d > 1e-9 ? dx / d : speed > 1e-9 ? -player.vx / speed : 1;
    const ny = d > 1e-9 ? dy / d : speed > 1e-9 ? -player.vy / speed : 0;
    player.x = o.x + nx * radius; player.y = o.y + ny * radius;
    const inward = player.vx * nx + player.vy * ny;
    if (inward < 0) {
      if (player.armedPowerups?.sticky) { player.vx = 0; player.vy = 0; }
      else {
        player.vx -= (1 + settings.bumperRestitution) * inward * nx;
        player.vy -= (1 + settings.bumperRestitution) * inward * ny;
      }
      if (!player.deployableContacts[o.id]) events.push({ type: 'deployable_hit', id: o.id, position: [player.x, player.y, player.z] });
    }
    player.deployableContacts[o.id] = now;
  }
  for (const id of Object.keys(player.deployableContacts)) if (!near.has(id)) delete player.deployableContacts[id];
}

export const deployablesAwake = (p, objects, radius = TUNING.ball.radius) => objects?.some(o => {
  const settings = p.deployableSettings ?? D, d = Math.hypot(p.x-o.x,p.y-o.y);
  return o.kind === 'orbital' && Math.abs(p.z-o.z) <= settings.height
    && d > settings.bumperRadius + radius && d < settings.orbitalRange && settings.orbitalPull > 0;
}) ?? false;
