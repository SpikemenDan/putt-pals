/**
 * Water bodies schema and validation (Task W2, issue #105).
 *
 * Real water bodies in courses:
 * - Deep water (default): acts as a water hazard, resetting the ball to its previous
 *   position with a stroke penalty.
 * - Shallow water (`shallow: true`): playable water that slows the ball down
 *   (increased friction and constant drag from tuning).
 * - Flowing currents (`current: [flowX, flowY]`): directional water flow that pushes
 *   the ball with velocity.
 * - Vertical elevation (`z`): water works at any tier of the K0 3D model.
 */

export function validCourseWaterBody(wb) {
  if (!wb || typeof wb !== 'object') return false;
  if (typeof wb.id !== 'string' || wb.id.trim() === '') return false;
  if (!Array.isArray(wb.bounds) || wb.bounds.length !== 4) return false;
  const [x, y, w, h] = wb.bounds;
  if (![x, y, w, h].every(n => typeof n === 'number' && Number.isFinite(n))) return false;
  if (w <= 0 || h <= 0) return false;
  if (wb.z !== undefined && (typeof wb.z !== 'number' || !Number.isFinite(wb.z))) return false;
  if (wb.shallow !== undefined && typeof wb.shallow !== 'boolean') return false;
  if (wb.current !== undefined) {
    if (!Array.isArray(wb.current) || wb.current.length !== 2) return false;
    if (!wb.current.every(n => typeof n === 'number' && Number.isFinite(n))) return false;
  }
  return true;
}

export function validateCourseWater(water) {
  if (water === undefined) return [];
  if (!Array.isArray(water)) return ['water must be an array'];
  const errors = [];
  const ids = new Set();
  water.forEach((wb, i) => {
    if (!validCourseWaterBody(wb)) {
      errors.push(`water body ${i} is invalid`);
      return;
    }
    if (ids.has(wb.id)) errors.push(`duplicate water body id: ${wb.id}`);
    ids.add(wb.id);
  });
  return errors;
}
