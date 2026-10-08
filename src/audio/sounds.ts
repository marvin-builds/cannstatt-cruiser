/**
 * Sound design as data: every cue is a list of short chiptune voices
 * (square / triangle / saw oscillators or filtered noise) with a pitch (or
 * cutoff) sweep and a fast attack, exponential decay envelope. webaudio.ts plays them.
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
  /** Optional filter, e.g. to darken noise; for noise `freq` / `to` sweep its cutoff. */
  filter?: BiquadFilterType;
  /** Attack in seconds (default 5 ms); long for swells like a passing truck. */
  attack?: number;
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

/**
 * When each gulp starts, in seconds after itemUsed: the player starts the drink
 * animation on that tick, lifts the mug for 0.10 s, then tips it every 0.28 s
 * (player/use.ts), and tosses the empty mug at 0.94 s, when the 'aah' follows.
 */
export const GULP_AT = [0.1, 0.38, 0.66] as const;
/** Start of the 'aah', just after the player tosses the empty mug. */
const AAH_AT = 0.98;
/** Drinking the Maßkrug: three gulps (one per player gulp) and a friendly 'aah' end within this many seconds. */
export const GLUG_LENGTH = AAH_AT + 0.3;

/** One low gulp: a falling triangle 'gloomp' with a wet lowpassed noise tap. */
function gulp(at: number): Voice[] {
  return [
    { wave: 'triangle', at, dur: 0.16, freq: 210, to: 95, gain: 0.45 },
    { wave: 'square', at: at + 0.02, dur: 0.08, freq: 120, to: 80, gain: 0.04 },
    { wave: 'noise', at, dur: 0.06, freq: 700, gain: 0.12, filter: 'lowpass' },
  ];
}

