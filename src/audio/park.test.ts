import { describe, expect, it } from 'vitest';
import type { ParkPlan } from '../types';
import { TRAFFIC } from './traffic';
import { PARK, PARK_CUES, ParkSound, ambienceLevel, boomboxAt, boomboxLevel, cheerCue, cheerIntensity, isParkCue } from './park';

const PLAN: ParkPlan = {
  start: 2000,
  end: 2400,
  pieces: [
    { kind: 'bank', from: 2020, to: 2060, height: 12 },
    { kind: 'container', from: 2120, to: 2200, height: 30 },
    { kind: 'crane', from: 2260, to: 2340, height: 50 },
  ],
};

describe('park audio: boombox position', () => {
  it('stands on the container', () => {
    expect(boomboxAt(PLAN)).toBe(2160);
  });

  it('falls back to the middle of the park without a container', () => {
    expect(boomboxAt({ ...PLAN, pieces: [] })).toBe(2200);
  });
});

describe('park audio: levels by distance', () => {
  it('are 0 without a park', () => {
    expect(ambienceLevel(null, 2000)).toBe(0);
    expect(boomboxLevel(null, 2000)).toBe(0);
  });

  it('are 0 far before and far behind the park', () => {
    for (const d of [0, PLAN.start - PARK.ambience.ahead - 1, PLAN.end + PARK.ambience.behind + 1]) {
      expect(ambienceLevel(PLAN, d)).toBe(0);
    }
    for (const d of [0, boomboxAt(PLAN) - PARK.boombox.ahead - 1, boomboxAt(PLAN) + PARK.boombox.behind + 1]) {
      expect(boomboxLevel(PLAN, d)).toBe(0);
    }
  });

  it('rise steadily on approach and fade behind the skater', () => {
    const at = boomboxAt(PLAN);
    let lastAmb = 0;
    let lastBox = 0;
    for (let d = PLAN.start - PARK.ambience.ahead; d <= at; d += 10) {
      const amb = ambienceLevel(PLAN, d);
      const box = boomboxLevel(PLAN, d);
      expect(amb).toBeGreaterThanOrEqual(lastAmb);
      expect(box).toBeGreaterThanOrEqual(lastBox);
      lastAmb = amb;
      lastBox = box;
    }
    for (let d = at; d <= PLAN.end + PARK.ambience.behind; d += 10) {
      const amb = ambienceLevel(PLAN, d);
      const box = boomboxLevel(PLAN, d);
      expect(amb).toBeLessThanOrEqual(lastAmb);
      expect(box).toBeLessThanOrEqual(lastBox);
      lastAmb = amb;
      lastBox = box;
    }
  });

  it('are full inside the park and loudest at the boombox', () => {
    expect(ambienceLevel(PLAN, PLAN.start)).toBe(1);
    expect(ambienceLevel(PLAN, PLAN.end)).toBe(1);
    expect(boomboxLevel(PLAN, boomboxAt(PLAN))).toBe(1);
    expect(boomboxLevel(PLAN, PLAN.start)).toBeLessThan(1);
    expect(ambienceLevel(PLAN, PLAN.start - 100)).toBeGreaterThan(0);
    expect(ambienceLevel(PLAN, PLAN.start - 100)).toBeLessThan(1);
  });
});

describe('park audio: ParkSound', () => {
  const tick = (sound: ParkSound, distance: number, active = true, duck = 1, park: ParkPlan | null = PLAN) =>
    sound.update(park, distance, active, distance / 190, duck);

  it('sends the levels while playing near the park', () => {
    const sound = new ParkSound();
    const step = tick(sound, boomboxAt(PLAN));
    expect(step.ambience).toBeGreaterThan(0.5);
    expect(step.boombox).toBeGreaterThan(0.5);
    expect(sound.sounding).toBe(true);
  });

  it.each([
    ['inactive (paused, muted, game over)', false, PLAN],
    ['without a park', true, null],
  ] as const)('drops to 0 when %s', (_name, active, park) => {
    const sound = new ParkSound();
    tick(sound, boomboxAt(PLAN));
    const step = tick(sound, boomboxAt(PLAN), active, 1, park);
    expect(step.ambience).toBe(0);
    expect(step.boombox).toBe(0);
    expect(sound.sounding).toBe(false);
  });

  it('keeps fading out behind the skater after gameplay cleared the passed park', () => {
    const sound = new ParkSound();
    tick(sound, PLAN.end);
    const step = tick(sound, PLAN.end + 60, true, 1, null);
    expect(step.ambience).toBeGreaterThan(0);
    expect(tick(sound, PLAN.end + PARK.ambience.behind + 1, true, 1, null).ambience).toBe(0);
    sound.reset();
    expect(tick(sound, PLAN.end + 60, true, 1, null).ambience).toBeNull();
  });

  it('sends nothing when the levels barely change', () => {
    const sound = new ParkSound();
    tick(sound, boomboxAt(PLAN));
    const step = tick(sound, boomboxAt(PLAN));
    expect(step.ambience).toBeNull();
    expect(step.boombox).toBeNull();
  });

  it('dips under gameplay sounds (the traffic duck) but never goes silent', () => {
    const sound = new ParkSound();
    const full = tick(sound, boomboxAt(PLAN)).boombox!;
    const ducked = tick(sound, boomboxAt(PLAN), true, TRAFFIC.duckTo).boombox!;
    expect(ducked).toBeLessThan(full);
    expect(ducked).toBeGreaterThan(full * 0.5);
  });

  it('plays occasional rolling wheels, board clacks and laughter only near the park', () => {
    const sound = new ParkSound();
    const heard = new Set<string>();
    for (let t = 0; t < 30; t += 1 / 60) {
      const step = sound.update(PLAN, PLAN.start + 100, true, t, 1);
      if (step.cue) heard.add(step.cue);
    }
    expect([...heard].sort()).toEqual([...PARK_CUES].sort());

    const far = new ParkSound();
    for (let t = 0; t < 30; t += 1 / 60) expect(far.update(PLAN, 0, true, t, 1).cue).toBeNull();
    const paused = new ParkSound();
    for (let t = 0; t < 30; t += 1 / 60) expect(paused.update(PLAN, PLAN.start, false, t, 1).cue).toBeNull();
  });

  it('marks its ambient cues so they never duck the other sounds', () => {
    for (const cue of PARK_CUES) expect(isParkCue(cue)).toBe(true);
    expect(isParkCue('jump')).toBe(false);
  });
});

describe('park audio: cheering', () => {
  it('grows with the session level: more voices and louder', () => {
    expect(cheerIntensity(1)).toBeGreaterThan(cheerIntensity(0.5));
    expect(cheerIntensity(0.5)).toBeGreaterThan(cheerIntensity(0));
    expect(cheerIntensity(0)).toBeGreaterThan(0);
    expect(cheerIntensity(2)).toBeLessThanOrEqual(1);
    expect(cheerCue(0.1)).toBe('cheerSmall');
    expect(cheerCue(0.5)).toBe('cheerMid');
    expect(cheerCue(0.95)).toBe('cheerBig');
  });
});
