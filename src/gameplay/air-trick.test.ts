import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { createPlayerTestGame, crash, tick } from '../player/testing';
import { canStartAirTrick } from '../player/air-trick';
import type { Entity, System } from '../types';
import { AIR_TRICK_POINTS, STREET_AIR_TRICK_POINTS } from './air-trick';
import { kickerRect, ledgeRect, obstacleRect, railRect } from './catalogue';
import { createGameplaySystem } from './index';
import { launchVelocityFor } from './rules';
import { place, record } from './test-kit';

const SPEED = 120;

/**
 * Player + gameplay with a stand-in for the player's air trick between them:
 * `trick.on` is copied into player.airTrick every tick before gameplay runs
 * (the player slice sets the flag itself from the down button).
 */
function trickGame(): { game: Game; trick: { on: boolean } } {
  const trick = { on: false };
  const flag: System = {
    name: 'air-trick-flag',
    update(ctx) {
      ctx.state.player.airTrick = trick.on;
    },
  };
  const game = createPlayerTestGame([flag, createGameplaySystem({ spawning: false })]);
  game.setSpeedOverride(SPEED);
  tick(game, 2);
  return { game, trick };
}

function until(game: Game, done: () => boolean, max = 400): void {
  for (let i = 0; i < max && !done(); i++) tick(game);
}

/** A lone kicker (no line) just ahead: the skater is launched high and lands on the street again. */
function launchOff(game: Game): void {
  const launches = record(game, 'launch');
  place(game, 'kicker', kickerRect(PLAYER_X + 20));
  until(game, () => launches.length > 0, 120);
  tick(game, 2);
}

/** Runs a trick of `ticks` ticks in the air. */
function doTrick(game: Game, trick: { on: boolean }, ticks: number): void {
  trick.on = true;
  tick(game, ticks);
  trick.on = false;
}

/** Waits until the skater falls and is `above` px over `top`, then puts `make(feetY)` under him. */
function catchOn(game: Game, top: (feetY: number) => Entity): Entity {
  until(game, () => game.state.player.vy > 0 && game.state.player.y > GROUND_Y - 40);
  return top(game.state.player.y);
}

