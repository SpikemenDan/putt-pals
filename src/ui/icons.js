/**
 * Original comic-style icons as constant SVG markup, one per power-up and one per HUD control. Printed comic style to match the caption-box HUD: a heavy ink
 * silhouette and flat colours from the game's palette, with no shading, gradients or ids, so the same icon can appear many times. These strings are fixed in the source and never contain
 * peer content, so they are safe to inject as markup; the development catalog (src/devtools) reuses them as plain DOM.
 */
const INK = '#120d26';
const P = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const C = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const line = (d, color = INK, width = 2.4) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shine = d => line(d, '#fff', 2.6);
/** `base` is the silhouette: it gets the ink outline. `over` is shading and detail drawn on top. */
const icon = (base, over = '') => `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true"><g stroke="${INK}" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round">${base}</g><g stroke="none">${base}</g>${over}</svg>`;

/** A shape made of brush strokes: a heavy ink line, the colour stroke, in flat colour. */
const stroked = (paths, color, shade, over = '') => `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">${paths.map(d => line(d, INK, 10)).join('')}${paths.map(d => `<g transform="translate(.6 1.100)">${line(d, shade, 5.500)}</g>`).join('')}${paths.map(d => line(d, color, 4.800)).join('')}${over}</svg>`;

export const POWERUP_ICONS = Object.freeze({
  mag: icon(P('M9 8h12v19a3.500 3.500 0 0 0 7 0V8h12v19a15.500 15.500 0 0 1-31 0z', '#d7261e'),
    P('M33 15h7v12a15.500 15.500 0 0 1-15.500 15.500v-7a9 9 0 0 0 8.500-8.500z', '#d7261e') + P('M9 8h12v8H9zM28 8h12v8H28z', '#eef3ff') + P('M16 8h5v8h-5zM35 8h5v8h-5z', '#eef3ff')
    + line('M9 16h12M28 16h12') + shine('M14 21v6a10 10 0 0 0 3.500 7') + line('M3 5l3 3M46 5l-3 3M24.500 3v4', '#ffd23f', 2.8)),
  steady: icon(C(24, 24, 17, '#2fbf5b') + P('M21.500 1h5v9h-5zM21.500 38h5v9h-5zM1 21.500h9v5H1zM38 21.500h9v5h-9z', '#eafff4'),
    P('M24 7a17 17 0 0 1 0 34 24 24 0 0 0 0-34z', '#2fbf5b') + C(24, 24, 9, '#eafff4') + C(24, 24, 4, '#d7261e') + shine('M12.500 16a13 13 0 0 1 6-5')),
  chip: icon(P('M5 41c2-6 8-8 18-8s16 2 19 8z', '#2fbf5b') + C(32, 13, 10, '#ffd23f'),
    P('M32 3a10 10 0 0 1 0 20 13 13 0 0 0 0-20z', '#ffd23f') + shine('M26 10a6.500 6.500 0 0 1 4-3.500') + line('M7 33c1-9 6-16 13-20', '#fff', 3) + line('M7 33c1-9 6-16 13-20', INK, 1) + P('M5 41c4-3 10-4 18-4s14 1 19 4z', '#2fbf5b')),
  ghost: icon(P('M9 43V21a15 15 0 0 1 30 0v22l-5-4.500L29 43l-5-4.500L19 43l-5-4.500z', '#ffffff'),
    P('M29 7a15 15 0 0 1 10 14v22l-5-4.500L29 43V21a16 16 0 0 0-5-14.500A15 15 0 0 1 29 7z', '#ffffff') + P('M15 22a3.500 4.500 0 1 1 7 0 3.500 4.500 0 0 1-7 0zM26 22a3.500 4.500 0 1 1 7 0 3.500 4.500 0 0 1-7 0z', INK) + C(17.500, 20.500, 1.200, '#fff') + C(28.500, 20.500, 1.200, '#fff') + P('M20 30a4 3 0 0 1 8 0z', INK) + shine('M13 18a11 11 0 0 1 5-7')),
  small: icon(C(24, 24, 8.500, '#ff3d8b') + P('M3 3h12l-4 4 6 6-4 4-6-6-4 4zM45 3v12l-4-4-6 6-4-4 6-6-4-4zM3 45V33l4 4 6-6 4 4-6 6 4 4zM45 45H33l4-4-6-6 4-4 6 6 4-4z', '#fff4c9'),
    P('M24 15.500a8.500 8.500 0 0 1 0 17 11 11 0 0 0 0-17z', '#ff3d8b') + shine('M19.500 21a5 5 0 0 1 3-2.500')),
  tall: icon(C(24, 24, 18, '#ff8f1f'),
    P('M24 6a18 18 0 0 1 0 36 23 23 0 0 0 0-36z', '#ff8f1f') + shine('M12 20a13 13 0 0 1 8-8.500') + C(33, 15, 1.800, '#ffd9a8') + C(36, 22, 1.300, '#ffd9a8') + line('M3 12V3h9M45 12V3h-9M3 36v9h9M45 36v9h-9', '#fff4c9', 3)),
  sticky: icon(P('M6 8h36v14c0 5-4.500 5-6 1.500s-5.500-3-5.500 1.500v12c0 7.500-9 7.500-9 0v-7c0-5-6.500-5-6.500 0v3c0 6-7 6-7 0v-8c0-5-2-4-2-8z', '#2fbf5b'),
    P('M6 8h36v5H6zM25.500 27v10c0 5 4 6 5 1V25c0-4 4.500-5 5.500-1.500-3-3-10.500-1-10.500 3.500z', '#2fbf5b') + shine('M11 18v5M33 38v.5') + C(14, 12, 1, '#fff')),
  aim360: icon(P('M24 4a20 20 0 1 0 19.800 23h-7.100A13 13 0 1 1 24 11c3.500 0 6.700 1.400 9 3.700L28 20h16V4l-5.900 5.900A19.900 19.900 0 0 0 24 4z', '#ff8f1f') + C(24, 24, 6, '#fff4c9'),
    P('M3.300 27a20 20 0 0 0 40.500 0h-7.100a13 13 0 0 1-26 0z', '#ff8f1f') + C(24, 24, 2.500, '#d7261e') + shine('M9 16a16.500 16.500 0 0 1 7-6.500')),
  aim180: icon(P('M4 33a20 20 0 0 1 40 0h-7a13 13 0 0 0-26 0z', '#8a3df0') + P('M0 28l15 1-8 11zM48 28l-15 1 8 11z', '#fff4c9') + C(24, 33, 6, '#fff4c9'),
    P('M24 13a20 20 0 0 1 20 20h-7a13 13 0 0 0-13-13z', '#8a3df0') + C(24, 33, 2.500, '#d7261e') + shine('M10 25a16 16 0 0 1 7-7')),
  love: icon(P('M24 44C8 32 3 24 3 16.500A11.500 11.500 0 0 1 24 10a11.500 11.500 0 0 1 21 6.500C45 24 40 32 24 44z', '#ff3d8b'),
    P('M34 5.500A11.500 11.500 0 0 1 45 16.500C45 24 40 32 24 44c8-9 13-17 13-26 0-5-1-9-3-12.500z', '#ff3d8b') + shine('M9.500 17a6 6 0 0 1 5.500-6') + C(19, 11, 1.300, '#fff')),
  hate: icon(P('M24 1l5 11 11-5-4 12 11 5-11 5 4 12-11-5-5 11-5-11-11 5 4-12L1 24l11-5-4-12 11 5z', '#8a3df0'),
    P('M24 1l5 11 11-5-4 12 11 5-11 5 4 12-11-5-5 11c3-14 3-21 0-35z', '#8a3df0') + line('M15 18l7 3.500M33 18l-7 3.500', '#fff', 3) + line('M16.500 33c4-4 11-4 15 0', '#fff', 3)),
  bumper: icon(C(24, 24, 20, '#d7261e'),
    P('M24 4a20 20 0 0 1 0 40 26 26 0 0 0 0-40z', '#d7261e') + C(24, 24, 13, '#ffd23f') + P('M24 11a13 13 0 0 1 0 26 17 17 0 0 0 0-26z', '#ffd23f') + C(24, 24, 6.500, '#fff') + C(24, 24, 2.500, '#d7261e') + shine('M9 19a16 16 0 0 1 7-8') + line('M24 4v3M24 41v3M4 24h3M41 24h3', INK, 2)),
  orbital: icon(P('M4 33C1 28 14 16 26 9.500S45 3 46 7.500 36 25 24 32 6 38 4 33zm6-1c2 1 8-1 14-5s14-12 16-16c-3 0-9 2-15 6S11 28 10 32z', '#27c8ff') + C(24, 22, 12.500, '#2f7cf0') + C(39, 11, 4.500, '#fff4c9'),
    P('M24 9.500a12.500 12.500 0 0 1 0 25 16 16 0 0 0 0-25z', '#2f7cf0') + shine('M16 20a8.500 8.500 0 0 1 5-5') + P('M4 33C1 28 14 16 26 9.500c-11 7-19 15-16 22.500 2 1 8-1 14-5C14 34 6 38 4 33z', '#27c8ff')),
  rain: icon(P('M12 27a9 9 0 0 1-.8-18A12 12 0 0 1 34 10.500 8.500 8.500 0 0 1 35 27z', '#ffffff') + P('M15 32l-4 10 5-2 2-8zM25 32l-4 10 5-2 2-8zM35 32l-4 10 5-2 2-8z', '#2f7cf0'),
    P('M12 27a9 9 0 0 1-8.700-7c7 3 22 3 35-3 2-1.500 3-3 3.500-5a8.500 8.500 0 0 1-6.800 15z', '#ffffff') + shine('M9 15a5.500 5.500 0 0 1 4-2.500M18 9.500a8 8 0 0 1 6-2.500')),
  snow: icon(P('M21.500 2h5v44h-5zM4.100 10.900l2.500-4.300 37.300 30.500-2.500 4.300zM43.900 10.900l-2.500-4.300L4.100 37.100l2.500 4.300z', '#27c8ff') + P('M16 5l8 6 8-6 2.500 3.500L24 16.500 13.500 8.500zM16 43l8-6 8 6 2.500-3.500L24 31.500l-10.500 8z', '#27c8ff'),
    C(24, 24, 5, '#fff') + line('M23 5v14M23 29v14', '#fff', 1.6)),
  wind: stroked(['M4 16h24a6.500 6.500 0 1 0-6.500-6.500', 'M4 26h34a6 6 0 1 1-6 6', 'M4 36h17'], '#27c8ff', '#27c8ff'),
  lightning: icon(P('M28 2L8 27h12l-5 19 24-27H26l9-17z', '#ffd23f'),
    P('M35 2l-9 17h13L15 46l11-22H21z', '#ffd23f') + shine('M26 7L14 23') + line('M4 8l4 3M44 34l-4-2M3 38l4-2', '#fff4c9', 2.6)),
  tornado: icon(P('M3 6h42l-6 8H9zM10 16h29l-5 7H14zM15 25h19l-4 6H19zM20 33h9l-3 6h-3zM23 41h3l-1 5h-1z', '#c9d1e2'),
    P('M33 6h12l-6 8h-9zM31 16h8l-5 7h-6zM27 25h7l-4 6h-5zM25 33h4l-3 6h-2z', '#c9d1e2') + shine('M9 9.500h15M15 19h9M20 28h5') + line('M2 44l5-2M46 40l-5 2', '#fff4c9', 2.6)),
  hurricane: stroked(['M24 13a11 11 0 1 1-.1 0', 'M35 18c1-7 4-12 10-15', 'M13 30c-1 7-4 12-10 15'], '#2f7cf0', '#2f7cf0', C(24, 24, 4.500, '#fff4c9')),
});

