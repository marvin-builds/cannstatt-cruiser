import { describe, expect, it } from 'vitest';
import type { Cue } from './backend';
import { GLUG_LENGTH, GRIND, GULP_AT, MASTER_GAIN, SOUNDS, TRAFFIC_RUMBLE, stuntStepPitch } from './sounds';
import { PASS_CUES } from './passby';
import { TRAFFIC, TRAFFIC_CUES } from './traffic';

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

describe('sounds: stunt lines', () => {
  const peak = (cue: Cue) => Math.max(...SOUNDS[cue].map((v) => v.gain));
  const tonal = (cue: Cue) => SOUNDS[cue].filter((v) => v.wave !== 'noise').sort((a, b) => a.at - b.at);

  it('launches with a springy whoosh that sweeps up', () => {
    const voices = tonal('launch');
    const end = voices.reduce((last, v) => (v.at + v.dur > last.at + last.dur ? v : last));
    expect(end.to!).toBeGreaterThan(3 * voices[0].freq);
    expect(SOUNDS.launch.some((v) => v.wave === 'noise')).toBe(true);
  });

  it('climbs a scale with every step of the line, starting at the plain note', () => {
    expect(stuntStepPitch(1)).toBe(1);
    for (let step = 2; step <= 10; step++) expect(stuntStepPitch(step)).toBeGreaterThan(stuntStepPitch(step - 1));
  });

  it('keeps the climb in a pleasant range for very long lines', () => {
    expect(stuntStepPitch(0)).toBe(1);
    expect(stuntStepPitch(100)).toBeLessThanOrEqual(4);
  });

  it('ends a completed line with a fanfare that finishes on its highest note', () => {
    const notes = tonal('stuntFanfare');
    const top = Math.max(...notes.map((v) => v.freq));
    expect(notes.at(-1)!.freq).toBe(top);
  });

  it('lets a dropped line fade with a soft falling blip, quieter than the fanfare', () => {
    const notes = tonal('stuntFizzle');
    expect(notes.at(-1)!.freq).toBeLessThan(notes[0].freq);
    expect(peak('stuntFizzle')).toBeLessThan(peak('stuntFanfare'));
  });
});

describe('sounds: air trick and big drops', () => {
  const tonal = (cue: Cue) => SOUNDS[cue].filter((v) => v.wave !== 'noise').sort((a, b) => a.at - b.at);
  const end = (cue: Cue) => Math.max(...SOUNDS[cue].map((v) => v.at + v.dur));
  const lowest = (cue: Cue) => Math.min(...tonal(cue).map((v) => Math.min(v.freq, v.to ?? v.freq)));

  it('spins with a quick fwip-fwip: two separate sweeping swishes', () => {
    const swishes = SOUNDS.airSpin.filter((v) => v.wave === 'noise');
    expect(soundingSpans(swishes)).toHaveLength(2);
    for (const v of swishes) expect(v.to).not.toBe(v.freq);
    expect(end('airSpin')).toBeLessThanOrEqual(0.4);
  });

  it('pings brightly on a made air trick, ending on its highest note', () => {
    const notes = tonal('airTrick');
    const top = Math.max(...notes.map((v) => v.freq));
    expect(top).toBeGreaterThanOrEqual(1000);
    expect(notes.at(-1)!.freq).toBe(top);
    expect(end('airTrick')).toBeLessThanOrEqual(0.6);
  });

  it('adds a deeper, longer boom under the landing thud for big drops', () => {
    expect(lowest('landHeavy')).toBeLessThan(lowest('land'));
    expect(end('landHeavy')).toBeGreaterThan(end('land'));
  });
});

/**
 * Worst-case level of cues started together: every voice counts at its peak
 * gain (times the cue's intensity) for as long as it sounds, so the loudest
 * moment is where most voices overlap. A waveform peaks at 1, so after the
 * master gain this must stay below 1 or the output can clip.
 */
function summedPeak(cues: { cue: Cue; intensity?: number; delay?: number }[]): number {
  const voices = cues.flatMap(({ cue, intensity = 1, delay = 0 }) =>
    SOUNDS[cue].map((v) => ({ start: v.at + delay, end: v.at + delay + v.dur, gain: v.gain * intensity })),
  );
  return Math.max(...voices.map(({ start }) => voices.filter((v) => v.start <= start && start < v.end).reduce((sum, v) => sum + v.gain, 0)));
}

describe('sounds: stunt mix headroom', () => {
  /** Output level (after the master gain) the loudest stunt moment may reach: about 1 dB below clipping. */
  const HEADROOM = 0.9;
  const grind = GRIND.noise.gain + GRIND.buzz.gain;
  const { noise, hiss, drone } = TRAFFIC_RUMBLE;
  /** Full Mitte rumble, ducked as it is under every gameplay sound. */
  const duckedTraffic = (noise.gain + hiss.gain + drone.gain + drone.throbDepth) * TRAFFIC.duckTo;
  const out = (oneShots: number, loops: number) => (oneShots + loops) * MASTER_GAIN;

  it('keeps a kicker take-off with the spin starting at once under the clipping level', () => {
    const level = summedPeak([{ cue: 'launch' }, { cue: 'stuntStep' }, { cue: 'airSpin' }]);
    expect(out(level, duckedTraffic)).toBeLessThanOrEqual(HEADROOM);
  });

  it('keeps an air trick caught on a ledge (grind loop on) under the clipping level', () => {
    const level = summedPeak([{ cue: 'airTrick' }, { cue: 'stuntStep' }, { cue: 'land' }]);
    expect(out(level, grind + duckedTraffic)).toBeLessThanOrEqual(HEADROOM);
  });

  it('keeps a big-drop landing that finishes the line with a trick under the clipping level', () => {
    const level = summedPeak([
      { cue: 'land' },
      { cue: 'landHeavy' },
      { cue: 'airTrick' },
      { cue: 'stuntStep' },
      { cue: 'stuntFanfare' },
    ]);
    expect(out(level, grind + duckedTraffic)).toBeLessThanOrEqual(HEADROOM);
  });
});