describe('air trick scoring', () => {
  it('a completed trick followed by a street landing scores once', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    launchOff(game);
    doTrick(game, trick, 21);
    expect(tricks).toEqual([]);
    until(game, () => game.state.player.grounded);
    tick(game, 30);
    expect(tricks).toEqual([{ ticks: 21, points: AIR_TRICK_POINTS }]);
  });

  it('the points are added to the score', () => {
    const { game, trick } = trickGame();
    const scores = record(game, 'scoreChanged');
    launchOff(game);
    doTrick(game, trick, 21);
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(scores.map((s) => s.delta)).toContain(AIR_TRICK_POINTS);
  });

  it('scores when the skater comes down on a rail', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const grinds = record(game, 'grindStart');
    launchOff(game);
    doTrick(game, trick, 21);
    const rail = catchOn(game, (feet) => place(game, 'handrail', railRect(PLAYER_X - 40, GROUND_Y - feet - 6, 200)));
    until(game, () => grinds.length > 0, 60);
    tick(game);
    expect(grinds).toEqual([{ entityId: rail.id }]);
    expect(tricks).toEqual([{ ticks: 21, points: AIR_TRICK_POINTS }]);
  });

  it('scores when the skater comes down on a bench', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const grinds = record(game, 'grindStart');
    launchOff(game);
    doTrick(game, trick, 21);
    const bench = catchOn(game, () => place(game, 'bench', obstacleRect('bench', PLAYER_X - 12)));
    until(game, () => grinds.length > 0, 60);
    tick(game);
    expect(grinds).toEqual([{ entityId: bench.id }]);
    expect(tricks).toHaveLength(1);
  });

  it('scores when the skater catches a ledge, with the stunt line multiplier when it is higher', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const grinds = record(game, 'grindStart');
    const launches = record(game, 'launch');
    const data = { line: 77, steps: 2 };
    const kicker = place(game, 'kicker', kickerRect(PLAYER_X + 40));
    kicker.data = { ...data, step: 1, velocity: launchVelocityFor(48) };
    const ledge = place(game, 'ledge', ledgeRect(PLAYER_X + 70, 48, 90));
    ledge.data = { ...data, step: 2, zone: 0 };
    until(game, () => launches.length > 0, 120);
    tick(game, 2);
    doTrick(game, trick, 21);
    until(game, () => grinds.length > 0, 200);
    tick(game);
    expect(grinds).toEqual([{ entityId: ledge.id }]);
    // The ledge is the line's second piece: line multiplier x2.
    expect(tricks).toEqual([{ ticks: 21, points: 2 * AIR_TRICK_POINTS }]);
  });

  it('a trick still running when a ledge catches the skater counts with the ticks it ran', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const grinds = record(game, 'grindStart');
    launchOff(game);
    trick.on = true;
    catchOn(game, (feet) => place(game, 'ledge', ledgeRect(PLAYER_X - 40, GROUND_Y - feet - 6, 200)));
    until(game, () => grinds.length > 0, 60);
    trick.on = false;
    tick(game, 3);
    expect(tricks).toHaveLength(1);
    expect(tricks[0]!.ticks).toBeGreaterThan(5);
  });

  it('a crash after the trick awards nothing, and the next clean trick scores again', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    launchOff(game);
    doTrick(game, trick, 21);
    crash(game);
    until(game, () => game.state.player.grounded);
    tick(game, 120);
    expect(tricks).toEqual([]);
    game.state.player.invulnerableTimer = 0;
    launchOff(game);
    doTrick(game, trick, 21);
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(tricks).toHaveLength(1);
  });

  it('a crash on the landing tick awards nothing', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    launchOff(game);
    doTrick(game, trick, 21);
    game.bus.on('land', () => crash(game));
    until(game, () => game.state.player.grounded);
    tick(game, 30);
    expect(tricks).toEqual([]);
  });

  it('two tricks in one flight score once each; no trick, no event', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    launchOff(game);
    doTrick(game, trick, 8);
    tick(game);
    doTrick(game, trick, 9);
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(tricks.map((t) => t.ticks)).toEqual([8, 9]);
    launchOff(game);
    until(game, () => game.state.player.grounded);
    tick(game, 10);
    expect(tricks).toHaveLength(2);
  });

  it('a run start forgets a pending trick', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    launchOff(game);
    doTrick(game, trick, 21);
    game.commands.gameOver();
    game.commands.startRun();
    game.setSpeedOverride(SPEED);
    tick(game, 60);
    expect(tricks).toEqual([]);
  });

  it('a street kickflip (no kicker launch in the flight) scores STREET_AIR_TRICK_POINTS, less than a launch kickflip', () => {
    expect(STREET_AIR_TRICK_POINTS).toBe(100);
    expect(STREET_AIR_TRICK_POINTS).toBeLessThan(AIR_TRICK_POINTS);
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    game.buttons.action.press('test');
    tick(game, 3);
    doTrick(game, trick, 10);
    game.buttons.action.release('test');
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(tricks).toEqual([{ ticks: 10, points: STREET_AIR_TRICK_POINTS }]);
    // The next flight off a kicker is a launch kickflip again.
    launchOff(game);
    doTrick(game, trick, 21);
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(tricks[1]).toEqual({ ticks: 21, points: AIR_TRICK_POINTS });
  });
});

/** Player + gameplay with the real kickflip (down pressed in the air, player/air-trick.ts). */
describe('air trick scoring agrees with the player rule', () => {
  /** Down pressed (one-tick taps) every tick of the flight from `from` on, until the trick starts; returns whether the rule allowed it. */
  function tapDownWhileAirborne(game: Game, from: number): boolean {
    let allowed = false;
    for (let i = 0; i < 120 && !game.state.player.airTrick; i++) {
      const p = game.state.player;
      if (i >= from && !p.grounded) {
        allowed ||= canStartAirTrick(p.y, p.vy, false);
        game.buttons.duck.press('test');
      }
      tick(game);
      game.buttons.duck.release('test');
      if (i > 2 && game.state.player.grounded) break;
    }
    return allowed || game.state.player.airTrick;
  }

  it('a kickflip on a full street jump scores the street points once', () => {
    const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
    game.setSpeedOverride(SPEED);
    tick(game, 2);
    const tricks = record(game, 'airTrick');
    game.buttons.action.press('test');
    const started = tapDownWhileAirborne(game, 2);
    until(game, () => game.state.player.grounded);
    game.buttons.action.release('test');
    tick(game, 30);
    expect(started).toBe(true);
    expect(tricks).toHaveLength(1);
    expect(tricks[0]!.points).toBe(STREET_AIR_TRICK_POINTS);
  });

  it('a kickflip after a kicker launch scores the launch points', () => {
    const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
    game.setSpeedOverride(SPEED);
    tick(game, 2);
    const tricks = record(game, 'airTrick');
    launchOff(game);
    tapDownWhileAirborne(game, 0);
    until(game, () => game.state.player.grounded);
    tick(game, 30);
    expect(tricks).toHaveLength(1);
    expect(tricks[0]!.points).toBe(AIR_TRICK_POINTS);
  });
});
