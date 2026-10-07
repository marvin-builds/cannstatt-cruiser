import { describe, expect, it } from 'vitest';
import { rowsFromString } from '../core/sprite-data';
import { B, HEAD_AT, HEAD_MOUTH } from './art';
import { BUBBLE_ART, BUBBLE_PERIOD, BUBBLE_POP_TIME, bubbleFrame, chillBubble, F } from './bubble';
import { TIMELINES, type TimelineName } from './poses';

const sample = (period: number, n: number) => Array.from({ length: n }, (_, i) => (i / n) * period);

describe('bubble gum animation (kid mode chill look)', () => {
  it('is a pure, looping function of time', () => {
    for (const t of [0, 0.37, 1.2, 2.05]) {
      expect(bubbleFrame(t)).toBe(bubbleFrame(t));
      expect(bubbleFrame(t + BUBBLE_PERIOD)).toBe(bubbleFrame(t));
    }
  });

  it('chews, then grows the bubble frame by frame, pops it and starts over', () => {
    const frames = sample(BUBBLE_PERIOD, 240).map(bubbleFrame);
    const order = frames.filter((f, i) => f !== null && f !== frames[i - 1]);
    const grown = order.indexOf(F.bubble4);
    expect(order.slice(order.indexOf(F.bubble1), grown + 1)).toEqual([F.bubble1, F.bubble2, F.bubble3, F.bubble4]);
    expect(order[grown + 1]).toBe(F.pop);
    expect(frames).toContain(F.gum);
    // It grows slowly: the growth takes more than half of the cycle.
    const growing = frames.filter((f) => f !== null && f >= F.bubble1 && f <= F.bubble4).length;
    expect(growing / frames.length).toBeGreaterThan(0.5);
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
  const names = (Object.keys(TIMELINES) as TimelineName[]).filter((n) => n !== 'crash');
  const grownAt = sample(BUBBLE_PERIOD, 240).find((t) => bubbleFrame(t) === F.bubble4)!;

  it('blows the bubble in front of the mouth in every pose but the crash (incl. duck, grind, air)', () => {
    for (const name of names) {
      for (const step of TIMELINES[name].steps) {
        const bubble = chillBubble(name, step.body, grownAt, 0);
        const head = HEAD_AT[step.body]!;
        expect(bubble, `${name} body ${step.body}`).toMatchObject({ frame: F.bubble4, x: head.x + HEAD_MOUTH.x + 1 });
        const rows = rowsFromString(BUBBLE_ART[F.bubble4]!);
        const mouthY = head.y + HEAD_MOUTH.y;
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
});
