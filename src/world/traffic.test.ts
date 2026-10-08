import { describe, expect, it } from 'vitest';
import { GROUND_Y, TICK_DT } from '../core/config';
import { Rng } from '../core/rng';
import { OBSTACLES } from '../gameplay/catalogue';
import { EXHAUST_TOP, FRONT_TOP, LANES, PUFF_LIFE, Traffic, TRAFFIC_TOP, trafficDensity, vehicleScreenX, VEHICLES, type VehicleKind } from './traffic';
import { ZONE_LENGTH, ZoneRoute } from './zones';

/** Runs `seconds` of traffic at a constant scroll speed (px/s) and density. */
function drive(traffic: Traffic, seconds: number, speed: number, density: number, viewWidth = 427, visit?: () => void): void {
  for (let i = 0; i < seconds / TICK_DT; i++) {
    traffic.update(TICK_DT, speed * TICK_DT, density, viewWidth);
    visit?.();
  }
}

function active(traffic: Traffic) {
  return traffic.vehicles.filter((v) => v.active);
}

describe('trafficDensity', () => {
  it('is zero away from Stuttgart-Mitte and one deep inside it', () => {
    const route = new ZoneRoute();
    route.snap(2, 0);
    expect(trafficDensity(route, 0)).toBe(0);
    expect(trafficDensity(route, ZONE_LENGTH + 1500)).toBe(0);
    expect(trafficDensity(route, 2 * ZONE_LENGTH + 1500)).toBe(1);
    expect(trafficDensity(route, 3 * ZONE_LENGTH + 1500)).toBe(0);
    expect(trafficDensity(route, 4 * ZONE_LENGTH + 1500)).toBe(0);
  });

  it('ramps in quickly as Mitte arrives and out as it leaves', () => {
    const route = new ZoneRoute();
    route.snap(2, 0);
    const enter = route.boundary(2);
    const leave = route.boundary(3);
    const into = [-400, -100, 0, 100, 400].map((d) => trafficDensity(route, enter + d));
    expect(into[0]).toBe(0);
    expect(into[4]).toBe(1);
    for (let i = 1; i < into.length; i++) expect(into[i]!).toBeGreaterThanOrEqual(into[i - 1]!);
    expect(trafficDensity(route, enter)).toBeGreaterThan(0);
    expect(trafficDensity(route, enter)).toBeLessThan(1);
    expect(trafficDensity(route, leave - 400)).toBe(1);
    expect(trafficDensity(route, leave)).toBeGreaterThan(0);
    expect(trafficDensity(route, leave + 400)).toBe(0);
  });

  it('is full at once when a run is snapped into Mitte', () => {
    const route = new ZoneRoute();
    route.snap(0, 500);
    expect(trafficDensity(route, 500)).toBe(1);
  });
});

