// Browser entry for the modular game (index.html). The legacy single-file game remains at putt-pals.html.
import * as THREE from 'three';
import { Peer } from 'peerjs';
import { createApp } from './app.js';

// Optional signalling server for self-hosted PeerServer deployments and browser tests:
// <script>window.__PP_PEER_SERVER = { host, port, path, secure }</script> before this module.
const app = createApp({ root: document.getElementById('root'), THREE, Peer, peerServer: window.__PP_PEER_SERVER || {} });
// Development/test hook, inert in normal play: lets browser checks inspect the running app.
if (window.__PP_APP_HOOK) window.__ppApp = app;
window.addEventListener('pagehide', () => { app.dispose(); });
