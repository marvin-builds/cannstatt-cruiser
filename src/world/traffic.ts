/**
 * Stuttgart-Mitte traffic on the foreground street (the asphalt band below the
 * riding line): two lanes of cars, vans and buses in opposite directions, each
 * leaving grey exhaust puffs. DOM-free and allocation-free while driving
 * (fixed pools); the art lives in art/traffic.ts.
 */
import { GROUND_Y } from '../core/config';
import type { Rng } from '../core/rng';
import type { ZoneRoute } from './zones';

/** Nothing of the traffic (vehicle roofs, exhaust puffs) ever reaches above this view y. */
export const TRAFFIC_TOP = GROUND_Y + 6;

/** Zone that has traffic. */
const TRAFFIC_ZONE = 0;
/** Ground distance before the Mitte gateway where traffic starts ramping in (and after it leaves, out). */
const RAMP_LEAD = 160;
/** Ground distance the ramp takes from no traffic to full traffic ("auf einmal"). */
const RAMP_LENGTH = 400;

export type VehicleKind = 'hatch' | 'sedan' | 'van' | 'bus';

/** Vehicle sizes in view px (art/traffic.ts paints them to exactly this size). */
export const VEHICLES: Readonly<Record<VehicleKind, { readonly w: number; readonly h: number; readonly puffEvery: readonly [number, number] }>> = {
  hatch: { w: 17, h: 8, puffEvery: [0.35, 0.75] },
  sedan: { w: 22, h: 8, puffEvery: [0.35, 0.75] },
  van: { w: 24, h: 11, puffEvery: [0.3, 0.6] },
  bus: { w: 42, h: 13, puffEvery: [0.2, 0.4] },
};

/** Weighted bag the next vehicle is drawn from. */
const KIND_BAG: readonly VehicleKind[] = ['hatch', 'hatch', 'sedan', 'sedan', 'sedan', 'van', 'van', 'bus'];

/** Number of body colours per kind the art offers. */
export const VEHICLE_VARIANTS = 4;

export interface Lane {
  /** View y of the wheels' bottom row. */
  readonly bottom: number;
  /** 1 = drives right (with the skater), -1 = oncoming. */
  readonly dir: 1 | -1;
  /**
   * Cruise speed range (px/s): over the street for oncoming traffic, relative
   * to the skater for traffic in his direction (it always overtakes him, so no
   * vehicle ever stalls on screen whatever his speed).
   */
  readonly speed: readonly [number, number];
  /** Seconds between two vehicles at full density. */
  readonly interval: readonly [number, number];
}

/** Back lane first (drawn first). */
export const LANES: readonly Lane[] = [
  { bottom: GROUND_Y + 21, dir: 1, speed: [35, 95], interval: [0.55, 1.2] },
  { bottom: GROUND_Y + 29, dir: -1, speed: [40, 110], interval: [0.4, 0.95] },
];

/** Smallest bumper-to-bumper gap in a lane. */
const MIN_GAP = 4;
const MAX_VEHICLES = 18;
const MAX_PUFFS = 64;
/** Exhaust puff lifetime (s) and rise speed (px/s). */
export const PUFF_LIFE = 1.4;
const PUFF_RISE = 8;
/** Sideways drift of a puff relative to the street (px/s, wind). */
const PUFF_DRIFT = -4;

export interface Vehicle {
  active: boolean;
  kind: VehicleKind;
  variant: number;
  lane: number;
  /** Screen x of the left edge (float). */
  x: number;
  /** View y of the roof (top row). */
  top: number;
  /** Cruise speed (px/s, see Lane.speed). */
  speed: number;
  /** Current speed after following the vehicle ahead. */
  pace: number;
  puffTimer: number;
}

export interface Puff {
  active: boolean;
  x: number;
  y: number;
  age: number;
}

/**
 * Traffic density 0..1 at a ground distance: 1 inside Stuttgart-Mitte, ramping
 * in quickly around the gateway into Mitte and out around the one leaving it.
 */
export function trafficDensity(route: ZoneRoute, distance: number): number {
  const k = route.legAt(distance);
  let density = 0;
  for (let leg = k - 1; leg <= k + 1; leg++) {
    if (leg < 0 || route.zoneOf(leg) !== TRAFFIC_ZONE) continue;
    const enter = leg === 0 ? 1 : ramp((distance - (route.boundary(leg) - RAMP_LEAD)) / RAMP_LENGTH);
    const leave = ramp((route.boundary(leg + 1) + RAMP_LEAD - distance) / RAMP_LENGTH);
    density = Math.max(density, Math.min(enter, leave));
  }
  return density;
}

function firstInactive<T extends { active: boolean }>(pool: readonly T[]): T | null {
  for (const item of pool) if (!item.active) return item;
  return null;
}

