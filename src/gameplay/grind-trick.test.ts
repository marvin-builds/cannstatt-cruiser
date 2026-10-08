import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { GRIND_POINTS } from './catalogue';
import { GRIND_TRICK_POINTS } from './grind-trick';
import { createGameplaySystem } from './index';
import { record } from './test-kit';

const RAIL_ID = 77;

/** Gameplay only (no player system), so the test sets the player's grind flags itself. */
function grinding(): Game {
  const game = new Game({ systems: [createGameplaySystem({ spawning: false })] });
  game.seed(1);
  game.commands.startRun();
  game.setSpeedOverride(120);
  game.tick();
  game.state.player.grinding = true;
  game.state.player.grounded = false;
  game.bus.emit('grindStart', { entityId: RAIL_ID });
  return game;
}

function ticks(game: Game, n: number): void {
  for (let i = 0; i < n; i++) game.tick();
}

describe('grind trick', () => {
  it('scores trick points every tick on top of the grind points and emits grindTrick when down is released', () => {
    const game = grinding();
    const tricks = record(game, 'grindTrick');
    const score = game.state.score;
    game.state.player.grindTrick = true;
    ticks(game, 30);
    expect(game.state.score - score).toBe(30 * (GRIND_POINTS + GRIND_TRICK_POINTS));
    expect(tricks).toEqual([]);
    game.state.player.grindTrick = false;
    game.tick();
    expect(tricks).toEqual([{ entityId: RAIL_ID, ticks: 30, points: 30 * GRIND_TRICK_POINTS }]);
    ticks(game, 10);
    expect(tricks).toHaveLength(1);
  });

  it('applies the multiplier', () => {
    const game = grinding();
    game.state.combo = 3;
    game.state.multiplier = 3;
    const tricks = record(game, 'grindTrick');
    game.state.player.grindTrick = true;
    ticks(game, 10);
    game.state.player.grindTrick = false;
    game.tick();
    expect(tricks[0]!.points).toBe(10 * GRIND_TRICK_POINTS * 3);
  });

  it('ends with the grind: grindTrick is emitted when the skater leaves the rail while still turned', () => {
    const game = grinding();
    const tricks = record(game, 'grindTrick');
    game.state.player.grindTrick = true;
    ticks(game, 12);
    game.state.player.grinding = false;
    game.state.player.grindTrick = false;
    game.tick();
    expect(tricks).toEqual([{ entityId: RAIL_ID, ticks: 12, points: 12 * GRIND_TRICK_POINTS }]);
  });

  it('a second trick on the same grind is counted on its own', () => {
    const game = grinding();
    const tricks = record(game, 'grindTrick');
    for (const n of [5, 8]) {
      game.state.player.grindTrick = true;
      ticks(game, n);
      game.state.player.grindTrick = false;
      game.tick();
    }
    expect(tricks.map((t) => t.ticks)).toEqual([5, 8]);
  });

  it('no trick without a grind', () => {
    const game = grinding();
    game.state.player.grinding = false;
    const tricks = record(game, 'grindTrick');
    const score = game.state.score;
    game.state.player.grindTrick = true;
    ticks(game, 10);
    game.state.player.grindTrick = false;
    game.tick();
    expect(tricks).toEqual([]);
    expect(game.state.score).toBe(score);
  });
});
