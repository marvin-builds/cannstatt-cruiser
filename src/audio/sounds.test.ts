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

  /** The sting: the steady (unswept) tonal notes of a cue, in order, one per start time. */
  const sting = (cue: Cue) => [...new Set(tonal(cue).filter((v) => v.to === undefined).map((v) => v.at))].map((at) => Math.max(...tonal(cue).filter((v) => v.at === at && v.to === undefined).map((v) => v.freq)));

  it.each(['airTrick', 'airTrickBig'] as const)('lands the kickflip %s with a flip whoosh, then a crisp catch click', (cue) => {
    const noise = SOUNDS[cue].filter((v) => v.wave === 'noise').sort((a, b) => a.at - b.at);
    const whoosh = noise[0];
    const click = noise.find((v) => v.dur <= 0.03 && v.at > whoosh.at)!;
    expect(whoosh.dur).toBeGreaterThanOrEqual(0.08);
    expect(whoosh.to).not.toBe(whoosh.freq);
    expect(click).toBeDefined();
    expect(click.freq).toBeGreaterThanOrEqual(2000);
  });

  it.each(['airTrick', 'airTrickBig'] as const)('rings the kickflip %s out in a bright 2-3 note sting on its highest note', (cue) => {
    const notes = sting(cue);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(notes.length).toBeLessThanOrEqual(3);
    expect(notes.at(-1)).toBe(Math.max(...notes));
    expect(notes.at(-1)!).toBeGreaterThanOrEqual(1000);
    expect(end(cue)).toBeLessThanOrEqual(0.8);
  });

  it('gives the kickflip its own melody, unlike the grind trick, star and stunt sounds', () => {
    const melody = (cue: Cue) => sting(cue).map(Math.round).join();
    for (const other of ['trick', 'trickBig', 'star', 'stuntStep', 'stuntFanfare', 'airSpin'] as const) {
      expect(melody('airTrick')).not.toBe(melody(other));
      expect(melody('airTrickBig')).not.toBe(melody(other));
    }
  });

  it('makes the launch kickflip slightly bigger: more notes, longer and reaching higher', () => {
    expect(sting('airTrickBig').length).toBeGreaterThan(sting('airTrick').length);
    expect(end('airTrickBig')).toBeGreaterThan(end('airTrick'));
    expect(Math.max(...sting('airTrickBig'))).toBeGreaterThanOrEqual(Math.max(...sting('airTrick')));
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

  it.each(['airTrick', 'airTrickBig'] as const)('keeps a kickflip (%s) caught on a ledge (grind loop on) under the clipping level', (cue) => {
    const level = summedPeak([{ cue }, { cue: 'stuntStep' }, { cue: 'land' }]);
    expect(out(level, grind + duckedTraffic)).toBeLessThanOrEqual(HEADROOM);
  });

  it('keeps a big-drop landing that finishes the line with a trick under the clipping level', () => {
    const level = summedPeak([
      { cue: 'land' },
      { cue: 'landHeavy' },
      { cue: 'airTrickBig' },
      { cue: 'stuntStep' },
      { cue: 'stuntFanfare' },
    ]);
    expect(out(level, grind + duckedTraffic)).toBeLessThanOrEqual(HEADROOM);
  });
});

describe('sounds: kickflip bail clatter', () => {
  const end = (cue: Cue) => Math.max(...SOUNDS[cue].map((v) => v.at + v.dur));
  const peak = (cue: Cue) => Math.max(...SOUNDS[cue].map((v) => v.gain));

  it('clatters the board in a few short separate wooden knocks, quieter than the crash', () => {
    expect(soundingSpans(SOUNDS.clatter).length).toBeGreaterThanOrEqual(3);
    expect(end('clatter')).toBeLessThanOrEqual(0.6);
    expect(peak('clatter')).toBeLessThan(peak('crash'));
  });

  it('has no voice-like low tone (no oof): every tonal knock stays above 200 Hz', () => {
    for (const v of SOUNDS.clatter.filter((v) => v.wave !== 'noise')) {
      expect(Math.min(v.freq, v.to ?? v.freq)).toBeGreaterThanOrEqual(200);
    }
  });

  it('keeps a bail (crash plus clatter) under the clipping level', () => {
    const level = summedPeak([{ cue: 'crash' }, { cue: 'clatter' }]);
    const { noise, hiss, drone } = TRAFFIC_RUMBLE;
    const duckedTraffic = (noise.gain + hiss.gain + drone.gain + drone.throbDepth) * TRAFFIC.duckTo;
    expect((level + duckedTraffic) * MASTER_GAIN).toBeLessThanOrEqual(0.9);
  });
});

describe('sounds: NorDIY park', () => {
  const end = (cue: Cue) => Math.max(...SOUNDS[cue].map((v) => v.at + v.dur));

  it('cheers with more voices and longer for more cheering', () => {
    expect(SOUNDS.cheerMid.length).toBeGreaterThan(SOUNDS.cheerSmall.length);
    expect(SOUNDS.cheerBig.length).toBeGreaterThan(SOUNDS.cheerMid.length);
    expect(end('cheerMid')).toBeGreaterThan(end('cheerSmall'));
    expect(end('cheerBig')).toBeGreaterThan(end('cheerMid'));
    expect(end('sessionRoar')).toBeGreaterThanOrEqual(end('cheerBig'));
  });

  it('keeps the ambient park one-shots quiet and short', () => {
    for (const cue of ['parkRoll', 'parkClack', 'parkLaugh'] as const) {
      expect(Math.max(...SOUNDS[cue].map((v) => v.gain))).toBeLessThanOrEqual(0.2);
      expect(end(cue)).toBeLessThan(1.5);
    }
  });

  it('claps the high five as one short, crisp hit', () => {
    expect(end('highFive')).toBeLessThan(0.25);
    expect(SOUNDS.highFive.some((v) => v.wave === 'noise')).toBe(true);
  });
});
