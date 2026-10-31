// Helpers for server room browser specs: one browser context per player and probes beyond ./app.cjs.
const { openApp } = require('./app.cjs');

const roomCode = prefix => prefix + Date.now().toString(36).slice(-5).toUpperCase();

/** Tracks the browser's room sockets so recovery specs can see each reconnect generation. */
function recordLinks() {
  const Native = window.WebSocket;
  const links = window.__ppSockets = new Set();
  window.WebSocket = class extends Native {
    constructor(...args) { super(...args); links.add(this); }
  };
}

/**
 * Opens a player in its own browser context (its own sessionStorage, as a separate friend's browser).
 * `hash` opens the app as an invite link, e.g. `#room=abc`, so a reload keeps the room code.
 */
async function openPlayer(browser, testInfo, name, { contexts, hash = '', endpoint } = {}) {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 800, height: 600 } });
  contexts.push(context);
  if (endpoint) await context.addInitScript(url => { window.__PP_ROOM_ENDPOINT = url; }, endpoint);
  const page = await context.newPage();
  await page.addInitScript(recordLinks);
  const p = await openApp(page, name);
  // A hash-only goto is a same-document navigation, so reload for the app to read the invite code.
  if (hash) { await page.goto('/' + hash); await page.reload(); await p.ui('landing').waitFor(); }
  return Object.assign(p, {
    lobbyStatus: () => p.ui('room-lobby').locator('p').first(),
    peerId: () => page.evaluate(() => window.__ppApp.room?.localId ?? null),
    isHost: () => page.evaluate(() => !!window.__ppApp.room?.isHost),
    roomConnected: () => page.evaluate(() => !!window.__ppApp.room?.connected),
    socketCount: () => page.evaluate(() => window.__ppSockets.size),
  });
}

module.exports = { roomCode, openPlayer };
