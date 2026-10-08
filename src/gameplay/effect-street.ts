/**
 * Test tooling (Vitest): rides a seeded run (gameplay only, nobody steering,
 * never crashing) into a drunk or chill phase and measures the longest
 * stretch of empty street the skater rides through while the effect is on,
 * in seconds of riding at the actual speed: ticks in which no obstacle or
 * rail is under the skater. Also lists every obstacle kind that came. DOM-free;
 * not used by the game itself.
 */
import { PLAYER_X, TICK_DT } from '../core/config';
import { Game } from '../core/game';
import type { EntityKind, GameState } from '../types';
import { isObstacle, isRail } from './catalogue';
import { createGameplaySystem } from './index';

export type Effect = 'drunk' | 'chill';

export interface EffectStreet {
  seed: number;
  /** Seconds the effect lasted. */
  effectSeconds: number;
  /** Longest run of empty street under the skater while the effect was on (seconds). */
  maxEmpty: number;
  /** Obstacle and rail kinds the skater rode past while the effect was on. */
  kinds: EntityKind[];
}

/** Gives up when the effect has not started after this long (a joint comes within ~55 s from the run start). */
const START_LIMIT = 90;

const blocking = (kind: EntityKind) => isObstacle(kind) || isRail(kind);

function timerOf(state: GameState, effect: Effect): number {
  return effect === 'drunk' ? state.drunkTimer : state.chillTimer;
}

/** The blocking entities under the skater's x right now. */
function underSkater(state: GameState): EntityKind[] {
  return state.entities.filter((e) => blocking(e.kind) && e.x <= PLAYER_X && e.x + e.w >= PLAYER_X).map((e) => e.kind);
}

/**
 * Rides seed `seed` from street distance `from` until the effect is over.
 * Drunk: a Maßkrug in hand from the start, drunk by itself after a while
 * (auto-drink.ts). Chill: the next joint is ridden through.
 */
export function rideEffect(seed: number, from: number, effect: Effect): EffectStreet {
  const game = new Game({ systems: [createGameplaySystem()] });
  game.seed(seed);
  game.commands.startRun();
  game.state.distance = from;
  game.state.player.invulnerableTimer = Infinity;
  if (effect === 'drunk') game.state.carriedItem = 'beer';
  const state = game.state;
  while (timerOf(state, effect) <= 0) {
    if (state.time > START_LIMIT) throw new Error(`seed ${seed}: no ${effect} phase within ${START_LIMIT} s`);
    game.tick();
  }
  const start = state.time;
  const kinds = new Set<EntityKind>();
  let empty = 0;
  let maxEmpty = 0;
  while (timerOf(state, effect) > 0) {
    const under = underSkater(state);
    for (const k of under) kinds.add(k);
    empty = under.length > 0 ? 0 : empty + TICK_DT;
    maxEmpty = Math.max(maxEmpty, empty);
    game.tick();
  }
  return { seed, effectSeconds: state.time - start, maxEmpty, kinds: [...kinds] };
}
