/**
 * The NorDIY high five (ROADMAP 36) on the ui side: the high five window (a
 * `highFiver` entity within reach of the skater; gameplay uses the same
 * rule) turns the item button / desktop chip into a hand, so empty hands can
 * high five too, and a one-time hint (storage key highFiveSeen) shows the
 * first time a high-fiver approaches: "[E] = High Five!" at the hint spot
 * under the skater (keyboard) or "Knopf: High Five!" beside the item button
 * (touch), pointing at it.
 */
import { PLAYER_X } from '../core/config';
import type { Store } from '../core/storage';
import type { Entity, Rect } from '../types';
import { type HintRow, hintPlateRect, KEY_E } from './hint-plate';
import { itemHintRect } from './item-button';
import { popupScale } from './layout';

/** The window is open while the high-fiver's hand (its middle) is at most this far from the skater's feet. */
export const HIGH_FIVE_REACH = 24;
/** The hint shows from when the hand is this far ahead of the skater. */
export const HIGH_FIVE_HINT_AHEAD = 150;
export const HIGH_FIVE_TOUCH_LABEL = 'Knopf: High Five!';
const DESKTOP_ROWS: readonly HintRow[] = [[KEY_E, '= High Five!']];
const SEEN_KEY = 'highFiveSeen';

/** Signed distance of a high-fiver's hand ahead of the skater's feet. */
const handAhead = (e: Entity) => e.x + e.w / 2 - PLAYER_X;

/**
 * A use press now goes to a high-fiver (gameplay's rule, gameplay/high-five.ts:
 * one within HIGH_FIVE_REACH; after his high five further presses stay his).
 */
export function highFiveOpen(entities: readonly Entity[]): boolean {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.kind === 'highFiver' && Math.abs(handAhead(e)) <= HIGH_FIVE_REACH) return true;
  }
  return false;
}

/** A high-fiver coming up or within reach, not yet passed. */
function approaching(e: Entity): boolean {
  const ahead = handAhead(e);
  return e.kind === 'highFiver' && ahead <= HIGH_FIVE_HINT_AHEAD && ahead >= -HIGH_FIVE_REACH;
}

export class HighFiveHint {
  private seen: boolean;
  /** Id of the high-fiver the hint is about, or null. */
  private current: number | null = null;

  constructor(private readonly store: Store) {
    this.seen = store.get(SEEN_KEY, false);
  }

  get visible(): boolean {
    return this.current !== null;
  }

  runStarted(): void {
    this.current = null;
  }

  /** The high five was given: the hint has done its job. */
  highFived(): void {
    this.current = null;
    this.markSeen();
  }

  /** Once per playing tick with state.entities. */
  update(entities: readonly Entity[]): void {
    if (this.current !== null) {
      const e = entities.find((x) => x.id === this.current);
      if (!e || !approaching(e)) this.current = null;
      return;
    }
    if (this.seen) return;
    const next = entities.find(approaching);
    if (!next) return;
    this.current = next.id;
    this.markSeen();
  }

  private markSeen(): void {
    if (this.seen) return;
    this.seen = true;
    this.store.set(SEEN_KEY, true);
  }
}

/** Where the hint shows: on a plate at the hint spot (keyboard) or beside the item button (touch). */
export type HighFiveHintPlate =
  | { kind: 'spot'; rows: readonly HintRow[]; scale: number; rect: Rect }
  | { kind: 'button'; label: string; scale: number; rect: Rect & { pointsRight: boolean } };

export function highFiveHintPlate(display: { touch: boolean; portrait: boolean; viewWidth: number }): HighFiveHintPlate {
  const scale = popupScale(display, false);
  if (display.touch) {
    const rect = itemHintRect(display.viewWidth, display, scale, HIGH_FIVE_TOUCH_LABEL);
    return { kind: 'button', label: HIGH_FIVE_TOUCH_LABEL, scale, rect };
  }
  return { kind: 'spot', rows: DESKTOP_ROWS, scale, rect: hintPlateRect(DESKTOP_ROWS, scale, display.viewWidth) };
}
