import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import type { Entity } from '../types';
import { kickerRect, ledgeRect } from './catalogue';
import { launchVelocityFor } from './rules';
import { STUNT_LINE_BONUS, STUNT_POINTS, StuntLines } from './stunts';
import { place, quietGame, record } from './test-kit';

const SPEED = 120;

let nextLine = 1;

/** Puts a designed line's pieces on the street: each piece is [kind, x, height?, length?]. */
function line(game: Game, pieces: (['kicker', number, number?] | ['ledge', number, number, number])[]): Entity[] {
  const id = nextLine++;
  return pieces.map(([kind, x, a, b], i) => {
    const data = { line: id, step: i + 1, steps: pieces.length };
    if (kind === 'kicker') {
      const e = place(game, 'kicker', kickerRect(x));
      e.data = { ...data, velocity: launchVelocityFor(a ?? 48) };
      return e;
    }
    const e = place(game, 'ledge', ledgeRect(x, a!, b!));
    e.data = { ...data, zone: 0 };
    return e;
  });
}

/** Ticks until `done` (at most `max`). */
function until(game: Game, done: () => boolean, max = 600): void {
  for (let i = 0; i < max && !done(); i++) tick(game);
}

/** The kicker 40 px ahead and a 48 px high ledge where the launch comes down at SPEED. */
function kickerLedge(game: Game, extra: (['kicker', number, number?] | ['ledge', number, number, number])[] = []): Entity[] {
  return line(game, [['kicker', PLAYER_X + 40, 48], ['ledge', PLAYER_X + 70, 48, 90], ...extra]);
}

describe('kicker', () => {
  it('launches the skater riding onto it with its velocity, once, and never crashes', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    const crashes = record(game, 'crash');
    const [k] = line(game, [['kicker', PLAYER_X + 30, 50]]);
    until(game, () => launches.length > 0, 120);
    expect(launches).toEqual([{ entityId: k!.id, velocity: launchVelocityFor(50) }]);
    expect(k!.done).toBe(true);
    tick(game, 10);
    expect(game.state.player.grounded).toBe(false);
    expect(GROUND_Y - game.state.player.y).toBeGreaterThan(40);
    until(game, () => game.state.player.grounded, 200);
    expect(launches).toHaveLength(1);
    expect(crashes).toEqual([]);
  });

  it('a skater jumping over it high is not launched', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    line(game, [['kicker', PLAYER_X + 24]]);
    game.buttons.action.press('test');
    tick(game, 30);
    game.buttons.action.release('test');
    until(game, () => game.state.player.grounded, 200);
    tick(game, 30);
    expect(launches).toEqual([]);
  });

  it('a kicker placed without line data launches with the default velocity', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    place(game, 'kicker', kickerRect(PLAYER_X + 20));
    until(game, () => launches.length > 0, 120);
    expect(launches[0]!.velocity).toBe(launchVelocityFor(48));
  });
});

describe('ledges', () => {
  it('the launch comes down onto the ledge and grinds it; rolling off its end drops to the street with no crash and no health lost', () => {
    const game = quietGame(SPEED);
    const grinds = record(game, 'grindStart');
    const crashes = record(game, 'crash');
    const health = game.state.health;
    const [, ledge] = kickerLedge(game);
    until(game, () => grinds.length > 0, 200);
    expect(grinds).toEqual([{ entityId: ledge!.id }]);
    expect(game.state.player.grinding).toBe(true);
    expect(game.state.player.y).toBe(ledge!.y);
    until(game, () => game.state.player.grounded, 300);
    expect(crashes).toEqual([]);
    expect(game.state.health).toBe(health);
  });

  it('jumping up through a ledge from the street never crashes; coming down onto it grinds', () => {
    const game = quietGame(60);
    const grinds = record(game, 'grindStart');
    const crashes = record(game, 'crash');
    const ledge = place(game, 'ledge', ledgeRect(PLAYER_X - 10, 42, 120));
    game.buttons.action.press('test');
    tick(game, 25);
    game.buttons.action.release('test');
    until(game, () => game.state.player.grounded || game.state.player.grinding, 200);
    expect(crashes).toEqual([]);
    expect(grinds).toEqual([{ entityId: ledge.id }]);
  });

  it('riding under a ledge on the street touches nothing', () => {
    const game = quietGame(SPEED);
    const crashes = record(game, 'crash');
    const grinds = record(game, 'grindStart');
    place(game, 'ledge', ledgeRect(PLAYER_X + 10, 42, 120));
    tick(game, 120);
    expect(crashes).toEqual([]);
    expect(grinds).toEqual([]);
  });

  it('the grind trick works on a ledge', () => {
    const game = quietGame(SPEED);
    const tricks = record(game, 'grindTrick');
    const grinds = record(game, 'grindStart');
    kickerLedge(game);
    until(game, () => grinds.length > 0, 200);
    game.buttons.duck.press('test');
    tick(game, 12);
    game.buttons.duck.release('test');
    tick(game, 2);
    expect(tricks).toHaveLength(1);
    expect(tricks[0]!.ticks).toBeGreaterThan(5);
  });
});

