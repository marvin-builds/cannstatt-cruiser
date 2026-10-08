/**
 * The grind trick hint: while grinding, until the player has done a grind
 * trick once ever (storage key grindTrickSeen), a small plate under the
 * skater says "↓ = Trick!" (desktop, with a key cap) or "Wisch runter =
 * Trick!" (touch). Only on the first TRICK_HINT_GRINDS grinds of a run.
 */
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Store } from '../core/storage';
import type { Rect } from '../types';
import { popupLeft } from './layout';

/** Grinds per run that show the hint. */
export const TRICK_HINT_GRINDS = 3;
const SEEN_KEY = 'grindTrickSeen';
/** Gap between the riding line and the hint plate. */
const BELOW_GROUND = 4;

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

/** The text after the key cap on desktop, the whole text on touch. */
export function trickHintLabel(touch: boolean): string {
  return touch ? 'Wisch runter = Trick!' : '= Trick!';
}

/**
 * The plate `w` x `h`, centred under the skater just below the riding line:
 * clear of the skater, rails, obstacles (all above the line), the rising
 * popups and the zone banner, and kept off the view edges like a popup.
 */
export function trickHintRect(w: number, h: number, viewWidth: number): Rect {
  return { x: popupLeft(PLAYER_X, w, viewWidth), y: GROUND_Y + BELOW_GROUND, w, h };
}
