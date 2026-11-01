// Preview rollback entry: preserve the same Durable Object export and its stored state,
// while refusing new HTTP/game/socket admissions. Existing DO sockets may continue.
export { RoomDurableObject } from './recovery-object.mjs';
export default {
  fetch() {
    return new Response('The preview room service is temporarily unavailable. Please try again later.', {
      status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '60' },
    });
  },
};