describe('stunt line scoring', () => {
  it('the first made piece starts the line quietly (x1), every further one emits stuntStep from x2 up, the end a completed line with its bonus', () => {
    const game = quietGame(SPEED);
    const steps = record(game, 'stuntStep');
    const ends = record(game, 'stuntEnd');
    const score = record(game, 'scoreChanged');
    kickerLedge(game);
    until(game, () => ends.length > 0, 400);
    // No "Combo x1!": the kicker that starts the line has the launch as its feedback.
    expect(steps).toEqual([{ step: 2, steps: 2, multiplier: 2, points: 2 * STUNT_POINTS.ledge }]);
    expect(ends).toEqual([{ steps: 2, made: 2, completed: true, points: STUNT_LINE_BONUS * 2 }]);
    // The stunt points are added as they are (the line has its own multiplier).
    for (const p of [STUNT_POINTS.kicker, 2 * STUNT_POINTS.ledge, STUNT_LINE_BONUS * 2]) expect(score.map((s) => s.delta)).toContain(p);
  });

  it('missing the ledge ends the line when the skater lands on the street: incomplete, no bonus, no penalty', () => {
    const game = quietGame(SPEED);
    const ends = record(game, 'stuntEnd');
    const crashes = record(game, 'crash');
    const health = game.state.health;
    line(game, [['kicker', PLAYER_X + 30], ['ledge', PLAYER_X + 600, 48, 80]]);
    const steps = record(game, 'stuntStep');
    until(game, () => ends.length > 0, 400);
    expect(ends).toEqual([{ steps: 2, made: 1, completed: false, points: 0 }]);
    expect(steps).toEqual([]);
    expect(game.state.player.grounded).toBe(true);
    expect(crashes).toEqual([]);
    expect(game.state.health).toBe(health);
  });

  it('a drop to the street before the next kicker keeps the line going', () => {
    const game = quietGame(SPEED);
    const steps = record(game, 'stuntStep');
    const ends = record(game, 'stuntEnd');
    kickerLedge(game, [
      ['kicker', PLAYER_X + 260, 48],
      ['ledge', PLAYER_X + 290, 48, 90],
    ]);
    until(game, () => ends.length > 0, 900);
    expect(steps.map((s) => [s.step, s.multiplier])).toEqual([
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    expect(ends).toEqual([{ steps: 4, made: 4, completed: true, points: STUNT_LINE_BONUS * 4 }]);
  });

  it('jumping over the next kicker ends the line once it is behind the skater', () => {
    const game = quietGame(SPEED);
    const ends = record(game, 'stuntEnd');
    const [, , k3] = kickerLedge(game, [
      ['kicker', PLAYER_X + 420, 48],
      ['ledge', PLAYER_X + 450, 48, 90],
    ]);
    until(game, () => k3!.x - PLAYER_X < 16, 600);
    expect(game.state.player.grounded).toBe(true);
    game.buttons.action.press('test');
    tick(game, 20);
    game.buttons.action.release('test');
    until(game, () => ends.length > 0, 300);
    expect(k3!.done).toBe(false);
    expect(ends).toEqual([{ steps: 4, made: 2, completed: false, points: 0 }]);
  });

  it('jumping over the first kicker: the line starts at the next piece made and ends once, completed at its last piece', () => {
    const game = quietGame(SPEED);
    const steps = record(game, 'stuntStep');
    const ends = record(game, 'stuntEnd');
    const [k1] = kickerLedge(game, [
      ['kicker', PLAYER_X + 260, 48],
      ['ledge', PLAYER_X + 290, 48, 90],
    ]);
    until(game, () => k1!.x - PLAYER_X < 16, 120);
    game.buttons.action.press('test');
    tick(game, 6);
    game.buttons.action.release('test');
    until(game, () => ends.length > 0, 900);
    expect(k1!.done).toBe(false);
    expect(steps).toEqual([{ step: 4, steps: 4, multiplier: 2, points: 2 * STUNT_POINTS.ledge }]);
    expect(ends).toEqual([{ steps: 4, made: 2, completed: true, points: STUNT_LINE_BONUS * 2 }]);
  });

  it('after dropping out, the next made piece of the same line starts it again', () => {
    const game = quietGame(SPEED);
    const steps = record(game, 'stuntStep');
    const ends = record(game, 'stuntEnd');
    // The second piece is far away: the launch misses it and the line ends on the street.
    line(game, [
      ['kicker', PLAYER_X + 30, 48],
      ['ledge', PLAYER_X + 900, 48, 80],
      ['kicker', PLAYER_X + 260, 48],
      ['ledge', PLAYER_X + 290, 48, 90],
    ]);
    until(game, () => ends.length > 1, 900);
    expect(ends).toEqual([
      { steps: 4, made: 1, completed: false, points: 0 },
      { steps: 4, made: 2, completed: true, points: STUNT_LINE_BONUS * 2 },
    ]);
    expect(steps.map((s) => [s.step, s.multiplier])).toEqual([[4, 2]]);
  });

  it('a single made piece is no line: making only the last one ends it incomplete, without a step', () => {
    const game = quietGame(60);
    const steps = record(game, 'stuntStep');
    const ends = record(game, 'stuntEnd');
    const ledge = place(game, 'ledge', ledgeRect(PLAYER_X - 10, 42, 120));
    ledge.data = { line: nextLine++, step: 2, steps: 2, zone: 0 };
    game.buttons.action.press('test');
    tick(game, 25);
    game.buttons.action.release('test');
    until(game, () => ends.length > 0, 400);
    expect(steps).toEqual([]);
    expect(ends).toEqual([{ steps: 2, made: 1, completed: false, points: 0 }]);
  });

  it('a skipped line says nothing: no step, no end', () => {
    const game = quietGame(SPEED);
    const steps = record(game, 'stuntStep');
    const ends = record(game, 'stuntEnd');
    const [k1] = line(game, [['kicker', PLAYER_X + 40, 48], ['ledge', PLAYER_X + 900, 48, 80]]);
    until(game, () => k1!.x - PLAYER_X < 16, 120);
    game.buttons.action.press('test');
    tick(game, 20);
    game.buttons.action.release('test');
    tick(game, 200);
    expect(steps).toEqual([]);
    expect(ends).toEqual([]);
  });

  it('a crash ends a running line incomplete', () => {
    const game = quietGame(SPEED);
    const ends = record(game, 'stuntEnd');
    const launches = record(game, 'launch');
    line(game, [['kicker', PLAYER_X + 30], ['ledge', PLAYER_X + 900, 48, 80]]);
    until(game, () => launches.length > 0, 120);
    game.state.health -= 1;
    game.bus.emit('crash', { entityId: 1, kind: 'barrier', health: game.state.health });
    expect(ends).toEqual([{ steps: 2, made: 1, completed: false, points: 0 }]);
  });

  it('a crash on the last piece ends the line incomplete, without bonus', () => {
    const game = quietGame(SPEED);
    const ends = record(game, 'stuntEnd');
    const grinds = record(game, 'grindStart');
    kickerLedge(game);
    until(game, () => grinds.length > 0, 200);
    game.state.health -= 1;
    game.bus.emit('crash', { entityId: 1, kind: 'barrier', health: game.state.health });
    expect(ends).toEqual([{ steps: 2, made: 2, completed: false, points: 0 }]);
  });

  it('shows the running line read-only (view) and forgets it at a run start', () => {
    const game = quietGame(SPEED);
    const lines = new StuntLines();
    game.bus.on('launch', (e) => lines.made(game.ctx, game.state.entities.find((x) => x.id === e.entityId)!));
    expect(lines.view()).toBeNull();
    const launches = record(game, 'launch');
    line(game, [['kicker', PLAYER_X + 30], ['ledge', PLAYER_X + 900, 48, 80]]);
    until(game, () => launches.length > 0, 120);
    const view = lines.view()!;
    expect(view).toMatchObject({ steps: 2, made: 1, multiplier: 1, points: STUNT_POINTS.kicker });
    view.made = 99;
    expect(lines.view()!.made).toBe(1);
    lines.reset();
    expect(lines.view()).toBeNull();
  });
});
