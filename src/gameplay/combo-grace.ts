/**
 * Combo grace (ROADMAP 52 Phase 3 point 10): a street landing no longer ends
 * the combo at once. A short ground touch of up to COMBO_GRACE_SECONDS (like
 * a manual) keeps combo and multiplier, so a quick hop on to the next
 * obstacle goes on chaining; only staying on the street longer ends it. A
 * crash still ends it at once (health.ts). The same in adult and kid mode.
 */
import type { GameContext } from '../types';
import { breakCombo } from './scoring';

/** Seconds the wheels may stay on the street after a landing before the combo ends. */
export const COMBO_GRACE_SECONDS = 0.3;
/** Rounding slack of the summed tick times (18 ticks of 1/60 s are the full grace). */
const EPSILON = 1e-9;

export class ComboGrace {
  /** Seconds on the street since the last landing; null while no grace runs. */
  private onStreet: number | null = null;

  /** Wheels on the street: the grace starts (again). */
  landed(): void {
    this.onStreet = 0;
  }

  /** Every playing tick: off the street (a jump, a grind) the grace is over and the combo lives on; too long on it ends the combo. */
  update(ctx: GameContext, dt: number): void {
    if (this.onStreet === null) return;
    const p = ctx.state.player;
    if (!p.grounded || p.grinding) {
      this.onStreet = null;
      return;
    }
    this.onStreet += dt;
    if (this.onStreet <= COMBO_GRACE_SECONDS + EPSILON) return;
    breakCombo(ctx.state);
    this.onStreet = null;
  }

  reset(): void {
    this.onStreet = null;
  }
}
