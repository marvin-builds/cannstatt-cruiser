/**
 * Frame-time probe for measurements (scripts/frametimes.ts drives it through
 * `window.__game.perf`). Storage is preallocated, so recording itself does
 * not allocate and does not skew GC or frame times.
 */

/** Per-system phase a cost is booked on. */
export type ProbePhase = 'update' | 'render';

/** Frame totals measured by the app loop. */
export interface FrameTotals {
  /** Fixed updates run in this rAF frame. */
  updates: number;
  /** ms spent in all updates of the frame. */
  updateMs: number;
  /** ms spent clearing the view and in Game.render (all systems). */
  renderMs: number;
  /** state.distance after the updates. */
  distance: number;
  /** Scroll position the frame was rendered at (RenderContext.scroll). */
  scroll: number;
  /** usedJSHeapSize after the frame (0 if unknown). */
  heap: number;
}

export interface FrameRecord extends FrameTotals {
  /** rAF timestamp (ms). */
  t: number;
  /** Real ms since the previous rAF frame. */
  elapsed: number;
  /** ms per system name, summed over the frame's updates. */
  update: Record<string, number>;
  render: Record<string, number>;
}

export interface ProbeDump {
  systems: string[];
  frames: FrameRecord[];
}

const COLUMNS = ['t', 'elapsed', 'updates', 'updateMs', 'renderMs', 'distance', 'scroll', 'heap'] as const;

export class FrameProbe {
  private readonly totals: Float64Array;
  private readonly perSystem: Float64Array;
  private count = 0;

  constructor(
    readonly systems: readonly string[],
    readonly capacity: number,
  ) {
    this.totals = new Float64Array(capacity * COLUMNS.length);
    this.perSystem = new Float64Array(capacity * systems.length * 2);
  }

  get full(): boolean {
    return this.count >= this.capacity;
  }

  beginFrame(t: number, elapsed: number): void {
    if (this.full) return;
    const base = this.count * COLUMNS.length;
    this.totals[base] = t;
    this.totals[base + 1] = elapsed;
  }

  addSystem(system: number, phase: ProbePhase, ms: number): void {
    if (this.full) return;
    this.perSystem[this.slot(this.count, system, phase)] += ms;
  }

  endFrame(totals: FrameTotals): void {
    if (this.full) return;
    const base = this.count * COLUMNS.length;
    for (let c = 2; c < COLUMNS.length; c++) this.totals[base + c] = totals[COLUMNS[c] as keyof FrameTotals];
    this.count++;
  }

  dump(): ProbeDump {
    const frames: FrameRecord[] = [];
    for (let f = 0; f < this.count; f++) {
      const record: Record<string, unknown> = {};
      COLUMNS.forEach((name, c) => (record[name] = this.totals[f * COLUMNS.length + c]));
      const update: Record<string, number> = {};
      const render: Record<string, number> = {};
      this.systems.forEach((name, s) => {
        update[name] = this.perSystem[this.slot(f, s, 'update')]!;
        render[name] = this.perSystem[this.slot(f, s, 'render')]!;
      });
      frames.push({ ...(record as unknown as FrameTotals & { t: number; elapsed: number }), update, render });
    }
    return { systems: [...this.systems], frames };
  }

  private slot(frame: number, system: number, phase: ProbePhase): number {
    return (frame * this.systems.length + system) * 2 + (phase === 'update' ? 0 : 1);
  }
}
