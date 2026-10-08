/**
 * Test tooling (Vitest and the people playtest): lets the HumanBot ride a
 * real run (player + gameplay, spawner on) and reports every crash, flagging
 * the ones that involve people. DOM-free; not used by the game itself.
 */
import { MAX_HEALTH, PLAYER_X, TICK_DT } from '../core/config';
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

export interface DrunkRun {
  seed: number;
  /** Seconds the bot rode drunk (the run lasts until the drunk timer is over). */
  drunkSeconds: number;
  /** Crashes while drunk (and the half second after). */
  crashes: CrashReport[];
  /** Obstacles cleared while drunk (and the half second after). */
  cleared: number;
}

/** Seconds the bot rides with the Maßkrug before drinking it. */
const DRINK_AFTER = 4;
/** Crashes this long after the drunk phase still count (a late press is still on its way). */
const SOBER_UP = 0.5;

/**
 * The human bot rides a seeded run from street distance `from` with a
 * Maßkrug in hand, drinks it after DRINK_AFTER seconds (use button) and
 * rides until the drunk effect is over. Reports the crashes and clears while drunk.
 */
export function rideDrunk(seed: number, from: number): DrunkRun {
  const game = new Game({ systems: [createPlayerSystem(), createGameplaySystem()] });
  game.seed(seed);
  game.commands.startRun();
  game.state.health = MAX_HEALTH * 1000;
  game.state.distance = from;
  game.state.carriedItem = 'beer';
  const bot = new HumanBot(new Rng(seed * 7919 + 1));
  const run: DrunkRun = { seed, drunkSeconds: 0, crashes: [], cleared: 0 };
  let drankAt = -1;
  game.bus.on('drunkStart', () => (drankAt = game.state.time));
  game.bus.on('obstacleCleared', () => {
    if (drankAt >= 0) run.cleared++;
  });
  game.bus.on('crash', (e) => {
    if (drankAt < 0) return;
    run.crashes.push({ seed, time: Math.round((game.state.time - drankAt) * 10) / 10, kind: e.kind, personRelated: false, near: nearby(game.state) });
  });
  let soberAt = -1;
  while (game.state.mode === 'playing' && (soberAt < 0 || game.state.time < soberAt + SOBER_UP)) {
    if (drankAt < 0 && game.state.time >= DRINK_AFTER) game.commands.useItem();
    stepBot(game, bot);
    if (drankAt >= 0 && soberAt < 0 && game.state.drunkTimer <= 0) soberAt = game.state.time;
  }
  run.drunkSeconds = soberAt - drankAt;
  return run;
}