function ramp(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export class Traffic {
  readonly vehicles: readonly Vehicle[];
  readonly puffs: readonly Puff[];
  /** Seconds (scaled by density) until each lane's next vehicle. */
  private readonly timers: number[];

  constructor(private readonly rng: Rng) {
    this.vehicles = Array.from({ length: MAX_VEHICLES }, () => ({
      active: false,
      kind: 'hatch' as VehicleKind,
      variant: 0,
      lane: 0,
      x: 0,
      top: 0,
      speed: 0,
      pace: 0,
      puffTimer: 0,
    }));
    this.puffs = Array.from({ length: MAX_PUFFS }, () => ({ active: false, x: 0, y: 0, age: 0 }));
    this.timers = LANES.map(() => 0);
  }

  reset(): void {
    for (const v of this.vehicles) v.active = false;
    for (const p of this.puffs) p.active = false;
    for (let i = 0; i < this.timers.length; i++) this.timers[i] = 0;
  }

  /** One step: `scroll` = view px the street moved left this step, `density` 0..1. */
  update(dt: number, scroll: number, density: number, viewWidth: number): void {
    this.movePuffs(dt, scroll);
    this.follow();
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const w = VEHICLES[v.kind].w;
      v.x += LANES[v.lane]!.dir === 1 ? v.pace * dt : -v.pace * dt - scroll;
      if (v.x > viewWidth + 2 || v.x + w < -2) {
        v.active = false;
        continue;
      }
      v.puffTimer -= dt;
      if (v.puffTimer <= 0) this.puff(v);
    }
    this.keepApart();
    if (density > 0) this.spawn(dt, density, viewWidth);
  }

  /** Slows a vehicle that has closed up on the one ahead to that one's pace. */
  private follow(): void {
    for (const v of this.vehicles) if (v.active) v.pace = v.speed;
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const ahead = this.ahead(v);
      if (ahead && this.gap(v, ahead) < MIN_GAP * 3) v.pace = Math.min(v.pace, ahead.pace);
    }
  }

  /** Never lets a vehicle overlap the one ahead (pushes it back to the minimum gap). */
  private keepApart(): void {
    for (let pass = 0; pass < 3; pass++) {
      for (const v of this.vehicles) {
        if (!v.active) continue;
        const ahead = this.ahead(v);
        if (!ahead) continue;
        const short = MIN_GAP - this.gap(v, ahead);
        if (short > 0) v.x -= LANES[v.lane]!.dir * short;
      }
    }
  }

  /** Nearest active vehicle in front of `v` in its driving direction, or null. */
  private ahead(v: Vehicle): Vehicle | null {
    const dir = LANES[v.lane]!.dir;
    let best: Vehicle | null = null;
    for (const o of this.vehicles) {
      if (!o.active || o === v || o.lane !== v.lane) continue;
      if ((o.x - v.x) * dir <= 0) continue;
      if (!best || (o.x - best.x) * dir < 0) best = o;
    }
    return best;
  }

  /** Free street between `v` and the vehicle `ahead` of it. */
  private gap(v: Vehicle, ahead: Vehicle): number {
    return LANES[v.lane]!.dir === 1 ? ahead.x - (v.x + VEHICLES[v.kind].w) : v.x - (ahead.x + VEHICLES[ahead.kind].w);
  }

  private spawn(dt: number, density: number, viewWidth: number): void {
    for (let lane = 0; lane < LANES.length; lane++) {
      this.timers[lane]! -= dt * density;
      if (this.timers[lane]! > 0) continue;
      const slot = firstInactive(this.vehicles);
      if (!slot) return;
      const spec = LANES[lane]!;
      const kind = this.rng.pick(KIND_BAG);
      const { w, h, puffEvery } = VEHICLES[kind];
      const speed = Math.round(this.rng.range(spec.speed[0], spec.speed[1]));
      const x = spec.dir === 1 ? -w - 1 : viewWidth + 1;
      if (!this.clear(lane, x, w)) continue;
      slot.active = true;
      slot.kind = kind;
      slot.variant = this.rng.int(0, VEHICLE_VARIANTS - 1);
      slot.lane = lane;
      slot.x = x;
      slot.top = spec.bottom - h + 1;
      slot.speed = speed;
      slot.pace = speed;
      slot.puffTimer = this.rng.range(0, puffEvery[1]);
      this.timers[lane] = this.rng.range(spec.interval[0], spec.interval[1]);
    }
  }

  /** True if a vehicle `w` wide fits at `x` in `lane` with room to spare. */
  private clear(lane: number, x: number, w: number): boolean {
    const room = MIN_GAP * 3;
    for (const o of this.vehicles) {
      if (!o.active || o.lane !== lane) continue;
      if (x - room < o.x + VEHICLES[o.kind].w && o.x < x + w + room) return false;
    }
    return true;
  }

  private puff(v: Vehicle): void {
    const { w, puffEvery } = VEHICLES[v.kind];
    const lane = LANES[v.lane]!;
    v.puffTimer = this.rng.range(puffEvery[0], puffEvery[1]);
    const p = firstInactive(this.puffs);
    if (!p) return;
    p.active = true;
    p.x = lane.dir === 1 ? v.x - 2 : v.x + w + 1;
    p.y = lane.bottom - 2;
    p.age = 0;
  }

  private movePuffs(dt: number, scroll: number): void {
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.age += dt;
      p.x += PUFF_DRIFT * dt - scroll;
      p.y -= PUFF_RISE * dt;
      if (p.age >= PUFF_LIFE || p.y < TRAFFIC_TOP) p.active = false;
    }
  }
}
