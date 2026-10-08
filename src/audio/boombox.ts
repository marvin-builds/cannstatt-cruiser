/**
 * The NorDIY boombox loop (ROADMAP 36), the only music in the game: a short,
 * mellow lo-fi chiptune rendered once into a sample buffer (no files) that the
 * backend loops through a soft lowpass. Four bars of Fmaj7 - Em7 - Dm7 -
 * Cmaj7: a warm triangle bass, a soft pulse-wave arpeggio, a slow triangle
 * melody and a gentle kick / brush / hat groove with a little swing. Notes
 * that ring past the loop end wrap around to its start, so it loops seamlessly.
 */

/** Note frequency of a MIDI note number (A4 = 69 = 440 Hz). */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const BOOMBOX = {
  bpm: 88,
  bars: 4,
  /** Render rate: the loop is lowpassed anyway, so a low rate keeps rendering fast. */
  sampleRate: 22050,
  /** Delay of every off-beat eighth, in beats (lazy swing). */
  swing: 0.08,
  /** Per bar: bass root and the four chord tones of the arpeggio (MIDI). */
  chords: [
    { root: 41, tones: [65, 69, 72, 76] }, // Fmaj7
    { root: 40, tones: [64, 67, 71, 74] }, // Em7
    { root: 38, tones: [62, 65, 69, 72] }, // Dm7
    { root: 36, tones: [60, 64, 67, 71] }, // Cmaj7
  ],
  /** Arpeggio: chord tone index for each eighth of a bar. */
  arp: [0, 2, 1, 3, 2, 1, 3, 2],
  /** Melody: [beat in the loop, MIDI note, length in beats]. */
  melody: [
    [0, 76, 1.5],
    [2, 72, 1.5],
    [4, 74, 1.5],
    [6, 71, 1.5],
    [8, 72, 1.5],
    [10, 69, 1.5],
    [12, 71, 2],
    [14.5, 67, 1.5],
  ],
  /** Peak level the finished loop is normalized to. */
  peak: 0.9,
} as const;

/** Length of one loop in seconds. */
export function loopSeconds(): number {
  return (BOOMBOX.bars * 4 * 60) / BOOMBOX.bpm;
}

type Wave = (phase: number) => number;
/** Soft 25 % pulse without DC offset. */
const pulse: Wave = (p) => (p % 1 < 0.25 ? 1.5 : -0.5);
const triangle: Wave = (p) => 4 * Math.abs((p % 1) - 0.5) - 1;
const sine: Wave = (p) => Math.sin(2 * Math.PI * p);

/** Renders the loop as mono samples at `sampleRate` (deterministic). */
export function renderBoombox(sampleRate: number = BOOMBOX.sampleRate): Float32Array {
  const out = new Float32Array(Math.round(loopSeconds() * sampleRate));
  const beat = 60 / BOOMBOX.bpm;
  /** Adds one note: `freq` (or a sweep to `to`), plucky envelope with `decay` seconds, wrapped around the loop end. */
  const note = (wave: Wave, startBeat: number, beats: number, freq: number, gain: number, decay: number, to = freq) => {
    const start = Math.round(startBeat * beat * sampleRate);
    const len = Math.round(beats * beat * sampleRate);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const f = freq + (to - freq) * Math.min(1, i / len);
      phase += f / sampleRate;
      const attack = Math.min(1, t / 0.006);
      const release = Math.min(1, (len - i) / (0.01 * sampleRate));
      out[(start + i) % out.length] += wave(phase) * gain * attack * release * Math.exp(-t / decay);
    }
  };
  let seed = 0x1234567;
  const noise: Wave = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x80000000 - 1;
  };
  const swing = (eighth: number) => eighth / 2 + (eighth % 2 === 1 ? BOOMBOX.swing : 0);

  BOOMBOX.chords.forEach((chord, bar) => {
    const at = bar * 4;
    note(triangle, at, 1.5, hz(chord.root), 0.5, 0.9);
    note(triangle, at + 2, 1, hz(chord.root), 0.45, 0.7);
    note(triangle, at + swing(7), 0.5, hz(chord.root + 7), 0.35, 0.3);
    BOOMBOX.arp.forEach((tone, eighth) => note(pulse, at + swing(eighth), 0.5, hz(chord.tones[tone]!), 0.07, 0.18));
    for (const kick of [0, 2]) note(sine, at + kick, 0.4, 110, 0.6, 0.12, 42);
    for (const brush of [1, 3]) note(noise, at + brush, 0.3, 1, 0.12, 0.06);
    for (let eighth = 1; eighth < 8; eighth += 2) note(noise, at + swing(eighth), 0.12, 1, 0.04, 0.02);
  });
  for (const [at, midi, beats] of BOOMBOX.melody) note(triangle, at, beats, hz(midi), 0.22, 0.8);

  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i]! / peak) * BOOMBOX.peak;
  return out;
}
