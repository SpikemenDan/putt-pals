/**
 * Per-map toon palettes and ambient weather (V1c #60).
 *
 * Plain data, no rendering dependencies. Each starter map has a distinct saturated palette in the V1a
 * toon style: one flat colour per surface role (sRGB hex), the colours of the five sky bands above the
 * horizon and the three below it, a sun strength, a cloud tint and an optional ambient weather.
 * Weather is visual only: nothing here reaches the simulation, so no gameplay changes.
 *
 * Courses without an entry (the 16 non-starter maps) use the Switchback Garden palette. The garden
 * surface colours are the approved V1a look; `materials.js` TOON_PALETTE must stay equal to them.
 */

/** Surface roles every palette defines. */
export const PALETTE_ROLES = Object.freeze([
  'turf', 'tile', 'wall', 'platform', 'ramp', 'sand', 'ice', 'slime',
  'padRing', 'fanRing', 'fanBlade', 'cupSleeve', 'cupRim', 'pole', 'flag', 'wind',
]);

/** Ambient weather kinds. */
export const WEATHER_KINDS = Object.freeze(['snow', 'storm']);

const freezePalette = palette => Object.freeze({
  ...palette,
  surfaces: Object.freeze(palette.surfaces),
  sky: Object.freeze({ ...palette.sky, up: Object.freeze(palette.sky.up), down: Object.freeze(palette.sky.down), clouds: Object.freeze(palette.sky.clouds) }),
});

const GARDEN = freezePalette({
  id: 'garden',
  surfaces: {
    turf: 0x2fbf5b, tile: 0x8a2be2, wall: 0xff3d6e, platform: 0xffa726, ramp: 0xffd640,
    sand: 0xffcf73, ice: 0x8be8ff, slime: 0xc4f53a,
    padRing: 0xffc21a, fanRing: 0x4a5272, fanBlade: 0xeef1ff,
    cupSleeve: 0x16241e, cupRim: 0xffffff, pole: 0xffffff, flag: 0xff2e88, wind: 0xffffff,
  },
  // The V1b sky: horizon band first, zenith band last.
  sky: {
    up: [0xdbf2ff, 0x99d6ff, 0x61b0fa, 0x458ff2, 0x3375e6],
    down: [0xb8e3ff, 0x85c7ff, 0x66adf7],
    sun: 1,
    cloudTint: 0xffffff,
    clouds: { seed: 59, ring: 14, deck: 10, scale: 1, drift: 0.004 },
  },
  weather: null,
});

const DUNE = freezePalette({
  id: 'dune',
  surfaces: {
    turf: 0xe98a2b, tile: 0xb5341b, wall: 0x14b8a6, platform: 0x7c3aed, ramp: 0xffe14d,
    sand: 0xffeaa0, ice: 0x8be8ff, slime: 0xc4f53a,
    padRing: 0x00b3a4, fanRing: 0x5b3b2a, fanBlade: 0xfff4e0,
    cupSleeve: 0x2a1608, cupRim: 0xffffff, pole: 0xffffff, flag: 0xd9004c, wind: 0xfff2cc,
  },
  sky: {
    up: [0xfff0cf, 0xffd89a, 0xffbf6e, 0xff9f55, 0xe9784a],
    down: [0xffe1ad, 0xffc783, 0xf5a966],
    sun: 1,
    cloudTint: 0xfff2dc,
    clouds: { seed: 8, ring: 9, deck: 7, scale: 0.9, drift: 0.003 },
  },
  weather: null,
});

const FROST = freezePalette({
  id: 'frost',
  surfaces: {
    turf: 0xb9e6f7, tile: 0x2b44c4, wall: 0xf2f8ff, platform: 0x7aa2ff, ramp: 0xd9e8ff,
    sand: 0xffcf73, ice: 0x39b7ff, slime: 0xc4f53a,
    padRing: 0xffffff, fanRing: 0x5d7fb8, fanBlade: 0xffffff,
    cupSleeve: 0x0f2a4a, cupRim: 0xffffff, pole: 0xffffff, flag: 0xff5a3c, wind: 0xe6f6ff,
  },
  sky: {
    up: [0xeef6ff, 0xcfe6fb, 0xa9d0f5, 0x86b9ee, 0x6aa2e6],
    down: [0xe0eefc, 0xc0daf4, 0xa4c6ee],
    sun: 0.6,
    cloudTint: 0xe6efff,
    clouds: { seed: 20, ring: 18, deck: 13, scale: 1.15, drift: 0.005 },
  },
  weather: 'snow',
});

