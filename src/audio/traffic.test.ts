import { describe, expect, it } from 'vitest';
import { TRAFFIC, TrafficNoise } from './traffic';

/** Runs `ticks` updates at 60 Hz from `start` seconds; returns the levels sent and the honk count. */
function run(noise: TrafficNoise, ticks: number, density: number, active = true, start = 0) {
  const sent: number[] = [];
  let honks = 0;
  for (let i = 0; i < ticks; i++) {
    const step = noise.update(density, active, start + i / 60);
    if (step.level !== null) sent.push(step.level);
    if (step.honk) honks++;
  }
  return { sent, honks };
}

describe('traffic noise: rumble level', () => {
  it('rises smoothly towards the density instead of jumping', () => {
    const noise = new TrafficNoise();
    const { sent } = run(noise, 120, 1);
    expect(sent[0]).toBeGreaterThan(0);
    expect(sent[0]).toBeLessThan(0.2);
    for (let i = 1; i < sent.length; i++) expect(sent[i]).toBeGreaterThanOrEqual(sent[i - 1]!);
    expect(noise.level).toBeGreaterThan(0.95);
  });

  it('follows a partial density', () => {
    const noise = new TrafficNoise();
    run(noise, 180, 0.4);
    expect(noise.level).toBeCloseTo(0.4, 2);
  });

  it('fades out smoothly when the density drops and ends at exactly 0', () => {
    const noise = new TrafficNoise();
    run(noise, 180, 1);
    const { sent } = run(noise, 300, 0, true, 3);
    expect(sent[0]).toBeGreaterThan(0.8);
    expect(sent.at(-1)).toBe(0);
    expect(noise.level).toBe(0);
  });

  it('sends nothing while nothing changes (no backend call per tick)', () => {
    const noise = new TrafficNoise();
    expect(run(noise, 60, 0).sent).toEqual([]);
    run(noise, 300, 1);
    expect(run(noise, 60, 1, true, 5).sent).toEqual([]);
  });

  it('only sends noticeable steps', () => {
    const noise = new TrafficNoise();
    const { sent } = run(noise, 600, 1);
    for (let i = 1; i < sent.length; i++) expect(Math.abs(sent[i]! - sent[i - 1]!)).toBeGreaterThanOrEqual(TRAFFIC.minStep);
  });

  it('goes silent at once when inactive (pause, mute, game over)', () => {
    const noise = new TrafficNoise();
    run(noise, 180, 1);
    const step = noise.update(1, false, 3);
    expect(step.level).toBe(0);
    expect(step.honk).toBe(false);
    expect(noise.level).toBe(0);
    expect(run(noise, 60, 1, false, 3).sent).toEqual([]);
  });

  it('clamps out-of-range densities', () => {
    const noise = new TrafficNoise();
    run(noise, 600, 3);
    expect(noise.level).toBeLessThanOrEqual(1);
    run(noise, 600, -1, true, 10);
    expect(noise.level).toBe(0);
  });
});

describe('traffic noise: honks', () => {
  it('honks now and then at high density', () => {
    const { honks } = run(new TrafficNoise(), 60 * 60, 1);
    expect(honks).toBeGreaterThanOrEqual(6);
    expect(honks).toBeLessThanOrEqual(60 / TRAFFIC.honkSlot);
  });

  it('never honks at low density, while inactive or outside Mitte', () => {
    expect(run(new TrafficNoise(), 60 * 60, TRAFFIC.honkDensity - 0.05).honks).toBe(0);
    expect(run(new TrafficNoise(), 60 * 60, 1, false).honks).toBe(0);
    expect(run(new TrafficNoise(), 60 * 60, 0).honks).toBe(0);
  });

  it('is deterministic for the same run time', () => {
    const a = run(new TrafficNoise(), 60 * 30, 1);
    const b = run(new TrafficNoise(), 60 * 30, 1);
    expect(a.honks).toBe(b.honks);
  });

  it('honks at most once per slot', () => {
    const noise = new TrafficNoise();
    let last = -Infinity;
    for (let i = 0; i < 60 * 60; i++) {
      const t = i / 60;
      if (noise.update(1, true, t).honk) {
        expect(t - last).toBeGreaterThan(TRAFFIC.honkSlot * 0.99);
        last = t;
      }
    }
  });
});

describe('traffic noise: a new run', () => {
  it('honks in the first slot of a new run even if the last run ended in that slot', () => {
    const fresh = run(new TrafficNoise(), 60, 1, true, 0).honks;
    const noise = new TrafficNoise();
    run(noise, 60, 1, true, 0);
    noise.reset();
    expect(run(noise, 60, 1, true, 0).honks).toBe(fresh);
  });
});
