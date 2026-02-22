// ═══════════════════════════════════════════════════════════════════
// WORLD CONSTANTS
// Chunk size 32 = good balance for large worlds.
// 32^3 = 32,768 voxels per chunk, greedy mesh keeps draw calls low.
// ═══════════════════════════════════════════════════════════════════

export const CHUNK_SIZE = 32;
export const CHUNK_HEIGHT = 128;

/** How many chunks to render around the player */
export const RENDER_DISTANCE = 12;

/** How many chunks the server keeps loaded around each player */
export const SERVER_LOAD_DISTANCE = 14;

/** Sea level for water placement */
export const SEA_LEVEL = 42;

/** Maximum world height for terrain generation */
export const TERRAIN_MAX_HEIGHT = 96;

/** Minimum terrain height (ocean floor) */
export const TERRAIN_MIN_HEIGHT = 8;

/** World size in chunks (per axis, centered at 0) — 64 chunks = 2048 blocks radius */
export const WORLD_SIZE_CHUNKS = 64;

/** Ticks per second for server game loop */
export const TICK_RATE = 20;

/** Milliseconds per tick */
export const TICK_MS = 1000 / TICK_RATE;

/** Network update rate (position sync) */
export const NET_UPDATE_RATE = 10; // times per second

/** Physics step (fixed timestep) */
export const PHYSICS_STEP = 1 / 60;

/** Gravity (blocks per second squared) */
export const GRAVITY = -24;

/** Player movement speed (blocks per second) */
export const PLAYER_SPEED = 5.5;

/** Sprint multiplier */
export const SPRINT_MULTIPLIER = 1.6;

/** Jump velocity (blocks per second) */
export const JUMP_VELOCITY = 9;

/** Player hitbox */
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
