/** Ordered (Bayer 4x4) dithering used for crisp pixel crossfades and sky bands. */
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/** Number of distinct coverage steps (0 = nothing, DITHER_LEVELS = everything). */
export const DITHER_LEVELS = 16;

/** Whether pixel (x, y) is covered at `level` (0..DITHER_LEVELS). */
export function ditherCovers(level: number, x: number, y: number): boolean {
  return BAYER_4[y & 3]![x & 3]! < level;
}
