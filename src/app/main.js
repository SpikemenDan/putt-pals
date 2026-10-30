// Browser entry for the modular game (index.html). The legacy single-file game remains at putt-pals.html.
import * as THREE from 'three';
import { createApp } from './app.js';

// Optional loopback service origin for development; normal hosting uses same-origin WSS.
const app = createApp({ root: document.getElementById('root'), THREE,
  serverEndpoint: window.__PP_ROOM_ENDPOINT,
});
// Development/test hook, inert in normal play: lets browser checks inspect the running app.
if (window.__PP_APP_HOOK) window.__ppApp = app;
window.addEventListener('pagehide', () => { app.dispose(); });
