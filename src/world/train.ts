import type { Rng } from '../core/rng';

export interface TrainOptions {
  /** Train length in view px. */
  readonly width: number;
  /** Own speed (layer px/s) towards the left, on top of the layer scroll. */
  readonly speed: number;
  /** Seconds between two trains, inclusive range. */
  readonly interval: readonly [number, number];
  /** Seconds until the first train after a restart. */
  readonly firstDelay: number;
}

/**
 * An oncoming train (Stadtbahn) on a parallax layer: waits, enters at the
 * right edge, drives left through layer space and leaves at the left edge.
 */
export class TrainRunner {
  private x: number | null = null;
  private wait = 0;

  constructor(
    private readonly rng: Rng,
    private readonly options: TrainOptions,
  ) {}

  restart(): void {
    this.x = null;
    this.wait = this.options.firstDelay;
  }

  /** `enabled` = the train's zone is on screen; the wait only counts down then. */
  update(dt: number, layerScroll: number, viewWidth: number, enabled: boolean): void {
    if (this.x !== null) {
      this.x -= this.options.speed * dt;
      if (this.x + this.options.width < layerScroll) {
        this.x = null;
        this.wait = this.rng.range(this.options.interval[0], this.options.interval[1]);
      }
      return;
    }
    if (!enabled) return;
    this.wait -= dt;
    if (this.wait <= 1e-9) this.x = layerScroll + viewWidth + 4;
  }

  /**
   * Integer screen x of the train's left edge, or null when none is running.
   * `ahead` (s) extrapolates its own drive for a frame drawn between ticks.
   */
  screenX(layerScroll: number, ahead = 0): number | null {
    return this.x === null ? null : Math.round(this.x - this.options.speed * ahead) - Math.floor(layerScroll);
  }
}
