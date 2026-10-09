import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { createPlayerTestGame, crash, tick } from '../player/testing';
import { airTicksLeft, canStartAirTrick } from '../player/air-trick';
import { AIR_TRICK_HEIGHT } from '../player/tuning';
import type { Entity, GameEvents, ObstacleKind, System } from '../types';
import { AIR_TRICK_POINTS, EMPTY_AIR_TRICK_POINTS, STREET_AIR_TRICK_POINTS } from './air-trick';
import { KICKFLIP_BAIL_GRACE_TICKS } from './bail';
import { kickerRect, ledgeRect, obstacleRect, railRect } from './catalogue';
import { createGameplaySystem } from './index';
import { launchVelocityFor } from './rules';
import { KICKFLIP_REFRESH_SECONDS } from './flip-fade';
import { obstacle, place, record } from './test-kit';

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

/** Rides onto `kicker` and taps jump on its ramp (ramps need a press, ROADMAP 40) until it launches. */
function pressOnRamp(game: Game, kicker: Entity): void {
  const launches = record(game, 'launch');
  until(game, () => kicker.x + 2 <= PLAYER_X, 120);
  game.buttons.action.press('test');
  tick(game, 2);
  game.buttons.action.release('test');
  until(game, () => launches.length > 0, 30);
}

/** A lone kicker (no line) just ahead: the skater is launched high and lands on the street again. */
function launchOff(game: Game): void {
  pressOnRamp(game, place(game, 'kicker', kickerRect(PLAYER_X + 20)));
  tick(game, 2);
}

/** Runs a trick of `ticks` ticks in the air. */
function doTrick(game: Game, trick: { on: boolean }, ticks: number): void {
  trick.on = true;
  tick(game, ticks);
  trick.on = false;
}

/** Ahead of the skater so that the street jump of streetFlip clears it in the air (a still person). */
const CLEAR_AHEAD = 30;

/**
 * A street jump (action held 13 ticks) with a stand-in kickflip of 10 ticks,
 * over `over` (placed CLEAR_AHEAD px ahead) or into empty air; rides until
 * the skater is back on the street, plus a tick for the award.
 */
function streetFlip(game: Game, trick: { on: boolean }, over?: ObstacleKind): void {
  if (over) obstacle(game, over, PLAYER_X + CLEAR_AHEAD, { walk: 0, sway: 0, phase: 0 });
  game.buttons.action.press('test');
  tick(game, 3);
  doTrick(game, trick, 10);
  game.buttons.action.release('test');
  until(game, () => game.state.player.grounded);
  tick(game);
}

/** Every `land` event from now on reports `left` ticks of kickflip still to turn (what the player does for a late flip). */
function flipLeftOnLanding(game: Game, left: number): void {
  const emit = game.bus.emit.bind(game.bus);
  game.bus.emit = ((name: keyof GameEvents, payload: GameEvents[keyof GameEvents]) =>
    emit(name, name === 'land' ? { ...(payload as GameEvents['land']), flipLeft: left } : payload)) as typeof game.bus.emit;
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
    expect(tricks).toEqual([{ ticks: 21, points: AIR_TRICK_POINTS, full: true }]);
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
    expect(tricks).toEqual([{ ticks: 21, points: AIR_TRICK_POINTS, full: true }]);
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
    pressOnRamp(game, kicker);
    expect(launches).toHaveLength(1);
    tick(game, 2);
    doTrick(game, trick, 21);
    until(game, () => grinds.length > 0, 200);
    tick(game);
    expect(grinds).toEqual([{ entityId: ledge.id }]);
    // The ledge is the line's second piece: line multiplier x2.
    expect(tricks).toEqual([{ ticks: 21, points: 2 * AIR_TRICK_POINTS, full: true }]);
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

  it('a street kickflip over an obstacle scores STREET_AIR_TRICK_POINTS, less than a launch kickflip', () => {
    expect(STREET_AIR_TRICK_POINTS).toBe(100);
    expect(STREET_AIR_TRICK_POINTS).toBeLessThan(AIR_TRICK_POINTS);
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    streetFlip(game, trick, 'bin');
    expect(tricks).toEqual([{ ticks: 10, points: STREET_AIR_TRICK_POINTS, full: true }]);
    // The next flight off a kicker is a launch kickflip again.
    launchOff(game);
    doTrick(game, trick, 21);
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(tricks[1]).toEqual({ ticks: 21, points: AIR_TRICK_POINTS, full: true });
  });
});

