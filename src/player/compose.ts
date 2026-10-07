import { rowsFromString } from '../core/sprite-data';
import type { FrameArt } from '../core/sprite';

/** A sprite-string part placed at (x, y) inside a frame. */
export interface Part {
  art: FrameArt;
  x: number;
  y: number;
  /** Mirror the part horizontally. */
  flip?: boolean;
}

/**
 * Builds one sprite frame (rows of palette characters) by stacking parts,
 * later parts on top; '.' and ' ' are transparent. Lets poses share the head
 * and limbs instead of redrawing them per frame.
 */
export function composeFrame(width: number, height: number, parts: readonly Part[]): string[] {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  for (const part of parts) {
    const rows = typeof part.art === 'string' ? rowsFromString(part.art) : part.art;
    rows.forEach((row, dy) => {
      const chars = part.flip ? [...row].reverse() : [...row];
      chars.forEach((ch, dx) => {
        const x = part.x + dx;
        const y = part.y + dy;
        if (ch === '.' || ch === ' ' || x < 0 || y < 0 || x >= width || y >= height) return;
        grid[y]![x] = ch;
      });
    });
  }
  return grid.map((row) => row.join(''));
}

/**
 * Tilts pixel art by shifting whole columns: column x moves up by
 * round(slope * (x - pivotX)). The art is bottom-aligned in a frame of
 * `height` rows (taller than the art, to leave room for the lift); pixels
 * pushed outside are clipped. Used for the board's ollie / flip frames.
 */
export function shearColumns(rows: readonly string[], slope: number, pivotX: number, height: number): string[] {
  const width = rows[0]?.length ?? 0;
  const top = height - rows.length;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const ty = top + y - Math.round(slope * (x - pivotX));
      if (ch !== '.' && ty >= 0 && ty < height) grid[ty]![x] = ch;
    });
  });
  return grid.map((r) => r.join(''));
}
