import { describe, expect, it } from 'vitest';
import { drunkLook } from './wobble';

const DT = 1 / 60;
const sample = (from: number, seconds: number) =>
  Array.from({ length: Math.round(seconds / DT) }, (_, i) => drunkLook(5, from + i * DT)!);

describe('drunk wobble (state.drunkTimer > 0)', () => {
  it('shows nothing while sober', () => {
    expect(drunkLook(0, 3)).toBeNull();
    expect(drunkLook(-1, 3)).toBeNull();
  });

  it('leans the body 1 px left and right, both ways within two seconds', () => {
    const looks = sample(0, 2);
    const leans = new Set(looks.map((l) => l.lean));
    expect([...leans].sort()).toEqual([-1, 0, 1]);
    for (const l of looks) expect(Math.abs(l.lean)).toBeLessThanOrEqual(1);
  });

  it('holds each lean for several ticks, so it reads as a sway and not as jitter', () => {
    const leans = sample(0, 4).map((l) => l.lean);
    let changes = 0;
    for (let i = 1; i < leans.length; i++) if (leans[i] !== leans[i - 1]) changes++;
    expect(leans.length / (changes + 1)).toBeGreaterThanOrEqual(6);
  });

  it('flails an arm now and then, but not most of the time', () => {
    const looks = sample(0, 6);
    const flailing = looks.filter((l) => l.flail).length / looks.length;
    expect(flailing).toBeGreaterThan(0.05);
    expect(flailing).toBeLessThan(0.35);
  });

  it('hiccups a small rising bubble now and then', () => {
    const looks = sample(0, 6);
    const rises = looks.flatMap((l) => (l.hiccup === null ? [] : [l.hiccup]));
    expect(rises.length).toBeGreaterThan(0);
    expect(rises.length).toBeLessThan(looks.length / 2);
    expect(Math.max(...rises)).toBeGreaterThan(Math.min(...rises));
  });

  it('is a pure function of the run time (deterministic replays)', () => {
    expect(sample(1.3, 3)).toEqual(sample(1.3, 3));
    expect(drunkLook(2, 4.2)).toEqual(drunkLook(6, 4.2));
  });
});