describe('a reason to flip and repetition fade (ROADMAP 41)', () => {
  it('a street flip into empty air pays the small EMPTY_AIR_TRICK_POINTS, marked as cut', () => {
    expect(EMPTY_AIR_TRICK_POINTS).toBe(20);
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    streetFlip(game, trick);
    expect(tricks).toEqual([{ ticks: 10, points: EMPTY_AIR_TRICK_POINTS, full: false }]);
  });

  it('a street flip over a person (cleared in the same flight) pays the full street base', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    streetFlip(game, trick, 'vfbFan');
    expect(tricks).toEqual([{ ticks: 10, points: STREET_AIR_TRICK_POINTS, full: true }]);
  });

  it('a street flip in a flight that stomps someone pays the full street base', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const stomps = record(game, 'stomp');
    // A person further ahead: the skater falls onto the head and bounces off.
    obstacle(game, 'vfbFan', PLAYER_X + 50, { walk: 0, sway: 0, phase: 0 });
    streetFlip(game, trick);
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(stomps).toHaveLength(1);
    expect(tricks[0]).toEqual({ ticks: 10, points: STREET_AIR_TRICK_POINTS, full: true });
  });

  it('an obstacle cleared before the take-off (ducked under) does not count for the flight', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    game.bus.emit('obstacleCleared', { entityId: 1, kind: 'banner', points: 150 });
    streetFlip(game, trick);
    expect(tricks[0]!.points).toBe(EMPTY_AIR_TRICK_POINTS);
  });

  it('consecutive empty street flips pay 100%, 50%, 25%, then 10% of the base (rounded)', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    for (let i = 0; i < 5; i++) streetFlip(game, trick);
    expect(tricks.map((t) => t.points)).toEqual([20, 10, 5, 2, 2]);
    expect(tricks.map((t) => t.full)).toEqual([false, false, false, false, false]);
  });

  it('two flips in one launch flight: the first is full, the second fades', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    launchOff(game);
    doTrick(game, trick, 8);
    tick(game);
    doTrick(game, trick, 8);
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(tricks).toEqual([
      { ticks: 8, points: AIR_TRICK_POINTS, full: true },
      { ticks: 8, points: AIR_TRICK_POINTS / 2, full: false },
    ]);
  });

  const refreshers: [string, (game: Game) => void][] = [
    ['obstacleCleared', (g) => g.bus.emit('obstacleCleared', { entityId: 1, kind: 'bin', points: 100 })],
    ['stomp', (g) => g.bus.emit('stomp', { entityId: 1, kind: 'vfbFan', item: 'football' })],
    ['highFive', (g) => g.bus.emit('highFive', { entityId: 1, points: 50 })],
    ['launch', (g) => g.bus.emit('launch', { entityId: 1, velocity: -200 })],
  ];
  for (const [name, refresh] of refreshers) {
    it(`${name} between two flips makes the next one full again`, () => {
      const { game, trick } = trickGame();
      const tricks = record(game, 'airTrick');
      streetFlip(game, trick);
      streetFlip(game, trick);
      refresh(game);
      // Back on the street right away: the launch stand-in must not make this a launch flight.
      game.bus.emit('land', { impact: 0 });
      streetFlip(game, trick);
      expect(tricks.map((t) => t.points)).toEqual([20, 10, 20]);
    });
  }

  it('a grind on a rail between two flips makes the next one full again', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const grinds = record(game, 'grindStart');
    streetFlip(game, trick);
    game.buttons.action.press('test');
    tick(game, 3);
    game.buttons.action.release('test');
    catchOn(game, (feet) => place(game, 'handrail', railRect(PLAYER_X - 40, GROUND_Y - feet - 6, 60)));
    until(game, () => grinds.length > 0, 60);
    until(game, () => game.state.player.grounded);
    streetFlip(game, trick);
    expect(tricks.map((t) => t.points)).toEqual([20, 20]);
  });

  it(`${KICKFLIP_REFRESH_SECONDS} s of riding without a kickflip make the next one full again`, () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    streetFlip(game, trick);
    streetFlip(game, trick);
    tick(game, Math.round(KICKFLIP_REFRESH_SECONDS / TICK_DT));
    streetFlip(game, trick);
    expect(tricks.map((t) => t.points)).toEqual([20, 10, 20]);
  });

  it('the fade also counts flips over obstacles, but clearing one resets it first', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    streetFlip(game, trick);
    streetFlip(game, trick, 'bin');
    streetFlip(game, trick);
    expect(tricks.map((t) => t.points)).toEqual([20, 100, 10]);
  });
});

