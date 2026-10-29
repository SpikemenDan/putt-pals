// Explicit domain form used by the server adapter; no XState internals are persisted.
export const SESSION_CONTEXT_FIELDS = Object.freeze([
  'mode', 'mapIndex', 'puttIndex', 'roundNumber', 'roundLimitSeconds', 'roundStartTime',
  'votingDeadline', 'votes', 'roster', 'players', 'completedMaps', 'totals', 'last',
]);
const nodes = Object.freeze({
  lobby: 'lobby',
  'select.waiting': { select: 'waiting' },
  'select.timing': { select: 'timing' },
  'select.choosingPutt': { select: 'choosingPutt' },
  'play.starting': { play: 'starting' },
  'play.active.settling': { play: { active: 'settling' } },
  'play.active.running': { play: { active: 'running' } },
  'play.active.replaying': { play: { active: 'replaying' } },
  results: 'results',
});
export function sessionNode(value) {
  return Object.keys(nodes).find(node => JSON.stringify(nodes[node]) === JSON.stringify(value)) ?? null;
}
export function sessionValue(node) {
  if (!Object.hasOwn(nodes, node)) throw new Error('Unknown session recovery node');
  return structuredClone(nodes[node]);
}
export function sessionDomain(snapshot) {
  return {
    node: sessionNode(snapshot.state),
    context: Object.fromEntries(SESSION_CONTEXT_FIELDS.map(key => [key, structuredClone(snapshot[key])])),
  };
}
