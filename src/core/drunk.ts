/**
 * Drunk controls: while `state.drunkTimer > 0` (and playing) core delivers
 * every action / duck press and release DRUNK_DELAY_MIN..MAX ticks late, each
 * edge with its own delay from a run-seeded rng. Order per source is kept and
 * nothing is dropped. Gameplay's solver validates drunk patterns with
 * `drunkWindow`. See "Drunk input" in docs/ARCHITECTURE.md.
 */
import { ActionButton, type ActionSnapshot } from './action';
import { DRUNK_DELAY_MAX, DRUNK_DELAY_MIN } from './config';
import type { Rng } from './rng';

/** Extra ticks one press or release is held back while drunk. */
export function drunkDelay(rng: Rng): number {
  return rng.int(DRUNK_DELAY_MIN, DRUNK_DELAY_MAX);
}

/** How a press that a sober player would make, held for some ticks, can arrive while drunk (all in ticks). */
export interface DrunkWindow {
  /** Earliest / latest extra delay of the press. */
  pressMin: number;
  pressMax: number;
  /** Shortest / longest hold the systems see (0 = press and release in the same tick, a tap). */
  holdMin: number;
  holdMax: number;
}

/**
 * Every outcome of a press held `holdTicks` ticks while drunk. The release
 * gets its own delay but never arrives before the press, so the hold can
 * shrink or grow by DRUNK_DELAY_MAX - DRUNK_DELAY_MIN ticks. Worst case for
 * timing: the take-off lands anywhere in [pressMin, pressMax] ticks late.
 */
export function drunkWindow(holdTicks: number): DrunkWindow {
  const spread = DRUNK_DELAY_MAX - DRUNK_DELAY_MIN;
  return {
    pressMin: DRUNK_DELAY_MIN,
    pressMax: DRUNK_DELAY_MAX,
    holdMin: Math.max(0, holdTicks - spread),
    holdMax: holdTicks + spread,
  };
}

/** What a DelayedButton needs from the game. */
export interface DelayClock {
  /** Fixed ticks done so far (state.frame). */
  frame(): number;
  /** Extra ticks for the edge happening now (0 = deliver normally). */
  delay(): number;
}

interface QueuedEdge {
  /** state.frame of the tick that sees the edge. */
  due: number;
  source: string;
  press: boolean;
}

/**
 * An ActionButton whose press / release edges can be held back by a few
 * ticks (drunk controls). Same interface as ActionButton; with a delay of 0
 * and nothing queued it behaves exactly like one.
 */
export class DelayedButton {
  private readonly inner = new ActionButton();
  /** Sources down as requested by the input layer (before any delay). */
  private readonly down = new Set<string>();
  private readonly queue: QueuedEdge[] = [];
  /** Tick of each source's last queued edge: later edges of that source never overtake it. */
  private readonly lastDue = new Map<string, number>();

  constructor(private readonly clock: DelayClock) {}

  press(source: string): void {
    if (this.down.has(source)) return;
    this.down.add(source);
    this.edge(source, true);
  }

  release(source: string): void {
    if (!this.down.delete(source)) return;
    this.edge(source, false);
  }

  /** Focus lost / run over: everything up now, queued edges dropped. */
  releaseAll(): void {
    this.down.clear();
    this.queue.length = 0;
    this.lastDue.clear();
    this.inner.releaseAll();
  }

  tick(dt: number): ActionSnapshot {
    if (this.queue.length > 0) this.deliverDue(this.clock.frame());
    return this.inner.tick(dt);
  }

  private edge(source: string, press: boolean): void {
    const delay = this.clock.delay();
    const after = this.lastDue.get(source);
    if (delay === 0 && after === undefined) {
      this.apply(source, press);
      return;
    }
    const due = Math.max(this.clock.frame() + 1 + delay, after ?? 0);
    this.queue.push({ due, source, press });
    this.lastDue.set(source, due);
  }

  private deliverDue(frame: number): void {
    let kept = 0;
    for (const e of this.queue) {
      if (e.due <= frame) {
        this.apply(e.source, e.press);
        if (this.lastDue.get(e.source) === e.due) this.lastDue.delete(e.source);
      } else {
        this.queue[kept++] = e;
      }
    }
    this.queue.length = kept;
  }

  private apply(source: string, press: boolean): void {
    if (press) this.inner.press(source);
    else this.inner.release(source);
  }
}
