/**
 * Fixed-timestep accumulator. Real elapsed time goes in, a whole number of
 * fixed `step` updates comes out; `alpha` is the leftover fraction of a step
 * (0..1) that renderers may use for interpolation.
 */
export class FixedTimestep {
  /** Multiplies real elapsed time (slow motion < 1 < fast forward). */
  timeScale = 1;
  /** Fraction of a step left in the accumulator after the last advance. */
  alpha = 0;
  private accumulator = 0;

  constructor(
    readonly step: number,
    /** Upper bound for one frame's elapsed time, so a stalled tab cannot cause a spiral of death. */
    readonly maxFrameTime = 0.25,
  ) {}

  advance(elapsedSeconds: number, update: () => void): void {
    const elapsed = Math.min(Math.max(elapsedSeconds, 0), this.maxFrameTime) * this.timeScale;
    this.accumulator += elapsed;
    // Small epsilon so float error in "n * step" still yields n updates.
    while (this.accumulator + 1e-9 >= this.step) {
      this.accumulator -= this.step;
      update();
    }
    this.accumulator = Math.max(this.accumulator, 0);
    this.alpha = this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }
}
