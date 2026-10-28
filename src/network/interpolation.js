/**
 * Remote-ball smoothing (N2). Presence arrives every ~70 ms (SNAPSHOT_INTERVAL_MS), so drawing the
 * latest position makes other players' balls step. Instead each remote is drawn slightly in the past,
 * interpolated between the two samples around that time. The local ball never goes through this.
 *
 * Pure and clock-free: callers pass their own timestamps (local receipt time and render time).
 */

/** How far behind real time remotes are drawn; covers one snapshot interval plus jitter. */
export const INTERPOLATION_DELAY_MS = 100;
/** A jump larger than this between two samples is a teleport (portal, respawn, new putt): snap, don't glide. */
export const TELEPORT_DISTANCE = 300;
const MAX_SAMPLES = 8;

export function createRemoteInterpolator({ delayMs = INTERPOLATION_DELAY_MS, teleport = TELEPORT_DISTANCE } = {}) {
  const tracks = new Map(); // id -> [{t, x, y, z}] in increasing t
  return {
    /** Records a received position for `id` at local time `t`. */
    push(id, t, { x, y, z }) {
      if (![t, x, y, z].every(Number.isFinite)) return;
      let track = tracks.get(id);
      if (!track) tracks.set(id, track = []);
      const last = track.at(-1);
      if (last && t <= last.t) return;
      if (last && Math.hypot(x - last.x, y - last.y, z - last.z) > teleport) track.length = 0;
      track.push({ t, x, y, z });
      if (track.length > MAX_SAMPLES) track.splice(0, track.length - MAX_SAMPLES);
    },
    /** Position of `id` to draw at local time `now`, or null if unknown. Holds the newest sample rather than extrapolating. */
    sample(id, now) {
      const track = tracks.get(id);
      if (!track?.length) return null;
      const at = now - delayMs;
      if (at <= track[0].t) return { x: track[0].x, y: track[0].y, z: track[0].z };
      for (let i = 1; i < track.length; i++) {
        const a = track[i - 1], b = track[i];
        if (at <= b.t) {
          const k = (at - a.t) / (b.t - a.t);
          return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
        }
      }
      const last = track.at(-1);
      return { x: last.x, y: last.y, z: last.z };
    },
    /** Drops every remote not in `ids` (left, spectating, new round). */
    retain(ids) { const keep = new Set(ids); for (const id of [...tracks.keys()]) if (!keep.has(id)) tracks.delete(id); },
    clear() { tracks.clear(); },
    get size() { return tracks.size; },
  };
}
