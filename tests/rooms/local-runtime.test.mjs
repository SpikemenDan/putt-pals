import assert from 'node:assert/strict';
import './inbound-queue.test.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { roomObjectName } from '../../services/rooms/room-name.mjs';
import { SERVER_ROOM_VERSION, validRoomSnapshot } from '../../src/network/contracts/server-room.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
const assetsDir = path.join(root, 'dist', 'assets');
const persistDir = await mkdtemp(path.join(os.tmpdir(), 'putt-pals-n4b-'));
const logs = [];
let child;
const testRoomCode = 'room123';

function observe(socket) {
  const client = { socket, frames: [], waiters: [], snapshot: null, playerId: null, connectionId: null, sequence: 0 };
  socket.addEventListener('message', event => {
    const frame = JSON.parse(event.data);
    if (frame.type === 'welcome' || frame.type === 'snapshot') client.snapshot = frame.type === 'welcome' ? frame.snapshot : frame.snapshot;
    if (frame.type === 'welcome') {
      client.playerId = frame.playerId;
      client.connectionId = frame.connectionId;
      client.resumeToken = frame.resumeToken;
    }
    const index = client.waiters.findIndex(waiter => waiter.predicate(frame));
    if (index >= 0) {
      const [waiter] = client.waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    } else client.frames.push(frame);
  });
  socket.addEventListener('close', () => {
    for (const waiter of client.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('WebSocket closed before expected room frame.'));
    }
  });
  return client;
}

function nextFrame(client, predicate, timeoutMs = 10_000) {
  const index = client.frames.findIndex(predicate);
  if (index >= 0) return Promise.resolve(client.frames.splice(index, 1)[0]);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      client.waiters = client.waiters.filter(item => item !== waiter);
      reject(new Error('Timed out waiting for a room frame.'));
    }, timeoutMs);
    client.waiters.push(waiter);
  });
}

async function openRoom(baseUrl, name, resume = null, roomCode = testRoomCode) {
  const socket = new WebSocket(`${baseUrl}/api/rooms/${roomCode}/socket`);
  const client = observe(socket);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const response = nextFrame(client, frame => frame.type === 'welcome' || frame.type === 'error');
  socket.send(JSON.stringify({ version: SERVER_ROOM_VERSION, type: 'hello', roomCode, name, resume }));
  const frame = await response;
  assert.equal(frame.type, 'welcome', `room admission failed: ${frame.code}`);
  assert.ok(validRoomSnapshot(frame.snapshot), 'welcome includes a valid public room snapshot');
  return client;
}

function makeCommand(client, payload, overrides = {}) {
  const snapshot = client.snapshot;
  const sequence = overrides.sequence ?? ++client.sequence;
  client.sequence = Math.max(client.sequence, sequence);
  return {
    version: SERVER_ROOM_VERSION, type: 'command', sessionId: snapshot.sessionId,
    connectionId: client.connectionId, sequence,
    roundNumber: snapshot.session.context.roundNumber,
    puttIndex: snapshot.session.context.puttIndex, payload, ...overrides,
  };
}

async function sendCommandFrame(client, frame) {
  const sequence = frame.sequence;
  const response = nextFrame(client, frame =>
    (frame.type === 'ack' && frame.sequence === sequence) || frame.type === 'error');
  client.socket.send(JSON.stringify(frame));
  return response;
}

function command(client, payload, overrides) {
  return sendCommandFrame(client, makeCommand(client, payload, overrides));
}

async function expectHandshakeError(baseUrl, roomCode, raw, code) {
  const socket = new WebSocket(`${baseUrl}/api/rooms/${roomCode}/socket`);
  const client = observe(socket);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const response = nextFrame(client, frame => frame.type === 'error');
  socket.send(raw);
  assert.equal((await response).code, code);
}

