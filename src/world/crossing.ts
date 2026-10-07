/** A vehicle that crosses a prop now and then, between two covers that hide it. */
export interface CrossingRun {
  /** Seconds from one crossing's start to the next. */
  readonly period: number;
  /** Seconds one crossing takes. */
  readonly duration: number;
  /** Left edge x at the start (fully hidden) and at the end (fully hidden). */
  readonly from: number;
  readonly to: number;
}

/** Integer left edge of the vehicle at `time`, or null between crossings. */
export function crossingX(time: number, run: CrossingRun): number | null {
  const t = ((time % run.period) + run.period) % run.period;
  if (t > run.duration) return null;
  return Math.round(run.from + (run.to - run.from) * (t / run.duration));
}
