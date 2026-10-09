/**
 * The one hint spot under the skater, shared by the riding hints (high five
 * on the keyboard, grind trick, air trick, kicker): which of them shows now.
 * The hints themselves only say whether they want to show (their rules); the
 * slot keeps a shown hint readable: at least HINT_MIN_TIME on screen, so it
 * lingers after a short grind or a landing, and never swapped for another
 * within HINT_NO_SWAP. A hint whose job is done (its trick started, the
 * skater took off from the kicker) is dismissed at once.
 */
import { type HintKind, shownHint } from './hint-plate';

/** Seconds a shown hint stays at least, also after it stopped wanting to. */
export const HINT_MIN_TIME = 1.8;
/** Seconds before a shown hint may give way to another one. */
export const HINT_NO_SWAP = 1;

export type HintWants = Record<HintKind, boolean>;

export class HintSlot {
  /** The hint on screen, or null. */
  kind: HintKind | null = null;
  /** Seconds the current hint has been on screen. */
  private time = 0;

  runStarted(): void {
    this.kind = null;
  }

  /** The hint's job is done: hide it now if it shows. */
  dismiss(kind: HintKind): void {
    if (this.kind === kind) this.kind = null;
  }

  /** Once per playing tick with what every hint wants. */
  update(dt: number, wants: HintWants): void {
    const best = shownHint(wants);
    if (this.kind !== null) {
      this.time += dt;
      // Still the one to show; too fresh to swap; or lingering with nothing else waiting.
      if (best === this.kind || this.time < HINT_NO_SWAP) return;
      if (best === null && this.time < HINT_MIN_TIME) return;
    }
    this.show(best);
  }

  private show(kind: HintKind | null): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.time = 0;
  }
}
