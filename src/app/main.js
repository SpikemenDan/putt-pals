// Browser entry for the modular game (index.html).
import * as THREE from 'three';
import { createApp } from './app.js';
import { createDisplayTuner } from '../devtools/display-tuner.js';

// Optional loopback service origin for development; normal hosting uses same-origin WSS.
// Development builds (vite dev only; the flag is false in production builds) get a live, tunable DISPLAY and a panel.
const tuner = import.meta.env.DEV ? createDisplayTuner({ storage: (() => { try { return window.sessionStorage; } catch { return null; } })() }) : null;
const app = createApp({ root: document.getElementById('root'), THREE,
  serverEndpoint: window.__PP_ROOM_ENDPOINT,
  ...(tuner ? { display: tuner.display } : {}),
});
if (tuner) {
  window.__ppTuner = tuner;
  Promise.all([import('../devtools/panel.js'), import('../devtools/sources.js'), import('../devtools/deployables-preview.js')]).then(([{ mountTuningPanel }, { sources, tuning }, { mountDeployablesPreview }]) => { mountTuningPanel(document, tuner, { sources, tuning }); mountDeployablesPreview(document, app); });
}
// Development/test hook, inert in normal play: lets browser checks inspect the running app.
if (window.__PP_APP_HOOK) window.__ppApp = app;
window.addEventListener('pagehide', () => { app.dispose(); });
