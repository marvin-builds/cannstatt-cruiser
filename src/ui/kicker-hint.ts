/**
 * The first-time kicker hint (ROADMAP 27): while a kicker ramp approaches,
 * on the first KICKER_HINT_RUNS kickers of a run and until the player has
 * completed a stunt line once ever (storage key stuntLineSeen), a small plate
 * at the hint spot under the skater says "Ab über die Rampe!" (short, so it
 * stays compact in the big portrait font). The
 * ramp needs no button, so touch and keyboard read the same. It disappears
 * on `launch` and once the kicker has passed.
 */
import { PLAYER_X } from '../core/config';
import type { Store } from '../core/storage';
import type { Entity, Rect } from '../types';
import { type HintRow, hintPlateRect } from './hint-plate';

/** Kickers per run that show the hint. */
export const KICKER_HINT_RUNS = 3;
/** The hint shows while a kicker's left edge is at most this far ahead of the skater's feet. */
export const KICKER_HINT_AHEAD = 140;
export const KICKER_HINT_LABEL = 'Ab über die Rampe!';
/** The plate's one row. */
export const KICKER_HINT_ROWS: readonly HintRow[] = [[KICKER_HINT_LABEL]];
const SEEN_KEY = 'stuntLineSeen';

export class KickerHint {
  private seen: boolean;
  private shown = 0;
  /** Id of the kicker the hint is about, or null. */
  private current: number | null = null;
  private launchedFrom: number | null = null;

  constructor(private readonly store: Store) {
    this.seen = store.get(SEEN_KEY, false);
  }

  get visible(): boolean {
    return this.current !== null;
  }

  runStarted(): void {
    this.shown = 0;
    this.current = null;
  }

  /** The skater took off from the kicker: the hint has done its job. */
  launched(): void {
    this.launchedFrom = this.current;
    this.current = null;
  }

  /** A stunt line was completed: never show the hint again. */
  lineCompleted(): void {
    this.current = null;
    if (this.seen) return;
    this.seen = true;
    this.store.set(SEEN_KEY, true);
  }

  /** Once per playing tick with state.entities. */
  update(entities: readonly Entity[]): void {
    const ahead = this.seen ? undefined : entities.find(approaching);
    if (!ahead) {
      this.current = null;
      return;
    }
    if (ahead.id === this.current || ahead.id === this.launchedFrom) return;
    if (this.shown >= KICKER_HINT_RUNS) return;
    this.shown++;
    this.current = ahead.id;
  }
}

/** A kicker not yet reached by the skater's feet and close enough to aim for. */
function approaching(e: Entity): boolean {
  return e.kind === 'kicker' && e.x + e.w > PLAYER_X && e.x - PLAYER_X <= KICKER_HINT_AHEAD;
}

/** The plate for the label at font `scale`: at the trick hint's spot under the skater. */
export function kickerHintRect(scale: number, viewWidth: number): Rect {
  return hintPlateRect(KICKER_HINT_ROWS, scale, viewWidth);
}
