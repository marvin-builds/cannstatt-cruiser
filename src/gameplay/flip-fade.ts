/**
 * Kickflip repetition fade (ROADMAP 41): consecutive paid kickflips with
 * nothing else in between pay a falling share of their base. Something else
 * happening (gameplay calls refresh: an obstacle cleared, a stomp, a grind
 * start, a kicker launch, a high five) or KICKFLIP_REFRESH_SECONDS of playing
 * time without a kickflip make the next one full again.
 */

/** Share of the base for the 1st, 2nd, 3rd and every later kickflip in a row. */
export const KICKFLIP_FADE: readonly number[] = [1, 0.5, 0.25, 0.1];
/** Playing time without a kickflip after which the next one pays full again. */
export const KICKFLIP_REFRESH_SECONDS = 3;

export class KickflipFade {
  /** Kickflips paid in a row. */
  private streak = 0;
  /** Seconds of playing time since the last kickflip ran. */
  private quiet = 0;

  reset(): void {
    this.streak = 0;
    this.quiet = 0;
  }

  /** Something else happened: the next kickflip pays full. */
  refresh(): void {
    this.streak = 0;
  }

  /** Every playing tick; `flipping`: a kickflip runs or waits for its touchdown. */
  update(dt: number, flipping: boolean): void {
    if (flipping) {
      this.quiet = 0;
      return;
    }
    this.quiet += dt;
    // A little slack: the sum of tick lengths drifts below the exact seconds.
    if (this.quiet >= KICKFLIP_REFRESH_SECONDS - 1e-6) this.streak = 0;
  }

  /** The share of the base the next paid kickflip gets; counts it. */
  next(): number {
    const share = KICKFLIP_FADE[Math.min(this.streak, KICKFLIP_FADE.length - 1)]!;
    this.streak++;
    return share;
  }
}
