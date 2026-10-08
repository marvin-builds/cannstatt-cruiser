import { describe, expect, it } from 'vitest';
import { type Block, fitColumn } from './column';

const b = (id: string, h: number, extra: Partial<Block> = {}): Block => ({ id, w: 40, h, gap: 2, ...extra });

describe('fitColumn', () => {
  it('stacks blocks from the top, centred, each after its gap', () => {
    const placed = fitColumn([b('a', 10), b('b', 20, { w: 100 })], { top: 10, bottom: 180, centre: 160, maxWidth: 300 });
    expect(placed.get('a')).toEqual({ x: 140, y: 12, w: 40, h: 10 });
    expect(placed.get('b')).toEqual({ x: 110, y: 24, w: 100, h: 20 });
  });

  it('drops the highest drop level first, all its blocks at once, until the rest fits', () => {
    const blocks = [b('keep', 50), b('help1', 20, { drop: 2 }), b('help2', 20, { drop: 2 }), b('tag', 20, { drop: 1 }), b('end', 30)];
    const all = fitColumn(blocks, { top: 0, bottom: 200, centre: 100, maxWidth: 200 });
    expect([...all.keys()]).toEqual(['keep', 'help1', 'help2', 'tag', 'end']);
    const tight = fitColumn(blocks, { top: 0, bottom: 120, centre: 100, maxWidth: 200 });
    expect([...tight.keys()]).toEqual(['keep', 'tag', 'end']);
    expect(tight.get('end')!.y).toBe(2 + 50 + 2 + 20 + 2);
    const tighter = fitColumn(blocks, { top: 0, bottom: 90, centre: 100, maxWidth: 200 });
    expect([...tighter.keys()]).toEqual(['keep', 'end']);
  });

  it('puts an inline block beside the previous one when both fit the width, else below it', () => {
    const blocks = [b('a', 10, { w: 100 }), b('b', 20, { w: 80, inline: true })];
    const wide = fitColumn(blocks, { top: 0, bottom: 180, centre: 200, maxWidth: 400 });
    expect(wide.get('a')).toEqual({ x: 106, y: 2, w: 100, h: 10 });
    expect(wide.get('b')).toEqual({ x: 214, y: 2, w: 80, h: 20 });
    const narrow = fitColumn(blocks, { top: 0, bottom: 180, centre: 100, maxWidth: 150 });
    expect(narrow.get('b')).toEqual({ x: 60, y: 14, w: 80, h: 20 });
  });
});
