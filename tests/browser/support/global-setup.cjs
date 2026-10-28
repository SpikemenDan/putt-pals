// Starts a local PeerServer for the multiplayer specs, so real PeerJS/WebRTC runs without the public
// PeerJS cloud. Pages are pointed at it through window.__PP_PEER_SERVER (see ./app.cjs).
const { PeerServer } = require('peer');
const { PEER_PORT, PEER_PATH } = require('./app.cjs');

module.exports = async function globalSetup() {
  let peers;
  const server = await new Promise((resolve, reject) => {
    const app = PeerServer({ port: PEER_PORT, path: PEER_PATH, allow_discovery: false }, resolve);
    peers = app;
    app.on?.('error', reject);
  });
  if (process.env.PP_PEER_LOG) {
    const t0 = Date.now(), log = (...a) => console.log(`[peerserver ${Date.now() - t0}ms]`, ...a);
    peers.on('connection', c => log('connection', c.getId()));
    peers.on('disconnect', c => log('disconnect', c.getId()));
    peers.on('message', (c, m) => log('message', c.getId(), m.type, '->', m.dst));
    peers.on('error', e => log('error', e?.message));
  }
  return async () => { await new Promise(resolve => server.close(() => resolve())); };
};
