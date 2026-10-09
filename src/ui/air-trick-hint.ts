/**
 * The air trick (kickflip) hint: until the player has done a kickflip once
 * ever (storage key airTrickSeen), a small plate at the hint spot under the
 * skater says how: "In der Luft [↓] = Kickflip!" (desktop, with a key cap),
 * "In der Luft runterwischen = Kickflip!" (touch; the compact "[↓] wischen =
 * Kickflip!" in the big portrait font, like the grind trick hint). It shows
 * in the air after every kicker launch, and once per run on the first full
 * street jump (STREET_HINT_HEIGHT above the street, high enough for the
 * street kickflip). It hides when the trick starts and on landing (the hint
 * slot lets it linger, hint-slot.ts). The kicker hint shows before the
 * launch, this one after it.
 */
import type { Store } from '../core/storage';
import type { Rect } from '../types';
import { fitHintRows, type HintRow, hintPlateRect, KEY_DOWN, SWIPE_DOWN } from './hint-plate';
import { popupScale } from './layout';

const SEEN_KEY = 'airTrickSeen';
/** Ticks a launch waits for the take-off (the player leaves the street on the tick after `launch`). */
const TAKE_OFF_TICKS = 6;
/** A street jump this high (px of the wheels above the street) is a full jump: the kickflip works there. */
export const STREET_HINT_HEIGHT = 24;

export class AirTrickHint {
  private seen: boolean;
  private active = false;
  /** Ticks left for the launched skater to leave the street; 0 when no launch waits. */
  private takeOff = 0;
  /** The street jump hint showed in this run. */
  private streetShown = false;

  constructor(private readonly store: Store) {
    this.seen = store.get(SEEN_KEY, false);
  }

  get visible(): boolean {
    return this.active;
  }

  runStarted(): void {
    this.active = false;
    this.takeOff = 0;
    this.streetShown = false;
  }

  /** The skater rode onto a kicker: show the hint once he is in the air. */
  launched(): void {
    if (!this.seen) this.takeOff = TAKE_OFF_TICKS;
  }

  /** An air trick was scored: never show the hint again. */
  trickDone(): void {
    this.active = false;
    this.takeOff = 0;
    if (this.seen) return;
    this.seen = true;
    this.store.set(SEEN_KEY, true);
  }

  /**
   * Once per playing tick: the skater is in the air (not on the street or a
   * ledge), the air trick runs, the wheels are `height` px above the street.
   */
  update(airborne: boolean, tricking: boolean, height = 0): void {
    if (this.takeOff > 0) {
      this.takeOff--;
      if (airborne) {
        this.takeOff = 0;
        this.active = true;
      }
    } else if (!airborne) this.active = false;
    else if (!this.seen && !this.streetShown && height >= STREET_HINT_HEIGHT) {
      this.streetShown = true;
      this.active = true;
    }
    if (tricking) {
      this.active = false;
      this.takeOff = 0;
    }
  }
}

const DESKTOP_ROWS: readonly HintRow[] = [['In der Luft', KEY_DOWN, '= Kickflip!']];
const TOUCH_ROWS: readonly HintRow[] = [['In der Luft'], ['runterwischen = Kickflip!']];
/** The big portrait font: the compact swipe row, as the grind trick hint. */
const TOUCH_PORTRAIT_ROWS: readonly HintRow[] = [[SWIPE_DOWN, 'wischen = Kickflip!']];

/** The plate's rows, font scale and rect for `display`. */
export function airTrickHintPlate(display: { touch: boolean; portrait: boolean; viewWidth: number }): {
  rows: readonly HintRow[];
  scale: number;
  rect: Rect;
} {
  const scale = popupScale(display, false);
  const rows = !display.touch ? DESKTOP_ROWS : display.portrait ? TOUCH_PORTRAIT_ROWS : fitHintRows([TOUCH_ROWS, TOUCH_PORTRAIT_ROWS], scale, display.viewWidth);
  return { rows, scale, rect: hintPlateRect(rows, scale, display.viewWidth) };
}
