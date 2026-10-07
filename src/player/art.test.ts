import { describe, expect, it } from 'vitest';
import { BODY_FRAMES, CHILL_BODY_FRAMES, HEAD_AT } from './art';

const count = (rows: string[], ch: string) => rows.join('').split(ch).length - 1;

/** True when `rows` contain a 2x2 block of `ch` (a cluster that still reads at 1x). */
function hasBlock(rows: string[], ch: string): boolean {
  for (let y = 0; y + 1 < rows.length; y++) {
    for (let x = 0; x + 1 < rows[y]!.length; x++) {
      if ([rows[y]![x], rows[y]![x + 1], rows[y + 1]![x], rows[y + 1]![x + 1]].every((c) => c === ch)) return true;
    }
  }
  return false;
}

describe('skater art at game scale', () => {
  it('shows salt-and-pepper hair in light-grey 2x2 patches over a dark base in every face frame', () => {
    BODY_FRAMES.forEach((frame, i) => {
      if (!HEAD_AT[i]) return;
      expect(count(frame, 'H'), `frame ${i}`).toBeGreaterThanOrEqual(8);
      expect(count(frame, 'h'), `frame ${i}`).toBeGreaterThanOrEqual(3);
      expect(hasBlock(frame, 'H'), `frame ${i}`).toBe(true);
    });
  });

  it('gives the chill face at least two red eye pixels under a dark lid', () => {
    CHILL_BODY_FRAMES.forEach((frame, i) => {
      if (HEAD_AT[i]) expect(count(frame, 'e'), `frame ${i}`).toBeGreaterThanOrEqual(2);
    });
  });
});