/** One crunchy bite: a bright band-passed noise crack over a short low chomp. */
function bite(at: number, pitch: number): Voice[] {
  return [
    { wave: 'noise', at, dur: 0.07, freq: 2600 * pitch, gain: 0.35, filter: 'bandpass' },
    { wave: 'noise', at: at + 0.03, dur: 0.05, freq: 1500 * pitch, gain: 0.2, filter: 'bandpass' },
    { wave: 'square', at, dur: 0.05, freq: 190 * pitch, to: 110 * pitch, gain: 0.08 },
  ];
}

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
  // Maßkrug: 'glug glug glug' then a small, friendly 'aah' (a soft falling vowel-ish triangle).
  glug: [
    ...GULP_AT.flatMap((at) => gulp(at)),
    { wave: 'triangle', at: AAH_AT, dur: GLUG_LENGTH - AAH_AT, freq: N.A4 * 1.2, to: N.E4, gain: 0.22 },
    { wave: 'square', at: AAH_AT, dur: 0.18, freq: 264, to: 200, gain: 0.03 },
  ],
  // Brezel / Lebkuchenherz: two crunchy bites, the second a little lower.
  munch: [...bite(0, 1), ...bite(0.17, 0.8)],
  // Football throw: an airy band-passed swish with a faint rising tone.
  whoosh: [
    { wave: 'noise', at: 0, dur: 0.24, freq: 1400, gain: 0.32, filter: 'bandpass' },
    { wave: 'noise', at: 0.06, dur: 0.16, freq: 2600, gain: 0.14, filter: 'bandpass' },
    { wave: 'triangle', at: 0, dur: 0.2, freq: 300, to: 900, gain: 0.06 },
  ],
  // The ball hits a person: a hollow falling 'bonk'.
  bonk: [
    { wave: 'triangle', at: 0, dur: 0.13, freq: 520, to: 180, gain: 0.45 },
    { wave: 'square', at: 0, dur: 0.05, freq: 900, to: 420, gain: 0.07 },
  ],
  // ...and a small cheer after it: a quick 'yay' arpeggio over a soft crowd hiss.
  cheer: [
    ...notes('square', [N.C5, N.E5, N.G5, N.C6], 0.05, 0.07, 0.16).map((v) => ({ ...v, at: v.at + 0.14 })),
    { wave: 'noise', at: 0.14, dur: 0.32, freq: 3000, gain: 0.06, filter: 'highpass' },
  ],
  // A missed ball flies back: a two-pulse rising warning whistle.
  whistle: [
    { wave: 'triangle', at: 0, dur: 0.16, freq: 900, to: 1500, gain: 0.18 },
    { wave: 'triangle', at: 0.2, dur: 0.24, freq: 1000, to: 2200, gain: 0.2 },
    { wave: 'square', at: 0.2, dur: 0.24, freq: 2000, to: 4400, gain: 0.025 },
  ],
  // The ball hits the skater: a dull low thud on top of the crash.
  thud: [
    { wave: 'triangle', at: 0, dur: 0.16, freq: 130, to: 45, gain: 0.6 },
    { wave: 'noise', at: 0, dur: 0.08, freq: 320, gain: 0.35, filter: 'lowpass' },
  ],
  // Drunk: a woozy sting, lazy up-and-down slides that sink like a wobbling horizon.
  woozy: [
    { wave: 'triangle', at: 0, dur: 0.2, freq: 420, to: 330, gain: 0.2 },
    { wave: 'triangle', at: 0.18, dur: 0.2, freq: 330, to: 440, gain: 0.2 },
    { wave: 'triangle', at: 0.36, dur: 0.2, freq: 440, to: 300, gain: 0.2 },
    { wave: 'triangle', at: 0.54, dur: 0.36, freq: 300, to: 190, gain: 0.2 },
    { wave: 'square', at: 0, dur: 0.9, freq: 105, to: 95, gain: 0.03 },
  ],
  // Health back: a warm rising heart chime with a soft high bell on top.
  heart: [
    ...notes('triangle', [N.E5, N.G5, N.C6], 0.07, 0.2, 0.3),
    { wave: 'sine', at: 0.14, dur: 0.4, freq: N.E6, gain: 0.1 },
  ],
  // Grind trick: a snappy upward square run (scaled by points via intensity).
  trick: notes('square', [N.G5, N.C6, N.E6], 0.04, 0.1, 0.1),
  // Big grind trick: a sparkle after the run.
  trickBig: [
    { wave: 'triangle', at: 0.12, dur: 0.12, freq: N.G6, gain: 0.12 },
    { wave: 'triangle', at: 0.18, dur: 0.22, freq: N.C7, gain: 0.12 },
  ],
  // A Mitte car honks: two muffled detuned squares together, a short 'mööp'.
  honk: [
    { wave: 'square', at: 0, dur: 0.3, freq: 349, gain: 0.14, filter: 'lowpass' },
    { wave: 'square', at: 0, dur: 0.3, freq: 440, gain: 0.11, filter: 'lowpass' },
  ],
  // A small car: an impatient, higher double beep 'tüt-tüt'.
  honkShort: [
    { wave: 'square', at: 0, dur: 0.1, freq: 523, gain: 0.11, filter: 'lowpass' },
    { wave: 'square', at: 0, dur: 0.1, freq: 622, gain: 0.08, filter: 'lowpass' },
    { wave: 'square', at: 0.15, dur: 0.14, freq: 523, gain: 0.11, filter: 'lowpass' },
    { wave: 'square', at: 0.15, dur: 0.14, freq: 622, gain: 0.08, filter: 'lowpass' },
  ],
  // A truck or bus: a long, deep, brassy 'BÖÖÖP' of two low saws.
  hornDeep: [
    { wave: 'sawtooth', at: 0, dur: 0.6, freq: 147, gain: 0.16, filter: 'lowpass', attack: 0.02 },
    { wave: 'sawtooth', at: 0, dur: 0.6, freq: 185, gain: 0.12, filter: 'lowpass', attack: 0.02 },
    { wave: 'square', at: 0, dur: 0.5, freq: 74, gain: 0.05, attack: 0.02 },
  ],
  // A truck passes close by: a swelling engine roar and air whoosh, then a brake hiss.
  truckPass: [
    { wave: 'noise', at: 0, dur: 1.1, freq: 250, to: 900, gain: 0.2, filter: 'lowpass', attack: 0.45 },
    { wave: 'sawtooth', at: 0, dur: 1.1, freq: 62, to: 48, gain: 0.08, attack: 0.45 },
    { wave: 'noise', at: 0.75, dur: 0.45, freq: 4200, to: 3000, gain: 0.07, filter: 'highpass', attack: 0.06 },
  ],
};

/**
 * Mitte traffic rumble, layered on one bus whose gain follows the traffic
 * level, gliding with `glide` (time constant, s): lowpassed road noise whose
 * cutoff opens with the level (fuller in dense traffic), a band of tyre hiss,
 * and an engine drone of two detuned low saws through a lowpass that slowly
 * throbs (an LFO on the drone gain) like idling and pulling-away engines.
 */
export const TRAFFIC_RUMBLE = {
  noise: { freq: 200, freqFull: 420, q: 0.7, gain: 0.5 },
  hiss: { freq: 700, q: 0.9, gain: 0.07 },
  drone: { freqs: [46, 61.5], cutoff: 170, gain: 0.09, throbHz: 0.7, throbDepth: 0.04 },
  glide: 0.06,
} as const;

/** Grind loop: band-passed noise scrape plus a low buzzing square, fades in and out. */
export const GRIND = {
  noise: { freq: 2600, q: 1.5, gain: 0.14 },
  buzz: { freq: 82, gain: 0.05, wobbleHz: 14, wobbleDepth: 6 },
  fade: 0.04,
} as const;

/** Overall volume: chiptune square waves are loud, keep it modest. */
export const MASTER_GAIN = 0.35;
