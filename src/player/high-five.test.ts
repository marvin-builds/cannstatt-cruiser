import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import type { Entity } from '../types';
import { HIGH_FIVE_HOLD, HIGH_FIVE_RAISE, HIGH_FIVE_TIME, highFiveArm, highFiveSide } from './high-five';
import { addRail, crash, createPlayerTestGame, playerController, startGrind, tick } from './testing';

const DT = 1 / 60;

let nextId = 5000;

/** A high fiver whose middle is `ahead` px in front of the skater (negative: behind), like gameplay lays it. */
function addFiver(game: Game, ahead: number): Entity {
  const w = 15;
  const fiver: Entity = { id: nextId++, kind: 'highFiver', x: PLAYER_X + ahead - w / 2, y: GROUND_Y - 27, w, h: 27, done: false };
  game.state.entities.push(fiver);
  return fiver;
}

/** What gameplay does on a use press in the high fiver's window. */
function highFive(game: Game, fiver: Entity): void {
  game.bus.emit('highFive', { entityId: fiver.id, points: 100 });
}

function view(game: Game) {
  return playerController(game).view(game.state.player);
}

describe('high five timeline', () => {
  it('raises the arm, holds the slap for the contact (~0.12 s) and lowers it, ~0.3 s in all', () => {
    expect(HIGH_FIVE_TIME).toBeGreaterThanOrEqual(0.25);
    expect(HIGH_FIVE_TIME).toBeLessThanOrEqual(0.35);
    expect(HIGH_FIVE_HOLD).toBeCloseTo(0.12, 2);
    expect(highFiveArm(0)).toBe('raise');
    expect(highFiveArm(HIGH_FIVE_RAISE)).toBe('slap');
    expect(highFiveArm(HIGH_FIVE_RAISE + HIGH_FIVE_HOLD - 0.001)).toBe('slap');
    expect(highFiveArm(HIGH_FIVE_RAISE + HIGH_FIVE_HOLD)).toBe('lower');
    expect(highFiveArm(HIGH_FIVE_TIME - 0.001)).toBe('lower');
    expect(highFiveArm(HIGH_FIVE_TIME)).toBeNull();
  });

  it('reaches ahead, straight up or back depending on where the high fiver is', () => {
    expect(highFiveSide(20)).toBe('ahead');
    expect(highFiveSide(2)).toBe('over');
    expect(highFiveSide(-3)).toBe('over');
    expect(highFiveSide(-20)).toBe('behind');
    // Unknown position: up and back, past the shoulder.
    expect(highFiveSide(null)).toBe('behind');
  });
});

describe('high five in the player system', () => {
  it('starts on highFive, lasts ~0.3 s and ends cleanly', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    const fiver = addFiver(game, 20);
    highFive(game, fiver);
    expect(view(game).highFive).toEqual({ time: 0, side: 'ahead' });
    tick(game, 1);
    expect(view(game).highFive?.time).toBeCloseTo(DT, 5);
    tick(game, Math.ceil(HIGH_FIVE_TIME / DT) - 2);
    expect(view(game).highFive).not.toBeNull();
    tick(game, 1);
    expect(view(game).highFive).toBeNull();
    tick(game, 10);
    expect(view(game).highFive).toBeNull();
  });

  it('picks the side from the high fiver entity at the event', () => {
    const game = createPlayerTestGame();
    highFive(game, addFiver(game, -18));
    expect(view(game).highFive?.side).toBe('behind');
    highFive(game, addFiver(game, 1));
    expect(view(game).highFive?.side).toBe('over');
    game.bus.emit('highFive', { entityId: 424242, points: 100 });
    expect(view(game).highFive?.side).toBe('behind');
  });

  it('follows the high fiver as the street carries him past', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    const fiver = addFiver(game, 16);
    highFive(game, fiver);
    expect(view(game).highFive?.side).toBe('ahead');
    fiver.x -= 16;
    tick(game, 1);
    expect(view(game).highFive?.side).toBe('over');
    fiver.x -= 16;
    tick(game, 1);
    expect(view(game).highFive?.side).toBe('behind');
    // Gone (despawned): the arm keeps its last side.
    game.state.entities.splice(game.state.entities.indexOf(fiver), 1);
    tick(game, 1);
    expect(view(game).highFive?.side).toBe('behind');
  });

  it('works in the air without changing physics or hitbox', () => {
    const plain = createPlayerTestGame();
    const fiving = createPlayerTestGame();
    for (const g of [plain, fiving]) {
      tick(g, 5);
      g.buttons.action.press('test');
      tick(g, 6);
    }
    highFive(fiving, addFiver(fiving, 10));
    expect(fiving.state.player.grounded).toBe(false);
    for (let i = 0; i < 60; i++) {
      tick(plain, 1);
      tick(fiving, 1);
      if (i === 3) expect(view(fiving).highFive).not.toBeNull();
      expect(fiving.state.player.y).toBe(plain.state.player.y);
      expect(fiving.state.player.hitbox).toEqual(plain.state.player.hitbox);
      expect(fiving.state.player.state).toBe(plain.state.player.state);
    }
  });

  it('is cancelled by a crash and ignored while crashing', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    const fiver = addFiver(game, 0);
    highFive(game, fiver);
    tick(game, 2);
    crash(game);
    expect(view(game).highFive).toBeNull();
    highFive(game, fiver);
    expect(view(game).highFive).toBeNull();
  });

  it('is cancelled by an air trick start', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    game.buttons.action.press('test');
    tick(game, 14);
    game.buttons.action.release('test');
    highFive(game, addFiver(game, 0));
    game.buttons.duck.press('test');
    tick(game, 1);
    expect(game.state.player.airTrick).toBe(true);
    expect(view(game).highFive).toBeNull();
  });

  it('is cancelled by a grind trick start', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    const rail = addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 30, w: 300, h: 4 });
    startGrind(game, rail);
    tick(game, 2);
    highFive(game, addFiver(game, 0));
    tick(game, 1);
    expect(view(game).highFive).not.toBeNull();
    game.buttons.duck.press('test');
    tick(game, 1);
    expect(game.state.player.grindTrick).toBe(true);
    expect(view(game).highFive).toBeNull();
  });

  it('replaces a running item use, and a new run starts without it', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    game.bus.emit('itemUsed', { item: 'pretzel', action: 'eat' });
    highFive(game, addFiver(game, 0));
    expect(view(game).use).toBeNull();
    game.commands.gameOver();
    game.commands.startRun();
    expect(view(game).highFive).toBeNull();
  });
});
