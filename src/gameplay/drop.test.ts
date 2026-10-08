import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import type { CarriedItem, Entity, Rect } from '../types';
import { BEER_AUTO_DRINK } from './auto-drink';
import { BALL_HIT_POINTS } from './ball';
import { DROP_ROOM_SECONDS, DROP_SPOTS, DROP_TIME, DroppedItems, ITEM_BOX } from './drop';
import { ITEM_POINTS } from './items';
import type { Motion } from './motion';
import { obstacle, quietGame, record } from './test-kit';

const DT = TICK_DT;
const free = () => true;
const still: Motion = { walk: 0, sway: 0, phase: 0 };
const FALL_TICKS = Math.round(DROP_TIME / DT);

describe('DroppedItems (an item knocked out of a person hand)', () => {
  it('falls in a short arc (up first, then down) and comes to rest lying on the ground after DROP_TIME', () => {
    const drops = new DroppedItems();
    expect(drops.drop('pretzel', { x: 200, y: GROUND_Y - 20 }, 120, free)).toBe(true);
    const d = drops.items[0]!;
    const startY = d.y;
    let top = d.y;
    for (let i = 0; i < FALL_TICKS - 1; i++) {
      drops.update(0, DT);
      top = Math.min(top, d.y);
      expect(d.lying).toBe(false);
    }
    expect(top).toBeLessThan(startY - 2);
    drops.update(0, DT);
    expect(d.lying).toBe(true);
    expect(d.y + d.h).toBe(GROUND_Y);
    expect(d.w).toBe(ITEM_BOX);
    // Lands on the first spot: a little further along the street than the person.
    expect(d.x + d.w / 2).toBe(200 + DROP_SPOTS[0]!);
    drops.update(0, DT);
    expect(d.y + d.h).toBe(GROUND_Y);
  });

  it('scrolls with the street, while falling and lying', () => {
    const drops = new DroppedItems();
    drops.drop('beer', { x: 200, y: GROUND_Y - 20 }, 120, free);
    for (let i = 0; i < FALL_TICKS; i++) drops.update(2, DT);
    expect(drops.items[0]!.x + ITEM_BOX / 2).toBeCloseTo(200 + DROP_SPOTS[0]! - 2 * FALL_TICKS, 6);
    drops.update(5, DT);
    expect(drops.items[0]!.x + ITEM_BOX / 2).toBeCloseTo(200 + DROP_SPOTS[0]! - 2 * FALL_TICKS - 5, 6);
  });

  it('lies only on free street: DROP_ROOM_SECONDS of riding around the spot; else a bit further or just behind; nowhere free: no drop', () => {
    const speed = 120;
    const room = DROP_ROOM_SECONDS * speed;
    const checked: [number, number][] = [];
    const firstBusy = (from: number, to: number) => {
      checked.push([from, to]);
      return checked.length > 1;
    };
    const drops = new DroppedItems();
    expect(drops.drop('football', { x: 200, y: GROUND_Y - 20 }, speed, firstBusy)).toBe(true);
    expect(checked[0]).toEqual([200 + DROP_SPOTS[0]! - room, 200 + DROP_SPOTS[0]! + room]);
    expect(drops.items[0]!.toX).toBe(200 + DROP_SPOTS[1]!);
    expect(DROP_SPOTS.some((s) => s < 0)).toBe(true);

    const none = new DroppedItems();
    expect(none.drop('football', { x: 200, y: GROUND_Y - 20 }, speed, () => false)).toBe(false);
    expect(none.items).toEqual([]);
  });

  it('is picked up by a hitbox overlapping it (riding over it, or jumping through it low enough)', () => {
    const drops = new DroppedItems();
    drops.drop('pretzel', { x: 100, y: GROUND_Y - 20 }, 120, free);
    for (let i = 0; i < FALL_TICKS; i++) drops.update(0, DT);
    const d = drops.items[0]!;
    const body = (x: number, bottom: number): Rect => ({ x: x - 5, y: bottom - 30, w: 10, h: 30 });
    expect(drops.pickUp(body(d.x - 20, GROUND_Y))).toBeNull();
    // High above it: missed.
    expect(drops.pickUp(body(d.x + 3, GROUND_Y - ITEM_BOX - 1))).toBeNull();
    // Low through the air over it: caught.
    expect(drops.pickUp(body(d.x + 3, GROUND_Y - 2))).toBe('pretzel');
    expect(drops.items).toEqual([]);
  });

  it('a missed item scrolls off the left edge and is gone', () => {
    const drops = new DroppedItems();
    drops.drop('beer', { x: 40, y: GROUND_Y - 20 }, 120, free);
    for (let i = 0; i < 200 && drops.items.length > 0; i++) drops.update(2, DT);
    expect(drops.items).toEqual([]);
  });
});

