import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import type { CarriedItem, ItemAction } from '../types';
import { addRail, crash, createPlayerTestGame, playerController, startGrind, tick } from './testing';
import { DRINK_GULPS, ITEM_USE_TIME, itemUseFrame, MugToss, TOSS_AT } from './use';

const DT = 1 / 60;

/** The frames of `action` sampled every tick until it is over. */
function frames(action: ItemAction) {
  const out = [];
  for (let t = 0; t < ITEM_USE_TIME[action]; t += DT) out.push(itemUseFrame(action, t)!);
  return out;
}

/** Number of runs of consecutive frames for which `match` holds. */
function runs<T>(list: T[], match: (x: T) => boolean): number {
  let n = 0;
  list.forEach((x, i) => {
    if (match(x) && (i === 0 || !match(list[i - 1]!))) n++;
  });
  return n;
}

describe('item use timelines', () => {
  it('drink: lifts the mug, takes three gulps in about a second, then tosses the empty mug', () => {
    expect(DRINK_GULPS).toBe(3);
    const f = frames('drink');
    expect(f[0]!.arm).toBe('lift');
    expect(runs(f, (x) => x.arm === 'tip')).toBe(3);
    const lastGulp = f.map((x) => x.arm).lastIndexOf('tip');
    expect(lastGulp * DT).toBeGreaterThan(0.75);
    expect(lastGulp * DT).toBeLessThan(1.15);
    expect(f.at(-1)!.arm).toBe('toss');
    expect(f.at(-1)!.item).toBeNull();
    expect(TOSS_AT).toBeGreaterThan(lastGulp * DT);
    expect(TOSS_AT).toBeLessThan(ITEM_USE_TIME.drink);
    // The mug empties while drinking: full first, empty before it is tossed.
    expect(f[0]!.item).toBe('full');
    expect(f.some((x) => x.item === 'empty')).toBe(true);
    expect(itemUseFrame('drink', ITEM_USE_TIME.drink)).toBeNull();
  });

  it('eat: two bites with crumbs, then the food is gone', () => {
    const f = frames('eat');
    expect(ITEM_USE_TIME.eat).toBeLessThan(1);
    expect(f[0]!.item).toBe('full');
    expect(runs(f, (x) => x.arm === 'bite')).toBe(2);
    expect(f.some((x) => x.item === 'bitten')).toBe(true);
    expect(f.some((x) => x.item === 'crumb')).toBe(true);
    expect(f.filter((x) => x.crumbs > 0).length).toBeGreaterThan(0);
    expect(f.at(-1)!.item).toBeNull();
    expect(itemUseFrame('eat', ITEM_USE_TIME.eat)).toBeNull();
  });

  it('throw: a quick overarm throw (arm up, then forward) without the ball (gameplay owns it)', () => {
    const f = frames('throw');
    expect(ITEM_USE_TIME.throw).toBeLessThanOrEqual(0.35);
    expect(f[0]!.arm).toBe('windup');
    expect(f.at(-1)!.arm).toBe('release');
    expect(f.every((x) => x.item === null)).toBe(true);
  });

  it('is deterministic', () => {
    for (const a of ['drink', 'eat', 'throw'] as const) expect(frames(a)).toEqual(frames(a));
  });
});

describe('the empty mug tossed behind', () => {
  it('flies back in an arc, lands on the ground and goes with the street', () => {
    const toss = new MugToss();
    expect(toss.active).toBe(false);
    toss.start(PLAYER_X, GROUND_Y - 26);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 400 && toss.active; i++) {
      toss.update(DT, 90);
      xs.push(toss.x);
      ys.push(toss.y);
    }
    expect(toss.active).toBe(false);
    expect(Math.min(...ys)).toBeLessThan(GROUND_Y - 26);
    expect(Math.max(...ys)).toBeLessThanOrEqual(GROUND_Y);
    expect(ys.filter((y) => y === GROUND_Y).length).toBeGreaterThan(0);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThan(xs[i - 1]!);
    expect(xs.at(-1)!).toBeLessThan(0);
  });
});

function useItem(game: Game, item: CarriedItem, action: ItemAction): void {
  game.state.carriedItem = null;
  game.bus.emit('itemUsed', { item, action });
}

describe('item use in the player system', () => {
  it('itemUsed plays the animation in the view and ends after its time', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    useItem(game, 'beer', 'drink');
    tick(game, 1);
    const view = playerView(game);
    expect(view.use).toMatchObject({ action: 'drink', item: 'beer' });
    tick(game, Math.ceil(ITEM_USE_TIME.drink / DT) + 1);
    expect(playerView(game).use).toBeNull();
  });

  it('never changes the hitbox, and jumping and ducking still work during it', () => {
    const plain = createPlayerTestGame();
    const using = createPlayerTestGame();
    tick(plain, 5);
    tick(using, 5);
    useItem(using, 'pretzel', 'eat');
    for (const g of [plain, using]) {
      g.buttons.action.press('test');
      tick(g, 3);
      g.buttons.action.release('test');
    }
    for (let i = 0; i < 50; i++) {
      tick(plain, 1);
      tick(using, 1);
      expect(using.state.player.hitbox).toEqual(plain.state.player.hitbox);
      expect(using.state.player.y).toBe(plain.state.player.y);
    }
    useItem(using, 'beer', 'drink');
    using.buttons.duck.press('test');
    tick(using, 3);
    expect(using.state.player.state).toBe('duck');
  });

  it('plays in the air and on a rail (incl. the grind trick)', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    const rail = addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 30, w: 300, h: 4 });
    startGrind(game, rail);
    game.buttons.duck.press('test');
    useItem(game, 'football', 'throw');
    tick(game, 3);
    expect(game.state.player.grindTrick).toBe(true);
    expect(playerView(game).use).toMatchObject({ action: 'throw' });
  });

  it('a crash cuts it short, and a new run starts without it', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    useItem(game, 'beer', 'drink');
    tick(game, 2);
    crash(game);
    tick(game, 1);
    expect(playerView(game).use).toBeNull();
    useItem(game, 'beer', 'drink');
    game.commands.gameOver();
    game.commands.startRun();
    expect(playerView(game).use).toBeNull();
  });

  it('drinking tosses the empty mug once, at TOSS_AT', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    useItem(game, 'beer', 'drink');
    const toss = playerToss(game);
    tick(game, Math.floor(TOSS_AT / DT) - 1);
    expect(toss.active).toBe(false);
    tick(game, 3);
    expect(toss.active).toBe(true);
    const eat = createPlayerTestGame();
    useItem(eat, 'pretzel', 'eat');
    tick(eat, 60);
    expect(playerToss(eat).active).toBe(false);
  });
});

function playerView(game: Game) {
  return playerController(game).view(game.state.player);
}

function playerToss(game: Game) {
  return playerController(game).toss;
}
