/** Seconds a floating popup ("+50", "Grind!") stays visible. */
export const POPUP_LIFETIME = 0.9;
/** View pixels a popup rises over its lifetime. */
const RISE = 14;
/** Vertical gap between popups spawned at (nearly) the same spot, per unit of font scale. */
const STACK_GAP = 10;
/** Popups closer than this horizontally count as the same spot. */
const SAME_SPOT = 24;

export interface Popup {
  /** What to draw: the spawned text, plus " x3" once it was merged with repeats. */
  text: string;
  color: string;
  /** Integer font scale. */
  scale: number;
  x: number;
  /** Current top edge (integer view pixels), already including the rise. */
  y: number;
  /** 0 at spawn .. 1 at the end of its life. */
  age: number;
  /** Small icon drawn after the text ("Lecker! +1" and a heart), or null. */
  icon: 'heart' | null;
}

interface Slot extends Popup {
  base: string;
  count: number;
  baseY: number;
  time: number;
  alive: boolean;
}

/**
 * Fixed-size pool of floating texts: spawning reuses slots (the oldest when
 * full), so the HUD allocates nothing per frame. A repeat of a live popup
 * ("Stern!") merges into it ("Stern! x2") instead of stacking, and no popup
 * ever rises above `ceiling` (the bottom of the HUD plate).
 */
export class PopupPool {
  /** Smallest top edge a popup may reach (view pixels). */
  ceiling = 0;
  private readonly slots: Slot[];
  private readonly visible: Popup[] = [];

  constructor(capacity: number) {
    this.slots = Array.from({ length: capacity }, () => ({
      text: '', base: '', count: 0, color: '', scale: 1, x: 0, y: 0, baseY: 0, age: 0, time: 0, alive: false, icon: null,
    }));
  }

  spawn(text: string, x: number, y: number, color: string, scale = 1, icon: Popup['icon'] = null): void {
    const repeat = this.slots.find((s) => s.alive && s.base === text && s.color === color);
    if (repeat) {
      repeat.count++;
      repeat.text = `${text} x${repeat.count}`;
      repeat.time = 0;
      repeat.age = 0;
      repeat.y = repeat.baseY;
      return;
    }
    const slot = this.slots.find((s) => !s.alive) ?? this.oldest();
    slot.alive = false;
    const baseY = this.freeY(Math.round(x), Math.max(Math.round(y), this.ceiling + RISE), scale);
    Object.assign(slot, { text, base: text, count: 1, color, scale, x: Math.round(x), y: baseY, baseY, age: 0, time: 0, alive: true, icon });
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.alive) continue;
      s.time += dt;
      if (s.time >= POPUP_LIFETIME) {
        s.alive = false;
        continue;
      }
      s.age = s.time / POPUP_LIFETIME;
      s.y = s.baseY - Math.round(RISE * Math.sin((s.age * Math.PI) / 2));
    }
  }

  /** Live popups; the returned array is reused between calls. */
  active(): readonly Popup[] {
    this.visible.length = 0;
    for (const s of this.slots) if (s.alive) this.visible.push(s);
    return this.visible;
  }

  clear(): void {
    for (const s of this.slots) s.alive = false;
  }

  /**
   * A start height near `y` that no live popup at the same spot occupies:
   * stacked upwards while that stays below the ceiling, else downwards.
   */
  private freeY(x: number, y: number, scale: number): number {
    const taken = (top: number) =>
      this.slots.some((s) => s.alive && Math.abs(s.x - x) < SAME_SPOT && Math.abs(s.y - top) < STACK_GAP * Math.max(s.scale, scale));
    const step = STACK_GAP * scale;
    for (let top = y; top - RISE >= this.ceiling; top -= step) if (!taken(top)) return top;
    let top = y;
    while (taken(top)) top += step;
    return top;
  }

  private oldest(): Slot {
    return this.slots.reduce((a, b) => (b.time > a.time ? b : a));
  }
}
