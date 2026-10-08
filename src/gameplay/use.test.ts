import { describe, expect, it } from 'vitest';
import { MAX_HEALTH, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import type { CarriedItem } from '../types';
import { obstacle, quietGame, record } from './test-kit';
import { DRUNK_DURATION, EAT_BONUS_POINTS } from './use';

/** A quiet game with `item` under the arm. */
function carrying(item: CarriedItem): Game {
  const game = quietGame();
  game.state.carriedItem = item;
  return game;
}

/** Presses E for one tick (like the ui's item button). */
function use(game: Game): void {
  game.commands.useItem();
  game.tick();
}

describe('using the carried item (use button)', () => {
  it('does nothing without an item', () => {
    const game = quietGame();
    const used = record(game, 'itemUsed');
    use(game);
    expect(used).toEqual([]);
  });

  it('Maßkrug: drinks it, starts the drunk effect and clears the item', () => {
    const game = carrying('beer');
    const used = record(game, 'itemUsed');
    const drunk = record(game, 'drunkStart');
    use(game);
    expect(used).toEqual([{ item: 'beer', action: 'drink' }]);
    expect(drunk).toEqual([{ duration: DRUNK_DURATION }]);
    expect(game.state.carriedItem).toBeNull();
    expect(game.state.drunkTimer).toBeCloseTo(DRUNK_DURATION, 5);
    expect(DRUNK_DURATION).toBeGreaterThanOrEqual(5);
    expect(DRUNK_DURATION).toBeLessThanOrEqual(7);
  });

  it('the drunk timer counts down every playing tick and stops at 0', () => {
    const game = carrying('beer');
    use(game);
    tick(game, 60);
    expect(game.state.drunkTimer).toBeCloseTo(DRUNK_DURATION - 60 * TICK_DT, 5);
    game.commands.pause();
    tick(game, 60);
    expect(game.state.drunkTimer).toBeCloseTo(DRUNK_DURATION - 60 * TICK_DT, 5);
    game.commands.resume();
    tick(game, Math.ceil(DRUNK_DURATION / TICK_DT));
    expect(game.state.drunkTimer).toBe(0);
  });

  it('the drunk timer is cleared when the run ends', () => {
    const game = carrying('beer');
    use(game);
    game.commands.gameOver();
    game.tick();
    expect(game.state.drunkTimer).toBe(0);
  });

  it('kid mode never gets drunk, even if a Maßkrug were carried', () => {
    const game = carrying('beer');
    game.state.kidMode = true;
    const drunk = record(game, 'drunkStart');
    use(game);
    expect(drunk).toEqual([]);
    expect(game.state.drunkTimer).toBe(0);
  });

  it.each(['pretzel', 'gingerbread'] as const)('%s: eating gives one health back', (item) => {
    const game = carrying(item);
    game.state.health = 3;
    const used = record(game, 'itemUsed');
    const gained = record(game, 'healthGained');
    use(game);
    expect(used).toEqual([{ item, action: 'eat' }]);
    expect(gained).toEqual([{ health: 4 }]);
    expect(game.state.health).toBe(4);
    expect(game.state.carriedItem).toBeNull();
  });

  it('eating at full health gives bonus points instead', () => {
    const game = carrying('pretzel');
    const gained = record(game, 'healthGained');
    const scores = record(game, 'scoreChanged');
    use(game);
    expect(game.state.health).toBe(MAX_HEALTH);
    expect(gained).toEqual([]);
    expect(scores.map((s) => s.delta)).toEqual([EAT_BONUS_POINTS]);
  });

  it('football: throws it as a ball entity (itemUsed, then ballThrown)', () => {
    const game = carrying('football');
    const seen: string[] = [];
    game.bus.on('itemUsed', (e) => seen.push(`used:${e.action}`));
    game.bus.on('ballThrown', () => seen.push('thrown'));
    const thrown = record(game, 'ballThrown');
    use(game);
    expect(seen).toEqual(['used:throw', 'thrown']);
    const ball = game.state.entities.find((e) => e.kind === 'ball');
    expect(ball?.id).toBe(thrown[0]!.entityId);
    expect(game.state.carriedItem).toBeNull();
  });

  it('only reacts to the press, not to a held key', () => {
    const game = carrying('pretzel');
    game.state.health = 2;
    game.buttons.use.press('test');
    tick(game, 10);
    game.state.carriedItem = 'pretzel';
    tick(game, 10);
    game.buttons.use.release('test');
    expect(game.state.health).toBe(3);
    expect(game.state.carriedItem).toBe('pretzel');
  });

  it('ignores the use button outside a run', () => {
    const game = carrying('pretzel');
    game.state.health = 2;
    obstacle(game, 'bin', 300);
    game.commands.pause();
    use(game);
    expect(game.state.carriedItem).toBe('pretzel');
    expect(game.state.health).toBe(2);
  });
});
