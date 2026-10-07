/** Zone order: 0 Stuttgart-Mitte, 1 Neckar, 2 Bad Cannstatt. */
export const ZONE_COUNT = 3;

/** Distance (view px) each zone lasts: ~44 s at start speed, ~18 s at top speed. */
export const ZONE_LENGTH = 4000;

export function normalizeZone(index: number): number {
  return ((Math.floor(index) % ZONE_COUNT) + ZONE_COUNT) % ZONE_COUNT;
}

/** Tracks how far the current zone has run and when the next one is due. */
export class ZoneClock {
  private start = 0;

  /** The current zone began at `distance`. */
  reset(distance = 0): void {
    this.start = distance;
  }

  /** The zone after `current` once this one has lasted ZONE_LENGTH, else null. */
  due(distance: number, current: number): number | null {
    return distance - this.start >= ZONE_LENGTH ? normalizeZone(current + 1) : null;
  }
}
