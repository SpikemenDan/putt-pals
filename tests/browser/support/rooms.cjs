// Helpers for the N2 room specs (capacity, guest recovery, host loss): one browser context per player,
// real PeerJS/WebRTC through the local PeerServer, and probes beyond ./app.cjs.
const { test } = require('@playwright/test');
const { openApp } = require('./app.cjs');

const roomCode = prefix => prefix + Date.now().toString(36).slice(-5).toUpperCase();

/** Skips the test where guests cannot reach a host, as tests/browser/multiplayer.spec.cjs does. */
async function requireGuestLinks(browser, testInfo) {
  const context = await browser.newContext();
  const webrtc = await (await context.newPage()).evaluate(() => typeof RTCPeerConnection === 'function');
  await context.close();
  // Playwright's Windows WebKit build ships without WebRTC.
  test.skip(!webrtc, `${testInfo.project.name} on ${process.platform} has no RTCPeerConnection`);
  // Linux WebKit: guests never connect over loopback without STUN/TURN. Needs N3's relay.
  test.skip(testInfo.project.name === 'webkit', 'WebKit guests cannot connect without a STUN/TURN relay (N3, #14)');
}

/**
 * Keeps every RTCPeerConnection the page makes, so a spec can drop them all (simulated network loss),
 * and every network notice the page shows, so short-lived ones can be asserted after the fact.
 */
function recordLinks() {
  window.__ppNotices = [];
  new MutationObserver(() => {
    const el = document.querySelector('[role=alert]');
    const text = el && !el.hidden ? el.textContent : '';
    if (text && text !== window.__ppNotices.at(-1)) window.__ppNotices.push(text);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  const Native = window.RTCPeerConnection;
  if (typeof Native !== 'function') return;
  const links = window.__ppLinks = new Set();
  window.RTCPeerConnection = class extends Native { constructor(...args) { super(...args); links.add(this); } };
}

/**
 * Opens a player in its own browser context (its own sessionStorage, as a separate friend's browser).
 * `hash` opens the app as an invite link, e.g. `#room=abc`, so a reload keeps the room code.
 */
async function openPlayer(browser, testInfo, name, { contexts, hash = '' }) {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 800, height: 600 } });
  contexts.push(context);
  const page = await context.newPage();
  await page.addInitScript(recordLinks);
  const p = await openApp(page, name);
  // A hash-only goto is a same-document navigation, so reload for the app to read the invite code.
  if (hash) { await page.goto('/' + hash); await page.reload(); await p.ui('landing').waitFor(); }
  return Object.assign(p, {
    lobbyStatus: () => p.ui('room-lobby').locator('p').first(),
    notice: () => page.getByRole('alert'),
    notices: () => page.evaluate(() => window.__ppNotices),
    peerId: () => page.evaluate(() => window.__ppApp.room?.localId ?? null),
    isHost: () => page.evaluate(() => !!window.__ppApp.room?.isHost),
    /** Closes every peer connection this page has, as a network drop would; returns how many were open. */
    dropLinks: () => page.evaluate(() => { const open = [...window.__ppLinks].filter(pc => pc.connectionState !== 'closed'); for (const pc of open) pc.close(); return open.length; }),
  });
}

module.exports = { roomCode, requireGuestLinks, openPlayer };
