/** Zone order: 0 Stuttgart-Mitte, 1 Neckar, 2 Bad Cannstatt. */
export const ZONE_COUNT = 3;

/** Ground distance (view px) one zone lasts: 56 paving tiles, ~40 s at start speed, ~16 s at top speed. */
export const ZONE_LENGTH = 3584;

/** Gateways are aligned to the ground paving period, so the paving seam never cuts a tile. */
export const SEAM_GRID = 64;

/** Ground distance over which the sky palette blends into the next zone, centred on the gateway. */
export const PALETTE_BLEND = 960;

/** A parallax depth: scroll factor and the screen x of its seam when the gateway reaches the player. */
export interface Depth {
  readonly factor: number;
  readonly seamAt: number;
}

/** One zone's stretch along a layer, in layer px. Leg 0 reaches back forever. */
export interface Leg {
  readonly index: number;
  readonly zone: number;
  readonly from: number;
  readonly to: number;
}

export interface PaletteBlend {
  readonly from: number;
  readonly to: number;
  /** 0 = all `from`, 1 = all `to`. */
  readonly t: number;
}

export function normalizeZone(index: number): number {
  return ((Math.floor(index) % ZONE_COUNT) + ZONE_COUNT) % ZONE_COUNT;
}

/**
 * The deterministic zone schedule of a run. Leg 0 is the zone shown since the
 * last snap; leg k (k >= 1) begins at ground distance `boundary(k)`, when its
 * gateway reaches the player. Every parallax layer carries the same legs,
 * shifted by its own factor and seam offset.
 */
export class ZoneRoute {
  private first = 0;
  private firstBoundary = ZONE_LENGTH;

  constructor(private readonly length = ZONE_LENGTH) {}

  /** Shows `zone` from `distance` on with no transition; the next gateway is a full zone length away. */
  snap(zone: number, distance: number): void {
    this.first = normalizeZone(zone);
    this.firstBoundary = Math.ceil((distance + this.length) / SEAM_GRID) * SEAM_GRID;
  }

  /** Ground distance at which leg `k` (>= 1) starts. */
  boundary(k: number): number {
    return this.firstBoundary + (k - 1) * this.length;
  }

  zoneOf(k: number): number {
    return normalizeZone(this.first + k);
  }

  /** Leg whose gateway the player has passed at `distance`. */
  legAt(distance: number): number {
    return distance < this.firstBoundary ? 0 : Math.floor((distance - this.firstBoundary) / this.length) + 1;
  }

  zoneAt(distance: number): number {
    return this.zoneOf(this.legAt(distance));
  }

  /** Layer x where leg `k` (>= 1) begins on `depth` (an integer). */
  seam(depth: Depth, k: number): number {
    return Math.floor(depth.factor * this.boundary(k)) + depth.seamAt;
  }

  /** Screen x of leg `k`'s seam on `depth` at ground distance `distance`. */
  seamScreenX(depth: Depth, k: number, distance: number): number {
    return this.seam(depth, k) - Math.floor(depth.factor * distance);
  }

  legAtLayer(depth: Depth, x: number): Leg {
    if (x < this.seam(depth, 1)) return this.leg(depth, 0);
    let k = Math.max(1, Math.floor(((x - depth.seamAt) / depth.factor - this.firstBoundary) / this.length) + 1);
    while (this.seam(depth, k + 1) <= x) k++;
    while (k > 1 && this.seam(depth, k) > x) k--;
    return this.leg(depth, k);
  }

  /** Legs overlapping layer range [from, to), left to right. */
  legs(depth: Depth, from: number, to: number): Leg[] {
    const list = [this.legAtLayer(depth, from)];
    while (list.at(-1)!.to < to) list.push(this.leg(depth, list.at(-1)!.index + 1));
    return list;
  }

  /** Sky palette mix at `distance`: blends across PALETTE_BLEND around each gateway. */
  blend(distance: number): PaletteBlend {
    const half = PALETTE_BLEND / 2;
    const leg = this.legAt(distance);
    for (const k of [leg, leg + 1]) {
      if (k < 1) continue;
      const start = this.boundary(k) - half;
      if (distance >= start && distance < start + PALETTE_BLEND) {
        return { from: this.zoneOf(k - 1), to: this.zoneOf(k), t: (distance - start) / PALETTE_BLEND };
      }
    }
    const zone = this.zoneOf(leg);
    return { from: zone, to: zone, t: 1 };
  }

  private leg(depth: Depth, k: number): Leg {
    return { index: k, zone: this.zoneOf(k), from: k === 0 ? -Infinity : this.seam(depth, k), to: this.seam(depth, k + 1) };
  }
}
