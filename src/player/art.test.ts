import { describe, expect, it } from 'vitest';
import { B, BODY_FRAMES, CHILL_BODY_FRAMES, FACE_AT, HEAD_AT, HEAD_MOUTH, PALETTE } from './art';

const count = (rows: string[], ch: string) => rows.join('').split(ch).length - 1;

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

/** Frames with the side-view head (every pose but the grind trick's turn and front view). */
const sideFaces = (i: number) => FACE_AT[i]?.view === 'side';

const faceFrames = () =>
  [BODY_FRAMES, CHILL_BODY_FRAMES].flatMap((frames) =>
    frames.flatMap((frame, i) => (sideFaces(i) ? [{ i, box: headBox(frame, HEAD_AT[i]!) }] : [])),
  );

/** Every frame with a visible head, any view, with its head box (`h` rows tall). */
const allHeads = () =>
  [BODY_FRAMES, CHILL_BODY_FRAMES].flatMap((frames) =>
    frames.flatMap((frame, i) => {
      const face = FACE_AT[i];
      return face ? [{ i, view: face.view, box: frame.slice(face.y, face.y + 9).map((row) => row.slice(face.x, face.x + 11)) }] : [];
    }),
  );

describe('skater art at game scale', () => {
  it('uses a neutral light grey for the temple and a dark base for the hair', () => {
    const light = parseInt(PALETTE.H.slice(1), 16);
    const [r, g, b] = [light >> 16, (light >> 8) & 255, light & 255];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
    expect(luma(PALETTE.H)).toBeGreaterThan(195);
    expect(luma(PALETTE.h)).toBeLessThan(80);
    expect(luma(PALETTE.H) - luma(PALETTE.h)).toBeGreaterThan(120);
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

  it('keeps the hair mostly dark with only a hint of grey at the temple, in every view', () => {
    for (const { i, view, box } of allHeads()) {
      const grey = cells(box, 'H');
      expect(grey.length, `frame ${i} (${view})`).toBeGreaterThanOrEqual(1);
      expect(grey.length, `frame ${i} (${view})`).toBeLessThanOrEqual(2);
      expect(count(box, 'h'), `frame ${i} (${view})`).toBeGreaterThanOrEqual(3 * grey.length);
      // At the temple: right under the cap (the first row below the brim).
      for (const cell of grey) expect(Number(cell.split(',')[1]), `frame ${i} ${cell}`).toBe(3);
    }
  });

  it('draws the same side head with the same hair in every side frame', () => {
    const first = faceFrames()[0]!.box;
    for (const { i, box } of faceFrames()) {
      expect(cells(box, 'H'), `frame ${i}`).toEqual(cells(first, 'H'));
      expect(cells(box, 'h'), `frame ${i}`).toEqual(cells(first, 'h'));
    }
  });

  it('shows the moustache only in the front view of the grind trick', () => {
    expect(luma(PALETTE.m)).toBeLessThan(80);
    for (const { i, view, box } of allHeads()) {
      const moustache = count(box, 'm');
      if (view !== 'front') expect(moustache, `frame ${i} (${view})`).toBe(0);
      else {
        expect(moustache, `frame ${i}`).toBeGreaterThanOrEqual(3);
        expect(moustache, `frame ${i}`).toBeLessThanOrEqual(7);
        // Under the nose, above the mouth.
        const rows = cells(box, 'm').map((c) => Number(c.split(',')[1]));
        const mouth = FACE_AT[i]!.mouth.y - FACE_AT[i]!.y;
        for (const y of rows) expect(y, `frame ${i}`).toBe(mouth - 1);
      }
    }
    expect(FACE_AT[B.grindFront]!.view).toBe('front');
    expect(FACE_AT[B.grindTurn]!.view).toBe('turn');
  });

  it('gives the front view two eyes and a mouth in the middle of the face', () => {
    const face = FACE_AT[B.grindFront]!;
    const box = headBox(BODY_FRAMES[B.grindFront]!, face);
    expect(face.mouth.x - face.x).toBe(5);
    expect(BODY_FRAMES[B.grindFront]![face.mouth.y]![face.mouth.x]).toBe('k');
    const eyeRow = box[4]!;
    expect([...eyeRow].filter((c, x) => c === 'k' && eyeRow[x - 1] === 's' && eyeRow[x + 1] === 's')).toHaveLength(2);
  });

  it('draws the same head in every normal face frame (no jitter) with a brim, one eye pixel and skin', () => {
    const heads = faceFrames().filter((_, n) => n < BODY_FRAMES.filter((__, i) => sideFaces(i)).length);
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
      if (!head || !sideFaces(i)) return;
      expect(FACE_AT[i]!.mouth).toEqual({ x: head.x + HEAD_MOUTH.x, y: head.y + HEAD_MOUTH.y });
      const mouth = frame[head.y + HEAD_MOUTH.y]![head.x + HEAD_MOUTH.x];
      expect(mouth, `frame ${i}`).toMatch(/[ks]/);
      // Nose: skin right above the mouth that sticks out in front of it.
      expect(frame[head.y + HEAD_MOUTH.y - 1]![head.x + HEAD_MOUTH.x + 1], `frame ${i}`).toBe('s');
      expect(frame[head.y + HEAD_MOUTH.y]![head.x + HEAD_MOUTH.x + 1], `frame ${i}`).toBe('.');
    });
  });
});
