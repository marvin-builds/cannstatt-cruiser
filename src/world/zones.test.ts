import { describe, expect, it } from 'vitest';
import { BASE_SPEED, PLAYER_X } from '../core/config';
import { FAR_DEPTH, GROUND_DEPTH, MID_DEPTH, NEAR_DEPTH } from './art/layout';
import { type Depth, normalizeZone, PALETTE_BLEND, SEAM_GRID, START_ZONE, ZONE_COUNT, ZONE_LENGTH, ZoneRoute } from './zones';

describe('normalizeZone', () => {
  it('wraps any index into 0..ZONE_COUNT-1', () => {
    expect(ZONE_COUNT).toBe(3);
    expect(normalizeZone(0)).toBe(0);
    expect(normalizeZone(4)).toBe(1);
    expect(normalizeZone(-1)).toBe(2);
  });
});

describe('ZoneRoute schedule', () => {
  it('lasts a fixed length per zone, about 35-45 s at start speed', () => {
    const seconds = ZONE_LENGTH / BASE_SPEED;
    expect(seconds).toBeGreaterThanOrEqual(35);
    expect(seconds).toBeLessThanOrEqual(45);
    expect(ZONE_LENGTH % SEAM_GRID).toBe(0);
  });

  it('starts in Bad Cannstatt and rides Cannstatt, Neckar, Mitte, Neckar, Cannstatt (ping-pong)', () => {
    expect(START_ZONE).toBe(2);
    const route = new ZoneRoute();
    expect(route.zoneAt(0)).toBe(2);
    expect(route.boundary(1)).toBe(ZONE_LENGTH);
    expect(route.boundary(2)).toBe(2 * ZONE_LENGTH);
    expect([0, 1, 2, 3, 4, 5, 6].map((k) => route.zoneOf(k))).toEqual([2, 1, 0, 1, 2, 1, 0]);
  });

  it('only ever moves to a neighbouring zone', () => {
    for (const zone of [0, 1, 2]) {
      const route = new ZoneRoute();
      route.snap(zone, 0);
      for (let k = 1; k < 12; k++) expect(Math.abs(route.zoneOf(k) - route.zoneOf(k - 1))).toBe(1);
    }
  });

  it('turns around at the ends of the route after a snap', () => {
    const route = new ZoneRoute();
    route.snap(0, 0);
    expect([0, 1, 2, 3, 4].map((k) => route.zoneOf(k))).toEqual([0, 1, 2, 1, 0]);
    route.snap(1, 0);
    expect([0, 1, 2, 3].map((k) => route.zoneOf(k))).toEqual([1, 0, 1, 2]);
  });

  it('switches zone only once the gateway has reached the player', () => {
    const route = new ZoneRoute();
    route.snap(2, 0);
    expect(route.zoneAt(ZONE_LENGTH - 1)).toBe(2);
    expect(route.zoneAt(ZONE_LENGTH)).toBe(1);
    expect(route.zoneAt(2 * ZONE_LENGTH - 1)).toBe(1);
    expect(route.zoneAt(2 * ZONE_LENGTH)).toBe(0);
    expect(route.zoneAt(3 * ZONE_LENGTH)).toBe(1);
    expect(route.zoneAt(4 * ZONE_LENGTH)).toBe(2);
  });

  it('puts the ground and near-layer seams under the player at the boundary', () => {
    const route = new ZoneRoute();
    route.snap(0, 0);
    const b = route.boundary(1);
    expect(route.seamScreenX(GROUND_DEPTH, 1, b)).toBe(PLAYER_X);
    expect(route.seamScreenX(NEAR_DEPTH, 1, b)).toBe(PLAYER_X);
  });

  it('aligns the ground seam to the paving grid', () => {
    const route = new ZoneRoute();
    route.snap(1, 1234.5);
    expect(route.seam(GROUND_DEPTH, 1) % SEAM_GRID).toBe(0);
  });

  it('is deterministic', () => {
    const a = new ZoneRoute();
    const b = new ZoneRoute();
    a.snap(2, 500);
    b.snap(2, 500);
    expect([1, 2, 3].map((k) => a.boundary(k))).toEqual([1, 2, 3].map((k) => b.boundary(k)));
  });
});

