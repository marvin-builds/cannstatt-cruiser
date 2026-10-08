/**
 * Hint plates at the hint spot under the skater (below the riding line, see
 * trick-hint.ts trickHintRect): rows of texts and key caps on a plate, and
 * which of the riding hints shows when several want to (one at a time).
 */
import { GROUND_Y, VIEW_H } from '../core/config';
import { FONT_LINE_HEIGHT, measureText } from '../core/font';
import type { Rect } from '../types';
import { POPUP_MARGIN } from './layout';
import { trickHintRect } from './trick-hint';

/** A "↓" key cap in a hint row (desktop: the duck key). */
export const KEY_DOWN = { key: 'down' } as const;
export type HintPiece = string | typeof KEY_DOWN;
/** One line of a hint plate: texts and key caps side by side. */
export type HintRow = readonly HintPiece[];

/** Key cap size (view px, at every font scale). */
export const KEYCAP_W = 9;
export const KEYCAP_H = 10;
/** Gap between two pieces of a row. */
export const PIECE_GAP = 3;
/** Plate padding and the gap between rows. */
export const HINT_PAD_X = 4;
export const HINT_PAD_Y = 3;
export const ROW_GAP = 2;
/** Gap between the riding line and the plate (as trickHintRect). */
const BELOW_GROUND = 4;

export function hintRowWidth(row: HintRow, scale: number): number {
  let w = PIECE_GAP * (row.length - 1);
  for (const p of row) w += typeof p === 'string' ? measureText(p, scale) : KEYCAP_W;
  return w;
}

/** Height of a row: the glyphs, or the key cap where it is taller. */
export function hintRowHeight(row: HintRow, scale: number): number {
  return row.includes(KEY_DOWN) ? Math.max(KEYCAP_H, FONT_LINE_HEIGHT * scale) : FONT_LINE_HEIGHT * scale;
}

export function hintPlateSize(rows: readonly HintRow[], scale: number): { w: number; h: number } {
  let w = 0;
  let h = 2 * HINT_PAD_Y + ROW_GAP * (rows.length - 1);
  for (const row of rows) {
    w = Math.max(w, hintRowWidth(row, scale));
    h += hintRowHeight(row, scale);
  }
  return { w: w + 2 * HINT_PAD_X, h };
}

/** The plate for `rows` at the hint spot under the skater. */
export function hintPlateRect(rows: readonly HintRow[], scale: number, viewWidth: number): Rect {
  const { w, h } = hintPlateSize(rows, scale);
  return trickHintRect(w, h, viewWidth);
}

/**
 * The first of `variants` (longest first) whose plate fits under the riding
 * line and inside the view at `scale`; the last one if none does.
 */
export function fitHintRows(variants: readonly (readonly HintRow[])[], scale: number, viewWidth: number): readonly HintRow[] {
  const fits = (rows: readonly HintRow[]) => {
    const { w, h } = hintPlateSize(rows, scale);
    return h <= VIEW_H - GROUND_Y - BELOW_GROUND && w <= viewWidth - 2 * POPUP_MARGIN;
  };
  return variants.find(fits) ?? variants[variants.length - 1]!;
}

export type HintKind = 'trick' | 'air' | 'kicker';

/**
 * The riding hint that shows at the hint spot when several want to: the grind
 * trick hint (on a rail), then the air trick hint (after a launch), then the
 * kicker hint (before it), so two never overlap.
 */
export function shownHint(wants: { trick: boolean; air: boolean; kicker: boolean }): HintKind | null {
  if (wants.trick) return 'trick';
  if (wants.air) return 'air';
  return wants.kicker ? 'kicker' : null;
}
