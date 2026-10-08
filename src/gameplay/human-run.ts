/**
 * Test tooling (Vitest and the people playtest): lets the HumanBot ride a
 * real run (player + gameplay, spawner on) and reports every crash, flagging
 * the ones that involve people. DOM-free; not used by the game itself.
 */
import { PLAYER_X, TICK_DT } from '../core/config';
import { Game } from '../core/game';
import { Rng } from '../core/rng';
import { createPlayerSystem } from '../player';
import type { EntityKind, GameState } from '../types';
import { isPerson } from './catalogue';
import { createGameplaySystem } from './index';
import { anchorOf } from './motion';
import { HUMAN_STYLE, HumanBot, type HumanStyle } from './testing';

/** A crash counts as person-related when a person is this many seconds of street away (or it is the person). */
export const PERSON_NEAR_SECONDS = 1;

export interface CrashReport {
  seed: number;
  /** Seconds into the run. */
  time: number;
  kind: EntityKind;
  personRelated: boolean;
  /** Entities within PERSON_NEAR_SECONDS of the player: kind and street offset (anchor - player x). */
  near: { kind: EntityKind; dx: number }[];
}

export interface HumanRun {
  seed: number;
  /** Seconds ridden (less than asked when the health ran out). */
  seconds: number;
  /** Street distance ridden. */
  distance: number;
  crashes: CrashReport[];
  stomps: number;
  score: number;
}

function nearby(state: GameState): CrashReport['near'] {
  const reach = state.speed * PERSON_NEAR_SECONDS;
  return state.entities
    .map((e) => ({ kind: e.kind, dx: Math.round(anchorOf(e) - PLAYER_X) }))
    .filter((e) => e.kind !== 'star' && Math.abs(e.dx) <= reach);
}

/** Drives `game` with `bot` for one tick. */
export function stepBot(game: Game, bot: HumanBot): void {
  const move = bot.next(game.state);
  if (move === 'press') game.buttons.action.press('bot');
  if (move === 'release') game.buttons.action.release('bot');
  if (bot.duck(game.state)) game.buttons.duck.press('bot');
  else game.buttons.duck.release('bot');
  game.tick();
}

/**
 * The human bot rides up to `seconds` of a seeded run at the real difficulty
 * speed from street distance `from` (0 = the run start; past the ramps = full
 * difficulty). By default health never runs out; with `health` (e.g.
 * MAX_HEALTH) the run ends like a real one. `style`: how sloppy the bot plays.
 */
export function rideHuman(seed: number, seconds: number, from = 0, health = Number.MAX_SAFE_INTEGER, style: HumanStyle = HUMAN_STYLE): HumanRun {
  const game = new Game({ systems: [createPlayerSystem(), createGameplaySystem()] });
  game.seed(seed);
  game.commands.startRun();
  game.state.health = health;
  game.state.distance = from;
  const run: HumanRun = { seed, seconds, distance: 0, crashes: [], stomps: 0, score: 0 };
  game.bus.on('crash', (e) => {
    const near = nearby(game.state);
    run.crashes.push({
      seed,
      time: Math.round(game.state.time * 10) / 10,
      kind: e.kind,
      personRelated: isPerson(e.kind) || near.some((n) => isPerson(n.kind)),
      near,
    });
  });
  game.bus.on('stomp', () => run.stomps++);
  const bot = new HumanBot(new Rng(seed * 7919 + 1), false, style);
  for (let i = 0; i < seconds / TICK_DT && game.state.mode === 'playing'; i++) stepBot(game, bot);
  run.score = game.state.score;
  run.seconds = game.state.time;
  run.distance = game.state.distance - from;
  return run;
}
