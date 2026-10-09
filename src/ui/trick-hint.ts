/**
 * The grind trick hint: while grinding, until the player has done a grind
 * trick once ever (storage key grindTrickSeen), a small plate at the hint spot
 * under the skater says "[↓] = Trick!" (desktop, with a key cap),
 * "Runterwischen = Trick!" (touch landscape) or the compact "[↓] wischen =
 * Trick!" (the big portrait font). Only on the first TRICK_HINT_GRINDS
 * grinds of a run; the hint slot (hint-slot.ts) lets it linger after a short grind.
 */
import type { Store } from '../core/storage';
import type { Rect } from '../types';
import { type HintRow, hintPlateRect, KEY_DOWN, SWIPE_DOWN } from './hint-plate';
import { popupScale } from './layout';

/** Grinds per run that show the hint. */
export const TRICK_HINT_GRINDS = 3;
const SEEN_KEY = 'grindTrickSeen';

export class TrickHint {
  private seen: boolean;
  private shown = 0;
  private active = false;
  private tricking = false;
  private wasGrinding = false;

  constructor(private readonly store: Store) {
    this.seen = store.get(SEEN_KEY, false);
  }

  get visible(): boolean {
    return this.active && !this.tricking;
  }

  runStarted(): void {
    this.shown = 0;
    this.active = false;
  }

  /** A grind trick was scored: never show the hint again. */
  trickDone(): void {
    this.active = false;
    if (this.seen) return;
    this.seen = true;
    this.store.set(SEEN_KEY, true);
  }

  /** Once per playing tick with player.grinding and player.grindTrick. */
  update(grinding: boolean, tricking: boolean): void {
    if (grinding && !this.wasGrinding && !this.seen && this.shown < TRICK_HINT_GRINDS) {
      this.shown++;
      this.active = true;
    }
    if (!grinding) this.active = false;
    this.wasGrinding = grinding;
    this.tricking = tricking;
  }
}

const DESKTOP_ROWS: readonly HintRow[] = [[KEY_DOWN, '= Trick!']];
const TOUCH_ROWS: readonly HintRow[] = [['Runterwischen = Trick!']];
const TOUCH_PORTRAIT_ROWS: readonly HintRow[] = [[SWIPE_DOWN, 'wischen = Trick!']];

/** The plate's rows, font scale (as the other hints) and rect at the hint spot for `display`. */
export function trickHintPlate(display: { touch: boolean; portrait: boolean; viewWidth: number }): {
  rows: readonly HintRow[];
  scale: number;
  rect: Rect;
} {
  const scale = popupScale(display, false);
  const rows = !display.touch ? DESKTOP_ROWS : display.portrait ? TOUCH_PORTRAIT_ROWS : TOUCH_ROWS;
  return { rows, scale, rect: hintPlateRect(rows, scale, display.viewWidth) };
}
