/**
 * A carried Maßkrug is drunk by itself after BEER_AUTO_DRINK seconds of
 * carrying (playing time). Patterns are planned drunk-safe while one is
 * carried (spawner.ts), so keeping the mug must not buy easy streets forever.
 * The drink is the same as pressing use (use.ts), so animation, sounds and
 * popups follow. Only a Maßkrug that would be drunk counts: never another
 * item, never in kid mode. A new item (caught or used) restarts the clock;
 * losing the item (crash) or a new run resets it.
 */
import { TICK_DT } from '../core/config';
import type { GameState } from '../types';
import { actionOf } from './use';

/** Seconds a Maßkrug is carried before the skater drinks it. */
export const BEER_AUTO_DRINK = 6;
const AUTO_TICKS = Math.round(BEER_AUTO_DRINK / TICK_DT);

export class AutoDrink {
  private ticks = 0;

  /** Counts one playing tick; true on the tick the carried Maßkrug is to be drunk. */
  due(state: GameState): boolean {
    const item = state.carriedItem;
    if (!item || actionOf(item, state.kidMode) !== 'drink') {
      this.ticks = 0;
      return false;
    }
    this.ticks++;
    return this.ticks >= AUTO_TICKS;
  }

  /** A new item in hand, or none: the clock starts again. */
  reset(): void {
    this.ticks = 0;
  }
}
