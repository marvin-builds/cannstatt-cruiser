import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import type { Entity } from '../types';
import { OBSTACLES } from './catalogue';
import { ITEM_POINTS } from './items';
import type { Motion } from './motion';
import { obstacle, quietGame, record } from './test-kit';
import { planStomp } from './testing';
import { TOSS_TIME } from './toss';

const still: Motion = { walk: 0, sway: 0, phase: 0 };
/** Left edge that centres a person's collision box on the skater. */
const centred = (kind: 'vfbFan' | 'wasenGuest') => PLAYER_X - OBSTACLES[kind].box.x - OBSTACLES[kind].box.w / 2;

/** Puts the skater in the air at `height` above the ground with vertical speed `vy`. */
function airborne(game: Game, height: number, vy: number): void {
  const p = game.state.player;
  p.grounded = false;
  p.y = GROUND_Y - height;
  p.vy = vy;
}

/** A still person under the skater, who drops onto its head from 40 px up. */
function dropOnto(kind: 'vfbFan' | 'wasenGuest', prop = 0, kidMode = false): { game: Game; person: Entity } {
  const game = quietGame(0);
  game.state.kidMode = kidMode;
  const person = obstacle(game, kind, centred(kind), still);
  person.data = { ...person.data, prop };
  airborne(game, 40, 0);
  return { game, person };
}

describe('stomp: landing on a person while falling', () => {
  it('falling onto the head is a stomp, not a crash: stomp event with the item, the person is done', () => {
    const { game, person } = dropOnto('vfbFan');
    const stomps = record(game, 'stomp');
    const crashes = record(game, 'crash');
    tick(game, 30);
    expect(stomps).toEqual([{ entityId: person.id, kind: 'vfbFan', item: 'football' }]);
    expect(crashes).toEqual([]);
    expect(person.done).toBe(true);
  });

  it('scores the stomp at impact like a clean clear: points and obstacleCleared (popup + sound) in the same tick', () => {
    const { game, person } = dropOnto('vfbFan');
    const stomps = record(game, 'stomp');
    const cleared = record(game, 'obstacleCleared');
    for (let i = 0; i < 30 && stomps.length === 0; i++) game.tick();
    expect(stomps).toHaveLength(1);
    expect(cleared).toEqual([{ entityId: person.id, kind: 'vfbFan', points: OBSTACLES.vfbFan.points }]);
    expect(game.state.score).toBe(OBSTACLES.vfbFan.points);
    tick(game, 30);
    expect(cleared).toHaveLength(1);
  });

  it('obstacleCleared and stomp come in the same tick for the same person (ui: "Stomp! +N")', () => {
    const { game, person } = dropOnto('wasenGuest');
    const seen: string[] = [];
    game.bus.on('obstacleCleared', (e) => seen.push(`cleared:${e.entityId}@${game.state.frame}`));
    game.bus.on('stomp', (e) => seen.push(`stomp:${e.entityId}@${game.state.frame}`));
    for (let i = 0; i < 30 && seen.length === 0; i++) game.tick();
    const frame = game.state.frame;
    expect(seen).toEqual([`cleared:${person.id}@${frame}`, `stomp:${person.id}@${frame}`]);
  });

  it('the skater bounces up on the next tick (player contract)', () => {
    const { game } = dropOnto('vfbFan');
    const stomps = record(game, 'stomp');
    for (let i = 0; i < 30 && stomps.length === 0; i++) game.tick();
    expect(stomps).toHaveLength(1);
    game.tick();
    expect(game.state.player.vy).toBeLessThan(0);
  });

  it('hitting a person from the side is a crash', () => {
    const game = quietGame(120);
    const stomps = record(game, 'stomp');
    const crashes = record(game, 'crash');
    obstacle(game, 'wasenGuest', PLAYER_X + 30, still);
    // Low in the air, falling slowly: the feet are already below the head when the person arrives.
    airborne(game, 8, 10);
    tick(game, 30);
    expect(crashes.map((c) => c.kind)).toEqual(['wasenGuest']);
    expect(stomps).toEqual([]);
  });

  it('rising through a person is a crash', () => {
    const game = quietGame(0);
    const stomps = record(game, 'stomp');
    const crashes = record(game, 'crash');
    obstacle(game, 'vfbFan', centred('vfbFan'), still);
    airborne(game, 4, -190);
    tick(game, 5);
    expect(crashes.map((c) => c.kind)).toEqual(['vfbFan']);
    expect(stomps).toEqual([]);
  });

  it('a stomped person stays harmless: no crash when the skater lands on or rides through them', () => {
    const { game, person } = dropOnto('wasenGuest');
    const crashes = record(game, 'crash');
    tick(game, 120);
    expect(game.state.player.grounded).toBe(true);
    expect(crashes).toEqual([]);
    expect(person.data?.stompedAt).toEqual(expect.any(Number));
  });

  it('a stomped person stops walking and sits where they fell', () => {
    const game = quietGame(0);
    const fan = obstacle(game, 'vfbFan', centred('vfbFan'), { walk: 0.12, sway: 0, phase: 0 });
    airborne(game, 40, 0);
    tick(game, 20);
    expect(fan.done).toBe(true);
    const x = fan.x;
    game.setSpeedOverride(120);
    tick(game, 30);
    expect(fan.x).toBeCloseTo(x - 120 * 30 * TICK_DT, 6);
  });

  it('counts as a trick in the combo (and scores)', () => {
    const { game } = dropOnto('vfbFan');
    tick(game, 12);
    expect(game.state.combo).toBe(1);
    expect(game.state.score).toBeGreaterThan(0);
  });
});

