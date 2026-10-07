import { describe, expect, it } from 'vitest';
import { Crossfade, CROSSFADE_TIME } from './crossfade';

describe('Crossfade', () => {
  it('shows one zone fully when idle', () => {
    const fade = new Crossfade(1);
    expect(fade.active).toBe(false);
    expect(fade.to).toBe(1);
    expect(fade.progress).toBe(1);
  });

  it('runs from the old to the new zone over CROSSFADE_TIME', () => {
    const fade = new Crossfade(0);
    fade.start(1);
    expect(fade.active).toBe(true);
    expect(fade.from).toBe(0);
    expect(fade.to).toBe(1);
    expect(fade.progress).toBe(0);
    fade.update(CROSSFADE_TIME / 2);
    expect(fade.progress).toBeCloseTo(0.5);
    fade.update(CROSSFADE_TIME);
    expect(fade.active).toBe(false);
    expect(fade.progress).toBe(1);
  });

  it('restarts from the zone it was fading to when retargeted', () => {
    const fade = new Crossfade(0);
    fade.start(1);
    fade.update(CROSSFADE_TIME / 4);
    fade.start(2);
    expect(fade.from).toBe(1);
    expect(fade.to).toBe(2);
    expect(fade.progress).toBe(0);
  });

  it('ignores a start towards the zone already shown', () => {
    const fade = new Crossfade(2);
    fade.start(2);
    expect(fade.active).toBe(false);
  });

  it('snaps without a transition', () => {
    const fade = new Crossfade(0);
    fade.start(1);
    fade.snap(0);
    expect(fade.active).toBe(false);
    expect(fade.to).toBe(0);
  });
});
