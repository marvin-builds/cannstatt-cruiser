/** Seconds a floating popup ("+50", "Grind!") stays visible. */
export const POPUP_LIFETIME = 0.9;
/** View pixels a popup rises over its lifetime. */
const RISE = 14;
/** Vertical gap between popups spawned at (nearly) the same spot. */
const STACK_GAP = 10;

export interface Popup {
  text: string;
  color: string;
  x: number;
  /** Current top edge (integer view pixels), already including the rise. */
  y: number;
  /** 0 at spawn .. 1 at the end of its life. */
  age: number;
}

interface Slot extends Popup {
  baseY: number;
  time: number;
  alive: boolean;
}

/**
 * Fixed-size pool of floating texts: spawning reuses slots (the oldest when
 * full), so the HUD allocates nothing per frame.
 */
export class PopupPool {
  private readonly slots: Slot[];
  private readonly visible: Popup[] = [];

  constructor(capacity: number) {
    this.slots = Array.from({ length: capacity }, () => ({ text: '', color: '', x: 0, y: 0, baseY: 0, age: 0, time: 0, alive: false }));
  }

  spawn(text: string, x: number, y: number, color: string): void {
    let baseY = Math.round(y);
    // Push it above any young popup near the same spot so texts never overlap.
    for (const s of this.slots) {
      if (s.alive && Math.abs(s.x - x) < 24 && Math.abs(s.y - baseY) < STACK_GAP) baseY = s.y - STACK_GAP;
    }
    const slot = this.slots.find((s) => !s.alive) ?? this.oldest();
    Object.assign(slot, { text, color, x: Math.round(x), y: baseY, baseY, age: 0, time: 0, alive: true });
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

  private oldest(): Slot {
    return this.slots.reduce((a, b) => (b.time > a.time ? b : a));
  }
}