describe('the tossed item', () => {
  /** Ticks until itemCaught, with `act` run every tick (input while the item flies). */
  function untilCaught(game: Game, act: (i: number) => void = () => {}): number {
    const caught = record(game, 'itemCaught');
    const stomps = record(game, 'stomp');
    let since = -1;
    for (let i = 0; i < 200 && caught.length === 0; i++) {
      if (since >= 0) act(since++);
      game.tick();
      if (stomps.length > 0 && since < 0) since = 0;
    }
    return caught.length ? since : -1;
  }

  it('is caught automatically after TOSS_TIME: itemCaught, carriedItem set, bonus points', () => {
    const { game } = dropOnto('vfbFan');
    const caught = record(game, 'itemCaught');
    const ticks = untilCaught(game);
    expect(ticks).toBe(Math.round(TOSS_TIME / TICK_DT));
    expect(caught).toEqual([{ item: 'football' }]);
    expect(game.state.carriedItem).toBe('football');
    expect(game.state.score).toBeGreaterThanOrEqual(ITEM_POINTS);
  });

  it('is caught even when the skater jumps right after the bounce', () => {
    const { game } = dropOnto('wasenGuest', 1);
    const ticks = untilCaught(game, (i) => {
      if (i === 10) game.buttons.action.press('test');
      if (i === 25) game.buttons.action.release('test');
    });
    expect(ticks).toBeGreaterThan(0);
    expect(game.state.carriedItem).toBe('pretzel');
  });

  it('is caught even when the skater ducks after landing', () => {
    const { game } = dropOnto('wasenGuest', 0);
    game.buttons.duck.press('test');
    expect(untilCaught(game)).toBeGreaterThan(0);
    expect(game.state.carriedItem).toBe('beer');
  });

  it('kid mode: a Wasen visitor gives a Lebkuchenherz or a Brezel, never beer', () => {
    for (const prop of [0, 1]) {
      const { game } = dropOnto('wasenGuest', prop, true);
      untilCaught(game);
      expect(['gingerbread', 'pretzel']).toContain(game.state.carriedItem);
    }
  });

  it('the carried item is lost on the next crash, and a new run starts empty-handed', () => {
    const { game } = dropOnto('vfbFan');
    untilCaught(game);
    expect(game.state.carriedItem).toBe('football');
    tick(game, 60);
    obstacle(game, 'bin', PLAYER_X - 2);
    tick(game, 2);
    expect(game.state.carriedItem).toBeNull();

    const again = dropOnto('vfbFan').game;
    untilCaught(again);
    again.commands.gameOver();
    again.commands.startRun();
    expect(again.state.carriedItem).toBeNull();
  });

  it('a crash while the item flies loses it: no catch', () => {
    const { game } = dropOnto('vfbFan');
    const caught = record(game, 'itemCaught');
    const stomps = record(game, 'stomp');
    for (let i = 0; i < 30 && stomps.length === 0; i++) game.tick();
    tick(game, 3);
    game.state.player.invulnerableTimer = 0;
    obstacle(game, 'barrier', PLAYER_X - 4);
    tick(game, 60);
    expect(caught).toEqual([]);
    expect(game.state.carriedItem).toBeNull();
  });
});

describe('planStomp (test tooling)', () => {
  for (const kind of ['vfbFan', 'wasenGuest'] as const) {
    it(`finds a real jump that lands on a moving ${kind}'s head`, () => {
      const game = quietGame(110);
      const motion = OBSTACLES[kind].motion!;
      obstacle(game, kind, PLAYER_X + 120, { walk: motion.walk[1], sway: motion.sway[1], phase: 1 });
      const stomps = record(game, 'stomp');
      const crashes = record(game, 'crash');
      const plan = planStomp(game.state, true)!;
      expect(plan).not.toBeNull();
      tick(game, plan.tick);
      game.buttons.action.press('test');
      for (let i = 0; i < 90; i++) {
        if (i === plan.hold) game.buttons.action.release('test');
        game.tick();
      }
      expect(stomps.map((s) => s.kind)).toEqual([kind]);
      expect(crashes).toEqual([]);
    });
  }
});
