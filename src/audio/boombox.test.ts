import { describe, expect, it } from 'vitest';
import { BOOMBOX, loopSeconds, renderBoombox } from './boombox';

describe('boombox loop', () => {
  it('is a short chill loop of a few bars', () => {
    expect(BOOMBOX.bpm).toBeGreaterThanOrEqual(85);
    expect(BOOMBOX.bpm).toBeLessThanOrEqual(95);
    expect(BOOMBOX.bars).toBeGreaterThanOrEqual(4);
    expect(BOOMBOX.bars).toBeLessThanOrEqual(8);
    expect(loopSeconds()).toBeCloseTo((BOOMBOX.bars * 4 * 60) / BOOMBOX.bpm, 5);
  });

  it('renders exactly one loop of audible, unclipped samples', () => {
    const rate = 8000;
    const samples = renderBoombox(rate);
    expect(samples.length).toBe(Math.round(loopSeconds() * rate));
    let peak = 0;
    for (const v of samples) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('sounds the same every time', () => {
    expect(renderBoombox(4000)).toEqual(renderBoombox(4000));
  });
});
