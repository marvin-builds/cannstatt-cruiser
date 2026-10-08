/**
 * The first-time air trick hint (Stunt Wave B): after a kicker launch, while
 * the skater is in the air, on the first AIR_HINT_LAUNCHES launches of a run
 * and until the player has done an air trick once ever (storage key
 * airTrickSeen), a small plate at the hint spot under the skater says how:
 * "In der Luft [↓] = Trick!" (desktop, with a key cap) or "In der Luft
 * runterwischen = Trick!" (touch; the short "Wisch runter = Trick!" where the
 * big portrait font leaves no room for two rows). It hides when the trick
 * starts and on landing. The kicker hint shows before the launch, this one
 * after it (see shownHint in hint-plate.ts).
 */
import type { Store } from '../core/storage';
import type { Rect } from '../types';
import { fitHintRows, type HintRow, hintPlateRect, KEY_DOWN } from './hint-plate';
import { popupScale } from './layout';

/** Launches per run that show the hint. */
export const AIR_HINT_LAUNCHES = 3;
const SEEN_KEY = 'airTrickSeen';
/** Ticks a launch waits for the take-off (the player leaves the street on the tick after `launch`). */
const TAKE_OFF_TICKS = 6;

export class AirTrickHint {
  private seen: boolean;
  private shown = 0;
  private active = false;
  /** Ticks left for the launched skater to leave the street; 0 when no launch waits. */
  private takeOff = 0;

  constructor(private readonly store: Store) {
    this.seen = store.get(SEEN_KEY, false);
  }

  get visible(): boolean {
    return this.active;
  }

  runStarted(): void {
    this.shown = 0;
    this.active = false;
    this.takeOff = 0;
  }

  /** The skater rode onto a kicker: show the hint once he is in the air. */
  launched(): void {
    if (this.seen || this.shown >= AIR_HINT_LAUNCHES) return;
    this.shown++;
    this.takeOff = TAKE_OFF_TICKS;
  }

  /** An air trick was scored: never show the hint again. */
  trickDone(): void {
    this.active = false;
    this.takeOff = 0;
    if (this.seen) return;
    this.seen = true;
    this.store.set(SEEN_KEY, true);
  }

  /** Once per playing tick: the skater is in the air (not on the street or a ledge), the air trick runs. */
  update(airborne: boolean, tricking: boolean): void {
    if (this.takeOff > 0) {
      this.takeOff--;
      if (airborne) {
        this.takeOff = 0;
        this.active = true;
      }
    } else if (!airborne) this.active = false;
    if (tricking) {
      this.active = false;
      this.takeOff = 0;
    }
  }
}

const DESKTOP_ROWS: readonly HintRow[] = [['In der Luft', KEY_DOWN, '= Trick!']];
const TOUCH_ROWS: readonly HintRow[] = [['In der Luft'], ['runterwischen = Trick!']];
const TOUCH_SHORT_ROWS: readonly HintRow[] = [['Wisch runter = Trick!']];

/** The plate's rows, font scale and rect for `display`. */
export function airTrickHintPlate(display: { touch: boolean; portrait: boolean; viewWidth: number }): {
  rows: readonly HintRow[];
  scale: number;
  rect: Rect;
} {
  const scale = popupScale(display, false);
  const rows = display.touch ? fitHintRows([TOUCH_ROWS, TOUCH_SHORT_ROWS], scale, display.viewWidth) : DESKTOP_ROWS;
  return { rows, scale, rect: hintPlateRect(rows, scale, display.viewWidth) };
}