describe('ZoneRoute layers', () => {
  /** Distance at which a layer's first seam enters at the right edge. */
  function entersAt(route: ZoneRoute, depth: Depth, viewWidth: number): number {
    let d = 0;
    while (route.seamScreenX(depth, 1, d) >= viewWidth) d += 1;
    return d;
  }

  it.each([320, 427])('streams the next zone in near first, far last (view %i)', (viewWidth) => {
    const route = new ZoneRoute();
    route.snap(0, 0);
    const near = entersAt(route, NEAR_DEPTH, viewWidth);
    const mid = entersAt(route, MID_DEPTH, viewWidth);
    const far = entersAt(route, FAR_DEPTH, viewWidth);
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
  });

  it('lists the legs overlapping a layer range with their zone', () => {
    const route = new ZoneRoute();
    route.snap(0, 0);
    const seam = route.seam(MID_DEPTH, 1);
    const legs = route.legs(MID_DEPTH, seam - 100, seam + 100);
    expect(legs.map((l) => [l.index, l.zone, l.previous, l.next])).toEqual([[0, 0, 1, 1], [1, 1, 0, 2]]);
    expect(legs[0]!.from).toBe(-Infinity);
    expect(legs[0]!.to).toBe(seam);
    expect(legs[1]!.from).toBe(seam);
    expect(legs[1]!.to).toBe(route.seam(MID_DEPTH, 2));
    expect(route.legs(MID_DEPTH, 0, 100).map((l) => l.index)).toEqual([0]);
  });

  it('finds the zone at a layer position', () => {
    const route = new ZoneRoute();
    route.snap(0, 0);
    const seam = route.seam(NEAR_DEPTH, 1);
    expect(route.legAtLayer(NEAR_DEPTH, seam - 1).zone).toBe(0);
    expect(route.legAtLayer(NEAR_DEPTH, seam).zone).toBe(1);
  });
});

describe('ZoneRoute palette blend', () => {
  it('blends the palettes gradually around the boundary', () => {
    const route = new ZoneRoute();
    route.snap(0, 0);
    const b = route.boundary(1);
    expect(route.blend(b - PALETTE_BLEND)).toEqual({ from: 0, to: 0, t: 1 });
    expect(route.blend(b - PALETTE_BLEND / 2)).toMatchObject({ from: 0, to: 1, t: 0 });
    expect(route.blend(b)).toMatchObject({ from: 0, to: 1, t: 0.5 });
    expect(route.blend(b + PALETTE_BLEND / 4).t).toBeCloseTo(0.75);
    expect(route.blend(b + PALETTE_BLEND)).toEqual({ from: 1, to: 1, t: 1 });
    // Several seconds of riding even at the start speed.
    expect(PALETTE_BLEND / BASE_SPEED).toBeGreaterThanOrEqual(4);
  });
});

describe('ZoneRoute snap', () => {
  it('shows the snapped zone everywhere with no transition', () => {
    const route = new ZoneRoute();
    route.snap(0, 0);
    route.snap(2, 1000);
    expect(route.zoneAt(1000)).toBe(2);
    expect(route.blend(1000)).toEqual({ from: 2, to: 2, t: 1 });
    const scroll = 1000 * FAR_DEPTH.factor;
    expect(route.legs(FAR_DEPTH, scroll, scroll + 427).map((l) => l.zone)).toEqual([2]);
  });

  it('schedules the next gateway a full zone length after the snap', () => {
    const route = new ZoneRoute();
    route.snap(2, 1000);
    expect(route.boundary(1)).toBeGreaterThanOrEqual(1000 + ZONE_LENGTH);
    expect(route.boundary(1)).toBeLessThan(1000 + ZONE_LENGTH + SEAM_GRID);
    expect(route.zoneOf(1)).toBe(1);
  });
});
