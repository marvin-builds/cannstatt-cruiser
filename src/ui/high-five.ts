/**
 * The NorDIY high five (ROADMAP 36) on the ui side: gameplay's high five
 * window (gameplay/high-five.ts: a `highFiver` within reach, or a little
 * ahead in the approach) turns the item button / desktop chip into a hand, so
 * empty hands can high five too; on touch the hand already shows from the
 * hint distance on. A hint shows as a high-fiver approaches: "[E] = High
 * Five!" at the hint spot under the skater (keyboard) or "Knopf: High Five!"
 * beside the item button (touch), pointing at it. It repeats for every
 * high-fiver until the first real high five or HIGH_FIVE_HINT_SHOWS
 * appearances (storage keys highFiveSeen, highFiveHintShows).
 */
import { PLAYER_X } from '../core/config';
import type { Store } from '../core/storage';
import { HIGH_FIVE_REACH, highFiverAhead, highFiveWindow } from '../gameplay/high-five';

export { HIGH_FIVE_REACH };
import type { Entity, Rect } from '../types';
import { type HintRow, hintPlateRect, KEY_E } from './hint-plate';
import { itemHintRect } from './item-button';
import { popupScale } from './layout';

/** The hint (and on touch the hand button) shows from when the hand is this far ahead of the skater. */
export const HIGH_FIVE_HINT_AHEAD = 150;
/** Appearances of the hint before it stops without a high five. */
export const HIGH_FIVE_HINT_SHOWS = 3;
export const HIGH_FIVE_TOUCH_LABEL = 'Knopf: High Five!';
const DESKTOP_ROWS: readonly HintRow[] = [[KEY_E, '= High Five!']];
const SEEN_KEY = 'highFiveSeen';
const SHOWS_KEY = 'highFiveHintShows';

/** A high-fiver coming up (within the hint distance) or within reach, not yet passed. */
function approaching(e: Entity): boolean {
  if (e.kind !== 'highFiver') return false;
  const ahead = highFiverAhead(e, PLAYER_X);
  return ahead <= HIGH_FIVE_HINT_AHEAD && ahead >= -HIGH_FIVE_REACH;
}

/**
 * The hand on the item button: 'press' inside gameplay's window (a use press
 * is the high-fiver's), 'show' while one approaches from the hint distance
 * (drawn, but a press would still go to the item), else null.
 */
export function highFiveHand(entities: readonly Entity[]): 'press' | 'show' | null {
  let hand: 'show' | null = null;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.kind !== 'highFiver') continue;
    if (highFiveWindow(highFiverAhead(e, PLAYER_X)) !== 'none') return 'press';
    if (approaching(e)) hand = 'show';
  }
  return hand;
}

/** Whether the item control shows the hand: on touch from the hint distance on, on desktop (E) inside gameplay's window. */
export function handShown(hand: 'press' | 'show' | null, touch: boolean): boolean {
  return touch ? hand !== null : hand === 'press';
}

export class HighFiveHint {
  private seen: boolean;
  private shows: number;
  /** Id of the high-fiver the hint is about, or null. */
  private current: number | null = null;

  constructor(private readonly store: Store) {
    this.seen = store.get(SEEN_KEY, false);
    this.shows = store.get(SHOWS_KEY, 0);
  }

  get visible(): boolean {
    return this.current !== null;
  }

  runStarted(): void {
    this.current = null;
  }

  /** The high five was given: the hint has done its job for good. */
  highFived(): void {
    this.current = null;
    if (this.seen) return;
    this.seen = true;
    this.store.set(SEEN_KEY, true);
  }

  /** Once per playing tick with state.entities. */
  update(entities: readonly Entity[]): void {
    if (this.current !== null) {
      const e = entities.find((x) => x.id === this.current);
      if (!e || !approaching(e)) this.current = null;
      return;
    }
    if (this.seen || this.shows >= HIGH_FIVE_HINT_SHOWS) return;
    const next = entities.find(approaching);
    if (!next) return;
    this.current = next.id;
    this.shows++;
    this.store.set(SHOWS_KEY, this.shows);
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