describe('Traffic', () => {
  it('keeps every vehicle body below the riding line', () => {
    expect(TRAFFIC_TOP).toBeGreaterThan(GROUND_Y);
    for (const lane of LANES) {
      for (const kind of lane.kinds) expect(lane.bottom - VEHICLES[kind].h + 1).toBeGreaterThanOrEqual(TRAFFIC_TOP);
    }
    const traffic = new Traffic(new Rng(3));
    let highest = Infinity;
    drive(traffic, 40, 120, 1, 427, () => {
      for (const v of traffic.vehicles) if (v.active) highest = Math.min(highest, v.top);
    });
    expect(highest).toBeGreaterThanOrEqual(TRAFFIC_TOP);
  });

  it('keeps the front lane (drawn over gameplay) clear of everything gameplay draws', () => {
    const deepestSink = Math.max(...Object.values(OBSTACLES).map((o) => o.sink));
    expect(FRONT_TOP).toBeGreaterThan(GROUND_Y + deepestSink);
    const front = LANES.filter((l) => l.front);
    expect(front).toHaveLength(1);
    for (const kind of front[0]!.kinds) expect(front[0]!.bottom - VEHICLES[kind].h + 1).toBeGreaterThanOrEqual(FRONT_TOP);
  });

  it('drives cars about twice the old size, and buses and trucks clearly bigger', () => {
    // Old sizes: hatch 17x8, sedan 22x8, van 24x11, bus 42x13.
    expect(VEHICLES.hatch.w).toBeGreaterThanOrEqual(32);
    expect(VEHICLES.sedan.w).toBeGreaterThanOrEqual(42);
    expect(VEHICLES.van.h).toBeGreaterThanOrEqual(20);
    for (const kind of ['hatch', 'sedan'] as const) expect(VEHICLES[kind].h).toBeGreaterThanOrEqual(15);
    for (const heavy of ['bus', 'truck'] as const) {
      expect(VEHICLES[heavy].heavy).toBe(true);
      expect(VEHICLES[heavy].w).toBeGreaterThanOrEqual(76);
      expect(VEHICLES[heavy].h).toBeGreaterThan(VEHICLES.van.h);
    }
  });

  it('sends buses and trucks through the front lane only', () => {
    const traffic = new Traffic(new Rng(11));
    const seen = new Set<VehicleKind>();
    drive(traffic, 60, 120, 1, 427, () => {
      for (const v of traffic.vehicles) {
        if (!v.active) continue;
        seen.add(v.kind);
        if (VEHICLES[v.kind].heavy) expect(LANES[v.lane]!.front).toBe(true);
      }
    });
    expect(seen.has('bus')).toBe(true);
    expect(seen.has('truck')).toBe(true);
  });

  it('fills much of the street (dense traffic)', () => {
    const traffic = new Traffic(new Rng(12));
    drive(traffic, 8, 120, 1, 320);
    let covered = 0;
    let samples = 0;
    drive(traffic, 30, 120, 1, 320, () => {
      for (const v of traffic.vehicles) {
        if (!v.active) continue;
        const left = Math.max(0, v.x);
        const right = Math.min(320, v.x + VEHICLES[v.kind].w);
        if (right > left) covered += right - left;
      }
      samples++;
    });
    // Share of the two lanes' length covered by vehicle bodies on average.
    expect(covered / samples / (320 * LANES.length)).toBeGreaterThan(0.4);
  });

  it('lets big exhaust clouds drift up above the riding line, but never above EXHAUST_TOP', () => {
    expect(PUFF_LIFE).toBeGreaterThanOrEqual(2.5);
    expect(EXHAUST_TOP).toBeLessThan(GROUND_Y - 20);
    const traffic = new Traffic(new Rng(3));
    let puffs = 0;
    let highest = Infinity;
    drive(traffic, 40, 120, 1, 427, () => {
      for (const p of traffic.puffs) {
        if (!p.active) continue;
        puffs++;
        highest = Math.min(highest, p.y);
      }
    });
    expect(puffs).toBeGreaterThan(0);
    expect(highest).toBeLessThan(GROUND_Y);
    expect(highest).toBeGreaterThanOrEqual(EXHAUST_TOP);
  });

  it('rumbles the street by 1 px only while a bus or truck is on screen', () => {
    const traffic = new Traffic(new Rng(13));
    let heavyTicks = 0;
    let shakes = 0;
    drive(traffic, 60, 120, 1, 427, () => {
      const heavy = traffic.vehicles.some((v) => v.active && VEHICLES[v.kind].heavy && v.x < 427 && v.x + VEHICLES[v.kind].w > 0);
      expect([0, 1]).toContain(traffic.shake);
      if (!heavy) expect(traffic.shake).toBe(0);
      if (heavy) heavyTicks++;
      if (traffic.shake) shakes++;
    });
    expect(heavyTicks).toBeGreaterThan(0);
    expect(shakes).toBeGreaterThan(heavyTicks / 4);
    expect(shakes).toBeLessThan(heavyTicks);
  });

  it('flashes headlights now and then (honk), briefly', () => {
    const traffic = new Traffic(new Rng(14));
    let flashing = 0;
    let ticks = 0;
    drive(traffic, 40, 120, 1, 427, () => {
      for (const v of traffic.vehicles) {
        if (!v.active) continue;
        ticks++;
        if (v.flash > 0) flashing++;
      }
    });
    expect(flashing).toBeGreaterThan(0);
    expect(flashing / ticks).toBeLessThan(0.2);
  });

  it('stays empty without density', () => {
    const traffic = new Traffic(new Rng(1));
    let seen = 0;
    drive(traffic, 20, 120, 0, 427, () => {
      for (const v of traffic.vehicles) if (v.active) seen++;
    });
    expect(seen).toBe(0);
  });

  it.each([320, 427])('fills both directions with dense traffic in Mitte (view %i)', (viewWidth) => {
    const traffic = new Traffic(new Rng(2));
    drive(traffic, 12, 120, 1, viewWidth);
    const cars = active(traffic);
    expect(cars.length).toBeGreaterThanOrEqual(4);
    expect(new Set(cars.map((v) => LANES[v.lane]!.dir))).toEqual(new Set([1, -1]));
    expect(new Set(cars.map((v) => v.speed)).size).toBeGreaterThan(2);
  });

  it('never lets two vehicles in one lane overlap', () => {
    const traffic = new Traffic(new Rng(4));
    let overlaps = 0;
    for (const speed of [90, 165, 40, 0]) {
      drive(traffic, 10, speed, 1, 400, () => {
        for (const a of traffic.vehicles) {
          for (const b of traffic.vehicles) {
            if (a === b || !a.active || !b.active || a.lane !== b.lane) continue;
            if (a.x < b.x + VEHICLES[b.kind].w && b.x < a.x + VEHICLES[a.kind].w) overlaps++;
          }
        }
      });
    }
    expect(overlaps).toBe(0);
  });

  it('drives every vehicle off screen once Mitte has gone', () => {
    const traffic = new Traffic(new Rng(5));
    drive(traffic, 10, 120, 1);
    expect(active(traffic).length).toBeGreaterThan(0);
    drive(traffic, 25, 120, 0);
    expect(active(traffic)).toHaveLength(0);
    expect(traffic.puffs.filter((p) => p.active)).toHaveLength(0);
  });

  it('is deterministic for a seed', () => {
    const snapshot = (seed: number) => {
      const traffic = new Traffic(new Rng(seed));
      drive(traffic, 15, 110, 1);
      return traffic.vehicles.map((v) => [v.active, v.kind, Math.round(v.x * 100), v.lane, v.speed, v.flash > 0]);
    };
    expect(snapshot(9)).toEqual(snapshot(9));
    const shakes = (seed: number) => {
      const traffic = new Traffic(new Rng(seed));
      const out: number[] = [];
      drive(traffic, 15, 110, 1, 427, () => out.push(traffic.shake));
      return out;
    };
    expect(shakes(9)).toEqual(shakes(9));
    expect(snapshot(9)).not.toEqual(snapshot(10));
  });

  it('reuses a fixed pool (no allocations while driving)', () => {
    const traffic = new Traffic(new Rng(6));
    const vehicles = [...traffic.vehicles];
    const puffs = [...traffic.puffs];
    drive(traffic, 20, 120, 1);
    expect(traffic.vehicles).toEqual(vehicles);
    traffic.vehicles.forEach((v, i) => expect(v).toBe(vehicles[i]));
    traffic.puffs.forEach((p, i) => expect(p).toBe(puffs[i]));
  });

  it('clears everything on reset', () => {
    const traffic = new Traffic(new Rng(7));
    drive(traffic, 10, 120, 1);
    traffic.reset();
    expect(active(traffic)).toHaveLength(0);
    expect(traffic.shake).toBe(0);
    expect(traffic.puffs.filter((p) => p.active)).toHaveLength(0);
  });

  it('extrapolates vehicles for a frame drawn between ticks (street lead plus own pace)', () => {
    const traffic = new Traffic(new Rng(3));
    drive(traffic, 5, 100, 1);
    const withSkater = active(traffic).find((v) => LANES[v.lane]!.dir === 1)!;
    const oncoming = active(traffic).find((v) => LANES[v.lane]!.dir === -1)!;
    expect(vehicleScreenX(withSkater, 1.2, 0.01)).toBeCloseTo(withSkater.x + withSkater.pace * 0.01);
    expect(vehicleScreenX(oncoming, 1.2, 0.01)).toBeCloseTo(oncoming.x - 1.2 - oncoming.pace * 0.01);
  });
});
