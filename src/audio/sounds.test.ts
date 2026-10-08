import { describe, expect, it } from 'vitest';
import type { Cue } from './backend';
import { GLUG_LENGTH, GULP_AT, SOUNDS } from './sounds';
import { PASS_CUES } from './passby';
import { TRAFFIC_CUES } from './traffic';

/** Merged [start, end] intervals in which any of the voices sounds. */
function soundingSpans(voices: { at: number; dur: number }[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const v of [...voices].sort((a, b) => a.at - b.at)) {
    const last = spans.at(-1);
    if (last && v.at <= last[1]) last[1] = Math.max(last[1], v.at + v.dur);
    else spans.push([v.at, v.at + v.dur]);
  }
  return spans;
}

describe('sounds: drinking', () => {
  it('has three distinct gulps with a pause between them before the aah', () => {
    const gulps = SOUNDS.glug.filter((v) => v.at < GLUG_LENGTH - 0.3);
    const spans = soundingSpans(gulps);
    expect(spans).toHaveLength(3);
    const last = SOUNDS.glug.reduce((end, v) => Math.max(end, v.at + v.dur), 0);
    expect(last).toBeGreaterThan(0.9);
    expect(last).toBeLessThanOrEqual(GLUG_LENGTH + 0.05);
  });
});

describe('sounds: drinking in step with the player', () => {
  // The player starts the drink animation on the itemUsed tick: lift for 0.10 s,
  // then each gulp (tip 0.18 s + level 0.10 s), and tosses the mug at 0.94 s.
  it('starts the three gulps when the player tips the mug', () => {
    expect(GULP_AT).toEqual([0.1, 0.38, 0.66]);
    const starts = soundingSpans(SOUNDS.glug.filter((v) => v.at < 0.9)).map(([start]) => start);
    for (const [i, at] of GULP_AT.entries()) expect(starts[i]).toBeCloseTo(at, 5);
  });

  it('says aah only once the mug is down, at the toss', () => {
    const aah = Math.min(...SOUNDS.glug.filter((v) => v.at > 0.8).map((v) => v.at));
    expect(aah).toBeGreaterThanOrEqual(0.94);
    expect(aah).toBeLessThan(1.05);
  });
});

describe('sounds: every cue', () => {
  it('has voices with sane timing and gain', () => {
    for (const voices of Object.values(SOUNDS)) {
      expect(voices.length).toBeGreaterThan(0);
      for (const v of voices) {
        expect(v.at).toBeGreaterThanOrEqual(0);
        expect(v.dur).toBeGreaterThan(0);
        expect(v.gain).toBeGreaterThan(0);
        expect(v.gain).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('sounds: traffic stays under the gameplay sounds', () => {
  const peak = (cue: Cue) => Math.max(...SOUNDS[cue].map((v) => v.gain));

  it('keeps every horn and truck voice below the jump, crash and item sounds', () => {
    const gameplay = Math.min(peak('jump'), peak('crash'), peak('catch') * 2, peak('star') * 2);
    for (const cue of TRAFFIC_CUES) expect(peak(cue)).toBeLessThanOrEqual(gameplay);
  });

  it('fades the passing truck in and out slowly (a whoosh, not a click)', () => {
    for (const v of SOUNDS.truckPass) expect(v.attack ?? 0).toBeGreaterThanOrEqual(0.05);
  });
});

describe('sounds: vehicles passing by', () => {
  const peak = (cue: Cue) => Math.max(...SOUNDS[cue].map((v) => v.gain));
  const end = (cue: Cue) => Math.max(...SOUNDS[cue].map((v) => v.at + v.dur));
  /** Lowest engine pitch of a cue (its tonal voices). */
  const pitch = (cue: Cue) => Math.min(...SOUNDS[cue].filter((v) => v.wave !== 'noise').map((v) => Math.min(v.freq, v.to ?? v.freq)));

  it('stays under the gameplay sounds and the horns', () => {
    const quietest = Math.min(peak('jump'), peak('crash'), peak('honk'));
    for (const cue of PASS_CUES) expect(peak(cue)).toBeLessThanOrEqual(quietest);
  });

  it('swells in and fades out (a whoosh, not a click) within about a second', () => {
    for (const cue of PASS_CUES) {
      for (const v of SOUNDS[cue]) expect(v.attack ?? 0).toBeGreaterThanOrEqual(0.02);
      expect(end(cue)).toBeGreaterThan(0.5);
      expect(end(cue)).toBeLessThanOrEqual(1.4);
    }
  });

  it('rises in pitch while approaching and drops as it drives away (Doppler)', () => {
    for (const cue of PASS_CUES) {
      const engine = SOUNDS[cue].filter((v) => v.wave !== 'noise' && v.to !== undefined).sort((a, b) => a.at - b.at);
      expect(engine.some((v) => v.to! > v.freq)).toBe(true);
      const last = engine.at(-1)!;
      expect(last.to!).toBeLessThan(last.freq);
    }
  });

  it('sounds higher for a car, lower for a van and deep for a bus or truck', () => {
    expect(pitch('passCar')).toBeGreaterThan(pitch('passVan'));
    expect(pitch('passVan')).toBeGreaterThan(pitch('passBus'));
    expect(pitch('passVan')).toBeGreaterThan(pitch('passTruck'));
  });

  it('gives buses and trucks a diesel rattle (a very low square)', () => {
    for (const cue of ['passBus', 'passTruck'] as const) {
      expect(SOUNDS[cue].some((v) => v.wave === 'square' && v.freq < 50)).toBe(true);
    }
    for (const cue of ['passCar', 'passVan'] as const) {
      expect(SOUNDS[cue].some((v) => v.wave === 'square' && v.freq < 50)).toBe(false);
    }
  });
});
