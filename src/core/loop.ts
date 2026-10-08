/** Frames the display cadence is estimated from (median, so single hitches do not move it). */
const CADENCE_FRAMES = 15;
/** A cadence this close (relative) to the step, half a step or two steps is treated as exactly that (60 / 120 / 30 Hz). */
const CADENCE_SNAP = 0.04;
/** A frame within this share of the cadence from a whole number of display frames counts as exactly that many. */
const FRAME_SNAP = 0.25;

/**
 * Estimates the display's frame interval from recent rAF elapsed times: the
 * median of the last CADENCE_FRAMES, snapped to 60 / 120 / 30 Hz when close.
 * Allocation-free per frame (ring buffer, fixed scratch array, snap targets built once).
 */
class FrameCadence {
  private readonly recent: Float64Array;
  private readonly sorted = new Float64Array(CADENCE_FRAMES);
  /** Display intervals the estimate snaps to: the step (60 Hz), half of it (120 Hz) and twice it (30 Hz). */
  private readonly targets: Float64Array;
  private next = 0;

  constructor(step: number) {
    this.recent = new Float64Array(CADENCE_FRAMES).fill(step);
    this.targets = Float64Array.of(step, step / 2, step * 2);
  }

  /** Records one frame's elapsed seconds and returns the current cadence estimate. */
  observe(elapsed: number): number {
    if (elapsed > 0) {
      this.recent[this.next] = elapsed;
      this.next = (this.next + 1) % CADENCE_FRAMES;
    }
    return this.snap(this.median());
  }

  private median(): number {
    const s = this.sorted;
    s.set(this.recent);
    for (let i = 1; i < s.length; i++) {
      const v = s[i]!;
      let j = i - 1;
      while (j >= 0 && s[j]! > v) {
        s[j + 1] = s[j]!;
        j--;
      }
      s[j + 1] = v;
    }
    return s[s.length >> 1]!;
  }

  private snap(interval: number): number {
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i]!;
      if (Math.abs(interval - target) <= target * CADENCE_SNAP) return target;
    }
    return interval;
  }
}

/**
 * Fixed-timestep accumulator. Real elapsed time goes in, a whole number of
 * fixed `step` updates comes out; `alpha` is the leftover fraction of a step
 * (0..1) that renderers use for interpolation (RenderContext.scroll).
 *
 * rAF timestamps jitter around the display's frame interval. Fed raw, an
 * accumulator that sits near a step boundary then runs 0 updates in one frame
 * and 2 in the next: a visible hitch. So each frame's elapsed time is snapped
 * to a whole number of display frames (the cadence, see FrameCadence) when it
 * is within FRAME_SNAP of one. At 60 Hz every frame then runs exactly one
 * update, at 120 Hz updates alternate, and a missed vsync still catches up.
 */
export class FixedTimestep {
  /** Multiplies real elapsed time (slow motion < 1 < fast forward). */
  timeScale = 1;
  /** Fraction of a step left in the accumulator after the last advance. */
  alpha = 0;
  private accumulator = 0;
  private readonly cadence: FrameCadence;

  constructor(
    readonly step: number,
    /** Upper bound for one frame's elapsed time, so a stalled tab cannot cause a spiral of death. */
    readonly maxFrameTime = 0.25,
  ) {
    this.cadence = new FrameCadence(step);
  }

  /** Runs the updates due after `elapsedSeconds` of real time and returns how many ran. */
  advance(elapsedSeconds: number, update: () => void): number {
    const raw = Math.min(Math.max(elapsedSeconds, 0), this.maxFrameTime);
    this.accumulator += this.snapToFrames(raw) * this.timeScale;
    let updates = 0;
    // Small epsilon so float error in "n * step" still yields n updates.
    while (this.accumulator + 1e-9 >= this.step) {
      this.accumulator -= this.step;
      update();
      updates++;
    }
    this.accumulator = Math.max(this.accumulator, 0);
    this.alpha = this.accumulator / this.step;
    return updates;
  }

  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }

  private snapToFrames(elapsed: number): number {
    const interval = this.cadence.observe(elapsed);
    const frames = Math.round(elapsed / interval);
    if (frames >= 1 && Math.abs(elapsed - frames * interval) <= interval * FRAME_SNAP) return frames * interval;
    return elapsed;
  }
}
