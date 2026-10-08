import { describe, expect, it } from 'vitest';
import { MAX_HEALTH, PLAYER_X, VIEW_MAX_W } from '../core/config';
import type { Game } from '../core/game';
import { createPlayerTestGame, tick } from '../player/testing';
import type { CarriedItem, ParkPlan } from '../types';
import { highFiverRect } from './catalogue';
import { speedAt } from './difficulty';
import { HIGH_FIVE_POINTS, HIGH_FIVE_REACH } from './high-five';
import { createGameplaySystem } from './index';
import { CHEER_STEP, PARK_CLEAR_AFTER, SESSION_MAX_POINTS } from './park';
import { PARK_ANNOUNCE } from './spawner';
import { place, quietGame, record } from './test-kit';

/** A park plan from `ahead` px in front of the player, `length` long (no structures: the session needs none). */
function parkAhead(game: Game, ahead: number, length: number): ParkPlan {
  const start = game.state.distance + ahead;
  const plan: ParkPlan = { start, end: start + length, pieces: [] };
  game.state.park = plan;
  return plan;
}

/** Ticks until gameplay has seen the player's distance reach `d` (core moves the distance on after the systems). */
function rideTo(game: Game, d: number): void {
  for (let i = 0; i < 10_000 && game.state.distance < d; i++) game.tick();
  game.tick();
}

const trick = (game: Game) => game.bus.emit('airTrick', { ticks: 10, points: 50 });

describe('NorDIY session cheers', () => {
  it('tricks inside the park cheer with a rising level, capped at 1; outside they do not', () => {
    const game = quietGame();
    const cheers = record(game, 'sessionCheer');
    const plan = parkAhead(game, 60, 600);
    trick(game);
    expect(cheers).toEqual([]);
    rideTo(game, plan.start);
    trick(game);
    game.bus.emit('grindTrick', { entityId: 1, ticks: 20, points: 40 });
    game.bus.emit('stuntStep', { step: 2, steps: 4, multiplier: 2, points: 200 });
    for (let i = 0; i < 6; i++) trick(game);
    const levels = cheers.map((c) => c.level);
    expect(levels[0]).toBeCloseTo(CHEER_STEP, 6);
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!);
    expect(levels[1]!).toBeGreaterThan(levels[0]!);
    expect(levels[2]!).toBeGreaterThan(levels[1]!);
    expect(Math.max(...levels)).toBe(1);
    expect(levels.length).toBe(9);
  });

  it('passing the end gives the Session bonus scaled by the cheering, once, and adds it to the score', () => {
    const game = quietGame();
    const ends = record(game, 'sessionEnd');
    const plan = parkAhead(game, 30, 300);
    rideTo(game, plan.start + 10);
    trick(game);
    trick(game);
    const level = 2 * CHEER_STEP;
    const score = game.state.score;
    rideTo(game, plan.end);
    expect(ends).toEqual([{ level: expect.closeTo(level, 6), points: Math.round(SESSION_MAX_POINTS * level) }]);
    expect(game.state.score).toBe(score + ends[0]!.points);
    expect(ends[0]!.points).toBeGreaterThan(0);
    tick(game, 30);
    expect(ends.length).toBe(1);
  });

  it('no tricks: sessionEnd with 0 points', () => {
    const game = quietGame();
    const ends = record(game, 'sessionEnd');
    const plan = parkAhead(game, 30, 200);
    const score = game.state.score;
    rideTo(game, plan.end + 1);
    expect(ends).toEqual([{ level: 0, points: 0 }]);
    expect(game.state.score).toBe(score);
  });

  it(`clears state.park once its end is PARK_CLEAR_AFTER behind the skater (the scenery has left the screen)`, () => {
    expect(PARK_CLEAR_AFTER).toBeGreaterThanOrEqual(PLAYER_X + 32);
    const game = quietGame();
    const plan = parkAhead(game, 30, 200);
    rideTo(game, plan.end + 1);
    expect(game.state.park).toBe(plan);
    rideTo(game, plan.end + PARK_CLEAR_AFTER + 1);
    expect(game.state.park).toBeNull();
  });
});

