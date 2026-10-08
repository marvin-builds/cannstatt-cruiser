/**
 * Test tooling (Vitest): how easy a stomp is for a human. A scene is one
 * person walking or swaying towards the skater at a pinned speed; every
 * try plays the real game (player + gameplay) from a fresh scene. The stomp
 * window is the longest run of consecutive take-off ticks (one hold) that
 * stomp the person without a crash; the human stomper aims its take-off so
 * the board would come down on the head's centre and is off by up to
 * `jitter` ticks. rideStomping lets such a human stomp every person of a
 * real run and reports crashes on the bounce. DOM-free; not used by the game
 * itself.
 */
import { GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import { Game } from '../core/game';
import { Rng } from '../core/rng';
import { createPlayerSystem } from '../player';
import type { GameState } from '../types';
import { isPerson, OBSTACLES } from './catalogue';
import { createGameplaySystem } from './index';
import { groundBody, stepBody } from './jumpsim';
import { anchorOf, type Motion, motionOffset } from './motion';
import { obstacle, quietGame } from './test-kit';
import { HUMAN_STYLE, HumanBot, planStomp } from './testing';

export interface StompScene {
  kind: 'vfbFan' | 'wasenGuest';
  motion: Motion;
  /** Screen x of the person's anchor when the scene starts. */
  anchor: number;
}

/** Ticks a try may last before it counts as a miss (the person is long past). */
const TRY_TICKS = 160;

/** A random person ahead of the skater, with a motion from its catalogue ranges. */
export function randomScene(rng: Rng): StompScene {
  const kind = rng.next() < 0.5 ? 'vfbFan' : 'wasenGuest';
  const { walk, sway } = OBSTACLES[kind].motion!;
  const between = ([lo, hi]: readonly [number, number]) => lo + (hi - lo) * rng.next();
  return { kind, motion: { walk: between(walk), sway: between(sway), phase: rng.next() * 2 * Math.PI }, anchor: PLAYER_X + 150 + rng.int(0, 40) };
}

function setUp(scene: StompScene, speed: number): Game {
  const game = quietGame(speed);
  obstacle(game, scene.kind, scene.anchor, scene.motion);
  return game;
}

/** Plays one try: rides `takeoff` ticks, presses the action for `hold` ticks. */
export function tryStomp(scene: StompScene, speed: number, takeoff: number, hold: number): 'stomp' | 'crash' | 'miss' {
  const game = setUp(scene, speed);
  const seen = { stomp: false, crash: false };
  game.bus.on('stomp', () => (seen.stomp = true));
  game.bus.on('crash', () => (seen.crash = true));
  for (let i = 0; i < takeoff + TRY_TICKS && !seen.stomp && !seen.crash; i++) {
    if (i === takeoff) game.buttons.action.press('bot');
    if (i === takeoff + hold) game.buttons.action.release('bot');
    game.tick();
  }
  // A crash right after the bounce still spoils the stomp.
  for (let i = 0; i < 20 && seen.stomp && !seen.crash; i++) game.tick();
  return seen.crash ? 'crash' : seen.stomp ? 'stomp' : 'miss';
}

/**
 * The take-off tick (riding from the scene start) that brings the board down
 * onto the centre of the head with this hold, by the jump physics alone: a
 * human's aim. Null when the hold never gets the board above the head.
 */
export function aimAtHead(scene: StompScene, speed: number, hold: number): number | null {
  const { box } = OBSTACLES[scene.kind];
  const headY = GROUND_Y - OBSTACLES[scene.kind].h + box.y;
  // Fly once from x = 0: where (ticks after take-off, course x) the falling board crosses the head's height.
  let body = groundBody();
  let fall = -1;
  for (let t = 1; t < 120 && fall < 0; t++) {
    body = stepBody(body, 0, t === 1, t <= hold);
    if (body.vy > 0 && body.y >= headY) fall = t;
    if (body.grounded) break;
  }
  if (fall < 0) return null;
  const step = speed * TICK_DT;
  let best: number | null = null;
  let bestGap = Infinity;
  // The scene starts 2 ticks into the run (quietGame), the press takes effect on the tick it is made.
  for (let takeoff = 0; takeoff < TRY_TICKS; takeoff++) {
    const ticks = takeoff + fall;
    const anchorGap = scene.anchor - PLAYER_X - step * ticks;
    const headCentre = PLAYER_X + anchorGap + motionOffset(scene.motion, anchorGap) + box.x + box.w / 2;
    const gap = Math.abs(headCentre - PLAYER_X);
    if (gap < bestGap) {
      bestGap = gap;
      best = takeoff;
    }
  }
  return best;
}

/** The stomp window per hold: the longest run of consecutive take-off ticks that stomp, and where it starts. */
export function stompWindow(scene: StompScene, speed: number, hold: number): { from: number; ticks: number } {
  const aim = aimAtHead(scene, speed, hold);
  if (aim === null) return { from: 0, ticks: 0 };
  // The window lies around the aim; search well past it on both sides.
  let best = { from: 0, ticks: 0 };
  let run = 0;
  for (let t = Math.max(0, aim - 30); t <= aim + 30; t++) {
    run = tryStomp(scene, speed, t, hold) === 'stomp' ? run + 1 : 0;
    if (run > best.ticks) best = { from: t - run + 1, ticks: run };
  }
  return best;
}

/** A human's stomp try: aims at the head with `hold` and takes off up to `jitter` ticks early or late. */
export function humanStomp(scene: StompScene, speed: number, hold: number, jitter: number, rng: Rng): boolean {
  const aim = aimAtHead(scene, speed, hold);
  if (aim === null) return false;
  return tryStomp(scene, speed, Math.max(0, aim + rng.int(-jitter, jitter)), hold) === 'stomp';
}

/** A person this close ahead (seconds of riding) gets aimed at: its pattern keeps the street around it free. */
const AIM_AHEAD_SECONDS = 1;
/** A crash this long after a stomp counts as one on the bounce. */
const BOUNCE_SECONDS = 1;

/**
 * Rides like HumanBot, but goes for every person: once one is close ahead and
 * the skater is supported, it takes off at planStomp's aim, up to
 * HUMAN_STYLE.takeoffJitter ticks early or late, then rides on as a fresh
 * HumanBot. Same driving protocol as HumanBot.
 */
class StompingHuman {
  private bot: HumanBot;
  private plan: { wait: number; hold: number } | null = null;
  private holding = 0;
  /** Ids of the people it went for. */
  readonly aimed = new Set<number>();
  /** Whether it still goes for new people. */
  aiming = true;

  constructor(private readonly rng: Rng) {
    this.bot = new HumanBot(rng);
  }

  next(state: GameState): 'press' | 'release' | null {
    if (this.holding > 0) {
      this.holding--;
      if (this.holding > 0) return null;
      this.bot = new HumanBot(this.rng);
      return 'release';
    }
    if (!this.plan) this.aim(state);
    if (!this.plan) return this.bot.next(state);
    if (this.plan.wait-- > 0) return null;
    this.holding = this.plan.hold;
    this.plan = null;
    return 'press';
  }

  duck(state: GameState): boolean {
    return !this.plan && this.holding === 0 && this.bot.duck(state);
  }

  private aim(state: GameState): void {
    const p = state.player;
    if (!this.aiming || !(p.grounded || p.grinding) || p.state === 'crash') return;
    const person = state.entities.find((e) => isPerson(e.kind) && !e.done && !this.aimed.has(e.id) && anchorOf(e) - PLAYER_X <= state.speed * AIM_AHEAD_SECONDS);
    if (!person) return;
    this.aimed.add(person.id);
    const plan = planStomp(state);
    if (!plan) return;
    const j = HUMAN_STYLE.takeoffJitter;
    this.plan = { wait: Math.max(0, plan.tick + this.rng.int(-j, j)), hold: plan.hold };
  }
}

export interface StompingRun {
  /** People the human went for, and how many of them it stomped. */
  tries: number;
  stomps: number;
  /** Seconds into the run of every crash within BOUNCE_SECONDS after a stomp. */
  bounceCrashes: number[];
}

/** A seeded real run (spawner on, endless health) from street distance `from` in which a human stomps every person it can. */
export function rideStomping(seed: number, seconds: number, from: number): StompingRun {
  const game = new Game({ systems: [createPlayerSystem(), createGameplaySystem()] });
  game.seed(seed);
  game.commands.startRun();
  game.state.health = Number.MAX_SAFE_INTEGER;
  game.state.distance = from;
  const bot = new StompingHuman(new Rng(seed * 7919 + 3));
  const run: StompingRun = { tries: 0, stomps: 0, bounceCrashes: [] };
  let stompedAt = -Infinity;
  game.bus.on('stomp', (e) => {
    stompedAt = game.state.time;
    if (bot.aimed.has(e.entityId)) run.stomps++;
  });
  game.bus.on('crash', () => {
    if (game.state.time - stompedAt <= BOUNCE_SECONDS) run.bounceCrashes.push(Math.round(game.state.time * 10) / 10);
  });
  // After `seconds` it rides on, without going for new people, until its last try is over.
  for (let i = 0; i < (seconds + 2 * BOUNCE_SECONDS) / TICK_DT; i++) {
    bot.aiming = i < seconds / TICK_DT;
    const move = bot.next(game.state);
    if (move === 'press') game.buttons.action.press('bot');
    if (move === 'release') game.buttons.action.release('bot');
    if (bot.duck(game.state)) game.buttons.duck.press('bot');
    else game.buttons.duck.release('bot');
    game.tick();
  }
  run.tries = bot.aimed.size;
  return run;
}
