/**
 * Stuttgart-Mitte traffic on the foreground street, close to the camera: a
 * back lane of cars and vans driving with the skater (drawn behind gameplay)
 * and an oncoming front lane that adds city buses and trucks (drawn in front
 * of gameplay, so it starts below everything gameplay draws). Vehicles leave
 * big exhaust clouds that drift up behind gameplay, flash their headlights
 * now and then (honk) and make the street rumble by 1 px while a bus or truck
 * passes. DOM-free and allocation-free while driving (fixed pools); the art
 * lives in art/traffic.ts.
 */
import { GROUND_Y, VIEW_H } from '../core/config';
import type { Rng } from '../core/rng';
import type { ZoneRoute } from './zones';

/** No vehicle body ever reaches above this view y (the riding line stays free). */
export const TRAFFIC_TOP = GROUND_Y + 2;
/**
 * Front-lane vehicles, drawn over gameplay, start at this view y: below the
 * deepest thing gameplay draws under the riding line (the curb gap, 6 px).
 */
export const FRONT_TOP = GROUND_Y + 7;
/** Exhaust clouds (drawn behind gameplay) never rise above this view y. */
export const EXHAUST_TOP = GROUND_Y - 44;

/** Zone that has traffic. */
const TRAFFIC_ZONE = 0;
/** Ground distance before the Mitte gateway where traffic starts ramping in (and after it leaves, out). */
const RAMP_LEAD = 160;
/** Ground distance the ramp takes from no traffic to full traffic ("auf einmal"). */
const RAMP_LENGTH = 400;

export type VehicleKind = 'hatch' | 'sedan' | 'van' | 'bus' | 'truck';

export interface VehicleSpec {
  readonly w: number;
  readonly h: number;
  /** Seconds between two exhaust clouds. */
  readonly puffEvery: readonly [number, number];
  /** Buses and trucks: big diesel clouds, the street rumbles while one is on screen. */
  readonly heavy?: boolean;
}

/** Vehicle sizes in view px (art/traffic.ts paints them to exactly this size). */
export const VEHICLES: Readonly<Record<VehicleKind, VehicleSpec>> = {
  hatch: { w: 34, h: 16, puffEvery: [0.4, 0.8] },
  sedan: { w: 44, h: 16, puffEvery: [0.4, 0.8] },
  van: { w: 48, h: 22, puffEvery: [0.3, 0.6] },
  bus: { w: 88, h: 26, puffEvery: [0.18, 0.35], heavy: true },
  truck: { w: 80, h: 26, puffEvery: [0.15, 0.3], heavy: true },
};

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
  /** Weighted bag the lane's next vehicle is drawn from. */
  readonly kinds: readonly VehicleKind[];
  /** Drawn in front of gameplay (its vehicles start at FRONT_TOP or lower). */
  readonly front: boolean;
}

/**
 * Back lane first (drawn first). The front lane's wheels reach below the view
 * edge: it drives right in front of the camera.
 */
export const LANES: readonly Lane[] = [
  {
    bottom: GROUND_Y + 23,
    dir: 1,
    speed: [35, 95],
    interval: [0.3, 0.75],
    kinds: ['hatch', 'hatch', 'sedan', 'sedan', 'sedan', 'van', 'van'],
    front: false,
  },
  {
    bottom: GROUND_Y + 32,
    dir: -1,
    speed: [40, 105],
    interval: [0.25, 0.7],
    kinds: ['hatch', 'sedan', 'sedan', 'van', 'van', 'bus', 'bus', 'truck', 'truck'],
    front: true,
  },
];

/** Lowest view row (front-lane exhaust pipes sit below the view edge). */
const VIEW_BOTTOM = VIEW_H - 1;
/** Smallest bumper-to-bumper gap in a lane. */
const MIN_GAP = 6;
const MAX_VEHICLES = 20;
const MAX_PUFFS = 120;
/** Exhaust cloud lifetime (s) and rise speed (px/s). */
export const PUFF_LIFE = 3.2;
const PUFF_RISE = 18;
/** Sideways drift of a cloud relative to the street (px/s, wind). */
const PUFF_DRIFT = -6;
/** Seconds between two headlight flashes of a vehicle, and how long one lasts. */
const FLASH_EVERY: readonly [number, number] = [2.5, 7];
export const FLASH_TIME = 0.35;
/** Ticks per half period of the 1 px street rumble. */
const SHAKE_TICKS = 4;

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
  /** Seconds left of a headlight flash (honk); 0 = lights normal. */
  flash: number;
  /** Seconds until the next flash. */
  flashTimer: number;
}

