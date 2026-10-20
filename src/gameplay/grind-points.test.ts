import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { createPlayerTestGame, tick } from '../player/testing';
import type { Entity, Rect, System } from '../types';
import { PopupFeed } from '../ui/popup-feed';
import { EMPTY_AIR_TRICK_POINTS } from './air-trick';
import { GRIND_LANDING_POINTS, GRIND_POINTS, kickerRect, ledgeRect, OBSTACLES, obstacleRect, railRect } from './catalogue';
import { createGameplaySystem } from './index';
import { bestGrindJump, GrindBot, type GrindJump } from './grind-bot';
import { place, quietGame, record } from './test-kit';

const SPEED = 120;

/** What one grind paid: the score changes from its grindStart to its grindEnd. */
interface PaidGrind {
  entityId: number;
  points: number;
}

/** Sums the score changes of every grind from its start to its end (both ticks included). */
function paidGrinds(game: Game): PaidGrind[] {
  const paid: PaidGrind[] = [];
  let open: PaidGrind | null = null;
  game.bus.on('grindStart', (e) => {
    open = { entityId: e.entityId, points: 0 };
    paid.push(open);
  });
  game.bus.on('scoreChanged', (e) => {
    if (open) open.points += e.delta;
  });
  game.bus.on('grindEnd', () => (open = null));
  return paid;
}

/** Places `kind` (rect `size`, at screen x `x`) and plans the grind bot's jump onto it. */
function grindable(game: Game, jumps: Map<number, GrindJump>, kind: Entity['kind'], size: Rect, x: number): Entity {
  const e = place(game, kind, { ...size, x });
  jumps.set(e.id, bestGrindJump(kind, size, SPEED)!);
  return e;
}

/** Rides the grind bot for `ticks`, flushing the ui's popup feed every tick; returns every popup text. */
function ride(game: Game, bot: GrindBot, ticks: number): string[] {
  const feed = new PopupFeed();
  feed.listen(game.bus);
  const texts: string[] = [];
  for (let i = 0; i < ticks; i++) {
    const move = bot.next(game.state);
    if (move === 'press') game.buttons.action.press('bot');
    if (move === 'release') game.buttons.action.release('bot');
    tick(game);
    for (const p of feed.flush(game.state.kidMode)) texts.push(p.text);
  }
  return texts;
}

describe('grind points (ROADMAP 92)', () => {
  it('a grind-only run scores clearly, and every rail grind ends with a +points popup of its total', { timeout: 30_000 }, () => {
    const game = quietGame(SPEED);
    const jumps = new Map<number, GrindJump>();
    const handrail = grindable(game, jumps, 'handrail', railRect(0, 22, 120), PLAYER_X + 120);
    const pipe = grindable(game, jumps, 'pipe', railRect(0, 10, 100), PLAYER_X + 500);
    const paid = paidGrinds(game);
    const ends = record(game, 'grindEnd');
    const clears = record(game, 'obstacleCleared');
    const crashes = record(game, 'crash');
    const popups = ride(game, new GrindBot(jumps), 600);

    expect(crashes).toEqual([]);
    expect(ends.map((e) => e.entityId)).toEqual([handrail.id, pipe.id]);
    // Landing plus the ticks on the rail: a long grind is worth a good hundred points.
    for (const g of paid) expect(g.points).toBeGreaterThanOrEqual(GRIND_LANDING_POINTS + 40 * GRIND_POINTS);
    expect(game.state.score).toBe(paid[0]!.points + paid[1]!.points);
    // The ui's "+N" popup (an obstacleCleared with points) shows each grind's total at its end.
    expect(clears).toEqual([
      { entityId: handrail.id, kind: 'handrail', points: paid[0]!.points },
      { entityId: pipe.id, kind: 'pipe', points: paid[1]!.points },
    ]);
    expect(popups).toEqual([`+${paid[0]!.points}`, `+${paid[1]!.points}`]);
  });

  it('a bench grind shows its own total next to the clear of the bench', { timeout: 30_000 }, () => {
    const game = quietGame(SPEED);
    const jumps = new Map<number, GrindJump>();
    const bench = grindable(game, jumps, 'bench', obstacleRect('bench', 0), PLAYER_X + 100);
    const paid = paidGrinds(game);
    const clears = record(game, 'obstacleCleared');
    ride(game, new GrindBot(jumps), 300);
    const grind = paid[0]!.points;
    expect(grind).toBeGreaterThanOrEqual(GRIND_LANDING_POINTS);
    expect(clears).toContainEqual({ entityId: bench.id, kind: 'bench', points: grind });
    expect(clears).toContainEqual({ entityId: bench.id, kind: 'bench', points: OBSTACLES.bench.points * 2 });
  });
});

/** Player + gameplay with `trick.on` copied into player.airTrick every tick (as in air-trick.test.ts). */
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

/** A lone kicker just ahead launches the skater high; returns once he falls `above` the street. */
function launchAndFall(game: Game): void {
  const kicker = place(game, 'kicker', kickerRect(PLAYER_X + 20));
  const launches = record(game, 'launch');
  until(game, () => kicker.x + 2 <= PLAYER_X, 120);
  game.buttons.action.press('test');
  tick(game, 2);
  game.buttons.action.release('test');
  until(game, () => launches.length > 0, 30);
  until(game, () => game.state.player.vy > 0 && game.state.player.y > GROUND_Y - 40);
}

describe('the grind popup is no clear', () => {
  it('a kickflip after rolling off a rail into empty air still pays the empty-air base', () => {
    const { game, trick } = trickGame();
    const tricks = record(game, 'airTrick');
    const ends = record(game, 'grindEnd');
    launchAndFall(game);
    const feet = game.state.player.y;
    place(game, 'handrail', railRect(PLAYER_X - 40, GROUND_Y - feet - 6, 80));
    until(game, () => ends.length > 0, 120);
    trick.on = true;
    tick(game, 4);
    trick.on = false;
    until(game, () => game.state.player.grounded);
    tick(game);
    expect(tricks).toEqual([{ ticks: 4, points: EMPTY_AIR_TRICK_POINTS, full: false }]);
  });

  it('stunt ledge grinds get no grind popup (the stunt callouts cheer them)', () => {
    const { game } = trickGame();
    const ends = record(game, 'grindEnd');
    const clears = record(game, 'obstacleCleared');
    launchAndFall(game);
    const feet = game.state.player.y;
    const ledge = place(game, 'ledge', ledgeRect(PLAYER_X - 40, GROUND_Y - feet - 6, 120));
    until(game, () => ends.some((e) => e.entityId === ledge.id), 200);
    tick(game, 2);
    expect(ends.map((e) => e.entityId)).toContain(ledge.id);
    expect(clears.filter((c) => c.entityId === ledge.id)).toEqual([]);
  });
});
