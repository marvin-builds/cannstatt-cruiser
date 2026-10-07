/**
 * The seam between the sound logic (which event plays what) and the synth.
 * The audio system only talks to this interface, so tests can use a fake.
 */

/** One-shot sound effects. */
export type Cue = 'jump' | 'boost' | 'land' | 'star' | 'cleared' | 'crash' | 'gameOver';

/** Sounds that play until stopped. */
export type LoopName = 'grind';

export interface AudioBackend {
  /** Creates / resumes the audio context. Called inside every user gesture. */
  unlock(): void;
  /** Plays a one-shot cue; `intensity` 0..1 scales its volume. Ignored before unlock. */
  play(cue: Cue, intensity: number): void;
  startLoop(loop: LoopName): void;
  stopLoop(loop: LoopName): void;
  setMuted(muted: boolean): void;
  /** Short state for debugging, e.g. the AudioContext state ('running', 'unavailable'). */
  status?(): string;
}
