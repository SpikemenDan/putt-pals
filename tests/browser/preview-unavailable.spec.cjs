const { test, expect } = require('@playwright/test');
const { openApp } = require('./support/app.cjs');
const { startLocalRoomWorker } = require('./support/local-worker.cjs');

test('preview maintenance: backend failure is actionable and solo remains available without a signaling fallback', async ({ browser }, info) => {
  const worker = await startLocalRoomWorker(info.project.use.baseURL, { entryPoint: 'services/rooms/preview-maintenance.mjs' });
  const context = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    await context.addInitScript(origin => {
      window.__PP_ROOM_ENDPOINT = origin;
      window.__peerConnectionAttempts = 0;
      for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
        const PeerConnection = window[name];
        if (typeof PeerConnection === 'function') {
          window[name] = new Proxy(PeerConnection, {
            construct(target, args, newTarget) {
              window.__peerConnectionAttempts++;
              return Reflect.construct(target, args, newTarget);
            },
          });
        }
      }
    }, worker.origin);
    const page = await context.newPage(), sockets = [], runtimeErrors = [];
    page.on('websocket', ws => sockets.push(ws.url()));
    page.on('pageerror', error => runtimeErrors.push(error.message));
    const player = await openApp(page, 'Ana');
    await player.ui('landing').getByLabel('Your name').fill('Ana');
    await player.ui('landing').getByLabel(/room code/i).fill('maintenance');
    await player.button('Join room').click();
    await expect(player.ui('connect-error')).toContainText(/room service.*unavailable|Could not reach the room service/);
    await expect(player.button('Join room')).toBeEnabled();
    expect(await page.evaluate(() => window.__ppApp.room)).toBeNull();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]).toBe(worker.origin.replace('http:', 'ws:') + '/api/rooms/maintenance/socket');
    await player.button('Play solo').click();
    await expect(player.ui('room-lobby')).toBeVisible();
    expect(sockets).toHaveLength(1);
    expect(await page.evaluate(() => window.__peerConnectionAttempts)).toBe(0);
    expect(runtimeErrors).toEqual([]);
  } finally { await context.close(); await worker.close(); }
});
