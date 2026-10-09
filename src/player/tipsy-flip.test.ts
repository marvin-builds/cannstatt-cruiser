import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../core/config';
import type { Game } from '../core/game';
import type { GameState } from '../types';
import { airTrickTicks, flipMood } from './air-trick';
import { createPlayerTestGame, tick } from './testing';
import { AIR_TRICK_TICKS, CHILL_FLIP_SCALE, DRUNK_FLIP_JITTER, DRUNK_FLIP_SCALE, STREET_AIR_TRICK_TICKS } from './tuning';

const DRUNK_BASE = Math.round(STREET_AIR_TRICK_TICKS * DRUNK_FLIP_SCALE);
const CHILL_TICKS = Math.round(STREET_AIR_TRICK_TICKS * CHILL_FLIP_SCALE);

function mood(drunkTimer: number, chillTimer: number): Pick<GameState, 'drunkTimer' | 'chillTimer'> {
  return { drunkTimer, chillTimer };
}

describe('flip length while drunk or chilled (pure rule, ROADMAP 42)', () => {
  it('scales: about 1.5 drunk (plus 0..~6 ticks jitter), a bit longer chilled', () => {
    expect(DRUNK_FLIP_SCALE).toBeGreaterThanOrEqual(1.3);
    expect(DRUNK_FLIP_SCALE).toBeLessThanOrEqual(1.7);
    expect(DRUNK_FLIP_JITTER).toBeGreaterThanOrEqual(4);
    expect(DRUNK_FLIP_JITTER).toBeLessThanOrEqual(8);
    expect(CHILL_FLIP_SCALE).toBeGreaterThanOrEqual(1.05);
    expect(CHILL_FLIP_SCALE).toBeLessThanOrEqual(1.4);
  });

  it('drunk wins over chilled; sober otherwise', () => {
    expect(flipMood(mood(0, 0))).toBe('sober');
    expect(flipMood(mood(3, 0))).toBe('drunk');
    expect(flipMood(mood(0, 3))).toBe('chill');
    expect(flipMood(mood(3, 3))).toBe('drunk');
  });

  it('street flips last longer drunk (plus the jitter) and chilled; launch flips never change', () => {
    expect(airTrickTicks(false)).toBe(STREET_AIR_TRICK_TICKS);
    expect(airTrickTicks(false, 'sober', 4)).toBe(STREET_AIR_TRICK_TICKS);
    expect(airTrickTicks(false, 'chill', 4)).toBe(CHILL_TICKS);
    expect(CHILL_TICKS).toBeGreaterThan(STREET_AIR_TRICK_TICKS);
    expect(airTrickTicks(false, 'drunk')).toBe(DRUNK_BASE);
    expect(airTrickTicks(false, 'drunk', 5)).toBe(DRUNK_BASE + 5);
    expect(DRUNK_BASE).toBeGreaterThan(CHILL_TICKS);
    for (const m of ['sober', 'drunk', 'chill'] as const) expect(airTrickTicks(true, m, 6)).toBe(AIR_TRICK_TICKS);
  });
});

/** Puts the skater high in the air rising fast, so even a late (drunk-delayed) flip has room to finish. */
function throwUp(game: Game): void {
  const p = game.state.player;
  p.grounded = false;
  p.y = GROUND_Y - 100;
  p.vy = -420;
}

/** Ticks the next street flip runs: one down tap, waits for it (drunk input arrives late), counts while it runs. */
function nextFlipLength(game: Game): number {
  throwUp(game);
  game.buttons.duck.press('test');
  tick(game);
  game.buttons.duck.release('test');
  for (let i = 0; i < 40 && !game.state.player.airTrick; i++) tick(game);
  expect(game.state.player.airTrick).toBe(true);
  let ticks = 0;
  while (game.state.player.airTrick) {
    ticks++;
    tick(game);
  }
  return ticks;
}

function flipLengths(setup: (game: Game) => void, flips = 12): { game: Game; lengths: number[] } {
  const game = createPlayerTestGame();
  setup(game);
  tick(game, 3);
  const lengths = Array.from({ length: flips }, () => nextFlipLength(game));
  return { game, lengths };
}

describe('flip length in the controller', () => {
  it('sober street flips keep STREET_AIR_TRICK_TICKS', () => {
    expect(new Set(flipLengths(() => {}).lengths)).toEqual(new Set([STREET_AIR_TRICK_TICKS]));
  });

  it('chilled street flips are CHILL_FLIP_SCALE times as long, with no randomness', () => {
    const { lengths } = flipLengths((g) => (g.state.chillTimer = 600));
    expect(new Set(lengths)).toEqual(new Set([CHILL_TICKS]));
  });

  it('drunk street flips are DRUNK_FLIP_SCALE times as long plus a varying 0..DRUNK_FLIP_JITTER', () => {
    const { lengths } = flipLengths((g) => (g.state.drunkTimer = 600), 20);
    for (const n of lengths) {
      expect(n).toBeGreaterThanOrEqual(DRUNK_BASE);
      expect(n).toBeLessThanOrEqual(DRUNK_BASE + DRUNK_FLIP_JITTER);
    }
    expect(new Set(lengths).size).toBeGreaterThanOrEqual(3);
  });

  it('drunk wins over chilled', () => {
    const { lengths } = flipLengths((g) => {
      g.state.drunkTimer = 600;
      g.state.chillTimer = 600;
    });
    for (const n of lengths) expect(n).toBeGreaterThanOrEqual(DRUNK_BASE);
  });

  it('the drunk jitter is deterministic per run seed and repeats on a new run with the same seed', () => {
    const drunk = (g: Game) => (g.state.drunkTimer = 600);
    const a = flipLengths(drunk).lengths;
    expect(flipLengths(drunk).lengths).toEqual(a);
    const { game } = flipLengths(drunk, 3);
    game.commands.gameOver();
    game.commands.startRun();
    drunk(game);
    tick(game, 3);
    expect(Array.from({ length: a.length }, () => nextFlipLength(game))).toEqual(a);
  });

  it('never draws from the gameplay rng (ctx.rng sequence unchanged)', () => {
    const sober = flipLengths(() => {}).game;
    const drunk = flipLengths((g) => (g.state.drunkTimer = 600)).game;
    expect(drunk.rng.next()).toBe(sober.rng.next());
  });

  it('a drunk launch kickflip keeps AIR_TRICK_TICKS', () => {
    const game = createPlayerTestGame();
    game.state.drunkTimer = 600;
    game.state.chillTimer = 600;
    tick(game, 3);
    game.bus.emit('launch', { entityId: 5, velocity: 700 });
    tick(game, 2);
    // A single tap; the drunk input delivers it late, still with plenty of air left.
    game.buttons.duck.press('test');
    tick(game);
    game.buttons.duck.release('test');
    let on = game.state.player.airTrick ? 1 : 0;
    for (let i = 0; i < 200 && !game.state.player.grounded; i++) {
      tick(game);
      if (game.state.player.airTrick) on++;
      else if (on > 0) break;
    }
    expect(on).toBe(AIR_TRICK_TICKS);
  });
});
