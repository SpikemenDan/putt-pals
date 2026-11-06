/**
 * Original comic-style icons as constant SVG markup: one per power-up and one per HUD control. Flat colour with an ink outline to
 * match the toon course. These strings are fixed in the source and never contain peer content, so they are safe to inject as
 * markup; the development catalog (src/devtools) reuses them as plain DOM.
 */
const INK = '#14102a';
const svg = body => `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const POWERUP_ICONS = Object.freeze({
  mag: svg('<path fill="#e83a4a" d="M6 6h7v11a3 3 0 0 0 6 0V6h7v11a10 10 0 0 1-20 0z"/><path fill="#fff" d="M6 6h7v5H6zM19 6h7v5h-7z"/>'),
  steady: svg('<circle cx="16" cy="16" r="10" fill="#7ff0b4"/><circle cx="16" cy="16" r="3.5" fill="#fff"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6"/>'),
  chip: svg('<path stroke-dasharray="3 4" d="M4 26C8 8 20 6 27 19"/><circle cx="24" cy="10" r="5.5" fill="#ffd23f"/><path d="M3 28h26"/>'),
  ghost: svg('<path fill="#e8f0ff" d="M6 28V15a10 10 0 0 1 20 0v13l-3.4-3-3.2 3-3.4-3-3.4 3-3.2-3z"/><circle cx="12.5" cy="14" r="1.6" fill="#14102a"/><circle cx="19.5" cy="14" r="1.6" fill="#14102a"/>'),
  small: svg('<circle cx="16" cy="16" r="5" fill="#ff7ad9"/><path d="M3 3l6 6M9 4v5H4M29 3l-6 6M23 4v5h5M3 29l6-6M9 28v-5H4M29 29l-6-6M23 28v-5h5"/>'),
  tall: svg('<circle cx="16" cy="16" r="10.5" fill="#ff9a3c"/><path stroke="#fff" d="M10.5 12.5a6.5 6.5 0 0 1 5-4"/><path d="M3 9V3h6M29 9V3h-6M3 23v6h6M29 23v6h-6"/>'),
  sticky: svg('<path fill="#9be564" d="M4 6h24v9c0 3-2.4 3-3.4 1s-3.6-2-3.6 1v7c0 4-5 4-5 0v-5c0-3-4-3-4 0v2c0 3-4.4 3-4.4 0v-5c0-3-3.6-2-3.6-4z"/>'),
  aim360: svg('<path d="M27 16a11 11 0 1 1-3.4-8"/><path fill="#ff6b35" d="M28 3v8h-8z"/><circle cx="16" cy="16" r="3" fill="#ff6b35"/>'),
  aim180: svg('<path d="M5 22a11 11 0 0 1 22 0"/><path fill="#c77dff" d="M1 17l8 1-5 7zM31 17l-8 1 5 7z"/><circle cx="16" cy="22" r="3" fill="#c77dff"/>'),
  love: svg('<path fill="#ff5c8a" d="M16 28C5 20 3 15 3 11a7 7 0 0 1 13-3.4A7 7 0 0 1 29 11c0 4-2 9-13 17z"/><path stroke="#fff" d="M8 11a3 3 0 0 1 3-3"/>'),
  hate: svg('<path fill="#8a2be2" d="M16 2l3.4 7 7-3.4-3 7.4 6.6 3-6.6 3 3 7.4-7-3.4L16 30l-3.4-7-7 3.4 3-7.4L0 16l8-3-3-7.4 7 3.4z"/><path stroke="#fff" d="M12 14l3 1.5M20 14l-3 1.5M12.5 20c2-1.6 5-1.6 7 0"/>'),
  bumper: svg('<circle cx="16" cy="16" r="13" fill="#ff4d6d"/><circle cx="16" cy="16" r="8" fill="#ffe14d"/><circle cx="16" cy="16" r="3.4" fill="#fff"/>'),
  orbital: svg('<ellipse cx="16" cy="16" rx="14" ry="6" transform="rotate(-24 16 16)"/><circle cx="16" cy="16" r="7.5" fill="#4d7dff"/><circle cx="27" cy="10" r="3" fill="#7ff0ff"/>'),
  rain: svg('<path fill="#dff1ff" d="M9 19a6 6 0 0 1-.6-12A8 8 0 0 1 24 8.600a5.300 5.300 0 0 1-.6 10.400z"/><path stroke="#2f7cf0" d="M11 23l-2 5M17 23l-2 5M23 23l-2 5"/>'),
  snow: svg('<path stroke="#2f7cf0" stroke-width="2.6" d="M16 3v26M4.700 9.500l22.600 13M27.300 9.500l-22.600 13M16 8l-3.500-3M16 8l3.500-3M16 24l-3.500 3M16 24l3.500 3"/>'),
  wind: svg('<path stroke="#2fa89a" stroke-width="2.800" d="M3 12h15a4.500 4.500 0 1 0-4.300-5.800M3 18h21a4 4 0 1 1-3.800 5.300M3 24h9"/>'),
  lightning: svg('<path fill="#ffd23f" d="M18 2L6 18h8l-2 12 14-18h-9z"/>'),
  tornado: svg('<path fill="#c3cad8" d="M3 5h26l-5 5H8zM8 12h17l-4 5H11zM11 19h10l-3 4h-5zM13 25h5l-2 4z"/>'),
  hurricane: svg('<path stroke="#5a6fd6" stroke-width="2.800" d="M16 16a3 3 0 1 1 3 3 7 7 0 1 1 6.500-9.500M16 16a3 3 0 1 1-3-3 7 7 0 1 1-6.500 9.500"/>'),
});

export const HUD_ICONS = Object.freeze({
  view: svg('<path fill="#fff" d="M4 11h4l2-4h12l2 4h4v15H4z"/><circle cx="16" cy="18" r="5" fill="#27c8ff"/>'),
  card: svg('<path fill="#fff" d="M6 4h20v24H6z"/><path d="M10 11h12M10 16h12M10 21h7"/>'),
  scoreboard: svg('<path fill="#ffd23f" d="M9 4h14v9a7 7 0 0 1-14 0z"/><path d="M9 7H4c0 5 2 8 6 8M23 7h5c0 5-2 8-6 8M16 20v5M10 28h12"/>'),
  invite: svg('<path d="M13 19l6-6"/><path fill="#fff" d="M14 9l3-3a6 6 0 0 1 9 9l-3 3-3-3 3-3a2 2 0 0 0-3-3l-3 3zM18 23l-3 3a6 6 0 0 1-9-9l3-3 3 3-3 3a2 2 0 0 0 3 3l3-3z"/>'),
  settings: svg('<path fill="#fff" d="M13 3h6l1 4 3 1.700 4-1.200 3 5.200-3 2.900v3.200l3 2.900-3 5.200-4-1.200-3 1.700-1 4h-6l-1-4-3-1.700-4 1.200-3-5.200 3-2.900v-3.200l-3-2.900 3-5.200 4 1.200 3-1.700z"/><circle cx="16" cy="16" r="4" fill="#ffd23f"/>'),
  prev: svg('<path fill="#fff" d="M20 5L8 16l12 11z"/>'),
  next: svg('<path fill="#fff" d="M12 5l12 11-12 11z"/>'),
  restart: svg('<path d="M26 16a10 10 0 1 1-3-7"/><path fill="#fff" d="M27 3v9h-9z"/>'),
  maps: svg('<path fill="#2fbf5b" d="M4 7l8-3 8 3 8-3v21l-8 3-8-3-8 3z"/><path d="M12 4v21M20 7v21"/>'),
  exit: svg('<path fill="#fff" d="M5 4h13v24H5z"/><path d="M14 16h14M23 11l5 5-5 5"/>'),
});

/** Markup for a power-up's icon; an unknown id draws nothing. */
export const powerupIcon = id => POWERUP_ICONS[id] || '';
