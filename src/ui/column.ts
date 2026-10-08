/**
 * A centred column of screen blocks (text rows, button cards) that drops the
 * least important blocks until the rest fits between `top` and `bottom`, so
 * every menu screen works on desktop, phone landscape and portrait
 * (where buttons are 44 view px tall). An optional clear zone (the skater)
 * stays uncovered: lines that would cover it move to its right.
 */
import type { Rect } from '../types';

export interface Block {
  id: string;
  w: number;
  h: number;
  /** Space above the block (or above its line). */
  gap: number;
  /** Optional blocks: the highest level is dropped first, all its blocks at once. Absent = always kept. */
  drop?: number;
  /** Sits beside the previous block (INLINE_GAP apart, line centred) when both fit maxWidth. */
  inline?: boolean;
}

export interface ColumnBounds {
  top: number;
  /** Lowest y the last block may reach. */
  bottom: number;
  /** Centre x of every line. */
  centre: number;
  /** Widest a line of inline blocks may get. */
  maxWidth: number;
  /** A region no block may cover (e.g. the skater): such lines move right of it, else optional blocks give way. */
  clear?: Rect;
}

/** Horizontal space between blocks that share a line. */
export const INLINE_GAP = 8;
/** Least space between the clear zone and a line moved to its right. */
export const CLEAR_GAP = 4;

interface Line {
  blocks: Block[];
  w: number;
  h: number;
  gap: number;
}

/**
 * Left x of a line `w` wide whose top is at `y`: centred, or right of the
 * clear zone when centred it would cover it; null when it cannot keep clear.
 */
function lineX(w: number, h: number, y: number, bounds: ColumnBounds): number | null {
  const x = bounds.centre - Math.floor(w / 2);
  const c = bounds.clear;
  if (!c || y >= c.y + c.h || c.y >= y + h || x >= c.x + c.w || c.x >= x + w) return x;
  const right = c.x + c.w + CLEAR_GAP;
  return right + w <= bounds.centre + Math.floor(bounds.maxWidth / 2) ? right : null;
}

interface Laid {
  lines: Line[];
  /** Top of every line. */
  ys: number[];
  /** Some line covers the clear zone. */
  clash: boolean;
}

/** Breaks the blocks into lines from `top`: inline blocks join the previous line when it stays within maxWidth and clear. */
function layLines(blocks: readonly Block[], bounds: ColumnBounds): Laid {
  const lines: Line[] = [];
  const ys: number[] = [];
  let y = bounds.top;
  for (const block of blocks) {
    const last = lines[lines.length - 1];
    if (block.inline && last) {
      const w = last.w + INLINE_GAP + block.w;
      const h = Math.max(last.h, block.h);
      const top = ys[ys.length - 1]!;
      if (w <= bounds.maxWidth && lineX(w, h, top, bounds) !== null) {
        last.blocks.push(block);
        last.w = w;
        y += h - last.h;
        last.h = h;
        continue;
      }
    }
    y += block.gap;
    lines.push({ blocks: [block], w: block.w, h: block.h, gap: block.gap });
    ys.push(y);
    y += block.h;
  }
  const clash = lines.some((l, i) => lineX(l.w, l.h, ys[i]!, bounds) === null);
  return { lines, ys, clash };
}

const bottomOf = (laid: Laid) => (laid.lines.length ? laid.ys[laid.ys.length - 1]! + laid.lines[laid.lines.length - 1]!.h : 0);

/** Rects of the kept blocks by id, in column order (dropped blocks are missing). */
export function fitColumn(blocks: readonly Block[], bounds: ColumnBounds): Map<string, Rect> {
  let kept = blocks;
  let laid = layLines(kept, bounds);
  while (bottomOf(laid) > bounds.bottom || laid.clash) {
    const level = Math.max(...kept.map((b) => b.drop ?? -Infinity));
    if (level === -Infinity) break;
    kept = kept.filter((b) => b.drop !== level);
    laid = layLines(kept, bounds);
  }
  const placed = new Map<string, Rect>();
  laid.lines.forEach((line, i) => {
    const y = laid.ys[i]!;
    let x = lineX(line.w, line.h, y, bounds) ?? bounds.centre - Math.floor(line.w / 2);
    for (const block of line.blocks) {
      placed.set(block.id, { x, y, w: block.w, h: block.h });
      x += block.w + INLINE_GAP;
    }
  });
  return placed;
}
