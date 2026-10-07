import { describe, expect, it } from 'vitest';
import { BODY_FRAMES, CHILL_BODY_FRAMES, HEAD_AT, PALETTE } from './art';

const count = (rows: string[], ch: string) => rows.join('').split(ch).length - 1;

/** Sizes of the 4-connected clusters of `ch` in `rows`. */
function clusters(rows: string[], ch: string): number[] {
  const seen = new Set<string>();
  const sizes: number[] = [];
  rows.forEach((row, y0) =>
    [...row].forEach((c, x0) => {
      if (c !== ch || seen.has(`${x0},${y0}`)) return;
      let size = 0;
      const todo = [[x0, y0]];
      seen.add(`${x0},${y0}`);
      while (todo.length) {
        const [x, y] = todo.pop()!;
        size++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x! + dx!;
          const ny = y! + dy!;
          if (rows[ny]?.[nx] === ch && !seen.has(`${nx},${ny}`)) {
            seen.add(`${nx},${ny}`);
            todo.push([nx, ny]);
          }
        }
      }
      sizes.push(size);
    }),
  );
  return sizes;
}

/** Perceived brightness 0..255 of a #rrggbb colour. */
function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

describe('skater art at game scale', () => {
  it('uses a neutral light grey and a clearly darker grey for the salt-and-pepper hair', () => {
    const light = parseInt(PALETTE.H.slice(1), 16);
    const [r, g, b] = [light >> 16, (light >> 8) & 255, light & 255];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
    expect(luma(PALETTE.H)).toBeGreaterThan(165);
    expect(luma(PALETTE.H) - luma(PALETTE.h)).toBeGreaterThan(90);
  });

  it('shows bold hair below the cap: separate light-grey patches over a dark base in every face frame', () => {
    BODY_FRAMES.forEach((frame, i) => {
      if (!HEAD_AT[i]) return;
      expect(count(frame, 'H'), `frame ${i}`).toBeGreaterThanOrEqual(12);
      expect(count(frame, 'h'), `frame ${i}`).toBeGreaterThanOrEqual(7);
      const patches = clusters(frame, 'H').filter((size) => size >= 3);
      expect(patches.length, `frame ${i}`).toBeGreaterThanOrEqual(3);
    });
  });

  it('gives the chill face a red eye with a dark red lower lid line', () => {
    CHILL_BODY_FRAMES.forEach((frame, i) => {
      if (!HEAD_AT[i]) return;
      expect(count(frame, 'e'), `frame ${i}`).toBeGreaterThanOrEqual(1);
      expect(count(frame, 'E'), `frame ${i}`).toBeGreaterThanOrEqual(2);
      expect(frame.join(''), `frame ${i}`).toMatch(/[pe]/);
    });
  });
});
