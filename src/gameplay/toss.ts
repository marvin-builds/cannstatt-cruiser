/**
 * The item a stomped person tosses to the skater: it pops up from the head in
 * a short ballistic arc aimed at where the hands are at launch, and for the
 * last part of the flight it homes in on the hands' current position, so the
 * catch never fails even if the skater jumps or ducks meanwhile. A Maßkrug
 * spills foam drops on the way. Screen space (view pixels), DOM-free.
 */
import type { CarriedItem } from '../types';

/** Seconds from the stomp to the catch. */
export const TOSS_TIME = 0.45;
/** Gravity of the arc (view px/s²); with TOSS_TIME it gives a ~12 px pop above the head. */
const TOSS_GRAVITY = 700;
/** Fraction of the flight after which the item eases from its arc onto the hands. */
const HOMING_FROM = 0.55;
/** A Maßkrug sheds a foam drop every this many ticks. */
const SPILL_EVERY = 4;
/** Ticks a foam drop lives. */
export const DROP_TICKS = 24;
const DROP_GRAVITY = 400;

export interface Point {
  x: number;
  y: number;
}

export interface Flight {
  item: CarriedItem;
  /** Where the item is now. */
  at: Point;
  from: Point;
  /** Hands at launch: the arc's target. */
  to: Point;
  /** Upward start speed of the arc (px/s, negative = up). */
  vy0: number;
  ticks: number;
}

/** A spilled foam drop (looks only). */
export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export class ItemToss {
  flight: Flight | null = null;
  drops: Drop[] = [];

  launch(item: CarriedItem, from: Point, hands: Point): void {
    const vy0 = (hands.y - from.y - 0.5 * TOSS_GRAVITY * TOSS_TIME * TOSS_TIME) / TOSS_TIME;
    this.flight = { item, at: { ...from }, from: { ...from }, to: { ...hands }, vy0, ticks: 0 };
  }

  /** Advances one tick towards `hands` (their current position); returns the item on the tick it is caught. */
  update(hands: Point, dt: number): CarriedItem | null {
    this.updateDrops(dt);
    const f = this.flight;
    if (!f) return null;
    f.ticks++;
    const t = Math.min(TOSS_TIME, f.ticks * dt);
    if (t >= TOSS_TIME - 1e-9) {
      this.flight = null;
      return f.item;
    }
    const k = t / TOSS_TIME;
    const arc = { x: f.from.x + (f.to.x - f.from.x) * k, y: f.from.y + f.vy0 * t + 0.5 * TOSS_GRAVITY * t * t };
    const w = smoothstep(Math.max(0, (k - HOMING_FROM) / (1 - HOMING_FROM)));
    f.at = { x: arc.x + (hands.x - arc.x) * w, y: arc.y + (hands.y - arc.y) * w };
    if (f.item === 'beer' && f.ticks % SPILL_EVERY === 0) {
      this.drops.push({ x: f.at.x, y: f.at.y, vx: -20 + (f.ticks % 3) * 10, vy: -30, age: 0 });
    }
    return null;
  }

  /** The skater crashed: an item in flight is lost (spilled drops still fall). */
  cancel(): void {
    this.flight = null;
  }

  reset(): void {
    this.flight = null;
    this.drops = [];
  }

  private updateDrops(dt: number): void {
    for (const d of this.drops) {
      d.vy += DROP_GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.age++;
    }
    this.drops = this.drops.filter((d) => d.age < DROP_TICKS);
  }
}
