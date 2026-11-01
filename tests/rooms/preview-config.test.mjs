import assert from 'node:assert/strict';
import path from 'node:path';
import { previewConfiguration } from '../../scripts/prepare-cloudflare-preview.mjs';
import maintenance, { RoomDurableObject } from '../../services/rooms/preview-maintenance.mjs';
import { RoomDurableObject as ActualRoom } from '../../services/rooms/recovery-object.mjs';
import { serverRoomUrl } from '../../src/network/server-room.js';

const c = previewConfiguration({ accountId: 'A'.repeat(32), workersSubdomain: 'approved-account' });
assert.equal(c.name, 'putt-pals-rooms-preview');
assert.equal(c.account_id, 'a'.repeat(32));
assert.equal(c.vars.ROOM_ALLOWED_ORIGINS, 'https://putt-pals-rooms-preview.approved-account.workers.dev');
assert.equal(serverRoomUrl('friends', {
  endpoint: c.vars.ROOM_ALLOWED_ORIGINS,
  location: { href: `${c.vars.ROOM_ALLOWED_ORIGINS}/` },
}), 'wss://putt-pals-rooms-preview.approved-account.workers.dev/api/rooms/friends/socket');
assert.throws(() => serverRoomUrl('friends', {
  endpoint: 'https://attacker.example',
  location: { href: `${c.vars.ROOM_ALLOWED_ORIGINS}/` },
}), /invalid-endpoint/, 'room clients cannot be redirected away from the approved same-origin service');
assert.throws(() => serverRoomUrl('friends', {
  endpoint: 'http://putt-pals-rooms-preview.approved-account.workers.dev',
  location: { href: `${c.vars.ROOM_ALLOWED_ORIGINS}/` },
}), /invalid-endpoint/, 'a secure preview page must not downgrade its room socket to plaintext');
assert.equal(c.vars.ROOM_ENVIRONMENT, 'preview');
assert.equal(c.preview_urls, false);
assert.equal(c.workers_dev, true);
assert.equal(c.observability.enabled, false);
assert.ok(path.isAbsolute(c.main));
assert.ok(path.isAbsolute(c.assets.directory));
assert.deepEqual(c.assets.run_worker_first, ['/api', '/api/*']);
assert.deepEqual(c.durable_objects.bindings, [{ name: 'ROOMS', class_name: 'RoomDurableObject' }]);
assert.deepEqual(c.exports, { RoomDurableObject: { type: 'durable-object', storage: 'sqlite' } });
for (const field of ['env', 'routes', 'triggers', 'secrets']) assert.equal(Object.hasOwn(c, field), false);
const rollback = previewConfiguration({ accountId: 'a'.repeat(32), workersSubdomain: 'approved-account', maintenance: true });
assert.deepEqual({ ...rollback, main: c.main }, c, 'maintenance and game configs preserve every binding/export/account/origin');
assert.ok(rollback.main.replaceAll('\\', '/').endsWith('services/rooms/preview-maintenance.mjs'));
assert.equal(RoomDurableObject, ActualRoom, 'maintenance preserves the exact durable class implementation');
const unavailable = maintenance.fetch(new Request('https://example.com/api/rooms/friends/socket'));
assert.equal(unavailable.status, 503);
assert.equal(unavailable.headers.get('cache-control'), 'no-store');
assert.equal(unavailable.headers.get('retry-after'), '60');
const rejectedUpgrade = maintenance.fetch(new Request('https://example.com/api/rooms/friends/socket', {
  headers: { connection: 'Upgrade', upgrade: 'websocket' },
}));
assert.equal(rejectedUpgrade.status, 503, 'maintenance rollback refuses new WebSocket admissions');
assert.equal(rejectedUpgrade.headers.get('upgrade'), null);
for (const accountId of [undefined, '', 'bad', 'a'.repeat(33)]) assert.throws(() => previewConfiguration({ accountId, workersSubdomain: 'approved' }));
for (const workersSubdomain of [undefined, '', 'https://example.com', 'x.workers.dev', '-bad', 'bad-', 'Bad', 'x'.repeat(64)]) assert.throws(() => previewConfiguration({ accountId: 'a'.repeat(32), workersSubdomain }));
console.log('PASS: offline preview config fixes the resource name, exact origin, SQLite binding and environment isolation; rejects malformed account/origin inputs.');
