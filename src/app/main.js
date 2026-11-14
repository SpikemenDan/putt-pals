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
  if (new URLSearchParams(window.location.search).has('map')) setTimeout(() => { // ?map: straight to the level select, through the real solo flow; ?map=ares or ?map=luna lands on that planet
    const press = text => [...document.querySelectorAll('button')].find(b => b.textContent === text)?.click();
    const step = (k, fn) => setTimeout(fn, 60 * k); // Solo steps (VIS-M4): Casual, the planet, Play solo
    const turns = { luna: 1, ares: 2 }[new URLSearchParams(window.location.search).get('map')] ?? 0; // left arrow order: Gaia, Luna, Ares
    step(0, () => document.querySelector('[data-menu=solo]')?.click());
    step(1, () => [...document.querySelectorAll('[data-ui=solo-steps] button')].find(b => b.textContent.startsWith('Casual'))?.click());
    for (let k = 0; k < turns; k++) step(2 + k, () => document.querySelector('[data-ui=world-left]')?.click());
    step(2 + turns, () => document.querySelector('[data-ui=solo-steps] [data-ui=world-choose]')?.click());
    step(3 + turns, () => press('Play solo')); // the Solo steps open the level select directly, with no lobby
  }, 300);
  if (new URLSearchParams(window.location.search).has('art')) import('../devtools/map-art.js').then(({ mountMapArt }) => mountMapArt(document)).catch(error => console.error('Dev tool failed to load (?art)', error)); // ?art: the flat master map on its own
  if (new URLSearchParams(window.location.search).has('gallery')) import('../devtools/planet-gallery.js').then(({ mountPlanetGallery }) => mountPlanetGallery(document)).catch(error => console.error('Dev tool failed to load (?gallery)', error)); // ?gallery: live close-ups of the loading-screen city, ship and plane
  Promise.all([import('../devtools/panel.js'), import('../devtools/sources.js'), import('../devtools/powerup-catalog.js'), import('../devtools/loading-preview.js')]).then(([{ mountTuningPanel }, { sources, tuning }, { mountPowerupCatalog }, { mountLoadingPreview }]) => { mountTuningPanel(document, tuner, { sources, tuning }); mountPowerupCatalog(document, app); mountLoadingPreview(document, app); }).catch(error => console.error('Dev tools failed to load', error));
  if (worldPreview) import('../devtools/world-preview.js').then(({ mountWorldPreview }) => mountWorldPreview(document, worldPreview, app)).catch(error => console.error('Dev tool failed to load (?world)', error));
}
// Development/test hook, inert in normal play: lets browser checks inspect the running app.
if (window.__PP_APP_HOOK) window.__ppApp = app;
window.addEventListener('pagehide', () => { app.dispose(); });
