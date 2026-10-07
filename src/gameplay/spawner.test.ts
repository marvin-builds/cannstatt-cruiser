import { describe, expect, it } from 'vitest';
import { TICK_DT, VIEW_MAX_W, VIEW_W } from '../core/config';
import { Rng } from '../core/rng';
import type { Entity } from '../types';
import { speedAt } from './difficulty';
import { Spawner } from './spawner';

interface Spawned {
  kind: string;
  /** x + distance: where it sits along the street, independent of when it appeared. */
  street: number;
  y: number;
  /** Screen x at the moment it was spawned. */
  spawnX: number;
  time: number;
}

/** Scrolls a spawner like the live system does, recording every new entity. */
function ride(seed: number, viewWidth: number, seconds: number): Spawned[] {
  const spawner = new Spawner();
  spawner.reset(new Rng(seed));
  const entities: Entity[] = [];
  const seen: Spawned[] = [];
  let distance = 0;
  for (let t = 0; t < seconds / TICK_DT; t++) {
    const dx = speedAt(distance) * TICK_DT;
    for (const e of entities) e.x -= dx;
    spawner.scroll(dx);
    const before = entities.length;
    distance += dx;
    spawner.spawn(entities, distance, viewWidth, null);
    for (const e of entities.slice(before)) {
      seen.push({ kind: e.kind, street: e.x + distance, y: e.y, spawnX: e.x, time: t * TICK_DT });
    }
  }
  return seen;
}

describe('spawner', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = ride(1, VIEW_MAX_W, 90);
    expect(a.length).toBeGreaterThan(30);
    expect(ride(1, VIEW_MAX_W, 90)).toEqual(a);
    expect(ride(2, VIEW_MAX_W, 90)).not.toEqual(a);
  });

  it('places the same street layout on every screen width (timing is distance based)', () => {
    const wide = ride(4, VIEW_MAX_W, 60);
    const narrow = ride(4, VIEW_W, 60);
    expect(narrow.length).toBeGreaterThan(20);
    narrow.forEach((e, i) => {
      expect(e.kind).toBe(wide[i]!.kind);
      expect(e.y).toBe(wide[i]!.y);
      expect(e.street).toBeCloseTo(wide[i]!.street, 6);
    });
  });

  it('spawns everything beyond the right edge, so nothing pops in', () => {
    for (const width of [VIEW_W, 380, VIEW_MAX_W]) {
      for (const e of ride(9, width, 60)) expect(e.spawnX).toBeGreaterThanOrEqual(width);
    }
  });

  it('leaves the first seconds of a run empty', () => {
    const first = ride(1, VIEW_MAX_W, 30)[0]!;
    // Reaches the player (x 64) no earlier than 3.5 s into the run.
    expect(first.time + (first.spawnX - 64) / speedAt(0)).toBeGreaterThan(3.5);
  });

  it('gets denser over time', () => {
    const all = ride(6, VIEW_MAX_W, 200).filter((e) => e.kind !== 'star');
    const early = all.filter((e) => e.time < 40).length;
    const late = all.filter((e) => e.time >= 160).length;
    expect(late).toBeGreaterThan(early);
  });
});
