/**
 * View size in view pixels. The height is fixed; the width adapts to the
 * screen between VIEW_W (16:9, the design minimum) and VIEW_MAX_W (~21:9).
 * Systems read the current width from `display.viewWidth`; VIEW_W is only the
 * guaranteed minimum (safe area for centred content).
 */
export const VIEW_W = 320;
export const VIEW_MAX_W = 427;
export const VIEW_H = 180;

/** Y (view pixels, down is positive) of the riding surface. */
export const GROUND_Y = 150;

/** Fixed update rate. */
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** Screen x of the player's feet; the world scrolls past this point. */
export const PLAYER_X = 64;

/** World scroll speed at run start and its cap, in view pixels per second. */
export const BASE_SPEED = 90;
export const MAX_SPEED = 165;

export const MAX_HEALTH = 5;

/** Ignore restart taps for this long after game over so a crash tap does not restart instantly. */
export const GAMEOVER_INPUT_DELAY = 0.75;

/** Fallback page colour around the letterboxed canvas. */
export const DEFAULT_LETTERBOX = '#1b1f2e';

/**
 * Drunk input (state.drunkTimer > 0 while playing): every action / duck press
 * and release reaches the systems this many ticks late, drawn per edge from a
 * run-seeded rng (see core/drunk.ts). Presses are never dropped.
 */
export const DRUNK_DELAY_MIN = 3;
export const DRUNK_DELAY_MAX = 8;
