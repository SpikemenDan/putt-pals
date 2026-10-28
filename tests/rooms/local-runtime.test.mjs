import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { roomObjectName } from '../../services/rooms/room-name.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
const assetsDir = path.join(root, 'dist', 'assets');
const persistDir = await mkdtemp(path.join(os.tmpdir(), 'putt-pals-n4b-'));
const logs = [];
let child;

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

  const socket = new WebSocket(`${baseUrl}/api/rooms/room123/socket`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.close();

  console.log('Local Wrangler runtime passed: assets/API routing, invalid routes, SQLite Durable Object WebSocket upgrade, stable room identity and room/environment isolation.');
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
