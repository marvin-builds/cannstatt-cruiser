/**
 * Items knocked out of a person's hands by the thrown football (ROADMAP 19):
 * the item falls in a short arc onto the street, a little further along than
 * the person, and lies there, scrolling with the street. The skater picks it
 * up by touching it with his hitbox (riding over it, or jumping through it
 * low enough); gameplay then catches it like a tossed item (itemCaught). A
 * pickup always replaces what he carries: the newest item wins. Missed items
 * scroll off the left edge and are gone.
 *
 * Fairness: an item only comes to lie on free street (DROP_ROOM_SECONDS of
 * riding without obstacles, rails or a pattern still to come on both sides),
 * trying DROP_SPOTS in order: on the far side of the person, a bit further,
 * then just in front of it. With no free spot nothing drops. Collecting it
 * never needs a move: riding on picks it up, and the spawner and solver never
 * see it. Screen space (view pixels), DOM-free and deterministic.
 */
import { GROUND_Y } from '../core/config';
import type { CarriedItem, Rect } from '../types';
import type { StreetCheck } from './ball';
import { overlaps } from './rules';
import type { Point } from './toss';

/** Seconds from the hit until the item lies on the street. */
export const DROP_TIME = 0.4;
/** Gravity of the fall (view px/s²): with DROP_TIME a pop of a few px above the hand. */
const DROP_GRAVITY = 600;
/** Free street on both sides of where an item comes to lie, in seconds of riding. */
export const DROP_ROOM_SECONDS = 0.5;
/** Where it may come to lie, in px from the person's middle (+ = further along the street), in order of preference. */
export const DROP_SPOTS = [12, 24, 36, -12, -24] as const;
/** Width and height of an item's pickup box (the item sprites are at most this big). */
export const ITEM_BOX = 7;

export interface DroppedItem extends Rect {
  item: CarriedItem;
  /** Screen x of the box middle where it comes to lie (scrolls with the street). */
  toX: number;
  /** Where the fall started (box middle; scrolls with the street). */
  fromX: number;
  fromY: number;
  /** Upward start speed of the fall (px/s, negative = up). */
  vy0: number;
  ticks: number;
  lying: boolean;
}

const REST_Y = GROUND_Y - ITEM_BOX;

export class DroppedItems {
  readonly items: DroppedItem[] = [];

  /**
   * The item falls from `hand` (screen space) onto the first free spot
   * (`streetFree` over DROP_ROOM_SECONDS of riding at `speed` around it).
   * False when no spot is free: then nothing drops.
   */
  drop(item: CarriedItem, hand: Point, speed: number, streetFree: StreetCheck): boolean {
    const room = DROP_ROOM_SECONDS * speed;
    const spot = DROP_SPOTS.find((s) => streetFree(hand.x + s - room, hand.x + s + room));
    if (spot === undefined) return false;
    const fromY = hand.y - ITEM_BOX / 2;
    const vy0 = (REST_Y - fromY - 0.5 * DROP_GRAVITY * DROP_TIME * DROP_TIME) / DROP_TIME;
    const half = ITEM_BOX / 2;
    this.items.push({ item, x: hand.x - half, y: fromY, w: ITEM_BOX, h: ITEM_BOX, toX: hand.x + spot, fromX: hand.x, fromY, vy0, ticks: 0, lying: false });
    return true;
  }

  /** One tick: everything scrolls `dx` with the street, falling items move on, items past the left edge are gone. */
  update(dx: number, dt: number): void {
    let kept = 0;
    for (let i = 0; i < this.items.length; i++) {
      const d = this.items[i]!;
      d.toX -= dx;
      d.fromX -= dx;
      if (!d.lying) fall(d, dt);
      d.x = (d.lying ? d.toX : d.fromX + (d.toX - d.fromX) * Math.min(1, (d.ticks * dt) / DROP_TIME)) - d.w / 2;
      if (d.x + d.w >= 0) this.items[kept++] = d;
    }
    this.items.length = kept;
  }

  /** The first item `body` touches, taken off the street; null if none. */
  pickUp(body: Rect): CarriedItem | null {
    const i = this.items.findIndex((d) => overlaps(body, d));
    if (i < 0) return null;
    return this.items.splice(i, 1)[0]!.item;
  }

  reset(): void {
    this.items.length = 0;
  }
}

function fall(d: DroppedItem, dt: number): void {
  d.ticks++;
  const t = d.ticks * dt;
  if (t >= DROP_TIME - 1e-9) {
    d.lying = true;
    d.y = REST_Y;
    return;
  }
  d.y = d.fromY + d.vy0 * t + 0.5 * DROP_GRAVITY * t * t;
}
