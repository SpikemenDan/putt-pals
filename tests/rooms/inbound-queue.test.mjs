import assert from 'node:assert/strict';
import { RoomDurableObject } from '../../services/rooms/room-object.mjs';
import { SERVER_ROOM_LIMITS } from '../../src/network/contracts/server-room.js';

function connection() {
  const sent = [];
  const closes = [];
  return { closed: false, sent, closes, socket: {
    readyState: 1, bufferedAmount: 0,
    send: raw => sent.push(JSON.parse(raw)),
    close: (...args) => closes.push(args),
  } };
}

async function blockedRoom() {
  const room = new RoomDurableObject({}, {});
  let release;
  room.enqueue(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  return { room, release };
}

{
  const { room, release } = await blockedRoom();
  const sender = connection();
  const other = connection();
  let received = 0;
  room.receive = async () => { received++; };
  for (let i = 0; i < 1000; i++) room.enqueueMessage(sender, '{}');
  assert.equal(room.queuedFrames, 64, 'flood cannot retain unlimited queued operations');
  assert.equal(sender.sent[0].code, 'rate-limited');
  assert.equal(sender.closes.length, 1, 'overflow closes once despite continued input');
  assert.equal(received, 0);
  release();
  await room.serial;
  assert.equal(received, 0, 'queued frames from a rejected connection are discarded');
  assert.equal(room.queuedFrames, 0);
  assert.equal(room.queuedBytes, 0);
  await room.enqueueMessage(other, '{}');
  assert.equal(received, 1, 'another connection can proceed after the queue drains');
}
{
  const { room, release } = await blockedRoom();
  const sender = connection();
  const raw = 'x'.repeat(SERVER_ROOM_LIMITS.messageBytes);
  for (let i = 0; i < 64; i++) room.enqueueMessage(sender, raw);
  assert.ok(room.queuedBytes <= SERVER_ROOM_LIMITS.outgoingQueueBytes);
  assert.ok(room.queuedFrames < 64, 'byte cap applies before frame cap');
  assert.equal(sender.sent[0].code, 'rate-limited');
  release();
  await room.serial;
  assert.equal(room.queuedBytes, 0);
}
for (const raw of [new ArrayBuffer(1), 'x'.repeat(SERVER_ROOM_LIMITS.messageBytes + 1), 'é'.repeat(SERVER_ROOM_LIMITS.messageBytes)]) {
  const room = new RoomDurableObject({}, {});
  const sender = connection();
  room.enqueueMessage(sender, raw);
  assert.equal(sender.sent[0].code, 'invalid-message');
  assert.equal(room.queuedFrames, 0, 'invalid frames never enter the queue');
}
{
  const room = new RoomDurableObject({}, {});
  const sender = connection();
  room.receive = async () => { throw new Error('injected failure'); };
  let failures = 0;
  room.operationFailed = () => { failures++; };
  await room.enqueueMessage(sender, '{}');
  assert.equal(failures, 1);
  assert.equal(room.queuedFrames, 0, 'failed processing releases queue capacity');
  assert.equal(room.queuedBytes, 0);
}
console.log('PASS: inbound frame/byte bounds, flood rejection, invalid input, queue recovery and failure cleanup (deterministic tests).');
