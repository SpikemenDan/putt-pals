// Starts an ephemeral real Durable Object Worker for browser cases that need forced socket eviction.
const { build } = require('esbuild');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function startLocalRoomWorker(allowedOrigin, { entryPoint = 'services/rooms/worker.mjs' } = {}) {
  const { Log, LogLevel, Miniflare } = await import('miniflare');
  const { roomObjectName } = await import('../../../services/rooms/room-name.mjs');
  const bundled = await build({ entryPoints: [entryPoint], bundle: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
  const persistence = await mkdtemp(path.join(os.tmpdir(), 'putt-pals-n4e-browser-'));
  const scriptName = 'n4e-browser-recovery';
  const mf = new Miniflare({
    host: '127.0.0.1', port: 0,
    resourcePersistencePath: persistence,
    workers: [{ config: {
      name: scriptName, compatibilityDate: '2026-10-28',
      manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundled.outputFiles[0].text } } },
      env: {
        ROOM_ENVIRONMENT: { type: 'text', value: 'development' },
        ROOM_ALLOWED_ORIGINS: { type: 'text', value: allowedOrigin },
        ROOMS: { type: 'durable-object', worker: scriptName, exportName: 'RoomDurableObject' },
      },
      exports: { RoomDurableObject: { type: 'durable-object', storage: 'sqlite' } },
    } }],
    log: new Log(LogLevel.ERROR),
  });
  const url = await mf.ready;
  return {
    origin: url.origin,
    async drop(roomCode) {
      await mf.unsafeEvictDurableObject(scriptName, 'RoomDurableObject', {
        name: roomObjectName('development', roomCode), webSockets: 'close',
      });
    },
    async close() { await mf.dispose(); await rm(persistence, { recursive: true, force: true }); },
  };
}

module.exports = { startLocalRoomWorker };