export interface Puff {
  active: boolean;
  /** Street x of the cloud's centre (float). */
  x: number;
  /** View y of the cloud's top row. */
  y: number;
  age: number;
  /** A heavy vehicle's diesel cloud (grows bigger). */
  big: boolean;
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

/**
 * Screen x to draw a vehicle at in a frame between ticks: oncoming traffic
 * moves with the street (`scrollLead`, see RenderContext) and at its own pace,
 * traffic in the skater's direction only at its own pace relative to him.
 * `ahead` = seconds since the last tick.
 */
export function vehicleScreenX(v: Vehicle, scrollLead: number, ahead: number): number {
  return LANES[v.lane]!.dir === 1 ? v.x + v.pace * ahead : v.x - scrollLead - v.pace * ahead;
}

function firstInactive<T extends { active: boolean }>(pool: readonly T[]): T | null {
  for (let i = 0; i < pool.length; i++) if (!pool[i]!.active) return pool[i]!;
  return null;
}

function ramp(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export class Traffic {
  readonly vehicles: readonly Vehicle[];
  readonly puffs: readonly Puff[];
  /** Vertical offset (0 or 1 px) of the traffic lanes: the street rumbles while a bus or truck is on screen. */
  shake = 0;
  /** Seconds (scaled by density) until each lane's next vehicle. */
  private readonly timers: number[];
  private ticks = 0;

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
      flash: 0,
      flashTimer: 0,
    }));
    this.puffs = Array.from({ length: MAX_PUFFS }, () => ({ active: false, x: 0, y: 0, age: 0, big: false }));
    this.timers = LANES.map(() => 0);
  }

  reset(): void {
    for (let i = 0; i < this.vehicles.length; i++) this.vehicles[i]!.active = false;
    for (let i = 0; i < this.puffs.length; i++) this.puffs[i]!.active = false;
    for (let i = 0; i < this.timers.length; i++) this.timers[i] = 0;
    this.shake = 0;
    this.ticks = 0;
  }

  /** One step: `scroll` = view px the street moved left this step, `density` 0..1. */
  update(dt: number, scroll: number, density: number, viewWidth: number): void {
    this.movePuffs(dt, scroll);
    this.follow();
    let heavy = false;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i]!;
      if (!v.active) continue;
      const { w } = VEHICLES[v.kind];
      v.x += LANES[v.lane]!.dir === 1 ? v.pace * dt : -v.pace * dt - scroll;
      if (v.x > viewWidth + 2 || v.x + w < -2) {
        v.active = false;
        continue;
      }
      if (VEHICLES[v.kind].heavy && v.x < viewWidth && v.x + w > 0) heavy = true;
      v.puffTimer -= dt;
      if (v.puffTimer <= 0) this.puff(v);
      this.blink(v, dt);
    }
    this.keepApart();
    if (density > 0) this.spawn(dt, density, viewWidth);
    this.ticks++;
    this.shake = heavy ? Math.floor(this.ticks / SHAKE_TICKS) % 2 : 0;
  }

  /** Counts a vehicle's headlight flash down and starts the next one when due. */
  private blink(v: Vehicle, dt: number): void {
    v.flash = Math.max(0, v.flash - dt);
    v.flashTimer -= dt;
    if (v.flashTimer > 0) return;
    v.flash = FLASH_TIME;
    v.flashTimer = this.rng.range(FLASH_EVERY[0], FLASH_EVERY[1]);
  }

  /** Slows a vehicle that has closed up on the one ahead to that one's pace. */
  private follow(): void {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i]!;
      if (v.active) v.pace = v.speed;
    }
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i]!;
      if (!v.active) continue;
      const ahead = this.ahead(v);
      if (ahead && this.gap(v, ahead) < MIN_GAP * 3) v.pace = Math.min(v.pace, ahead.pace);
    }
  }

  /** Never lets a vehicle overlap the one ahead (pushes it back to the minimum gap). */
  private keepApart(): void {
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < this.vehicles.length; i++) {
        const v = this.vehicles[i]!;
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
    for (let i = 0; i < this.vehicles.length; i++) {
      const o = this.vehicles[i]!;
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
      const kind = this.rng.pick(spec.kinds);
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
      slot.flash = 0;
      slot.flashTimer = this.rng.range(0.5, FLASH_EVERY[1]);
      this.timers[lane] = this.rng.range(spec.interval[0], spec.interval[1]);
    }
  }

  /** True if a vehicle `w` wide fits at `x` in `lane` with room to spare. */
  private clear(lane: number, x: number, w: number): boolean {
    const room = MIN_GAP * 3;
    for (let i = 0; i < this.vehicles.length; i++) {
      const o = this.vehicles[i]!;
      if (!o.active || o.lane !== lane) continue;
      if (x - room < o.x + VEHICLES[o.kind].w && o.x < x + w + room) return false;
    }
    return true;
  }

  private puff(v: Vehicle): void {
    const { w, puffEvery, heavy } = VEHICLES[v.kind];
    const lane = LANES[v.lane]!;
    v.puffTimer = this.rng.range(puffEvery[0], puffEvery[1]);
    const p = firstInactive(this.puffs);
    if (!p) return;
    p.active = true;
    p.x = lane.dir === 1 ? v.x - 2 : v.x + w + 1;
    p.y = Math.min(lane.bottom, VIEW_BOTTOM) - 3;
    p.age = 0;
    p.big = !!heavy;
  }

  private movePuffs(dt: number, scroll: number): void {
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i]!;
      if (!p.active) continue;
      p.age += dt;
      p.x += PUFF_DRIFT * dt - scroll;
      p.y -= PUFF_RISE * dt;
      if (p.age >= PUFF_LIFE || p.y < EXHAUST_TOP) p.active = false;
    }
  }
}
