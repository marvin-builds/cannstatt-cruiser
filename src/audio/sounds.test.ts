import { describe, expect, it } from 'vitest';
import { GLUG_LENGTH, SOUNDS } from './sounds';

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
