import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import { addRail, createPlayerTestGame, startGrind, tick } from '../player/testing';
import { CHILL_JUMP_SCALE, GRAVITY, HITBOX_H, HOLD_GRAVITY, JUMP_VELOCITY, STOMP_BOUNCE_VELOCITY } from '../player/tuning';
import { groundBody, hitboxOf, railBody, stepBody, stompBody } from './jumpsim';

/** y per tick of the real player when pressing for `hold` ticks from the ground (`chillTimer` > 0: chilled). */
function realGroundJump(hold: number, ticks: number, chillTimer = 0): number[] {
  const game = createPlayerTestGame();
  tick(game, 3);
  game.state.chillTimer = chillTimer;
  const ys: number[] = [];
  game.buttons.action.press('test');
  for (let i = 0; i < ticks; i++) {
    if (i === hold) game.buttons.action.release('test');
    game.tick();
    ys.push(game.state.player.y);
  }
  return ys;
}

function simGroundJump(hold: number, ticks: number, jumpScale = 1): number[] {
  let b = groundBody();
  const ys: number[] = [];
  for (let i = 0; i < ticks; i++) {
    b = stepBody(b, 0, i === 0, i < hold, false, jumpScale);
    ys.push(b.y);
  }
  return ys;
}

describe('jump simulator mirrors the player controller', () => {
  for (const hold of [1, 2, 5, 10, 15, 20, 30]) {
    it(`matches a ${hold}-tick hold from the ground tick by tick`, () => {
      const real = realGroundJump(hold, 70);
      const sim = simGroundJump(hold, 70);
      sim.forEach((y, i) => expect(y).toBeCloseTo(real[i]!, 6));
    });
  }

  it('rides a moving rail, rolls off its end and falls like the player', () => {
    const speed = 180;
    const game = createPlayerTestGame();
    tick(game, 3);
    const rail = addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 24, w: 40, h: 24 });
    startGrind(game, rail);
    let b = railBody(rail.y, rail.x + rail.w - PLAYER_X);
    let px = 0;
    for (let i = 0; i < 50; i++) {
      game.tick();
      rail.x -= speed * TICK_DT;
      b = stepBody(b, px, false, false);
      px += speed * TICK_DT;
      expect(b.y).toBeCloseTo(game.state.player.y, 6);
      expect(b.onRail).toBe(game.state.player.grinding);
      expect(b.grounded).toBe(game.state.player.grounded);
    }
  });

  it('jumps off a rail like the player', () => {
    const game = createPlayerTestGame();
    tick(game, 3);
    const rail = addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 24, w: 400, h: 24 });
    startGrind(game, rail);
    let b = railBody(rail.y, 1000);
    game.buttons.action.press('test');
    for (let i = 0; i < 40; i++) {
      if (i === 6) game.buttons.action.release('test');
      game.tick();
      b = stepBody(b, 0, i === 0, i < 6);
      expect(b.y).toBeCloseTo(game.state.player.y, 6);
    }
  });

  it('ducks like the player: low hitbox on the ground only, none in the air, at once on landing', () => {
    const game = createPlayerTestGame();
    tick(game, 3);
    let b = groundBody();
    // Duck 10 ticks, jump while ducked (duck stays held through the air), land ducked, stand up.
    const script = (i: number) => ({ press: i === 10, held: i >= 10 && i < 12, duck: i < 70 });
    for (let i = 0; i < 80; i++) {
      const { press, held, duck } = script(i);
      if (press) game.buttons.action.press('test');
      if (i === 12) game.buttons.action.release('test');
      if (duck) game.buttons.duck.press('test');
      else game.buttons.duck.release('test');
      game.tick();
      b = stepBody(b, 0, press, held, duck);
      const real = game.state.player;
      expect(b.y).toBeCloseTo(real.y, 6);
      expect(hitboxOf(b, real.x)).toEqual(real.hitbox);
    }
    expect(b.grounded).toBe(true);
  });

  it('uses the standing hitbox on support and the tucked one in the air', () => {
    expect(hitboxOf(groundBody(), 10)).toEqual({ x: 5, y: GROUND_Y - HITBOX_H.standing, w: 10, h: HITBOX_H.standing });
    const air = stepBody(groundBody(), 0, true, true);
    expect(hitboxOf(air, 0).h).toBe(HITBOX_H.tucked);
  });

  for (const hold of [1, 6, 20]) {
    it(`matches the chilled player (CHILL_JUMP_SCALE) for a ${hold}-tick hold`, () => {
      const real = realGroundJump(hold, 70, 30);
      const sim = simGroundJump(hold, 70, CHILL_JUMP_SCALE);
      sim.forEach((y, i) => expect(y).toBeCloseTo(real[i]!, 6));
    });
  }

  it('takes off with JUMP_VELOCITY * CHILL_JUMP_SCALE while chilled, everything else unchanged', () => {
    const b = stepBody(groundBody(), 0, true, true, false, CHILL_JUMP_SCALE);
    expect(b.vy).toBeCloseTo(-JUMP_VELOCITY * CHILL_JUMP_SCALE + HOLD_GRAVITY * TICK_DT, 9);
    const apex = (ys: number[]) => GROUND_Y - Math.min(...ys);
    const normal = apex(simGroundJump(30, 90));
    const chilled = apex(simGroundJump(30, 90, CHILL_JUMP_SCALE));
    expect(chilled).toBeLessThan(normal * 0.8);
    expect(chilled).toBeGreaterThan(30);
  });
});

describe('stomp bounce', () => {
  it('bounces like a take-off with STOMP_BOUNCE_VELOCITY and no hold boost on the tick after the stomp', () => {
    let b = groundBody();
    for (let i = 0; i < 20; i++) b = stepBody(b, 0, i === 0, i < 6);
    expect(b.vy).toBeGreaterThan(0);
    const bounced = stepBody(stompBody(b), 0, false, true);
    expect(bounced.grounded).toBe(false);
    expect(bounced.vy).toBeCloseTo(-STOMP_BOUNCE_VELOCITY + GRAVITY * TICK_DT, 9);
    expect(bounced.y).toBeCloseTo(b.y + bounced.vy * TICK_DT, 9);
  });

  it('matches the real player after a stomp tick by tick (held action gives no boost)', () => {
    const game = createPlayerTestGame();
    tick(game, 3);
    let b = groundBody();
    game.buttons.action.press('test');
    for (let i = 0; i < 70; i++) {
      // Falling at tick 30: gameplay reports a stomp after the player moved; the action stays held.
      if (i === 30) {
        expect(game.state.player.vy).toBeGreaterThan(0);
        game.bus.emit('stomp', { entityId: 1, kind: 'vfbFan', item: 'football' });
        b = stompBody(b);
      }
      game.tick();
      b = stepBody(b, 0, i === 0, true);
      expect(b.y).toBeCloseTo(game.state.player.y, 6);
      expect(b.grounded).toBe(game.state.player.grounded);
    }
    game.buttons.action.release('test');
  });
});
