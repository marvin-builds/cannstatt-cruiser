/**
 * A centred column of screen blocks (text rows, button cards) that drops the
 * least important blocks until the rest fits between `top` and `bottom`, so
 * every menu screen works on desktop, phone landscape and portrait
 * (where buttons are 44 view px tall).
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
}

/** Horizontal space between blocks that share a line. */
export const INLINE_GAP = 8;

interface Line {
  blocks: Block[];
  w: number;
  h: number;
  gap: number;
}

function lines(blocks: readonly Block[], maxWidth: number): Line[] {
  const out: Line[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.inline && last && last.w + INLINE_GAP + block.w <= maxWidth) {
      last.blocks.push(block);
      last.w += INLINE_GAP + block.w;
      last.h = Math.max(last.h, block.h);
    } else {
      out.push({ blocks: [block], w: block.w, h: block.h, gap: block.gap });
    }
  }
  return out;
}

const height = (ls: readonly Line[]) => ls.reduce((sum, l) => sum + l.gap + l.h, 0);

/** Rects of the kept blocks by id, in column order (dropped blocks are missing). */
export function fitColumn(blocks: readonly Block[], bounds: ColumnBounds): Map<string, Rect> {
  let kept = blocks;
  let laid = lines(kept, bounds.maxWidth);
  while (bounds.top + height(laid) > bounds.bottom) {
    const level = Math.max(...kept.map((b) => b.drop ?? -Infinity));
    if (level === -Infinity) break;
    kept = kept.filter((b) => b.drop !== level);
    laid = lines(kept, bounds.maxWidth);
  }
  const placed = new Map<string, Rect>();
  let y = bounds.top;
  for (const line of laid) {
    y += line.gap;
    let x = bounds.centre - Math.floor(line.w / 2);
    for (const block of line.blocks) {
      placed.set(block.id, { x, y, w: block.w, h: block.h });
      x += block.w + INLINE_GAP;
    }
    y += line.h;
  }
  return placed;
}
