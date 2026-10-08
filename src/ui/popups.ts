import { measureText } from '../core/font';
import { FONT_LINE_HEIGHT } from '../core/font-data';
import type { Rect } from '../types';

/** Seconds a floating popup ("+50", "Grind!") stays visible. */
export const POPUP_LIFETIME = 0.9;
/** View pixels a popup rises over its lifetime. */
const RISE = 14;
/** Rows of a popup line beyond the glyphs: the 1 px outline above and below, plus a 1 px gap. */
const LINE_PAD = 3;

/** Rows one popup line takes in the stack at font scale `scale` (outline and gap included). */
export function popupHeight(scale: number): number {
  return (FONT_LINE_HEIGHT + LINE_PAD) * scale;
}
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
  /** Spawn order: the stack keeps newer popups below older ones. */
  seq: number;
  /** The spawn centre x. */
  baseX: number;
  /** Least left edge after moving beside an `avoid` box it would have covered (0: never moved); kept for its life. */
  minLeft: number;
}

/** Gap between the avoided box and a popup moved beside it. */
const ASIDE_GAP = 2;

/**
 * Fixed-size pool of floating texts: spawning reuses slots (the oldest when
 * full), so the HUD allocates nothing per frame. A repeat of a live popup
 * ("Stern!") merges into it ("Stern! x2") instead of stacking, and moves to
 * the newest slot as if just spawned. Live popups
 * form one column above the skater: each rises on its own, but the newest
 * sits at the bottom and older ones are pushed up so no two ever overlap,
 * and the whole column is pushed down so none rises above `ceiling` (the
 * bottom of the HUD plate). When that pushes the column below `floor`,
 * the oldest popups are dropped (the newest always stays). A popup that
 * would cover an `avoid` box (the skater, the portrait item button) moves
 * to its right, and stays there.
 */
export class PopupPool {
  /** Smallest top edge a popup may reach (view pixels). */
  ceiling = 0;
  /** Largest bottom edge (view pixels): when the ceiling pushes the column below it, the oldest popups go. */
  floor = Infinity;
  /** Boxes no popup may cover, left to right (the skater and the item button, set every tick). */
  avoid: readonly Rect[] = [];
  private readonly slots: Slot[];
  private readonly visible: Popup[] = [];
  /** Live slots, newest first (reused by layout()). */
  private readonly column: Slot[] = [];
  private spawned = 0;

  constructor(capacity: number) {
    this.slots = Array.from({ length: capacity }, () => ({
      text: '', base: '', count: 0, color: '', scale: 1, x: 0, y: 0, baseY: 0, age: 0, time: 0, alive: false, icon: null, seq: 0, baseX: 0, minLeft: 0,
    }));
  }

  spawn(text: string, x: number, y: number, color: string, scale = 1, icon: Popup['icon'] = null): void {
    const baseY = Math.max(Math.round(y), this.ceiling + RISE);
    const seq = ++this.spawned;
    // A repeat merges and then counts as just spawned: newest slot at the bottom, rising again from the new spot.
    const repeat = this.slots.find((s) => s.alive && s.base === text && s.color === color);
    if (repeat) {
      repeat.count++;
      Object.assign(repeat, { text: `${text} x${repeat.count}`, x: Math.round(x), baseX: Math.round(x), minLeft: 0, y: baseY, baseY, age: 0, time: 0, seq });
      this.layout();
      return;
    }
    const slot = this.slots.find((s) => !s.alive) ?? this.oldest();
    Object.assign(slot, { text, base: text, count: 1, color, scale, x: Math.round(x), baseX: Math.round(x), minLeft: 0, y: baseY, baseY, age: 0, time: 0, alive: true, icon, seq });
    this.layout();
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
    }
    this.layout();
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
   * Places the live popups: each at its own risen height, but at least one
   * line above the popup spawned after it; then, from the top, at least at the
   * ceiling and one line below the popup above.
   */
  private layout(): void {
    const col = this.column;
    col.length = 0;
    for (const s of this.slots) if (s.alive) col.push(s);
    col.sort(newestFirst);
    for (let i = 0; i < col.length; i++) {
      const s = col[i]!;
      const own = s.baseY - Math.round(RISE * Math.sin((s.age * Math.PI) / 2));
      s.y = i === 0 ? own : Math.min(own, col[i - 1]!.y - popupHeight(s.scale));
    }
    for (let i = col.length - 1; i >= 0; i--) {
      const s = col[i]!;
      const above = col[i + 1];
      s.y = Math.max(s.y, above ? above.y + popupHeight(above.scale) : this.ceiling);
    }
    const newest = col[0];
    if (col.length > 1 && newest!.y + popupHeight(newest!.scale) > this.floor) {
      col[col.length - 1]!.alive = false;
      this.layout();
      return;
    }
    for (let i = 0; i < col.length; i++) this.keepClear(col[i]!);
  }

  /** Moves `s` right of every avoid box its text (outline included) would cover. */
  private keepClear(s: Slot): void {
    const half = Math.ceil((measureText(s.text, s.scale) + 2) / 2);
    const top = s.y - 1;
    const bottom = s.y + FONT_LINE_HEIGHT * s.scale + 1;
    s.x = Math.max(s.baseX, s.minLeft + half);
    for (let i = 0; i < this.avoid.length; i++) {
      const box = this.avoid[i]!;
      if (s.x - half < box.x + box.w && box.x < s.x + half && top < box.y + box.h && box.y < bottom) {
        s.minLeft = Math.max(s.minLeft, box.x + box.w + ASIDE_GAP);
        s.x = s.minLeft + half;
      }
    }
  }

  private oldest(): Slot {
    return this.slots.reduce((a, b) => (b.time > a.time ? b : a));
  }
}

const newestFirst = (a: Slot, b: Slot) => b.seq - a.seq;
