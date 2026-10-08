import { describe, expect, it } from 'vitest';
import { rowsFromString } from '../core/sprite-data';
import { B, FACE_AT } from './art';
import { CHILL_DURATION } from '../core/chill';
import { BUBBLE_ART, BUBBLE_PERIOD, BUBBLE_POP_TIME, bubbleFrame, bubbleTime, chillBubble, F } from './bubble';
import { isCrashTimeline, TIMELINES, type TimelineName } from './poses';

const sample = (period: number, n: number) => Array.from({ length: n }, (_, i) => (i / n) * period);

describe('bubble gum animation (kid mode chill look)', () => {
  it('is a pure, looping function of time', () => {
    for (const t of [0, 0.37, 1.2, 2.05]) {
      expect(bubbleFrame(t)).toBe(bubbleFrame(t));
      expect(bubbleFrame(t + BUBBLE_PERIOD)).toBe(bubbleFrame(t));
    }
  });

  it('grows the bubble frame by frame, pops it, chews and starts over', () => {
    const frames = sample(BUBBLE_PERIOD, 240).map(bubbleFrame);
    const order = frames.filter((f, i) => f !== null && f !== frames[i - 1]);
    expect(order.slice(0, 4)).toEqual([F.bubble1, F.bubble2, F.bubble3, F.pop]);
    expect(order.slice(4)).toContain(F.gum);
    // It grows slowly: the growth takes more than half of the cycle.
    const growing = frames.filter((f) => f !== null && f >= F.bubble1 && f <= F.bubble3).length;
    expect(growing / frames.length).toBeGreaterThan(0.5);
  });

  it('starts with a readable bubble right at the pickup, not a pink fleck', () => {
    expect(bubbleTime(CHILL_DURATION)).toBe(0);
    expect(bubbleTime(CHILL_DURATION - 1.25)).toBeCloseTo(1.25);
    expect(bubbleFrame(bubbleTime(CHILL_DURATION))).toBe(F.bubble1);
    for (const f of [F.bubble1, F.bubble2, F.bubble3, F.pop]) {
      const rows = rowsFromString(BUBBLE_ART[f]!);
      expect(rows.length, `frame ${f}`).toBeGreaterThanOrEqual(4);
      expect(rows[0]!.length, `frame ${f}`).toBeGreaterThanOrEqual(4);
    }
    // The bubbles grow by one pixel per frame.
    const sizes = [F.bubble1, F.bubble2, F.bubble3].map((f) => rowsFromString(BUBBLE_ART[f]!).length);
    expect(sizes).toEqual([sizes[0], sizes[0]! + 1, sizes[0]! + 2]);
  });

  it('chews a gum lump of at least 2 x 2 px between bubbles', () => {
    const gum = rowsFromString(BUBBLE_ART[F.gum]!);
    expect(gum.length).toBeGreaterThanOrEqual(2);
    expect(gum.join('').replace(/\./g, '').length).toBeGreaterThanOrEqual(4);
  });

  it('stays a small pixel bubble', () => {
    for (const art of BUBBLE_ART) {
      const rows = rowsFromString(art);
      expect(rows.length).toBeLessThanOrEqual(6);
      for (const row of rows) expect(row.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('chillBubble placement', () => {
  const names = (Object.keys(TIMELINES) as TimelineName[]).filter((n) => !isCrashTimeline(n));
  const grownAt = sample(BUBBLE_PERIOD, 240).find((t) => bubbleFrame(t) === F.bubble3)!;

  it('blows the bubble in front of the mouth in every pose but the crash (incl. duck, grind, air)', () => {
    for (const name of names) {
      for (const step of TIMELINES[name].steps) {
        const bubble = chillBubble(name, step.body, grownAt, 0);
        const { mouth, view } = FACE_AT[step.body]!;
        const rows = rowsFromString(BUBBLE_ART[F.bubble3]!);
        // Side and turning views blow it out in front of the lips, the front view straight at the camera.
        const x = view === 'front' ? mouth.x - Math.floor(rows[0]!.length / 2) : mouth.x + 1;
        expect(bubble, `${name} body ${step.body}`).toMatchObject({ frame: F.bubble3, x });
        const mouthY = mouth.y;
        expect(bubble!.y).toBeLessThanOrEqual(mouthY);
        expect(bubble!.y + rows.length).toBeGreaterThan(mouthY);
      }
    }
  });

  it('pops the bubble right when the crash starts, then shows nothing', () => {
    const popped = chillBubble('crash', B.crashThrown, grownAt, 0);
    expect(popped?.frame).toBe(F.pop);
    expect(chillBubble('crash', B.crashThrown, grownAt, BUBBLE_POP_TIME / 2)?.frame).toBe(F.pop);
    expect(chillBubble('crash', B.crashThrown, grownAt, BUBBLE_POP_TIME)).toBeNull();
    expect(chillBubble('crash', B.crashLying, grownAt, 0.5)).toBeNull();
  });

  it('shows no bubble while the head is in the bin', () => {
    expect(chillBubble('binCrash', B.binDive, grownAt, 0)).toBeNull();
    expect(chillBubble('binCrash', B.airFall, grownAt, 0.8)).toBeNull();
  });
});
