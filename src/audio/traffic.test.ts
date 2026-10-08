import { describe, expect, it } from 'vitest';
import { HORN_CUES, TRAFFIC, TRAFFIC_CUES, TrafficNoise, humLevel, type TrafficCue } from './traffic';

/** Runs `ticks` updates at 60 Hz from `start` seconds; returns the levels sent and the traffic cues. */
function run(noise: TrafficNoise, ticks: number, density: number, active = true, start = 0) {
  const sent: number[] = [];
  const cues: TrafficCue[] = [];
  for (let i = 0; i < ticks; i++) {
    const step = noise.update(density, active, start + i / 60);
    if (step.level !== null) sent.push(step.level);
    if (step.cue) cues.push(step.cue);
  }
  const horns = cues.filter((c) => HORN_CUES.includes(c));
  return { sent, cues, horns: horns.length };
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

  it('follows a partial density on the hum curve', () => {
    const noise = new TrafficNoise();
    run(noise, 180, 0.4);
    expect(noise.level).toBeCloseTo(humLevel(0.4), 2);
  });

  it('makes light traffic (density 0.05) a soft but audible hum, clearly quieter than Mitte', () => {
    const light = new TrafficNoise();
    run(light, 300, 0.05);
    const mitte = new TrafficNoise();
    run(mitte, 300, 1);
    expect(light.level).toBeGreaterThanOrEqual(0.15);
    expect(light.level).toBeLessThanOrEqual(mitte.level * 0.35);
    expect(mitte.level).toBeCloseTo(1, 2);
  });

  it('maps density to a rising hum level from silence to full', () => {
    expect(humLevel(0)).toBe(0);
    expect(humLevel(1)).toBe(1);
    expect(humLevel(-1)).toBe(0);
    expect(humLevel(3)).toBe(1);
    for (let d = 0.05; d <= 1; d += 0.05) expect(humLevel(d)).toBeGreaterThan(humLevel(d - 0.05));
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
    expect(step.cue).toBeNull();
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

  it('reuses one step object (no allocation per tick)', () => {
    const noise = new TrafficNoise();
    const first = noise.update(1, true, 0);
    expect(noise.update(1, true, 1 / 60)).toBe(first);
    expect(noise.update(0, false, 2 / 60)).toBe(first);
  });
});

describe('traffic noise: ducking under gameplay sounds', () => {
  /** A noise at full Mitte traffic that has settled. */
  function settled() {
    const noise = new TrafficNoise();
    run(noise, 300, 1);
    return noise;
  }

  it('dips the rumble at once when a gameplay sound plays', () => {
    const noise = settled();
    noise.duck();
    const step = noise.update(1, true, 5);
    expect(step.level).not.toBeNull();
    expect(step.level!).toBeLessThanOrEqual(TRAFFIC.duckTo + 0.001);
  });

  it('holds the dip briefly, then glides back to full without jumps', () => {
    const noise = settled();
    noise.duck();
    const { sent } = run(noise, 90, 1, true, 5);
    expect(sent[0]).toBeLessThanOrEqual(TRAFFIC.duckTo + 0.001);
    for (let i = 1; i < sent.length; i++) {
      expect(sent[i]).toBeGreaterThanOrEqual(sent[i - 1]!);
      expect(sent[i]! - sent[i - 1]!).toBeLessThan(0.1);
    }
    expect(sent.at(-1)).toBeGreaterThan(1 - TRAFFIC.minStep);
  });

  it('a second sound during the dip extends it instead of stacking', () => {
    const noise = settled();
    noise.duck();
    run(noise, 5, 1, true, 5);
    noise.duck();
    const { sent } = run(noise, 5, 1, true, 5.1);
    for (const level of sent) expect(level).toBeGreaterThanOrEqual(TRAFFIC.duckTo - 0.001);
    expect(sent.length).toBeLessThanOrEqual(1);
  });

  it('sends nothing when silent (outside Mitte, paused)', () => {
    const noise = new TrafficNoise();
    noise.duck();
    expect(run(noise, 60, 0).sent).toEqual([]);
    noise.duck();
    expect(run(noise, 60, 1, false).sent).toEqual([]);
  });
});

describe('traffic noise: horns and passing trucks', () => {
  it('honks often at full density', () => {
    const { horns } = run(new TrafficNoise(), 60 * 60, 1);
    expect(horns).toBeGreaterThanOrEqual(15);
    expect(horns).toBeLessThanOrEqual(60 / TRAFFIC.hornSlot);
  });

  it('honks more the denser the traffic', () => {
    const mid = run(new TrafficNoise(), 60 * 120, 0.6).horns;
    const full = run(new TrafficNoise(), 60 * 120, 1).horns;
    expect(mid).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(mid * 1.5);
  });

  it('mixes car horns, deep truck or bus horns and passing trucks', () => {
    const { cues } = run(new TrafficNoise(), 60 * 120, 1);
    for (const cue of TRAFFIC_CUES) expect(cues).toContain(cue);
    const trucks = cues.filter((c) => c === 'truckPass').length;
    expect(trucks).toBeGreaterThanOrEqual(5);
    expect(trucks).toBeLessThanOrEqual(120 / TRAFFIC.truckSlot);
  });

  it('never makes a sound in thin traffic, while inactive or outside Mitte', () => {
    expect(run(new TrafficNoise(), 60 * 60, TRAFFIC.hornDensity - 0.05).cues).toEqual([]);
    expect(run(new TrafficNoise(), 60 * 60, 1, false).cues).toEqual([]);
    expect(run(new TrafficNoise(), 60 * 60, 0).cues).toEqual([]);
  });

  it('is deterministic for the same run time', () => {
    const a = run(new TrafficNoise(), 60 * 30, 1);
    const b = run(new TrafficNoise(), 60 * 30, 1);
    expect(a.cues).toEqual(b.cues);
  });

  it('honks at most once per horn slot', () => {
    const noise = new TrafficNoise();
    let last = -Infinity;
    for (let i = 0; i < 60 * 60; i++) {
      const t = i / 60;
      const cue = noise.update(1, true, t).cue;
      if (cue && HORN_CUES.includes(cue)) {
        expect(t - last).toBeGreaterThan(TRAFFIC.hornSlot * 0.99);
        last = t;
      }
    }
  });
});

describe('traffic noise: a new run', () => {
  it('sounds the same in the first seconds of a new run even if the last run ended there', () => {
    const fresh = run(new TrafficNoise(), 120, 1, true, 0).cues;
    const noise = new TrafficNoise();
    run(noise, 120, 1, true, 0);
    noise.reset();
    expect(run(noise, 120, 1, true, 0).cues).toEqual(fresh);
  });
});
