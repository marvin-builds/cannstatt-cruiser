import { START_ZONE } from '../core/config';

/** Every run (and the title) starts in Bad Cannstatt; the single source is core/config. */
export { START_ZONE };

/** Zone indices: 0 Stuttgart-Mitte, 1 Neckar, 2 Bad Cannstatt. */
export const ZONE_COUNT = 3;

/**
 * The route rides back and forth along the river, always to a neighbouring
 * zone: Cannstatt -> Neckar -> Mitte -> Neckar -> Cannstatt -> ...
 */
export const ROUTE_CYCLE: readonly number[] = [2, 1, 0, 1];

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

/**
 * One zone's stretch along a layer, in layer px. Leg 0 reaches back forever.
 * Mutable so per-frame lists can reuse their legs (see ZoneRoute.legs).
 */
export interface Leg {
  index: number;
  zone: number;
  /** Zone the route came from (through this leg's gateway) and the zone it goes on to. */
  previous: number;
  next: number;
  from: number;
  to: number;
}

/** Sky palette mix; mutable so a frame can reuse one (see ZoneRoute.blend). */
export interface PaletteBlend {
  from: number;
  to: number;
  /** 0 = all `from`, 1 = all `to`. */
  t: number;
}

export function normalizeZone(index: number): number {
  return ((Math.floor(index) % ZONE_COUNT) + ZONE_COUNT) % ZONE_COUNT;
}

/** Position in ROUTE_CYCLE a snap to `zone` continues from (the Neckar heads on to Mitte). */
function cyclePosition(zone: number): number {
  return ROUTE_CYCLE.indexOf(normalizeZone(zone));
}

/**
 * The deterministic zone schedule of a run. Leg 0 is the zone shown since the
 * last snap; leg k (k >= 1) begins at ground distance `boundary(k)`, when its
 * gateway reaches the player. Every parallax layer carries the same legs,
 * shifted by its own factor and seam offset. A new route starts in START_ZONE.
 */
export class ZoneRoute {
  /** ROUTE_CYCLE position of leg 0. */
  private first = cyclePosition(START_ZONE);
  private firstBoundary: number;

  constructor(private readonly length = ZONE_LENGTH) {
    this.firstBoundary = length;
  }

  /** Shows `zone` from `distance` on with no transition; the next gateway is a full zone length away. */
  snap(zone: number, distance: number): void {
    this.first = cyclePosition(zone);
    this.firstBoundary = Math.ceil((distance + this.length) / SEAM_GRID) * SEAM_GRID;
  }

  /** Ground distance at which leg `k` (>= 1) starts. */
  boundary(k: number): number {
    return this.firstBoundary + (k - 1) * this.length;
  }

  /** Zone of leg `k` (also defined for k < 0: the zones the route came from). */
  zoneOf(k: number): number {
    const n = ROUTE_CYCLE.length;
    return ROUTE_CYCLE[(((this.first + k) % n) + n) % n]!;
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

  zoneAtLayer(depth: Depth, x: number): number {
    return this.zoneOf(this.legIndexAtLayer(depth, x));
  }

  /**
   * Legs overlapping layer range [from, to), left to right, written into
   * `out` (it reuses its legs, so a caller-owned list allocates nothing per frame).
   */
  legs(depth: Depth, from: number, to: number, out = new LegList()): LegList {
    let k = this.legIndexAtLayer(depth, from);
    out.clear();
    while (this.fill(depth, k++, out.next()).to < to);
    return out;
  }

  /** Sky palette mix at `distance`, written into `out`: blends across PALETTE_BLEND around each gateway. */
  blend(distance: number, out: PaletteBlend = { from: 0, to: 0, t: 1 }): PaletteBlend {
    const half = PALETTE_BLEND / 2;
    const leg = this.legAt(distance);
    for (let k = Math.max(1, leg); k <= leg + 1; k++) {
      const start = this.boundary(k) - half;
      if (distance >= start && distance < start + PALETTE_BLEND) {
        out.from = this.zoneOf(k - 1);
        out.to = this.zoneOf(k);
        out.t = (distance - start) / PALETTE_BLEND;
        return out;
      }
    }
    out.from = out.to = this.zoneOf(leg);
    out.t = 1;
    return out;
  }

  private legIndexAtLayer(depth: Depth, x: number): number {
    if (x < this.seam(depth, 1)) return 0;
    let k = Math.max(1, Math.floor(((x - depth.seamAt) / depth.factor - this.firstBoundary) / this.length) + 1);
    while (this.seam(depth, k + 1) <= x) k++;
    while (k > 1 && this.seam(depth, k) > x) k--;
    return k;
  }

  private fill(depth: Depth, k: number, leg: Leg): Leg {
    leg.index = k;
    leg.zone = this.zoneOf(k);
    leg.previous = this.zoneOf(k - 1);
    leg.next = this.zoneOf(k + 1);
    leg.from = k === 0 ? -Infinity : this.seam(depth, k);
    leg.to = this.seam(depth, k + 1);
    return leg;
  }
}

function blankLeg(): Leg {
  return { index: 0, zone: 0, previous: 0, next: 0, from: 0, to: 0 };
}

/** A reusable list of legs: `at(0)` .. `at(count - 1)`, left to right. */
export class LegList {
  private readonly pool: Leg[] = [];
  count = 0;

  at(i: number): Leg {
    if (i < 0 || i >= this.count) throw new RangeError(`Leg ${i} of ${this.count}`);
    return this.pool[i]!;
  }

  clear(): void {
    this.count = 0;
  }

  /** Appends a leg (a reused one when available) for the caller to fill. */
  next(): Leg {
    if (this.count === this.pool.length) this.pool.push(blankLeg());
    return this.pool[this.count++]!;
  }
}