describe('the high five', () => {
  function withFiver(dx: number, item: CarriedItem | null = 'pretzel') {
    const game = quietGame(0);
    game.state.carriedItem = item;
    const fiver = place(game, 'highFiver', highFiverRect(0));
    fiver.x = PLAYER_X + dx - fiver.w / 2;
    return { game, fiver, fives: record(game, 'highFive'), used: record(game, 'itemUsed') };
  }

  const use = (game: Game) => {
    game.commands.useItem();
    game.tick();
  };

  it('a use press within HIGH_FIVE_REACH of the high fiver gives a high five and never uses the carried item', () => {
    for (const dx of [-HIGH_FIVE_REACH, -10, 0, 12, HIGH_FIVE_REACH]) {
      const { game, fiver, fives, used } = withFiver(dx);
      const score = game.state.score;
      use(game);
      expect(fives).toEqual([{ entityId: fiver.id, points: HIGH_FIVE_POINTS }]);
      expect(game.state.score).toBe(score + HIGH_FIVE_POINTS);
      expect(used).toEqual([]);
      expect(game.state.carriedItem).toBe('pretzel');
      expect(typeof fiver.data?.slapped).toBe('number');
      // Once given, a second press in the window still goes to him (nothing more happens).
      use(game);
      expect(fives.length).toBe(1);
      expect(used).toEqual([]);
    }
  });

  it('outside the window the use press uses the item as before', () => {
    for (const dx of [-HIGH_FIVE_REACH - 4, HIGH_FIVE_REACH + 4, 120]) {
      const { game, fives, used } = withFiver(dx);
      use(game);
      expect(fives).toEqual([]);
      expect(used).toEqual([{ item: 'pretzel', action: 'eat' }]);
      expect(game.state.carriedItem).toBeNull();
    }
  });

  it('works without an item and in the air', () => {
    const { game, fives } = withFiver(0, null);
    game.buttons.action.press('test');
    tick(game, 6);
    game.buttons.action.release('test');
    expect(game.state.player.grounded).toBe(false);
    use(game);
    expect(fives.length).toBe(1);
  });

  it('the high fiver never crashes the skater', () => {
    const game = quietGame(120);
    const crashes = record(game, 'crash');
    place(game, 'highFiver', highFiverRect(PLAYER_X + 20));
    tick(game, 60);
    expect(crashes).toEqual([]);
    expect(game.state.health).toBe(MAX_HEALTH);
  });
});

describe('the park in a live run', { timeout: 120_000 }, () => {
  it('is planned in Bad Cannstatt ahead of its start, rides with a paused speed ramp and is cleared after its end', () => {
    const game = createPlayerTestGame([createGameplaySystem()]);
    game.commands.startRun();
    let shown: { plan: ParkPlan; at: number } | null = null;
    const speeds: { distance: number; speed: number }[] = [];
    const ends = record(game, 'sessionEnd');
    for (let i = 0; i < 60 * 60 && game.state.mode === 'playing'; i++) {
      game.state.health = game.state.maxHealth;
      game.tick();
      const park = game.state.park;
      if (park && !shown) shown = { plan: park, at: game.state.distance };
      speeds.push({ distance: game.state.distance, speed: game.state.speed });
      if (shown && game.state.distance > shown.plan.end + VIEW_MAX_W + 10) break;
    }
    expect(shown).not.toBeNull();
    const { plan, at } = shown!;
    expect(plan.start - at).toBeGreaterThanOrEqual(PARK_ANNOUNCE);
    expect(game.state.time).toBeGreaterThanOrEqual(20);
    expect(game.state.park).toBeNull();
    expect(ends.length).toBe(1);
    const inside = speeds.filter((s) => s.distance > plan.start + 2 && s.distance < plan.end).map((s) => s.speed);
    expect(Math.max(...inside)).toBe(Math.min(...inside));
    expect(inside[0]).toBeCloseTo(speedAt(plan.start), 0);
    const after = speeds.filter((s) => s.distance > plan.end + 400)[0]!;
    expect(after.speed).toBeGreaterThan(inside[0]!);
    expect(after.speed).toBeLessThan(speedAt(after.distance));
  });
});
