import { describe, expect, it } from 'vitest';
import { BODY_FRAMES, CHILL_BODY_FRAMES, HEAD_AT, HEAD_MOUTH, PALETTE } from './art';

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

/** Pixels of `frame` inside the head box of `head` (11 x 8), as rows. */
const headBox = (frame: string[], head: { x: number; y: number }) =>
  frame.slice(head.y, head.y + 8).map((row) => row.slice(head.x, head.x + 11));

/** "x,y" of every `ch` pixel in `rows`. */
const cells = (rows: string[], ch: string) =>
  rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === ch ? [`${x},${y}`] : [])));

const faceFrames = () =>
  [BODY_FRAMES, CHILL_BODY_FRAMES].flatMap((frames) =>
    frames.flatMap((frame, i) => (HEAD_AT[i] ? [{ i, box: headBox(frame, HEAD_AT[i]!) }] : [])),
  );

describe('skater art at game scale', () => {
  it('uses a neutral light grey and a clearly darker grey base for the greying hair', () => {
    const light = parseInt(PALETTE.H.slice(1), 16);
    const [r, g, b] = [light >> 16, (light >> 8) & 255, light & 255];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
    expect(luma(PALETTE.H)).toBeGreaterThan(195);
    expect(luma(PALETTE.H) - luma(PALETTE.h)).toBeGreaterThan(90);
  });

  it('keeps the face clean: no stubble colour and no hair in front of the ear', () => {
    expect(PALETTE).not.toHaveProperty('b');
    for (const frames of [BODY_FRAMES, CHILL_BODY_FRAMES]) expect(frames.join('')).not.toContain('b');
    for (const { i, box } of faceFrames()) {
      // Everything in front of the ear (columns 5..10 below the cap) is face, not hair.
      const face = box.slice(3).map((row) => row.slice(5));
      expect(face.join(''), `frame ${i}`).not.toMatch(/[hH]/);
    }
  });

  it('greys the hair as one clean continuous band under the cap and down the back, identical in every face frame', () => {
    const first = faceFrames()[0]!.box;
    const grey = cells(first, 'H');
    expect(grey.length).toBeGreaterThanOrEqual(5);
    // One 4-connected band, no scattered grey pixels.
    expect(clusters(first, 'H')).toEqual([grey.length]);
    // It runs along the whole cap edge at the side (the row right under the cap) ...
    expect(first[3]!.slice(1, 4)).toBe('HHH');
    // ... and down the back of the head.
    for (const y of [4, 5]) expect(first[y]![1], `row ${y}`).toBe('H');
    // A little dark base is left inside it, as one block.
    expect(count(first, 'h')).toBeGreaterThanOrEqual(2);
    expect(clusters(first, 'h')).toHaveLength(1);
    for (const { i, box } of faceFrames()) {
      expect(cells(box, 'H'), `frame ${i}`).toEqual(grey);
      expect(cells(box, 'h'), `frame ${i}`).toEqual(cells(first, 'h'));
    }
  });

  it('draws the same head in every normal face frame (no jitter) with a brim, one eye pixel and skin', () => {
    const heads = faceFrames().filter((_, n) => n < BODY_FRAMES.filter((__, i) => HEAD_AT[i]).length);
    const head = heads[0]!.box;
    // Compare the head's own pixels; its transparent corners may show arms or the torso.
    const opaque = (box: string[]) => box.map((row, y) => [...row].map((c, x) => (head[y]![x] === '.' ? '.' : c)).join(''));
    for (const { i, box } of heads) expect(opaque(box), `frame ${i}`).toEqual(head);
    expect(head.join('')).toContain('C');
    expect(count(head, 's')).toBeGreaterThanOrEqual(12);
    // One dark eye pixel inside the face, skin left and right of it.
    const eyes = head.slice(3, 6).flatMap((row, y) => [...row].flatMap((c, x) => (c === 'k' && row[x - 1] === 's' && row[x + 1] === 's' ? [[x, y]] : [])));
    expect(eyes).toHaveLength(1);
  });

  it('gives the chill face a red eye with a dark red lower lid line', () => {
    CHILL_BODY_FRAMES.forEach((frame, i) => {
      if (!HEAD_AT[i]) return;
      expect(count(frame, 'e'), `frame ${i}`).toBeGreaterThanOrEqual(1);
      expect(count(frame, 'E'), `frame ${i}`).toBeGreaterThanOrEqual(2);
      expect(frame.join(''), `frame ${i}`).toMatch(/[pe]/);
    });
  });

  it('puts the mouth (joint, bubble gum) on the front of the face, just under the nose', () => {
    BODY_FRAMES.forEach((frame, i) => {
      const head = HEAD_AT[i];
      if (!head) return;
      const mouth = frame[head.y + HEAD_MOUTH.y]![head.x + HEAD_MOUTH.x];
      expect(mouth, `frame ${i}`).toMatch(/[ks]/);
      // Nose: skin right above the mouth that sticks out in front of it.
      expect(frame[head.y + HEAD_MOUTH.y - 1]![head.x + HEAD_MOUTH.x + 1], `frame ${i}`).toBe('s');
      expect(frame[head.y + HEAD_MOUTH.y]![head.x + HEAD_MOUTH.x + 1], `frame ${i}`).toBe('.');
    });
  });
});
