/**
 * Using a carried item (itemUsed): the upper-body animation and the empty
 * Maßkrug tossed away behind. Drink: the mug goes to the mouth for
 * DRINK_GULPS gulps (~1 s, the "glug glug glug"), then the empty mug is
 * tossed (MugToss). Eat: the Brezel / Lebkuchenherz goes to the mouth, two
 * bites with crumbs, gone. Throw: a quick overarm throw (gameplay draws the
 * ball from the itemUsed moment on). Looks only: no physics, no hitbox.
 * Pure timelines here; use-art.ts has the geometry, render.ts draws it.
 */
import { GROUND_Y } from '../core/config';
import type { ItemAction } from '../types';

/** Where the using arm is: see use-art.ts for the hand positions. */
export type UseArm = 'lift' | 'drink' | 'tip' | 'toss' | 'bite' | 'chew' | 'windup' | 'release';

/** How much of the item is left in the hand (null: nothing in the hand). */
export type UseItemLook = 'full' | 'empty' | 'bitten' | 'crumb';

export interface UseFrame {
  arm: UseArm;
  item: UseItemLook | null;
  /** Seconds since the last bite while its crumbs are still falling, else -1. */
  crumbs: number;
}

interface UseStep {
  t: number;
  arm: UseArm;
  item: UseItemLook | null;
  /** A bite: crumbs start falling. */
  bite?: boolean;
}

export const DRINK_GULPS = 3;
/** Seconds of one gulp: the mug tipped up, then back level at the lips. */
const GULP_TIP = 0.18;
const GULP_LEVEL = 0.1;
/** Seconds the crumbs of a bite are shown falling. */
export const CRUMB_TIME = 0.26;

const gulps: UseStep[] = Array.from({ length: DRINK_GULPS }, (_, i) => {
  // The last gulp empties the mug.
  const item: UseItemLook = i === DRINK_GULPS - 1 ? 'empty' : 'full';
  return [
    { t: GULP_TIP, arm: 'tip', item },
    { t: GULP_LEVEL, arm: 'drink', item },
  ] satisfies UseStep[];
}).flat();

const STEPS: Record<ItemAction, UseStep[]> = {
  drink: [{ t: 0.1, arm: 'lift', item: 'full' }, ...gulps, { t: 0.12, arm: 'toss', item: null }],
  eat: [
    { t: 0.08, arm: 'lift', item: 'full' },
    { t: 0.12, arm: 'bite', item: 'full', bite: true },
    { t: 0.14, arm: 'chew', item: 'bitten' },
    { t: 0.12, arm: 'bite', item: 'bitten', bite: true },
    { t: 0.14, arm: 'chew', item: 'crumb' },
    { t: 0.08, arm: 'chew', item: null },
  ],
  throw: [
    { t: 0.1, arm: 'windup', item: null },
    { t: 0.16, arm: 'release', item: null },
  ],
};

const total = (steps: UseStep[]) => steps.reduce((sum, s) => sum + s.t, 0);

/** Seconds each use animation lasts. */
export const ITEM_USE_TIME: Record<ItemAction, number> = {
  drink: total(STEPS.drink),
  eat: total(STEPS.eat),
  throw: total(STEPS.throw),
};

/** Seconds into the drink when the empty mug leaves the hand (start of the toss). */
export const TOSS_AT = ITEM_USE_TIME.drink - STEPS.drink.at(-1)!.t;

/** The frame of `action` at `time` seconds after itemUsed, or null once it is over. */
export function itemUseFrame(action: ItemAction, time: number): UseFrame | null {
  let t = time;
  let sinceBite = -1;
  for (const step of STEPS[action]) {
    if (step.bite) sinceBite = 0;
    if (t < step.t) {
      const crumbs = sinceBite < 0 ? -1 : sinceBite + t;
      return { arm: step.arm, item: step.item, crumbs: crumbs <= CRUMB_TIME ? crumbs : -1 };
    }
    t -= step.t;
    if (sinceBite >= 0) sinceBite += step.t;
  }
  return null;
}

/** Flight of the tossed mug (view px / s): back over the shoulder, then lying on the street. */
const TOSS_VX = -55;
const TOSS_VY = -70;
const TOSS_GRAVITY = 520;
/** Seconds after which a mug left on a stopped street (speed 0) is gone anyway. */
const TOSS_MAX_TIME = 3;

/**
 * The empty Maßkrug tossed away behind the skater: a ballistic arc in screen
 * space from the hand, then it lies on the street and moves left with it
 * until it is off screen. One per player; `start` replaces a mug still flying.
 */
export class MugToss {
  active = false;
  x = 0;
  y = 0;
  /** Seconds since the toss (drives the spin). */
  age = 0;
  landed = false;
  private vy = 0;

  start(x: number, y: number): void {
    this.active = true;
    this.landed = false;
    this.x = x;
    this.y = y;
    this.vy = TOSS_VY;
    this.age = 0;
  }

  reset(): void {
    this.active = false;
  }

  update(dt: number, speed: number): void {
    if (!this.active) return;
    this.age += dt;
    if (this.landed) this.x -= speed * dt;
    else {
      this.x += TOSS_VX * dt;
      this.vy += TOSS_GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.landed = true;
      }
    }
    if (this.x < -12 || this.age > TOSS_MAX_TIME) this.active = false;
  }
}
