/**
 * Quiet time (ROADMAP 52): how long the skater rides sober street with
 * nothing to react to. A tick is busy while something on the street
 * (street.ts isStreetThreat) passes the skater's body. The
 * quiet stretches between busy ticks are reported per minute of the run
 * (longest and mean), counted only from `from` seconds on and only while no
 * effect (drunk, chill) is on: an effect ends the stretch there. Gaps shorter
 * than MIN_STRETCH (between the stars of one arc, two close obstacles) are
 * part of one threat, not a stretch.
 *
 * Measured with rideQuiet (the real gameplay system, nobody steering, never
 * crashing) in Vitest and with QuietMeter fed from the playtest's states
 * (scripts/scenarios/quiet-time.ts). DOM-free; not used by the game itself.
 */
import { PLAYER_X, TICK_DT } from '../core/config';
import { Game } from '../core/game';
import { HITBOX_W } from '../player/tuning';
import type { Entity, GameState } from '../types';
import { createGameplaySystem } from './index';
import { isStreetThreat } from './street';

/** Gaps shorter than this (seconds) do not count as a quiet stretch. */
export const MIN_STRETCH = 0.2;

export interface QuietStretch {
  /** Run time (seconds) the stretch started at. */
  start: number;
  seconds: number;
}

export interface QuietMinute {
  /** 0 = the run's first minute. */
  minute: number;
  /** Longest stretch starting in this minute (seconds; 0 when none). */
  longest: number;
  /** Mean stretch starting in this minute (seconds; 0 when none). */
  mean: number;
  stretches: number;
}

export interface QuietReport {
  minutes: QuietMinute[];
  /** The longest stretch of the whole ride. */
  longest: QuietStretch;
}

const half = HITBOX_W / 2;

/** A threat passes the skater's body this tick. */
export function threatAtSkater(entities: readonly Entity[]): boolean {
  return entities.some((e) => e.x <= PLAYER_X + half && e.x + e.w >= PLAYER_X - half && isStreetThreat(e, entities));
}

/** Collects quiet stretches tick by tick (see the module comment). */
export class QuietMeter {
  private readonly stretches: QuietStretch[] = [];
  /** The open stretch's start, or null while busy or not counting. */
  private start: number | null = null;
  private last = 0;

  /** `from`: seconds of the run before which nothing counts. */
  constructor(private readonly from = 0) {}

  /** One tick at run time `time`: `busy` = a threat at the skater, `sober` = no effect on. */
  add(time: number, busy: boolean, sober: boolean): void {
    const counting = sober && time >= this.from;
    if (busy || !counting) this.close();
    else this.start ??= time;
    this.last = time;
  }

  private close(): void {
    if (this.start === null) return;
    const seconds = this.last - this.start + TICK_DT;
    if (seconds >= MIN_STRETCH) this.stretches.push({ start: this.start, seconds });
    this.start = null;
  }

  report(): QuietReport {
    this.close();
    const minutes: QuietMinute[] = [];
    // A ride of exactly n minutes reports n (its clock may end a hair past the minute).
    const count = Math.max(1, Math.ceil(this.last / 60 - 1e-6));
    for (let minute = 0; minute < count; minute++) {
      const inside = this.stretches.filter((s) => Math.floor(s.start / 60) === minute).map((s) => s.seconds);
      const total = inside.reduce((a, b) => a + b, 0);
      minutes.push({ minute, longest: Math.max(0, ...inside), mean: inside.length ? total / inside.length : 0, stretches: inside.length });
    }
    const longest = this.stretches.reduce((a, b) => (b.seconds > a.seconds ? b : a), { start: 0, seconds: 0 });
    return { minutes, longest };
  }
}

/** Whether no effect is on. */
export function soberAt(state: GameState): boolean {
  return state.chillTimer <= 0 && state.drunkTimer <= 0;
}

export interface QuietRideOptions {
  /** Seconds of the run before which nothing counts (default 0). */
  from?: number;
  /** Solver units the spawner may plan per tick (default the game's PLAN_WORK_PER_TICK). */
  workPerTick?: number;
}

/**
 * Rides seed `seed` for `seconds` with the real gameplay system (the live
 * spawner with its planning budget, zones, stunt lines and the park), nobody
 * steering and never crashing, and measures the quiet time.
 */
export function rideQuiet(seed: number, seconds: number, options: QuietRideOptions = {}): QuietReport {
  const { from = 0, workPerTick } = options;
  const game = new Game({ systems: [createGameplaySystem({ workPerTick })] });
  game.seed(seed);
  game.commands.startRun();
  const state = game.state;
  state.player.invulnerableTimer = Infinity;
  const meter = new QuietMeter(from);
  let collected = false;
  game.bus.on('starCollected', () => (collected = true));
  for (let t = 0; t < seconds / TICK_DT; t++) {
    collected = false;
    game.tick();
    meter.add(state.time, collected || threatAtSkater(state.entities), soberAt(state));
  }
  return meter.report();
}