export const HUD_ICONS = Object.freeze({
  view: icon(P('M5 15h8l3-6h16l3 6h8v25H5z', '#eaf1ff') + C(24, 26, 9.500, '#27c8ff'), P('M24 16.500a9.500 9.500 0 0 1 0 19 12 12 0 0 0 0-19z', '#27c8ff') + shine('M18.500 24a6 6 0 0 1 3.500-4') + C(38, 20, 1.800, '#d7261e')),
  card: icon(P('M9 5h30v38H9z', '#fff4c9'), P('M33 5h6v38h-6z', '#fff4c9') + line('M15 14h18M15 22h18M15 30h11', INK, 2.8)),
  scoreboard: icon(P('M13 5h22v16a11 11 0 0 1-22 0zM21 31h6v7h-6zM13 38h22v6H13z', '#ffd23f') + P('M13 9H4c0 9 3 14 10 15v-5c-3-1-5-3-5.500-6H13zM35 9h9c0 9-3 14-10 15v-5c3-1 5-3 5.500-6H35z', '#ffd23f'),
    P('M27 5h8v16a11 11 0 0 1-8 10.500zM27 38h8v6h-8z', '#ffd23f') + shine('M18 10v10')),
  invite: icon(P('M21 13l6-6a10 10 0 0 1 14 14l-6 6-5-5 6-6a3 3 0 0 0-4-4l-6 6zM27 35l-6 6A10 10 0 0 1 7 27l6-6 5 5-6 6a3 3 0 0 0 4 4l6-6z', '#27c8ff') + P('M17 27l10-10 4 4-10 10z', '#fff4c9'), shine('M12 25l-3 3')),
  settings: icon(P('M20 3h8l1.500 6 4.500 2 5.500-3 5.500 5.500-3 5.500 2 4.500 6 1.500v8l-6 1.500-2 4.500 3 5.500-5.500 5.500-5.500-3-4.500 2-1.500 6h-8l-1.500-6-4.500-2-5.500 3L3 39.500l3-5.500-2-4.500-6-1.500v-8l6-1.500 2-4.500-3-5.500L8.500 8l5.500 3 4.500-2z', '#ffffff') + C(24, 24, 7.500, '#ffd23f'),
    P('M24 16.500a7.500 7.500 0 0 1 0 15 10 10 0 0 0 0-15z', '#ffd23f') + shine('M12 16a14 14 0 0 1 6-5')),
  prev: icon(P('M33 5L9 24l24 19z', '#ffd23f'), P('M33 24v19L9 24z', '#ffd23f')),
  next: icon(P('M15 5l24 19-24 19z', '#ffd23f'), P('M15 24v19l24-19z', '#ffd23f')),
  restart: icon(P('M24 6a18 18 0 1 0 18 18h-7a11 11 0 1 1-11-11c3 0 5.800 1.300 7.800 3.200L27 21h15V6l-5.300 5.300A18 18 0 0 0 24 6z', '#27c8ff'), P('M6 24a18 18 0 0 0 36 0h-7a11 11 0 0 1-22 0z', '#27c8ff')),
  maps: icon(P('M5 11l13-5 12 5 13-5v31l-13 5-12-5-13 5z', '#2fbf5b'), P('M18 6l12 5v31l-12-5z', '#2fbf5b') + line('M18 6v31M30 11v31') + C(36, 19, 3, '#d7261e')),
  exit: icon(P('M8 5h22v38H8z', '#eaf1ff') + P('M24 20h9v-7l12 11-12 11v-7h-9z', '#d7261e'), P('M8 5h6v38H8z', '#eaf1ff') + C(20, 25, 1.800, INK)),
});

/** Markup for a power-up's icon; an unknown id draws nothing. */
export const powerupIcon = id => POWERUP_ICONS[id] || '';
