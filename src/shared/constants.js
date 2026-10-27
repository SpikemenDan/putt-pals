/**
 * Core constants for Putt Pals.
 * Shared across headless simulation, session management, networking, rendering, and CLI tools.
 */

// --- Ball & Cup Physics Constants (P32 baseline) ---
export const BALL_RADIUS = 5;
export const R = BALL_RADIUS;

export const DEFAULT_CUP_RADIUS = 15;
export const CUP = DEFAULT_CUP_RADIUS;

export const MIN_CUP_RADIUS = 8;
export const CUP_MIN = MIN_CUP_RADIUS;

export const TURF_FRICTION = 0.75;
export const K_TURF = TURF_FRICTION;

export const SHOT_POWER = 900;
export const POWER = SHOT_POWER;

// Simulation timestep (240 Hz fixed tick)
export const FIXED_TIMESTEP = 1 / 240;
export const DT = FIXED_TIMESTEP;

// Surface drag multipliers
export const SURFACE_DRAG = Object.freeze({
  turf: 1.0,
  sand: 3.5,
  ice: 0.15,
  slime: 6.0,
});

// Deprecated compatibility export: scores have no gameplay cap. Bound wire counts to exact integers.
export const MAX_SCORE = Number.MAX_SAFE_INTEGER;

// --- Course & Rule Constants ---
export const MIN_TIMEOUT_SECONDS = 120;
export const MAX_TIMEOUT_SECONDS = 600;
export const DEFAULT_PAR = 2;
export const DEFAULT_PENALTY = 3;

// Starter courses in official tournament order
export const STARTER_COURSE_INDICES = Object.freeze([0, 8, 20, 21, 5, 19]);
export const STARTERS = STARTER_COURSE_INDICES;

// --- Multiplayer & Protocol Constants ---
export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 4;
export const SNAPSHOT_INTERVAL_MS = 70;
export const VOTING_COUNTDOWN_SECONDS = 15;
export const RECONNECT_GRACE_PERIOD_MS = 30000;

// Maximum name length
export const MAX_PLAYER_NAME_LENGTH = 14;

// Player colour palette: the game's eight ball/scoreboard colours, indexed by player colour index (mod 8).
export const PLAYER_COLORS = Object.freeze(['#ff4fb8', '#3e8ef7', '#f5a623', '#8e4ec6', '#12a594', '#e5484d', '#99d52a', '#e8e8e8']);
