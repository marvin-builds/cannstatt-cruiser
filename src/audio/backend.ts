/**
 * The seam between the sound logic (which event plays what) and the synth.
 * The audio system only talks to this interface, so tests can use a fake.
 */

/** One-shot sound effects. */
export type Cue =
  | 'jump'
  | 'boost'
  | 'land'
  | 'star'
  | 'cleared'
  | 'crash'
  | 'gameOver'
  | 'chill'
  | 'bubble'
  | 'pop'
  | 'oof'
  | 'boing'
  | 'hoppla'
  | 'catch'
  | 'glug'
  | 'munch'
  | 'whoosh'
  | 'bonk'
  | 'cheer'
  | 'whistle'
  | 'thud'
  | 'woozy'
  | 'heart'
  | 'trick'
  | 'trickBig'
  | 'honk'
  | 'honkShort'
  | 'hornDeep'
  | 'truckPass'
  | 'passCar'
  | 'passVan'
  | 'passBus'
  | 'passTruck'
  | 'launch'
  | 'stuntStep'
  | 'stuntFanfare'
  | 'stuntFizzle';

/** Sounds that play until stopped. */
export type LoopName = 'grind';

export interface AudioBackend {
  /** Creates / resumes the audio context. Called inside every user gesture. */
  unlock(): void;
  /**
   * Plays a one-shot cue; `intensity` 0..1 scales its volume, `delay` (seconds,
   * default 0) starts it later, `pitch` (default 1) multiplies the frequency of
   * its tonal voices (2 = an octave up). Ignored before unlock.
   */
  play(cue: Cue, intensity: number, delay?: number, pitch?: number): void;
  startLoop(loop: LoopName): void;
  stopLoop(loop: LoopName): void;
  setMuted(muted: boolean): void;
  /**
   * Level 0..1 of the continuous Mitte traffic rumble (0 = silent). The caller
   * smooths it and calls only on noticeable changes; the backend glides between
   * levels without clicks and reuses one set of nodes.
   */
  setTraffic(level: number): void;
  /** Short state for debugging, e.g. the AudioContext state ('running', 'unavailable'). */
  status?(): string;
}
