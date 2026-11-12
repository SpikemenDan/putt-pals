// Browser entry for the modular game (index.html).
import * as THREE from 'three';
import { createApp } from './app.js';
import { createDisplayTuner } from '../devtools/display-tuner.js';
import { createWorldPreview } from '../devtools/world-preview.js';

// Optional loopback service origin for development; normal hosting uses same-origin WSS.
// Development builds (vite dev only; the flag is false in production builds) get a live, tunable DISPLAY and a panel.
const devStorage = () => { try { return window.sessionStorage; } catch { return null; } };
const tuner = import.meta.env.DEV ? createDisplayTuner({ storage: devStorage() }) : null;
// ?world: VIS-W gravity playtest box; without it no preview exists, so stored preview state can never apply unseen. Solo rooms only.
const worldPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('world') ? createWorldPreview({ storage: devStorage() }) : null;
const app = createApp({ root: document.getElementById('root'), THREE,
  serverEndpoint: window.__PP_ROOM_ENDPOINT,
  ...(tuner ? { display: tuner.display, soloHazards: true, worldPreview } : {}), // development only: lets the preview try weather without a second player
});
if (tuner) {
  window.__ppTuner = tuner;
  if (new URLSearchParams(window.location.search).has('map')) setTimeout(() => { // ?map: straight to the level select, through the real solo flow
    const press = text => [...document.querySelectorAll('button')].find(b => b.textContent === text)?.click();
    press('Play solo');
    const poll = setInterval(() => { if (document.querySelector('[data-ui=map-select]')?.offsetParent !== undefined && [...document.querySelectorAll('button')].some(b => b.textContent === 'Start Game')) { press('Start Game'); clearInterval(poll); } }, 200);
  }, 300);
  if (new URLSearchParams(window.location.search).has('art')) import('../devtools/map-art.js').then(({ mountMapArt }) => mountMapArt(document)); // ?art: the flat master map on its own
  if (new URLSearchParams(window.location.search).has('gallery')) import('../devtools/planet-gallery.js').then(({ mountPlanetGallery }) => mountPlanetGallery(document)); // ?gallery: live close-ups of the loading-screen city, ship and plane
  Promise.all([import('../devtools/panel.js'), import('../devtools/sources.js'), import('../devtools/powerup-catalog.js'), import('../devtools/loading-preview.js')]).then(([{ mountTuningPanel }, { sources, tuning }, { mountPowerupCatalog }, { mountLoadingPreview }]) => { mountTuningPanel(document, tuner, { sources, tuning }); mountPowerupCatalog(document, app); mountLoadingPreview(document, app); });
  if (worldPreview) import('../devtools/world-preview.js').then(({ mountWorldPreview }) => mountWorldPreview(document, worldPreview, app));
}
// Development/test hook, inert in normal play: lets browser checks inspect the running app.
if (window.__PP_APP_HOOK) window.__ppApp = app;
window.addEventListener('pagehide', () => { app.dispose(); });
