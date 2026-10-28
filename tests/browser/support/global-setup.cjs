// Starts a local PeerServer for the multiplayer specs, so real PeerJS/WebRTC runs without the public
// PeerJS cloud. Pages are pointed at it through window.__PP_PEER_SERVER (see ./app.cjs).
const { PeerServer } = require('peer');
const { PEER_PORT, PEER_PATH } = require('./app.cjs');

module.exports = async function globalSetup() {
  const server = await new Promise((resolve, reject) => {
    const app = PeerServer({ port: PEER_PORT, path: PEER_PATH, allow_discovery: false }, resolve);
    app.on?.('error', reject);
  });
  return async () => { await new Promise(resolve => server.close(() => resolve())); };
};