const SLIME = freezePalette({
  id: 'slime',
  surfaces: {
    turf: 0x19b394, tile: 0x4c1d95, wall: 0xff5fd2, platform: 0xffa726, ramp: 0xffe14d,
    sand: 0xffcf73, ice: 0x8be8ff, slime: 0xb6ff1f,
    padRing: 0xffe14d, fanRing: 0x3b2a6e, fanBlade: 0xf3ffe0,
    cupSleeve: 0x1a0f2e, cupRim: 0xffffff, pole: 0xffffff, flag: 0xffe14d, wind: 0xe9ffb0,
  },
  sky: {
    up: [0xf3ffc7, 0xd3f58f, 0x9be36f, 0x5fcc8a, 0x2fb3a0],
    down: [0xe0f8a8, 0xb6ec84, 0x86d98f],
    sun: 0.9,
    cloudTint: 0xf4ffd8,
    clouds: { seed: 21, ring: 15, deck: 11, scale: 1, drift: 0.006 },
  },
  weather: null,
});

const CYCLONE = freezePalette({
  id: 'cyclone',
  surfaces: {
    turf: 0x4f6fe0, tile: 0x24285a, wall: 0xffb300, platform: 0xff6b3d, ramp: 0xffd640,
    sand: 0xffcf73, ice: 0x8be8ff, slime: 0xc4f53a,
    padRing: 0xffb300, fanRing: 0x2e3560, fanBlade: 0xeaf0ff,
    cupSleeve: 0x0b0f24, cupRim: 0xffffff, pole: 0xffffff, flag: 0xff3d6e, wind: 0xc9e4ff,
  },
  sky: {
    up: [0x9aa6bd, 0x7a87a4, 0x5a678a, 0x434f74, 0x313b5e],
    down: [0x8a96b0, 0x6e7a98, 0x535f80],
    sun: 0,
    cloudTint: 0x8d97b3,
    clouds: { seed: 5, ring: 24, deck: 16, scale: 1.3, drift: 0.014 },
  },
  weather: 'storm',
});

const FINALE = freezePalette({
  id: 'finale',
  surfaces: {
    turf: 0xffc21a, tile: 0x1b1f7a, wall: 0xe0128a, platform: 0x00c2a8, ramp: 0xff7a2f,
    sand: 0xffcf73, ice: 0x8be8ff, slime: 0x6ef03a,
    padRing: 0x00e5ff, fanRing: 0x4a1d7a, fanBlade: 0xfff0f8,
    cupSleeve: 0x1a0b2e, cupRim: 0xffffff, pole: 0xffffff, flag: 0x00e5ff, wind: 0xffe3f4,
  },
  sky: {
    up: [0xffd9e8, 0xffa6c9, 0xff7fb0, 0xd94fa0, 0x8a35b8],
    down: [0xffc2dc, 0xff93bd, 0xe66aaa],
    sun: 1,
    cloudTint: 0xffe6f2,
    clouds: { seed: 19, ring: 16, deck: 12, scale: 1.05, drift: 0.005 },
  },
  weather: null,
});

/** Palette per course name; the six starter maps. */
export const COURSE_PALETTES = Object.freeze({
  'Switchback Garden': GARDEN,
  'Dune Serpent': DUNE,
  'Frost Hollow': FROST,
  'Slime Springs': SLIME,
  'Cyclone Ring': CYCLONE,
  'Grand Finale': FINALE,
});

export const DEFAULT_PALETTE = GARDEN;

/** The palette for a course (by name), or the default palette. */
export function paletteForCourse(course) {
  return COURSE_PALETTES[course?.name] || DEFAULT_PALETTE;
}
