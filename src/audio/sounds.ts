/**
 * Sound design as data: every cue is a list of short chiptune voices
 * (square / triangle / saw oscillators or filtered noise) with a pitch sweep
 * and a fast attack, exponential decay envelope. webaudio.ts plays them.
 */
import type { Cue } from './backend';

export interface Voice {
  wave: OscillatorType | 'noise';
  /** Start offset in seconds from the cue's trigger time. */
  at: number;
  /** Length in seconds (attack + decay). */
  dur: number;
  /** Start frequency in Hz (filter cutoff for noise). */
  freq: number;
  /** End frequency in Hz (exponential sweep); defaults to `freq`. */
  to?: number;
  /** Peak gain before the master gain. */
  gain: number;
  /** Optional filter, e.g. to darken noise. */
  filter?: BiquadFilterType;
}

/** Note frequencies (equal temperament, A4 = 440 Hz). */
const N = {
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  G4: 392.0,
  Gb4: 369.99,
  F4: 349.23,
  E4: 329.63,
  A4: 440.0,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  D6: 1174.66,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
  C7: 2093.0,
} as const;

/** Evenly spaced notes of one wave, e.g. an arpeggio. */
function notes(wave: OscillatorType, freqs: number[], step: number, gain: number, last = step): Voice[] {
  return freqs.map((freq, i) => ({
    wave,
    at: i * step,
    dur: i === freqs.length - 1 ? last : step * 1.1,
    freq,
    gain,
  }));
}

/** A bubble gum bubble bursting: a tiny bright click with a quick falling blip. */
const POP: Voice[] = [
  { wave: 'noise', at: 0, dur: 0.04, freq: 3500, gain: 0.3, filter: 'highpass' },
  { wave: 'square', at: 0, dur: 0.05, freq: 1400, to: 500, gain: 0.08 },
];

export const SOUNDS: Record<Cue, Voice[]> = {
  // Quick rising square blip.
  jump: [{ wave: 'square', at: 0, dur: 0.11, freq: 300, to: 720, gain: 0.22 }],
  // Held jump: a higher, airy second sweep on top of the jump blip.
  boost: [
    { wave: 'triangle', at: 0, dur: 0.16, freq: 600, to: 1300, gain: 0.3 },
    { wave: 'square', at: 0.02, dur: 0.1, freq: 1200, to: 1800, gain: 0.06 },
  ],
  // Soft thud: low triangle drop plus a dull noise tap.
  land: [
    { wave: 'triangle', at: 0, dur: 0.09, freq: 150, to: 55, gain: 0.55 },
    { wave: 'noise', at: 0, dur: 0.05, freq: 500, gain: 0.25, filter: 'lowpass' },
  ],
  // Bright major arpeggio.
  star: notes('square', [N.C6, N.E6, N.G6, N.C7], 0.045, 0.13, 0.12),
  // Short positive two-note blip.
  cleared: notes('square', [N.A5, N.D6], 0.04, 0.12, 0.07),
  // Noise burst and a falling tone.
  crash: [
    { wave: 'noise', at: 0, dur: 0.28, freq: 1800, gain: 0.5, filter: 'lowpass' },
    { wave: 'square', at: 0, dur: 0.38, freq: 420, to: 70, gain: 0.18 },
  ],
  // Sad descending jingle that ends on a long low note.
  gameOver: [
    ...notes('square', [N.G4, N.Gb4, N.F4, N.E4], 0.18, 0.12, 0.5),
    ...notes('triangle', [N.D4, N.C4, N.B3, N.C4], 0.18, 0.18, 0.5).map((v) => ({ ...v, freq: v.freq / 2 })),
  ],
  // Bumping into a person: a short, soft vocal-ish 'oof' (falling triangle with a hint of square).
  oof: [
    { wave: 'triangle', at: 0.06, dur: 0.18, freq: 330, to: 170, gain: 0.35 },
    { wave: 'square', at: 0.06, dur: 0.12, freq: 165, to: 110, gain: 0.05 },
  ],
  // Joint pickup: a lazy descending triangle arpeggio over a slow, soft 'wah' slide down.
  chill: [
    { wave: 'triangle', at: 0, dur: 0.7, freq: N.C5, to: N.C4, gain: 0.22 },
    ...notes('triangle', [N.G5, N.E5, N.C5, N.A4], 0.13, 0.12, 0.4),
  ],
  // Bubble gum pickup (kid mode): a sweet, bouncy rising major arpeggio of soft
  // triangle 'bloops' (each bends up a little), ending in the bubble's pop.
  bubble: [
    ...notes('triangle', [N.C5, N.E5, N.G5, N.C6, N.E6], 0.08, 0.2, 0.14).map((v) => ({ ...v, to: v.freq * 1.25 })),
    ...notes('square', [N.G5, N.C6], 0.08, 0.04, 0.1).map((v) => ({ ...v, at: v.at + 0.16 })),
    ...POP.map((v) => ({ ...v, at: v.at + 0.48 })),
  ],
  pop: POP,
  // Stomp bounce: a springy 'boing', a triangle that dips and shoots up with a wobbling square on top.
  boing: [
    { wave: 'triangle', at: 0, dur: 0.06, freq: 220, to: 140, gain: 0.4 },
    { wave: 'triangle', at: 0.05, dur: 0.22, freq: 140, to: 620, gain: 0.35 },
    { wave: 'square', at: 0.05, dur: 0.12, freq: 280, to: 560, gain: 0.05 },
    { wave: 'square', at: 0.17, dur: 0.1, freq: 520, to: 600, gain: 0.04 },
  ],
  // The stomped person stumbles: a two-syllable 'hop-pla', up then tumbling down, after the boing.
  hoppla: [
    { wave: 'square', at: 0.1, dur: 0.07, freq: N.E4, to: N.A4, gain: 0.08 },
    { wave: 'triangle', at: 0.1, dur: 0.07, freq: N.E4, to: N.A4, gain: 0.2 },
    { wave: 'square', at: 0.19, dur: 0.16, freq: N.C5, to: N.D4, gain: 0.07 },
    { wave: 'triangle', at: 0.19, dur: 0.16, freq: N.C5, to: N.D4, gain: 0.2 },
    { wave: 'noise', at: 0.3, dur: 0.06, freq: 600, gain: 0.12, filter: 'lowpass' },
  ],
  // Caught the tossed item: a cheerful rising arpeggio with a high sparkle on top.
  catch: [
    ...notes('square', [N.G5, N.C6, N.E6, N.G6], 0.055, 0.1, 0.16),
    { wave: 'triangle', at: 0.22, dur: 0.18, freq: N.C7, gain: 0.12 },
  ],
};

/** Grind loop: band-passed noise scrape plus a low buzzing square, fades in and out. */
export const GRIND = {
  noise: { freq: 2600, q: 1.5, gain: 0.14 },
  buzz: { freq: 82, gain: 0.05, wobbleHz: 14, wobbleDepth: 6 },
  fade: 0.04,
} as const;

/** Overall volume: chiptune square waves are loud, keep it modest. */
export const MASTER_GAIN = 0.35;