/** Quiet game with a still person ahead and the football in hand. */
function ballAt(kind: 'vfbFan' | 'wasenGuest', prop = 0, kidMode = false): { game: Game; person: Entity } {
  const game = quietGame();
  game.state.kidMode = kidMode;
  const person = obstacle(game, kind, PLAYER_X + 90, still);
  person.data = { ...person.data, prop };
  game.state.carriedItem = 'football';
  return { game, person };
}

/** Throws, then rides on (no input) until something is caught or `max` ticks pass. */
function throwAndRide(game: Game, max = 240): CarriedItem[] {
  const seen = record(game, 'itemCaught');
  game.commands.useItem();
  for (let i = 0; i < max && seen.length === 0; i++) game.tick();
  return seen.map((e) => e.item);
}

describe('a ball hit drops the person item onto the street', () => {
  for (const [kind, prop, kidMode, item] of [
    ['vfbFan', 0, false, 'football'],
    ['wasenGuest', 1, false, 'pretzel'],
    ['wasenGuest', 0, false, 'beer'],
    ['wasenGuest', 0, true, 'gingerbread'],
    ['wasenGuest', 1, true, 'pretzel'],
  ] as const) {
    it(`${kind} (prop ${prop}${kidMode ? ', kid mode' : ''}): riding over it collects ${item} like a caught item`, () => {
      const { game } = ballAt(kind, prop, kidMode);
      const hits = record(game, 'ballHit');
      const score = game.state.score;
      expect(throwAndRide(game)).toEqual([item]);
      expect(hits).toHaveLength(1);
      expect(game.state.carriedItem).toBe(item);
      expect(game.state.score - score).toBe(BALL_HIT_POINTS + ITEM_POINTS);
    });
  }

  it('kid mode never drops beer, whatever the visitor holds', () => {
    for (let prop = 0; prop < 4; prop++) {
      const { game } = ballAt('wasenGuest', prop, true);
      expect(throwAndRide(game)).not.toContain('beer');
    }
  });

  it('the item is not caught at once: it falls first and lies ahead of the skater', () => {
    const { game } = ballAt('wasenGuest', 1);
    const hits = record(game, 'ballHit');
    const caught = record(game, 'itemCaught');
    game.commands.useItem();
    for (let i = 0; i < 120 && hits.length === 0; i++) game.tick();
    tick(game, FALL_TICKS + 2);
    expect(caught).toEqual([]);
  });

  it('a picked-up Maßkrug starts the auto-drink clock', () => {
    const { game } = ballAt('wasenGuest', 0);
    expect(throwAndRide(game)).toEqual(['beer']);
    const used = record(game, 'itemUsed');
    tick(game, Math.round(BEER_AUTO_DRINK / TICK_DT) - 1);
    expect(used).toEqual([]);
    game.tick();
    expect(used).toEqual([{ item: 'beer', action: 'drink' }]);
  });

  it('replaces an item caught in the meantime (documented rule: the newest pickup wins)', () => {
    const { game } = ballAt('wasenGuest', 1);
    const hits = record(game, 'ballHit');
    game.commands.useItem();
    for (let i = 0; i < 120 && hits.length === 0; i++) game.tick();
    game.state.carriedItem = 'gingerbread';
    const caught = record(game, 'itemCaught');
    for (let i = 0; i < 240 && caught.length === 0; i++) game.tick();
    expect(caught).toEqual([{ item: 'pretzel' }]);
    expect(game.state.carriedItem).toBe('pretzel');
  });
});

/** After the ball hit, waits `wait` ticks, then jumps (`hold` ticks); reports whether and how the item was caught. */
function jumpAfterHit(wait: number, hold: number): { caught: boolean; airborne: boolean } {
  const { game } = ballAt('wasenGuest', 1);
  const hits = record(game, 'ballHit');
  let airborne = false;
  let caught = false;
  game.bus.on('itemCaught', () => {
    caught = true;
    airborne = !game.state.player.grounded;
  });
  game.commands.useItem();
  for (let i = 0; i < 120 && hits.length === 0; i++) game.tick();
  tick(game, wait);
  game.buttons.action.press('test');
  for (let i = 0; i < 200; i++) {
    if (i === hold) game.buttons.action.release('test');
    game.tick();
  }
  return { caught, airborne };
}

describe('jumping and the dropped item', () => {
  const waits = Array.from({ length: 40 }, (_, i) => i);

  it('jumping through it low collects it mid-air', () => {
    expect(waits.some((w) => {
      const r = jumpAfterHit(w, 1);
      return r.caught && r.airborne;
    })).toBe(true);
  });

  it('a high jump over it misses it: it scrolls away and is never caught', () => {
    expect(waits.some((w) => !jumpAfterHit(w, 20).caught)).toBe(true);
  });
});
