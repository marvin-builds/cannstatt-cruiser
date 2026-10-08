/**
 * Rng-free timing for occasional sounds: the run time is cut into slots and a
 * hash of the slot index decides whether and what sounds in that slot, so the
 * same run sounds the same (traffic horns, park clacks).
 */

/** Deterministic 0..1 value for a slot index and a salt (integer hash). */
export function slotHash(slot: number, salt: number): number {
  let h = Math.imul(slot ^ salt, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** Fires once per slot of `length` seconds; tells whether a new slot began. */
export class Slots {
  private last: number | null = null;
  index = 0;
  constructor(private readonly length: number) {}

  enter(time: number): boolean {
    this.index = Math.floor(time / this.length);
    if (this.index === this.last) return false;
    this.last = this.index;
    return true;
  }

  reset(): void {
    this.last = null;
  }
}