describe('kickflip bail (ROADMAP 41)', () => {
  it(`a flip with more than ${KICKFLIP_BAIL_GRACE_TICKS} ticks left on the landing is a bail: crash -1/'bail', one health, no points`, () => {
    expect(KICKFLIP_BAIL_GRACE_TICKS).toBe(3);
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const crashes = record(game, 'crash');
    game.state.carriedItem = 'football';
    const health = game.state.health;
    flipLeftOnLanding(game, KICKFLIP_BAIL_GRACE_TICKS + 1);
    game.buttons.action.press('test');
    tick(game, 3);
    trick.on = true;
    until(game, () => game.state.player.grounded);
    trick.on = false;
    tick(game, 30);
    expect(crashes).toEqual([{ entityId: -1, kind: 'bail', health: health - 1 }]);
    expect(game.state.health).toBe(health - 1);
    expect(game.state.carriedItem).toBeNull();
    expect(game.state.combo).toBe(0);
    expect(tricks).toEqual([]);
  });

  it('the last health lost on a bail ends the run', () => {
    const game = trickGame().game;
    game.state.health = 1;
    game.bus.emit('land', { impact: 0, flipLeft: 9 });
    expect(game.state.mode).toBe('gameover');
  });

  it('within the grace the flip scores normally', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const crashes = record(game, 'crash');
    flipLeftOnLanding(game, KICKFLIP_BAIL_GRACE_TICKS);
    streetFlip(game, trick);
    expect(crashes).toEqual([]);
    expect(tricks).toHaveLength(1);
  });

  it('while invulnerable a late flip costs no health, but it still scores nothing', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const crashes = record(game, 'crash');
    const health = game.state.health;
    game.state.player.invulnerableTimer = 2;
    flipLeftOnLanding(game, 8);
    streetFlip(game, trick);
    expect(crashes).toEqual([]);
    expect(game.state.health).toBe(health);
    expect(tricks).toEqual([]);
  });

  it('a late flip with down still held at the landing is read as a duck landing: no bail, but no points either', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const crashes = record(game, 'crash');
    flipLeftOnLanding(game, 8);
    game.buttons.action.press('test');
    tick(game, 3);
    game.buttons.action.release('test');
    trick.on = true;
    // Down pressed late in the fall (to duck under a banner ahead) and held to the street.
    until(game, () => game.state.player.vy > 0 && game.state.player.y > GROUND_Y - 15);
    game.buttons.duck.press('test');
    until(game, () => game.state.player.grounded);
    trick.on = false;
    tick(game, 30);
    expect(crashes).toEqual([]);
    expect(tricks).toEqual([]);
  });

  /** Down held on the street (long enough for core's drunk delay to deliver it), then a landing `flipLeft` ticks late. */
  function landLateWithDownHeld(game: Game, flipLeft: number): void {
    game.buttons.duck.press('test');
    tick(game, 40);
    game.bus.emit('land', { impact: 0, flipLeft });
  }

  it('while drunk down held on the touchdown is no duck landing: the late flip bails (nothing overhead to duck under)', () => {
    const game = trickGame().game;
    const crashes = record(game, 'crash');
    game.state.drunkTimer = 20;
    const health = game.state.health;
    landLateWithDownHeld(game, KICKFLIP_BAIL_GRACE_TICKS + 1);
    expect(crashes).toEqual([{ entityId: -1, kind: 'bail', health: health - 1 }]);
  });

  it('while chilled down held on the touchdown is still a duck landing: no bail', () => {
    const game = trickGame().game;
    const crashes = record(game, 'crash');
    game.state.chillTimer = 20;
    landLateWithDownHeld(game, KICKFLIP_BAIL_GRACE_TICKS + 1);
    expect(crashes).toEqual([]);
  });

  it('a ledge catch with the flip still turning never bails', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const crashes = record(game, 'crash');
    const grinds = record(game, 'grindStart');
    flipLeftOnLanding(game, 8);
    launchOff(game);
    trick.on = true;
    catchOn(game, (feet) => place(game, 'ledge', ledgeRect(PLAYER_X - 40, GROUND_Y - feet - 6, 200)));
    until(game, () => grinds.length > 0, 60);
    trick.on = false;
    tick(game, 3);
    expect(crashes).toEqual([]);
    expect(tricks).toHaveLength(1);
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
    // Nothing was cleared in that flight: a flip into empty air.
    expect(tricks[0]).toMatchObject({ points: EMPTY_AIR_TRICK_POINTS, full: false });
  });

  it('a street kickflip tapped late in the fall is a bail; tapped on the way up it is not (real player)', () => {
    for (const late of [true, false]) {
      const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
      game.setSpeedOverride(SPEED);
      tick(game, 2);
      const crashes = record(game, 'crash');
      game.buttons.action.press('test');
      tick(game, 3);
      const p = game.state.player;
      // Late: 7 ticks of air left for the 12-tick street flip. Early: on the way up.
      until(game, () => (late ? p.vy > 0 && airTicksLeft(p.y, p.vy) <= 7 : p.vy < 0 && GROUND_Y - p.y > AIR_TRICK_HEIGHT));
      game.buttons.duck.press('test');
      tick(game);
      game.buttons.duck.release('test');
      game.buttons.action.release('test');
      until(game, () => p.grounded);
      tick(game);
      expect(crashes.map((c) => c.kind)).toEqual(late ? ['bail'] : []);
    }
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