function upgradeStatus(baseUrl, roomCode, origin) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/api/rooms/${roomCode}/socket`, {
      headers: { connection: 'Upgrade', upgrade: 'websocket', origin },
    });
    request.once('response', response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.once('upgrade', (response, socket) => {
      socket.destroy();
      resolve(response.statusCode);
    });
    request.once('error', reject);
    request.end();
  });
}

async function waitForSnapshot(client, predicate, timeoutMs = 10_000) {
  if (client.snapshot && predicate(client.snapshot)) return client.snapshot;
  try {
    const frame = await nextFrame(client, message => message.type === 'snapshot' && predicate(message.snapshot), timeoutMs);
    return frame.snapshot;
  } catch (error) {
    throw new Error(`${error.message} Latest snapshot: ${JSON.stringify(client.snapshot)}`, { cause: error });
  }
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Wrangler exited early (${child.exitCode}).`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for the local Wrangler server.');
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function main() {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(wrangler, [
    'dev',
    '--local',
    '--ip', '127.0.0.1',
    '--port', String(port),
    '--persist-to', persistDir,
    '--var', 'ROOM_LOCAL_DIAGNOSTICS:true',
    '--show-interactive-dev-session', 'false',
  ], {
    cwd: root,
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => logs.push(data.toString()));
  child.stderr.on('data', data => logs.push(data.toString()));

  await waitForServer(`${baseUrl}/`);

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);

  const assets = await readdir(assetsDir);
  const script = assets.find(file => file.endsWith('.js'));
  assert.ok(script, 'Vite build should emit a JavaScript asset');
  const assetResponse = await fetch(`${baseUrl}/assets/${script}`);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get('content-type'), /javascript/);

  const unknownApi = await fetch(`${baseUrl}/api/not-a-room-route`);
  assert.equal(unknownApi.status, 404);
  assert.equal((await fetch(`${baseUrl}/api`)).status, 404);
  const invalidCode = await fetch(`${baseUrl}/api/rooms/bad-room/socket`);
  assert.equal(invalidCode.status, 400);
  const nonUpgrade = await fetch(`${baseUrl}/api/rooms/room123/socket`);
  assert.equal(nonUpgrade.status, 426);
  assert.equal((await fetch(`${baseUrl}/api/_local/rooms/invalid-room/identity`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/_local/rooms/room123/identity`, { method: 'POST' })).status, 404);

  const identityUrl = `${baseUrl}/api/_local/rooms/room123/identity`;
  const roomOne = await fetch(identityUrl).then(response => response.json());
  const sameRoom = await fetch(identityUrl).then(response => response.json());
  const otherRoom = await fetch(`${baseUrl}/api/_local/rooms/room124/identity`).then(response => response.json());
  assert.equal(roomOne.id, sameRoom.id, 'same environment and room code must map to the same Durable Object');
  assert.notEqual(roomOne.id, otherRoom.id, 'different room codes must use isolated Durable Objects');

  assert.equal(roomObjectName('development', 'room123'), 'putt-pals:development:v2:room123');
  assert.notEqual(roomObjectName('development', 'room123'), roomObjectName('preview', 'room123'));
  assert.notEqual(roomObjectName('preview', 'room123'), roomObjectName('production', 'room123'));
  assert.throws(() => roomObjectName('staging', 'room123'), /Unknown room environment/);
  assert.throws(() => roomObjectName('development', 'bad-room'), /Invalid room code/);

  await expectHandshakeError(baseUrl, 'room124', JSON.stringify({
    version: 1, type: 'hello', roomCode: 'room124', name: 'Old client', resume: null,
  }), 'incompatible-version');
  await expectHandshakeError(baseUrl, 'room125', '{', 'invalid-message');
  await expectHandshakeError(baseUrl, 'room126', 'x'.repeat(65_537), 'invalid-message');
  await expectHandshakeError(baseUrl, 'room127', JSON.stringify({
    version: SERVER_ROOM_VERSION, type: 'hello', roomCode: 'room127', name: '', resume: null,
  }), 'invalid-message');
  assert.equal(await upgradeStatus(baseUrl, 'room128', 'https://evil.example'), 403);
  const boundaryClient = await openRoom(baseUrl, 'Boundary', null, 'room129');
  assert.equal((await sendCommandFrame(boundaryClient, makeCommand(boundaryClient, {
    type: 'START_VOTING', playerId: 'spoofed',
  }))).code, 'invalid-message');

  const clients = [];
  let phase = 'room admission';
  try {
    const isolatedRoom = await openRoom(baseUrl, 'Isolated', null, 'room130');
    const host = await openRoom(baseUrl, 'Host');
    assert.notEqual(isolatedRoom.snapshot.sessionId, host.snapshot.sessionId);
    isolatedRoom.socket.close();
    clients.push(host);
    for (const name of ['Guest 1', 'Guest 2', 'Guest 3']) clients.push(await openRoom(baseUrl, name));
    assert.equal(host.snapshot.seats.length, 4);
    assert.ok(validRoomSnapshot(host.snapshot), 'joined room snapshots remain valid');
    assert.deepEqual(host.frames.filter(frame => frame.type === 'error'), [], 'host has no prior protocol errors');

    const fifthSocket = new WebSocket(`${baseUrl}/api/rooms/${testRoomCode}/socket`);
    const fifth = observe(fifthSocket);
    await new Promise((resolve, reject) => {
      fifthSocket.addEventListener('open', resolve, { once: true });
      fifthSocket.addEventListener('error', reject, { once: true });
    });
    const fullResponse = nextFrame(fifth, frame => frame.type === 'error');
    fifthSocket.send(JSON.stringify({
      version: SERVER_ROOM_VERSION, type: 'hello', roomCode: testRoomCode, name: 'Fifth', resume: null,
    }));
    assert.equal((await fullResponse).code, 'room-full');

    phase = 'guest controller guard';
    assert.equal((await command(clients[1], { type: 'START_VOTING' })).code, 'unauthorized');
    phase = 'controller starts voting';
    const startResponse = await command(host, { type: 'START_VOTING' });
    assert.equal(startResponse.type, 'ack', JSON.stringify(startResponse));
    const controller = clients[1];
    assert.equal((await command(controller, { type: 'CAST_VOTE', mapIndex: 0 })).type, 'ack');
    const votingSnapshot = await waitForSnapshot(controller, snapshot => snapshot.session.node === 'select.timing');
    const votingDeadline = votingSnapshot.session.context.votingDeadline;

    phase = 'controller succession';
    host.socket.close();
    await waitForSnapshot(controller, snapshot =>
      snapshot.controllerId === controller.playerId && snapshot.session.node === 'select.timing'
      && snapshot.session.context.votingDeadline === votingDeadline);
    const resumedHost = await openRoom(baseUrl, 'Host', {
      sessionId: host.snapshot.sessionId, playerId: host.playerId, token: host.resumeToken,
    });
    clients[0] = resumedHost;
    assert.notEqual(resumedHost.connectionId, host.connectionId);
    assert.equal(resumedHost.snapshot.controllerId, controller.playerId, 'a resumed controller does not reclaim authority');
    assert.equal(resumedHost.snapshot.session.node, 'select.timing', 'controller departure does not reset the session');
    assert.equal(resumedHost.snapshot.session.context.votingDeadline, votingDeadline, 'controller departure preserves the voting deadline');
    assert.equal((await command(resumedHost, { type: 'START_VOTING' }, { connectionId: host.connectionId })).code, 'stale-connection');
    await expectHandshakeError(baseUrl, testRoomCode, JSON.stringify({
      version: SERVER_ROOM_VERSION, type: 'hello', roomCode: testRoomCode, name: 'Host',
      resume: { sessionId: host.snapshot.sessionId, playerId: host.playerId, token: host.resumeToken },
    }), 'identity-rejected');

    phase = 'map vote';
    const staleVote = makeCommand(controller, { type: 'CAST_VOTE', mapIndex: 0 }, {
      roundNumber: controller.snapshot.session.context.roundNumber + 1,
    });
    assert.equal((await sendCommandFrame(controller, staleVote)).code, 'stale-round');
    for (const client of clients) {
      const vote = makeCommand(client, { type: 'CAST_VOTE', mapIndex: 0 });
      assert.equal((await sendCommandFrame(client, vote)).type, 'ack');
      if (client === controller) assert.equal((await sendCommandFrame(client, vote)).code, 'sequence-rejected');
    }
    await waitForSnapshot(controller, snapshot => snapshot.session.node === 'play.starting');

    const activeSnapshot = await waitForSnapshot(clients[0], snapshot => snapshot.session.node.startsWith('play.'));
    const presenceFrame = nextFrame(controller, frame => frame.type === 'presence'
      && Object.hasOwn(frame.players, clients[0].playerId));
    clients[0].socket.send(JSON.stringify({
      version: SERVER_ROOM_VERSION, type: 'presence', sessionId: activeSnapshot.sessionId,
      connectionId: clients[0].connectionId, sequence: 1,
      roundNumber: activeSnapshot.session.context.roundNumber,
      puttIndex: activeSnapshot.session.context.puttIndex,
      payload: { x: 10, y: 12, z: 5, mode: 'play', strokes: 0 },
    }));
    const presence = await presenceFrame;
    assert.equal(presence.players[clients[0].playerId].x, 10);
    const roundStartTime = activeSnapshot.session.context.roundStartTime;
    clients[0].socket.close();
    await waitForSnapshot(controller, snapshot => snapshot.seats.some(seat =>
      seat.playerId === clients[0].playerId && seat.connectedSince === null));
    assert.equal(controller.snapshot.session.context.roundStartTime, roundStartTime, 'creator disconnect preserves the active round deadline');
    const resumedDuringPlay = await openRoom(baseUrl, 'Host', {
      sessionId: clients[0].snapshot.sessionId, playerId: clients[0].playerId, token: clients[0].resumeToken,
    });
    clients[0] = resumedDuringPlay;
    assert.equal(resumedDuringPlay.snapshot.session.context.roundStartTime, roundStartTime);

    for (let puttIndex = 0; puttIndex < 6; puttIndex++) {
      phase = `putt ${puttIndex + 1} scoring`;
      const playing = await waitForSnapshot(controller, snapshot =>
        snapshot.session.node.startsWith('play.') && snapshot.session.context.puttIndex === puttIndex);
      await delay(Math.max(0, playing.session.context.roundStartTime - Date.now()));
      for (const client of clients) {
        assert.equal((await command(client, { type: 'REPORT_SCORE', strokes: 1, timedOut: false })).type, 'ack');
      }
      if (puttIndex < 5) {
        await waitForSnapshot(controller, snapshot => snapshot.session.context.puttIndex === puttIndex + 1);
      }
    }
    const results = await waitForSnapshot(controller, snapshot => snapshot.session.node === 'results');
    assert.equal(results.session.context.players[host.playerId].scores.length, 6);
    assert.equal(results.session.context.players[clients[1].playerId].scores.length, 6);
    console.log('Local Wrangler runtime passed: routing/isolation, v2 admission, four-member capacity, controller succession and resumed identity, and a four-player six-putt game.');
  } catch (error) {
    throw new Error(`${phase}: ${error.message}`, { cause: error });
  } finally {
    for (const client of clients) client.socket.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  if (logs.length) console.error(logs.join(''));
  process.exitCode = 1;
} finally {
  await stopServer();
  await rm(persistDir, { recursive: true, force: true });
}
